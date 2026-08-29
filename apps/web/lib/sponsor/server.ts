import { canonicalStringify } from "@terra/simulation";

export const SPONSOR_OPERATIONS = [
  "create-city-agent",
  "update-city-intelligence",
  "record-milestone",
] as const;

export type SponsorOperation = (typeof SPONSOR_OPERATIONS)[number];

export type SponsorRequest = Readonly<{
  schemaVersion: 1;
  operation: SponsorOperation;
  sessionId: string;
  idempotencyKey: string;
  cityId: string;
  cityTokenId: string | null;
  campaignVersion: number;
  commitment: string | null;
}>;

export type SponsorTransactionPlan = Readonly<{
  operation: SponsorOperation;
  target: string;
  nonce: number;
  maximumSpendUnits: number;
  cityId: string;
  cityTokenId: string | null;
  campaignVersion: number;
  commitment: string | null;
}>;

export type SponsorDriverReceipt = Readonly<{
  transactionHash: string;
  nonce: number;
  spendUnits: number;
}>;

export type SponsorReceipt = SponsorDriverReceipt &
  Readonly<{
    operation: SponsorOperation;
  }>;

export interface SponsorTransactionDriver {
  execute(plan: SponsorTransactionPlan): Promise<SponsorDriverReceipt>;
}

export type SponsorOperationPolicy = Readonly<{
  target: string;
  maximumSpendUnits: number;
}>;

export type SponsoredTransactionServiceOptions = Readonly<{
  driver: SponsorTransactionDriver;
  policies: Readonly<Record<SponsorOperation, SponsorOperationPolicy>>;
  requestsPerSessionWindow: number;
  sessionWindowMs: number;
  dailySpendLimitUnits: number;
  initialNonce: number;
  isPaused: () => boolean;
  clock?: () => number;
  maximumTrackedSessions?: number;
  maximumIdempotencyEntries?: number;
}>;

export type SponsorFailureCode =
  | "invalid_request"
  | "operation_not_allowed"
  | "rate_limited"
  | "spending_limited"
  | "paused"
  | "idempotency_conflict"
  | "transaction_failed";

export class SponsorPolicyError extends Error {
  public constructor(
    public readonly code: SponsorFailureCode,
    public readonly retryable: boolean,
  ) {
    super(code);
    this.name = "SponsorPolicyError";
  }
}

type StoredReceipt = Readonly<{
  fingerprint: string;
  receipt: SponsorReceipt;
}>;

type SessionWindow = { startedAt: number; used: number };

const SESSION_ID = /^[A-Za-z0-9._:-]{8,128}$/u;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{16,160}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/u;
const HASH_32 = /^0x[0-9a-fA-F]{64}$/u;

/**
 * Serialised, server-only sponsor policy. Contract targets and spend ceilings
 * come only from trusted server configuration; browser-shaped input cannot
 * provide a recipient, calldata, nonce, or value.
 */
export function createSponsoredTransactionService(
  options: SponsoredTransactionServiceOptions,
): Readonly<{ execute(input: unknown): Promise<SponsorReceipt> }> {
  const policies = validatePolicies(options.policies);
  const requestsPerWindow = boundedInteger(
    options.requestsPerSessionWindow,
    1,
    100,
  );
  const windowMs = boundedInteger(options.sessionWindowMs, 1_000, 86_400_000);
  const dailyLimit = boundedInteger(
    options.dailySpendLimitUnits,
    1,
    Number.MAX_SAFE_INTEGER,
  );
  const maximumTrackedSessions = boundedInteger(
    options.maximumTrackedSessions ?? 2_000,
    1,
    10_000,
  );
  const maximumIdempotencyEntries = boundedInteger(
    options.maximumIdempotencyEntries ?? 5_000,
    1,
    50_000,
  );
  const clock = options.clock ?? Date.now;
  let nonce = boundedInteger(options.initialNonce, 0, Number.MAX_SAFE_INTEGER);
  let spendDay = dayNumber(validTimestamp(clock()));
  let spentToday = 0;
  let executionTail: Promise<void> = Promise.resolve();
  const windows = new Map<string, SessionWindow>();
  const idempotency = new Map<string, StoredReceipt>();

  return Object.freeze({
    async execute(input: unknown): Promise<SponsorReceipt> {
      const request = parseSponsorRequest(input);
      return serialize(async () => {
        if (options.isPaused()) throw policyFailure("paused", true);

        const fingerprint = canonicalStringify(request);
        const previous = idempotency.get(request.idempotencyKey);
        if (previous) {
          if (previous.fingerprint !== fingerprint) {
            throw policyFailure("idempotency_conflict", false);
          }
          return previous.receipt;
        }

        const now = validTimestamp(clock());
        if (!acquireSessionWindow(request.sessionId, now)) {
          throw policyFailure("rate_limited", true);
        }

        const policy = policies[request.operation];
        const currentDay = dayNumber(now);
        if (currentDay !== spendDay) {
          spendDay = currentDay;
          spentToday = 0;
        }
        if (spentToday + policy.maximumSpendUnits > dailyLimit) {
          throw policyFailure("spending_limited", true);
        }

        const plan: SponsorTransactionPlan = Object.freeze({
          operation: request.operation,
          target: policy.target,
          nonce,
          maximumSpendUnits: policy.maximumSpendUnits,
          cityId: request.cityId,
          cityTokenId: request.cityTokenId,
          campaignVersion: request.campaignVersion,
          commitment: request.commitment,
        });

        let driverReceipt: SponsorDriverReceipt;
        try {
          driverReceipt = await options.driver.execute(plan);
        } catch {
          throw policyFailure("transaction_failed", true);
        }
        if (
          !isDriverReceipt(driverReceipt) ||
          driverReceipt.nonce !== nonce ||
          driverReceipt.spendUnits > policy.maximumSpendUnits
        ) {
          throw policyFailure("transaction_failed", false);
        }

        const receipt: SponsorReceipt = Object.freeze({
          ...driverReceipt,
          operation: request.operation,
        });
        nonce += 1;
        spentToday += driverReceipt.spendUnits;
        if (idempotency.size >= maximumIdempotencyEntries) {
          const oldest = idempotency.keys().next().value as string | undefined;
          if (oldest !== undefined) idempotency.delete(oldest);
        }
        idempotency.set(request.idempotencyKey, { fingerprint, receipt });
        return receipt;
      });
    },
  });

  async function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const previous = executionTail;
    let release!: () => void;
    executionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  function acquireSessionWindow(sessionId: string, now: number): boolean {
    const current = windows.get(sessionId);
    if (
      current === undefined ||
      now < current.startedAt ||
      now - current.startedAt >= windowMs
    ) {
      if (!current && windows.size >= maximumTrackedSessions) {
        const oldest = windows.keys().next().value as string | undefined;
        if (oldest !== undefined) windows.delete(oldest);
      }
      windows.set(sessionId, { startedAt: now, used: 1 });
      return true;
    }
    if (current.used >= requestsPerWindow) return false;
    current.used += 1;
    return true;
  }
}

function parseSponsorRequest(value: unknown): SponsorRequest {
  if (!isRecord(value)) throw policyFailure("invalid_request", false);
  if (
    !hasExactKeys(value, [
      "schemaVersion",
      "operation",
      "sessionId",
      "idempotencyKey",
      "cityId",
      "cityTokenId",
      "campaignVersion",
      "commitment",
    ]) ||
    value.schemaVersion !== 1 ||
    typeof value.operation !== "string"
  ) {
    throw policyFailure("invalid_request", false);
  }
  if (!SPONSOR_OPERATIONS.includes(value.operation as SponsorOperation)) {
    throw policyFailure("operation_not_allowed", false);
  }
  if (
    typeof value.sessionId !== "string" ||
    !SESSION_ID.test(value.sessionId) ||
    typeof value.idempotencyKey !== "string" ||
    !IDEMPOTENCY_KEY.test(value.idempotencyKey) ||
    typeof value.cityId !== "string" ||
    !IDENTIFIER.test(value.cityId) ||
    !Number.isSafeInteger(value.campaignVersion) ||
    Number(value.campaignVersion) < 1 ||
    (value.cityTokenId !== null &&
      (typeof value.cityTokenId !== "string" ||
        !/^[0-9]{1,78}$/u.test(value.cityTokenId))) ||
    (value.commitment !== null &&
      (typeof value.commitment !== "string" || !HASH_32.test(value.commitment)))
  ) {
    throw policyFailure("invalid_request", false);
  }

  const operation = value.operation as SponsorOperation;
  if (
    (operation === "create-city-agent" &&
      (value.cityTokenId !== null || value.commitment !== null)) ||
    (operation !== "create-city-agent" && value.cityTokenId === null) ||
    (operation === "record-milestone" && value.commitment === null)
  ) {
    throw policyFailure("invalid_request", false);
  }
  return value as SponsorRequest;
}

function validatePolicies(
  policies: Readonly<Record<SponsorOperation, SponsorOperationPolicy>>,
): Readonly<Record<SponsorOperation, SponsorOperationPolicy>> {
  const keys = Object.keys(policies).sort();
  if (
    canonicalStringify(keys) !==
    canonicalStringify([...SPONSOR_OPERATIONS].sort())
  ) {
    throw new TypeError("Sponsor policy must configure exactly the allowlist");
  }
  const result = {} as Record<SponsorOperation, SponsorOperationPolicy>;
  for (const operation of SPONSOR_OPERATIONS) {
    const policy = policies[operation];
    if (!ADDRESS.test(policy.target)) {
      throw new TypeError("Sponsor target must be a contract address");
    }
    result[operation] = Object.freeze({
      target: policy.target,
      maximumSpendUnits: boundedInteger(
        policy.maximumSpendUnits,
        1,
        Number.MAX_SAFE_INTEGER,
      ),
    });
  }
  return Object.freeze(result);
}

function isDriverReceipt(value: unknown): value is SponsorDriverReceipt {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["transactionHash", "nonce", "spendUnits"]) &&
    typeof value.transactionHash === "string" &&
    HASH_32.test(value.transactionHash) &&
    Number.isSafeInteger(value.nonce) &&
    Number(value.nonce) >= 0 &&
    Number.isSafeInteger(value.spendUnits) &&
    Number(value.spendUnits) >= 0
  );
}

function policyFailure(
  code: SponsorFailureCode,
  retryable: boolean,
): SponsorPolicyError {
  return new SponsorPolicyError(code, retryable);
}

function dayNumber(timestamp: number): number {
  return Math.floor(timestamp / 86_400_000);
}

function validTimestamp(value: number): number {
  return boundedInteger(value, 0, Number.MAX_SAFE_INTEGER);
}

function boundedInteger(
  value: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError("Sponsor policy limit is invalid");
  }
  return value;
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
