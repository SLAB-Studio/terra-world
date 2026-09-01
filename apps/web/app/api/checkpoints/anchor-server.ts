import type { AdultCheckpointRepository } from "./session-server";
import type {
  AdultCheckpointStorageReference,
  AdultSession,
  AdultSessionRateLimiter,
} from "./server";

const ANCHOR_BODY_BYTES = 1_024;
const HASH_32_BYTES = /^0x[a-fA-F0-9]{64}$/u;
const CONTENT_HASH = /^sha256:[a-f0-9]{64}$/u;

export type CheckpointAnchorRequest = Readonly<{
  checkpointRoot: `0x${string}`;
  contentHash: `sha256:${string}`;
  byteLength: number;
  checkpointSavedAt: number;
  idempotencyKey: string;
  milestoneStorageTransactionHash: `0x${string}` | null;
  milestoneStorageTransactionSequence: number;
}>;

export type CheckpointAnchorEvidence = Readonly<{
  status: "synced" | "already-synced";
  checkpointRoot: `0x${string}`;
  agenticRoot: `0x${string}`;
  milestoneStorageTransactionHash: `0x${string}` | null;
  milestoneStorageTransactionSequence: number;
  milestoneStorageBlockNumber: number | null;
  updateAtTransactionHash: `0x${string}` | null;
  updateAtBlockNumber: number | null;
  agentCardTransactionHash: `0x${string}` | null;
  agentCardBlockNumber: number | null;
}>;

export type CheckpointAnchorService = Readonly<{
  anchor(request: CheckpointAnchorRequest): Promise<CheckpointAnchorEvidence>;
}>;

export interface CheckpointAnchorGlobalRateLimiter {
  tryAcquire(): boolean;
}

export type CheckpointAnchorPostHandlerOptions = Readonly<{
  repository: AdultCheckpointRepository;
  authorizeAdultSession(request: Request): Promise<AdultSession | null>;
  sessionRateLimiter: AdultSessionRateLimiter;
  globalRateLimiter: CheckpointAnchorGlobalRateLimiter;
  service: CheckpointAnchorService;
  allowedOrigins: readonly string[];
}>;

type AnchorBody = Readonly<{
  schemaVersion: 1;
  operation: "anchor";
  root: string;
  contentHash: string;
  byteLength: number;
  checkpointSavedAt: number;
}>;

type AnchorFailureCode =
  | "invalid_request"
  | "not_authorized"
  | "not_found"
  | "checkpoint_rejected"
  | "rate_limited"
  | "anchor_unavailable";

export class CheckpointAnchorError extends Error {
  override readonly name = "CheckpointAnchorError";

  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super("Checkpoint anchoring is unavailable");
  }
}

/**
 * Strict authenticated bridge from a stored checkpoint to the server-owned
 * AgenticID milestone synchronizer. Chain targets and signer choices never
 * enter this browser-facing contract.
 */
export function createCheckpointAnchorPostHandler(
  options: CheckpointAnchorPostHandlerOptions,
): (request: Request) => Promise<Response> {
  const origins = validateOrigins(options.allowedOrigins);

  return async (request: Request): Promise<Response> => {
    if (!isAllowedOrigin(request, origins)) {
      return failure("not_authorized", false, 403);
    }
    if (!hasJsonContentType(request)) {
      return failure("invalid_request", false, 415);
    }

    let session: AdultSession | null;
    try {
      session = await options.authorizeAdultSession(request);
    } catch {
      session = null;
    }
    if (session === null) return failure("not_authorized", false, 401);

    const body = await readAnchorBody(request);
    if (body === null) return failure("invalid_request", false, 400);

    let reference: Awaited<ReturnType<AdultCheckpointRepository["findByRoot"]>>;
    try {
      reference = await options.repository.findByRoot(session, body.root);
    } catch {
      return failure("anchor_unavailable", true, 503);
    }
    if (reference === null) return failure("not_found", false, 404);
    if (!matchesStoredCheckpoint(body, reference)) {
      return failure("checkpoint_rejected", false, 409);
    }
    if (
      reference.transactionSequence === undefined ||
      reference.transactionSequence === null ||
      !Number.isSafeInteger(reference.transactionSequence) ||
      reference.transactionSequence < 0 ||
      (reference.transactionHash !== undefined &&
        reference.transactionHash !== null &&
        !HASH_32_BYTES.test(reference.transactionHash))
    ) {
      return failure("checkpoint_rejected", false, 409);
    }

    if (!options.sessionRateLimiter.tryAcquire(session.sessionId)) {
      return failure("rate_limited", true, 429);
    }
    if (!options.globalRateLimiter.tryAcquire()) {
      return failure("rate_limited", true, 429);
    }

    try {
      const evidence = await options.service.anchor({
        checkpointRoot: body.root as `0x${string}`,
        contentHash: body.contentHash as `sha256:${string}`,
        byteLength: body.byteLength,
        checkpointSavedAt: body.checkpointSavedAt,
        idempotencyKey: reference.idempotencyKey,
        milestoneStorageTransactionHash:
          (reference.transactionHash as `0x${string}` | null | undefined) ??
          null,
        milestoneStorageTransactionSequence: reference.transactionSequence,
      });
      assertAnchorEvidence(evidence, body.root);
      return success(evidence);
    } catch (error) {
      return anchorFailure(error);
    }
  };
}

export function createCheckpointAnchorGlobalRateLimiter(input: {
  readonly capacity: number;
  readonly windowMs: number;
  readonly clock?: () => number;
}): CheckpointAnchorGlobalRateLimiter {
  const capacity = boundedInteger(input.capacity, 1, 1_000, "anchor capacity");
  const windowMs = boundedInteger(
    input.windowMs,
    1_000,
    24 * 60 * 60_000,
    "anchor window",
  );
  const clock = input.clock ?? Date.now;
  let startedAt = validTimestamp(clock());
  let used = 0;

  return Object.freeze({
    tryAcquire(): boolean {
      const now = validTimestamp(clock());
      if (now < startedAt || now - startedAt >= windowMs) {
        startedAt = now;
        used = 0;
      }
      if (used >= capacity) return false;
      used += 1;
      return true;
    },
  });
}

function matchesStoredCheckpoint(
  body: AnchorBody,
  reference: AdultCheckpointStorageReference,
): boolean {
  return (
    reference.root === body.root &&
    reference.contentHash === body.contentHash &&
    reference.byteLength === body.byteLength &&
    reference.checkpointSavedAt === body.checkpointSavedAt
  );
}

async function readAnchorBody(request: Request): Promise<AnchorBody | null> {
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > ANCHOR_BODY_BYTES) return null;
  if (request.body === null) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > ANCHOR_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let value: unknown;
  try {
    value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch {
    return null;
  }
  return isAnchorBody(value) ? value : null;
}

function isAnchorBody(value: unknown): value is AnchorBody {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "schemaVersion",
      "operation",
      "root",
      "contentHash",
      "byteLength",
      "checkpointSavedAt",
    ]) &&
    value.schemaVersion === 1 &&
    value.operation === "anchor" &&
    typeof value.root === "string" &&
    HASH_32_BYTES.test(value.root) &&
    typeof value.contentHash === "string" &&
    CONTENT_HASH.test(value.contentHash) &&
    Number.isSafeInteger(value.byteLength) &&
    Number(value.byteLength) > 0 &&
    Number.isSafeInteger(value.checkpointSavedAt) &&
    Number(value.checkpointSavedAt) >= 0
  );
}

function assertAnchorEvidence(value: unknown, checkpointRoot: string): void {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "status",
      "checkpointRoot",
      "agenticRoot",
      "milestoneStorageTransactionHash",
      "milestoneStorageTransactionSequence",
      "milestoneStorageBlockNumber",
      "updateAtTransactionHash",
      "updateAtBlockNumber",
      "agentCardTransactionHash",
      "agentCardBlockNumber",
    ]) ||
    (value.status !== "synced" && value.status !== "already-synced") ||
    value.checkpointRoot !== checkpointRoot ||
    typeof value.agenticRoot !== "string" ||
    !HASH_32_BYTES.test(value.agenticRoot) ||
    !nullableHash(value.milestoneStorageTransactionHash) ||
    !nonNegativeInteger(value.milestoneStorageTransactionSequence) ||
    !nullableNonNegativeInteger(value.milestoneStorageBlockNumber) ||
    !nullableHash(value.updateAtTransactionHash) ||
    !nullableNonNegativeInteger(value.updateAtBlockNumber) ||
    !nullableHash(value.agentCardTransactionHash) ||
    !nullableNonNegativeInteger(value.agentCardBlockNumber)
  ) {
    throw new CheckpointAnchorError("invalid_evidence", false);
  }
}

function anchorFailure(error: unknown): Response {
  if (error instanceof CheckpointAnchorError) {
    return failure("anchor_unavailable", error.retryable, 503);
  }
  if (
    isRecord(error) &&
    typeof error.code === "string" &&
    typeof error.retryable === "boolean"
  ) {
    return failure("anchor_unavailable", error.retryable, 503);
  }
  return failure("anchor_unavailable", false, 503);
}

function success(evidence: CheckpointAnchorEvidence): Response {
  return Response.json(
    { ok: true, evidence },
    { status: 200, headers: responseHeaders() },
  );
}

function failure(
  code: AnchorFailureCode,
  retryable: boolean,
  status: number,
): Response {
  return Response.json(
    { ok: false, code, retryable },
    { status, headers: responseHeaders() },
  );
}

function responseHeaders(): HeadersInit {
  return {
    "cache-control": "private, no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  };
}

function hasJsonContentType(request: Request): boolean {
  return /^application\/json(?:\s*;|$)/iu.test(
    request.headers.get("content-type") ?? "",
  );
}

function isAllowedOrigin(
  request: Request,
  origins: ReadonlySet<string>,
): boolean {
  const origin = request.headers.get("origin");
  if (origin === null || !origins.has(origin)) return false;
  try {
    return new URL(request.url).origin === origin;
  } catch {
    return false;
  }
}

function validateOrigins(values: readonly string[]): Set<string> {
  if (values.length === 0)
    throw new RangeError("At least one origin is required");
  return new Set(
    values.map((value) => {
      const parsed = new URL(value);
      if (
        parsed.origin !== value ||
        !["http:", "https:"].includes(parsed.protocol)
      ) {
        throw new TypeError("Checkpoint anchor origin is invalid");
      }
      return value;
    }),
  );
}

function nullableHash(value: unknown): boolean {
  return (
    value === null || (typeof value === "string" && HASH_32_BYTES.test(value))
  );
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function nullableNonNegativeInteger(value: unknown): boolean {
  return value === null || nonNegativeInteger(value);
}

function boundedInteger(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`Invalid ${label}`);
  }
  return value;
}

function validTimestamp(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("Invalid anchor timestamp");
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  );
}
