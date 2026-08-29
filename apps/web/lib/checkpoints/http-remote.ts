import {
  CheckpointRemoteError,
  type CheckpointDownload,
  type CheckpointDownloadRequest,
  type CheckpointRemoteReceipt,
  type CheckpointRemoteStorage,
  type CheckpointUploadRequest,
} from "./backup";

const DEFAULT_ENDPOINT = "/api/checkpoints";
const DEFAULT_TIMEOUT_MS = 20_000;
const MAXIMUM_TIMEOUT_MS = 60_000;
const MAXIMUM_RESPONSE_BYTES = 7_100_000;
const SAFE_CODE = /^[a-z0-9_:-]{1,64}$/u;

export type CheckpointHttpRemoteOptions = Readonly<{
  endpoint?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}>;

/**
 * Same-origin browser transport for the local-first queue. Adult auth is an
 * HttpOnly session concern; this adapter accepts no token, signer, or wallet.
 */
export function createCheckpointHttpRemoteStorage(
  options: CheckpointHttpRemoteOptions = {},
): CheckpointRemoteStorage {
  const endpoint = validateEndpoint(options.endpoint ?? DEFAULT_ENDPOINT);
  const fetcher = options.fetch ?? globalThis.fetch;
  if (typeof fetcher !== "function") {
    throw new TypeError("Checkpoint fetch is unavailable");
  }
  const timeoutMs = validateTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  return Object.freeze({
    async upload(
      request: CheckpointUploadRequest,
    ): Promise<CheckpointRemoteReceipt> {
      const payload = await postJson(
        fetcher,
        endpoint,
        timeoutMs,
        {
          schemaVersion: 1,
          operation: "upload",
          idempotencyKey: request.idempotencyKey,
          encryptedEnvelope: request.encryptedEnvelope,
          contentHash: request.contentHash,
          byteLength: request.byteLength,
        },
        request.idempotencyKey,
      );
      if (!isUploadSuccess(payload)) {
        throw new CheckpointRemoteError("invalid_response", false);
      }
      return payload.receipt;
    },

    async download(
      request: CheckpointDownloadRequest,
    ): Promise<CheckpointDownload> {
      const payload = await postJson(fetcher, endpoint, timeoutMs, {
        schemaVersion: 1,
        operation: "download",
        root: request.root,
        expectedContentHash: request.expectedContentHash,
        expectedByteLength: request.expectedByteLength,
      });
      if (!isDownloadSuccess(payload)) {
        throw new CheckpointRemoteError("invalid_response", false);
      }
      return payload.checkpoint;
    },
  });
}

async function postJson(
  fetcher: typeof globalThis.fetch,
  endpoint: string,
  timeoutMs: number,
  body: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(endpoint, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      headers: {
        "content-type": "application/json",
        ...(idempotencyKey === undefined
          ? {}
          : { "idempotency-key": idempotencyKey }),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = await readBoundedJson(response);
    if (!response.ok) {
      if (isFailurePayload(payload)) {
        throw new CheckpointRemoteError(payload.code, payload.retryable);
      }
      throw new CheckpointRemoteError(
        response.status === 429 || response.status >= 500
          ? "server_unavailable"
          : "request_rejected",
        response.status === 429 || response.status >= 500,
      );
    }
    return payload;
  } catch (error) {
    if (error instanceof CheckpointRemoteError) throw error;
    throw new CheckpointRemoteError("network_failure", true);
  } finally {
    clearTimeout(timeout);
  }
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declared = response.headers.get("content-length");
  if (declared !== null && Number(declared) > MAXIMUM_RESPONSE_BYTES) {
    throw new CheckpointRemoteError("invalid_response", false);
  }
  if (!response.body) {
    throw new CheckpointRemoteError("invalid_response", false);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > MAXIMUM_RESPONSE_BYTES) {
        await reader.cancel();
        throw new CheckpointRemoteError("invalid_response", false);
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
    throw new CheckpointRemoteError("invalid_response", false);
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

function isUploadSuccess(
  value: unknown,
): value is Readonly<{ ok: true; receipt: CheckpointRemoteReceipt }> {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["ok", "receipt"]) &&
    value.ok === true &&
    isReceipt(value.receipt)
  );
}

function isDownloadSuccess(
  value: unknown,
): value is Readonly<{ ok: true; checkpoint: CheckpointDownload }> {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["ok", "checkpoint"]) &&
    value.ok === true &&
    isRecord(value.checkpoint) &&
    hasExactKeys(value.checkpoint, [
      "root",
      "contentHash",
      "byteLength",
      "encryptedEnvelope",
    ]) &&
    hasReceiptValues(value.checkpoint) &&
    typeof value.checkpoint.encryptedEnvelope === "string"
  );
}

function isReceipt(value: unknown): value is CheckpointRemoteReceipt {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["root", "contentHash", "byteLength"]) &&
    hasReceiptValues(value)
  );
}

function hasReceiptValues(
  value: Record<string, unknown>,
): value is Record<string, unknown> & CheckpointRemoteReceipt {
  return (
    typeof value.root === "string" &&
    value.root.length > 0 &&
    typeof value.contentHash === "string" &&
    /^sha256:[a-f0-9]{64}$/u.test(value.contentHash) &&
    Number.isSafeInteger(value.byteLength) &&
    Number(value.byteLength) > 0
  );
}

function validateEndpoint(endpoint: string): string {
  if (
    !/^\/[A-Za-z0-9/_-]+$/u.test(endpoint) ||
    endpoint.startsWith("//") ||
    endpoint.includes("//")
  ) {
    throw new TypeError("Checkpoint endpoint must be a same-origin path");
  }
  return endpoint;
}

function validateTimeout(value: number): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 1_000 ||
    value > MAXIMUM_TIMEOUT_MS
  ) {
    throw new RangeError("Checkpoint request timeout is invalid");
  }
  return value;
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
