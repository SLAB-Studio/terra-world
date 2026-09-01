export const CHECKPOINT_ANCHOR_ENDPOINT = "/api/checkpoints/anchor" as const;

export const CHECKPOINT_ANCHOR_HTTP_LIMITS = Object.freeze({
  defaultTimeoutMs: 360_000,
  maximumTimeoutMs: 360_000,
  maximumResponseBytes: 16 * 1_024,
});

const HASH_32_BYTES = /^0x[a-fA-F0-9]{64}$/u;
const CONTENT_HASH = /^sha256:[a-f0-9]{64}$/u;
const SAFE_CODE = /^[a-z0-9_:-]{1,64}$/u;

export type CheckpointAnchorRequest = Readonly<{
  root: `0x${string}`;
  contentHash: `sha256:${string}`;
  byteLength: number;
  checkpointSavedAt: number;
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

export type CheckpointHttpAnchorOptions = Readonly<{
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}>;

export type CheckpointHttpAnchorClient = Readonly<{
  anchor(request: CheckpointAnchorRequest): Promise<CheckpointAnchorEvidence>;
}>;

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
 * Same-origin browser boundary for public checkpoint evidence. Contract targets,
 * wallets, signers, and private keys are deliberately absent from this API.
 */
export function createCheckpointHttpAnchorClient(
  options: CheckpointHttpAnchorOptions = {},
): CheckpointHttpAnchorClient {
  const fetcher = options.fetch ?? globalThis.fetch;
  if (typeof fetcher !== "function") {
    throw new TypeError("Checkpoint anchor fetch is unavailable");
  }
  const timeoutMs = validateTimeout(
    options.timeoutMs ?? CHECKPOINT_ANCHOR_HTTP_LIMITS.defaultTimeoutMs,
  );

  return Object.freeze({
    async anchor(
      request: CheckpointAnchorRequest,
    ): Promise<CheckpointAnchorEvidence> {
      const body = projectRequest(request);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetcher(CHECKPOINT_ANCHOR_ENDPOINT, {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          redirect: "error",
          referrerPolicy: "no-referrer",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const payload = await readBoundedJson(response);
        if (!response.ok) {
          if (isFailurePayload(payload)) {
            throw new CheckpointAnchorError(payload.code, payload.retryable);
          }
          throw new CheckpointAnchorError(
            response.status === 429 || response.status >= 500
              ? "server_unavailable"
              : "request_rejected",
            response.status === 429 || response.status >= 500,
          );
        }
        return parseSuccess(payload, body.root);
      } catch (error) {
        if (error instanceof CheckpointAnchorError) throw error;
        throw new CheckpointAnchorError("network_failure", true);
      } finally {
        clearTimeout(timeout);
      }
    },
  });
}

function projectRequest(request: CheckpointAnchorRequest) {
  if (
    !isRecord(request) ||
    typeof request.root !== "string" ||
    !HASH_32_BYTES.test(request.root) ||
    typeof request.contentHash !== "string" ||
    !CONTENT_HASH.test(request.contentHash) ||
    !positiveInteger(request.byteLength) ||
    !nonNegativeInteger(request.checkpointSavedAt)
  ) {
    throw new TypeError("Checkpoint anchor request is invalid");
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    operation: "anchor" as const,
    root: request.root,
    contentHash: request.contentHash,
    byteLength: request.byteLength,
    checkpointSavedAt: request.checkpointSavedAt,
  });
}

function parseSuccess(
  value: unknown,
  requestedRoot: string,
): CheckpointAnchorEvidence {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["ok", "evidence"]) ||
    value.ok !== true ||
    !isAnchorEvidence(value.evidence, requestedRoot)
  ) {
    throw new CheckpointAnchorError("invalid_response", false);
  }
  const evidence = value.evidence;
  return Object.freeze({
    status: evidence.status,
    checkpointRoot: evidence.checkpointRoot,
    agenticRoot: evidence.agenticRoot,
    milestoneStorageTransactionHash: evidence.milestoneStorageTransactionHash,
    milestoneStorageTransactionSequence:
      evidence.milestoneStorageTransactionSequence,
    milestoneStorageBlockNumber: evidence.milestoneStorageBlockNumber,
    updateAtTransactionHash: evidence.updateAtTransactionHash,
    updateAtBlockNumber: evidence.updateAtBlockNumber,
    agentCardTransactionHash: evidence.agentCardTransactionHash,
    agentCardBlockNumber: evidence.agentCardBlockNumber,
  });
}

function isAnchorEvidence(
  value: unknown,
  requestedRoot: string,
): value is CheckpointAnchorEvidence {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
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
    ]) &&
    (value.status === "synced" || value.status === "already-synced") &&
    value.checkpointRoot === requestedRoot &&
    HASH_32_BYTES.test(value.checkpointRoot) &&
    typeof value.agenticRoot === "string" &&
    HASH_32_BYTES.test(value.agenticRoot) &&
    nullableHash(value.milestoneStorageTransactionHash) &&
    nonNegativeInteger(value.milestoneStorageTransactionSequence) &&
    nullableNonNegativeInteger(value.milestoneStorageBlockNumber) &&
    nullableHash(value.updateAtTransactionHash) &&
    nullableNonNegativeInteger(value.updateAtBlockNumber) &&
    nullableHash(value.agentCardTransactionHash) &&
    nullableNonNegativeInteger(value.agentCardBlockNumber)
  );
}

async function readBoundedJson(response: Response): Promise<unknown> {
  if (
    !/^application\/json(?:\s*;|$)/iu.test(
      response.headers.get("content-type") ?? "",
    )
  ) {
    throw new CheckpointAnchorError("invalid_response", false);
  }
  const declared = response.headers.get("content-length");
  if (
    declared !== null &&
    Number(declared) > CHECKPOINT_ANCHOR_HTTP_LIMITS.maximumResponseBytes
  ) {
    throw new CheckpointAnchorError("invalid_response", false);
  }
  if (response.body === null) {
    throw new CheckpointAnchorError("invalid_response", false);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > CHECKPOINT_ANCHOR_HTTP_LIMITS.maximumResponseBytes) {
        await reader.cancel();
        throw new CheckpointAnchorError("invalid_response", false);
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
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch {
    throw new CheckpointAnchorError("invalid_response", false);
  }
}

function isFailurePayload(value: unknown): value is Readonly<{
  ok: false;
  code: string;
  retryable: boolean;
}> {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["ok", "code", "retryable"]) &&
    value.ok === false &&
    typeof value.code === "string" &&
    SAFE_CODE.test(value.code) &&
    typeof value.retryable === "boolean"
  );
}

function validateTimeout(value: number): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 1_000 ||
    value > CHECKPOINT_ANCHOR_HTTP_LIMITS.maximumTimeoutMs
  ) {
    throw new RangeError("Checkpoint anchor request timeout is invalid");
  }
  return value;
}

function nullableHash(value: unknown): value is `0x${string}` | null {
  return (
    value === null || (typeof value === "string" && HASH_32_BYTES.test(value))
  );
}

function nullableNonNegativeInteger(value: unknown): value is number | null {
  return value === null || nonNegativeInteger(value);
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
