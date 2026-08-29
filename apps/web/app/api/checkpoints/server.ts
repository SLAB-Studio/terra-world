import {
  CheckpointRemoteError,
  type CheckpointDownloadRequest,
  type CheckpointRemoteReceipt,
  type CheckpointRemoteStorage,
  type CheckpointUploadRequest,
} from "../../../lib/checkpoints/backup";

export const CHECKPOINT_API_LIMITS = {
  maximumBodyBytes: 7_100_000,
  maximumRequestsPerWindow: 100,
  maximumWindowMs: 60 * 60 * 1_000,
  maximumTrackedSessions: 2_000,
} as const;

const SESSION_ID = /^[A-Za-z0-9._:-]{8,128}$/u;
const IDEMPOTENCY_KEY = /^checkpoint-v1-([a-f0-9]{64})$/u;
const CONTENT_HASH = /^sha256:[a-f0-9]{64}$/u;
const SAFE_ROOT = /^[A-Za-z0-9._:-]{1,256}$/u;

export type AdultSession = Readonly<{ sessionId: string }>;

export type AdultCheckpointStorageReference = CheckpointRemoteReceipt &
  Readonly<{
    idempotencyKey: string;
    attachedAt: number;
  }>;

export interface AdultCheckpointSessionStore {
  findByIdempotency(
    session: AdultSession,
    idempotencyKey: string,
  ): Promise<AdultCheckpointStorageReference | null>;
  attach(
    session: AdultSession,
    reference: AdultCheckpointStorageReference,
  ): Promise<void>;
  findByRoot(
    session: AdultSession,
    root: string,
  ): Promise<AdultCheckpointStorageReference | null>;
}

export interface AdultSessionRateLimiter {
  tryAcquire(sessionId: string): boolean;
}

export type CheckpointPostHandlerOptions = Readonly<{
  remote: CheckpointRemoteStorage;
  sessions: AdultCheckpointSessionStore;
  authorizeAdultSession(request: Request): Promise<AdultSession | null>;
  rateLimiter: AdultSessionRateLimiter;
  allowedOrigins: readonly string[];
  clock?: () => number;
  maximumBodyBytes?: number;
}>;

type UploadBody = Readonly<{
  schemaVersion: 1;
  operation: "upload";
  idempotencyKey: string;
  encryptedEnvelope: string;
  contentHash: string;
  byteLength: number;
}>;

type DownloadBody = Readonly<{
  schemaVersion: 1;
  operation: "download";
  root: string;
  expectedContentHash: string;
  expectedByteLength: number;
}>;

type CheckpointApiBody = UploadBody | DownloadBody;

type FailurePayload = Readonly<{
  ok: false;
  code:
    | "invalid_request"
    | "not_authorized"
    | "not_found"
    | "rate_limited"
    | "checkpoint_rejected"
    | "storage_unavailable";
  retryable: boolean;
}>;

/**
 * Authenticated, same-origin checkpoint transport. Authentication and the
 * adult-owned reference store are injected so no browser wallet or sponsor
 * secret can enter this contract.
 */
export function createCheckpointPostHandler(
  options: CheckpointPostHandlerOptions,
): (request: Request) => Promise<Response> {
  const origins = validateOrigins(options.allowedOrigins);
  const maximumBodyBytes = validateLimit(
    options.maximumBodyBytes ?? CHECKPOINT_API_LIMITS.maximumBodyBytes,
    1,
    CHECKPOINT_API_LIMITS.maximumBodyBytes,
  );
  const clock = options.clock ?? Date.now;

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
    if (!session || !SESSION_ID.test(session.sessionId)) {
      return failure("not_authorized", false, 401);
    }
    if (!options.rateLimiter.tryAcquire(session.sessionId)) {
      return failure("rate_limited", true, 429);
    }

    const parsed = await readCheckpointBody(request, maximumBodyBytes);
    if (!parsed.ok) {
      return failure("invalid_request", false, parsed.status);
    }

    return parsed.value.operation === "upload"
      ? request.headers.get("idempotency-key") === parsed.value.idempotencyKey
        ? uploadCheckpoint(parsed.value, session, options, clock)
        : failure("invalid_request", false, 400)
      : downloadCheckpoint(parsed.value, session, options);
  };
}

export function createAdultSessionRateLimiter(input: {
  readonly capacity: number;
  readonly windowMs: number;
  readonly maximumTrackedSessions?: number;
  readonly clock?: () => number;
}): AdultSessionRateLimiter {
  const capacity = validateLimit(
    input.capacity,
    1,
    CHECKPOINT_API_LIMITS.maximumRequestsPerWindow,
  );
  const windowMs = validateLimit(
    input.windowMs,
    1,
    CHECKPOINT_API_LIMITS.maximumWindowMs,
  );
  const maximumTrackedSessions = validateLimit(
    input.maximumTrackedSessions ??
      CHECKPOINT_API_LIMITS.maximumTrackedSessions,
    1,
    CHECKPOINT_API_LIMITS.maximumTrackedSessions,
  );
  const clock = input.clock ?? Date.now;
  const windows = new Map<string, { startedAt: number; used: number }>();

  return Object.freeze({
    tryAcquire(sessionId: string): boolean {
      if (!SESSION_ID.test(sessionId)) return false;
      const now = clock();
      const current = windows.get(sessionId);
      if (
        current === undefined ||
        now < current.startedAt ||
        now - current.startedAt >= windowMs
      ) {
        if (!current && windows.size >= maximumTrackedSessions) {
          evictOldestWindow(windows);
        }
        windows.set(sessionId, { startedAt: now, used: 1 });
        return true;
      }
      if (current.used >= capacity) return false;
      current.used += 1;
      return true;
    },
  });
}

async function uploadCheckpoint(
  body: UploadBody,
  session: AdultSession,
  options: CheckpointPostHandlerOptions,
  clock: () => number,
): Promise<Response> {
  const request: CheckpointUploadRequest = {
    idempotencyKey: body.idempotencyKey,
    encryptedEnvelope: body.encryptedEnvelope,
    contentHash: body.contentHash,
    byteLength: body.byteLength,
  };
  try {
    const existing = await options.sessions.findByIdempotency(
      session,
      request.idempotencyKey,
    );
    if (existing) {
      if (
        existing.contentHash !== request.contentHash ||
        existing.byteLength !== request.byteLength
      ) {
        return failure("checkpoint_rejected", false, 409);
      }
      return success({ receipt: toRemoteReceipt(existing) });
    }

    const receipt = await options.remote.upload(request);
    if (
      receipt.contentHash !== request.contentHash ||
      receipt.byteLength !== request.byteLength
    ) {
      return failure("checkpoint_rejected", false, 422);
    }
    await options.sessions.attach(session, {
      ...receipt,
      idempotencyKey: request.idempotencyKey,
      attachedAt: validTimestamp(clock()),
    });
    return success({ receipt });
  } catch (error) {
    return remoteFailure(error);
  }
}

async function downloadCheckpoint(
  body: DownloadBody,
  session: AdultSession,
  options: CheckpointPostHandlerOptions,
): Promise<Response> {
  try {
    const reference = await options.sessions.findByRoot(session, body.root);
    if (!reference) return failure("not_found", false, 404);
    if (
      reference.contentHash !== body.expectedContentHash ||
      reference.byteLength !== body.expectedByteLength
    ) {
      return failure("checkpoint_rejected", false, 409);
    }
    const request: CheckpointDownloadRequest = {
      root: reference.root,
      expectedContentHash: reference.contentHash,
      expectedByteLength: reference.byteLength,
    };
    const checkpoint = await options.remote.download(request);
    if (
      checkpoint.root !== reference.root ||
      checkpoint.contentHash !== reference.contentHash ||
      checkpoint.byteLength !== reference.byteLength
    ) {
      return failure("checkpoint_rejected", false, 422);
    }
    return success({ checkpoint });
  } catch (error) {
    return remoteFailure(error);
  }
}

async function readCheckpointBody(
  request: Request,
  maximumBodyBytes: number,
): Promise<
  | { readonly ok: true; readonly value: CheckpointApiBody }
  | { readonly ok: false; readonly status: 400 | 413 }
> {
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > maximumBodyBytes) {
    return { ok: false, status: 413 };
  }
  const bytes = await readBoundedBytes(request.body, maximumBodyBytes);
  if (!bytes.ok) return bytes;

  let value: unknown;
  try {
    value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes.value),
    ) as unknown;
  } catch {
    return { ok: false, status: 400 };
  }
  return isCheckpointBody(value)
    ? { ok: true, value }
    : { ok: false, status: 400 };
}

async function readBoundedBytes(
  stream: ReadableStream<Uint8Array> | null,
  maximumBodyBytes: number,
): Promise<
  | { readonly ok: true; readonly value: Uint8Array }
  | { readonly ok: false; readonly status: 413 }
> {
  if (!stream) return { ok: true, value: new Uint8Array() };
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maximumBodyBytes) {
        await reader.cancel();
        return { ok: false, status: 413 };
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, value: combined };
}

function isCheckpointBody(value: unknown): value is CheckpointApiBody {
  if (!isRecord(value) || value.schemaVersion !== 1) return false;
  if (value.operation === "upload") {
    const idempotencyMatch =
      typeof value.idempotencyKey === "string"
        ? IDEMPOTENCY_KEY.exec(value.idempotencyKey)
        : null;
    return (
      hasExactKeys(value, [
        "schemaVersion",
        "operation",
        "idempotencyKey",
        "encryptedEnvelope",
        "contentHash",
        "byteLength",
      ]) &&
      idempotencyMatch !== null &&
      typeof value.encryptedEnvelope === "string" &&
      value.encryptedEnvelope.length > 0 &&
      typeof value.contentHash === "string" &&
      CONTENT_HASH.test(value.contentHash) &&
      value.contentHash === `sha256:${idempotencyMatch[1]}` &&
      Number.isSafeInteger(value.byteLength) &&
      Number(value.byteLength) > 0 &&
      Number(value.byteLength) <= CHECKPOINT_API_LIMITS.maximumBodyBytes &&
      new TextEncoder().encode(value.encryptedEnvelope).byteLength ===
        value.byteLength
    );
  }
  if (value.operation === "download") {
    return (
      hasExactKeys(value, [
        "schemaVersion",
        "operation",
        "root",
        "expectedContentHash",
        "expectedByteLength",
      ]) &&
      typeof value.root === "string" &&
      SAFE_ROOT.test(value.root) &&
      typeof value.expectedContentHash === "string" &&
      CONTENT_HASH.test(value.expectedContentHash) &&
      Number.isSafeInteger(value.expectedByteLength) &&
      Number(value.expectedByteLength) > 0 &&
      Number(value.expectedByteLength) <= CHECKPOINT_API_LIMITS.maximumBodyBytes
    );
  }
  return false;
}

function remoteFailure(error: unknown): Response {
  if (error instanceof CheckpointRemoteError) {
    return error.retryable
      ? failure("storage_unavailable", true, 503)
      : failure("checkpoint_rejected", false, 422);
  }
  return failure("storage_unavailable", true, 503);
}

function success(value: Record<string, unknown>): Response {
  return Response.json(
    { ok: true, ...value },
    { status: 200, headers: responseHeaders() },
  );
}

function failure(
  code: FailurePayload["code"],
  retryable: boolean,
  status: number,
): Response {
  return Response.json(
    { ok: false, code, retryable } satisfies FailurePayload,
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

function toRemoteReceipt(
  reference: AdultCheckpointStorageReference,
): CheckpointRemoteReceipt {
  return {
    root: reference.root,
    contentHash: reference.contentHash,
    byteLength: reference.byteLength,
  };
}

function hasJsonContentType(request: Request): boolean {
  return /^application\/json(?:\s*;|$)/iu.test(
    request.headers.get("content-type") ?? "",
  );
}

function isAllowedOrigin(
  request: Request,
  allowedOrigins: Set<string>,
): boolean {
  const origin = request.headers.get("origin");
  return (
    origin !== null &&
    allowedOrigins.has(origin) &&
    new URL(request.url).origin === origin
  );
}

function validateOrigins(origins: readonly string[]): Set<string> {
  if (origins.length === 0)
    throw new RangeError("At least one origin is required");
  const result = new Set<string>();
  for (const origin of origins) {
    const parsed = new URL(origin);
    if (
      parsed.origin !== origin ||
      !["https:", "http:"].includes(parsed.protocol)
    ) {
      throw new TypeError("Checkpoint API origin is invalid");
    }
    result.add(origin);
  }
  return result;
}

function validateLimit(
  value: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError("Checkpoint API limit is invalid");
  }
  return value;
}

function validTimestamp(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("Checkpoint API timestamp is invalid");
  }
  return value;
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function evictOldestWindow(
  windows: Map<string, { startedAt: number; used: number }>,
): void {
  let oldestKey: string | undefined;
  let oldest = Number.POSITIVE_INFINITY;
  for (const [key, value] of windows) {
    if (value.startedAt < oldest) {
      oldest = value.startedAt;
      oldestKey = key;
    }
  }
  if (oldestKey !== undefined) windows.delete(oldestKey);
}
