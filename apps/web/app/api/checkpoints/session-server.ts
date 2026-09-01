import type {
  AdultCheckpointSessionStore,
  AdultCheckpointStorageReference,
  AdultSession,
} from "./server";

const SESSION_TOKEN = /^[A-Za-z0-9_-]{32,128}$/u;
const SESSION_ID = /^adult-session:[a-f0-9]{64}$/u;
const SAFE_ROOT = /^[A-Za-z0-9._:-]{1,256}$/u;
const IDEMPOTENCY_KEY = /^checkpoint-v1-[a-f0-9]{64}$/u;
const CONTENT_HASH = /^sha256:[a-f0-9]{64}$/u;
const SESSION_BODY_BYTES = 256;

export const ADULT_SESSION_COOKIE = "terra_adult";

export interface AdultCheckpointRepository extends AdultCheckpointSessionStore {
  createSession(sessionId: string, expiresAt: number): Promise<void>;
  isSessionActive(sessionId: string, now: number): Promise<boolean>;
}

export type AdultSessionPostHandlerOptions = Readonly<{
  repository: AdultCheckpointRepository;
  allowedOrigins: readonly string[];
  clock?: () => number;
  randomBytes?: (length: number) => Uint8Array;
  sessionTtlMs?: number;
}>;

export function createAdultSessionPostHandler(
  options: AdultSessionPostHandlerOptions,
): (request: Request) => Promise<Response> {
  const origins = validateOrigins(options.allowedOrigins);
  const clock = options.clock ?? Date.now;
  const randomBytes = options.randomBytes ?? secureRandomBytes;
  const sessionTtlMs = boundedInteger(
    options.sessionTtlMs ?? 30 * 60_000,
    60_000,
    24 * 60 * 60_000,
    "adult session lifetime",
  );

  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    if (
      origin === null ||
      !origins.has(origin) ||
      new URL(request.url).origin !== origin
    ) {
      return sessionFailure(403);
    }
    if (
      !/^application\/json(?:\s*;|$)/iu.test(
        request.headers.get("content-type") ?? "",
      )
    ) {
      return sessionFailure(415);
    }
    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > SESSION_BODY_BYTES) {
      return sessionFailure(413);
    }
    const body = await readBoundedJson(request, SESSION_BODY_BYTES);
    if (
      !isRecord(body) ||
      !hasExactKeys(body, ["schemaVersion", "operation", "adultConfirmed"]) ||
      body.schemaVersion !== 1 ||
      body.operation !== "begin-adult-session" ||
      body.adultConfirmed !== true
    ) {
      return sessionFailure(400);
    }

    let token: string;
    let expiresAt: number;
    try {
      token = encodeBase64Url(randomBytes(32));
      if (!SESSION_TOKEN.test(token)) return sessionFailure(503, true);
      const sessionId = await sessionIdForToken(token);
      const now = validTimestamp(clock());
      expiresAt = validTimestamp(now + sessionTtlMs);
      await options.repository.createSession(sessionId, expiresAt);
    } catch {
      return sessionFailure(503, true);
    }

    return Response.json(
      { ok: true, expiresAt },
      {
        status: 201,
        headers: {
          ...privateResponseHeaders(),
          "set-cookie": serializeSessionCookie(
            token,
            Math.floor(sessionTtlMs / 1_000),
            new URL(request.url).protocol === "https:",
          ),
        },
      },
    );
  };
}

export function createAdultSessionAuthorizer(input: {
  readonly repository: AdultCheckpointRepository;
  readonly clock?: () => number;
}): (request: Request) => Promise<AdultSession | null> {
  const clock = input.clock ?? Date.now;
  return async (request) => {
    const token = readCookie(
      request.headers.get("cookie"),
      ADULT_SESSION_COOKIE,
    );
    if (token === null || !SESSION_TOKEN.test(token)) return null;
    const sessionId = await sessionIdForToken(token);
    return (await input.repository.isSessionActive(
      sessionId,
      validTimestamp(clock()),
    ))
      ? Object.freeze({ sessionId })
      : null;
  };
}

/**
 * Bounded local/demo repository. It stores a SHA-256 session identifier rather
 * than the cookie token, plus ciphertext references only. Deployments can
 * inject a durable implementation of the same interface.
 */
export function createMemoryAdultCheckpointRepository(
  input: {
    readonly maximumSessions?: number;
    readonly maximumReferences?: number;
  } = {},
): AdultCheckpointRepository {
  const maximumSessions = boundedInteger(
    input.maximumSessions ?? 1_000,
    1,
    10_000,
    "session capacity",
  );
  const maximumReferences = boundedInteger(
    input.maximumReferences ?? 10_000,
    1,
    100_000,
    "reference capacity",
  );
  const sessions = new Map<string, number>();
  const byIdempotency = new Map<string, AdultCheckpointStorageReference>();
  const byRoot = new Map<string, AdultCheckpointStorageReference>();

  const repository: AdultCheckpointRepository = {
    async createSession(sessionId, expiresAt) {
      assertSessionId(sessionId);
      validTimestamp(expiresAt);
      if (!sessions.has(sessionId) && sessions.size >= maximumSessions) {
        evictEarliestSession(sessions, byIdempotency);
      }
      sessions.set(sessionId, expiresAt);
    },

    async isSessionActive(sessionId, now) {
      if (!SESSION_ID.test(sessionId)) return false;
      const expiresAt = sessions.get(sessionId);
      if (expiresAt === undefined) return false;
      if (expiresAt <= now) {
        removeSession(sessionId, sessions, byIdempotency);
        return false;
      }
      return true;
    },

    async findByIdempotency(session, idempotencyKey) {
      if (
        !isKnownSession(session, sessions) ||
        !IDEMPOTENCY_KEY.test(idempotencyKey)
      ) {
        return null;
      }
      return (
        byIdempotency.get(referenceKey(session.sessionId, idempotencyKey)) ??
        null
      );
    },

    async attach(session, reference) {
      if (!isKnownSession(session, sessions)) {
        throw new TypeError("Adult checkpoint session is unavailable");
      }
      assertReference(reference);
      const idKey = referenceKey(session.sessionId, reference.idempotencyKey);
      if (!byRoot.has(reference.root) && byRoot.size >= maximumReferences) {
        throw new RangeError("Adult checkpoint reference capacity reached");
      }
      byIdempotency.set(idKey, Object.freeze({ ...reference }));
      byRoot.set(reference.root, Object.freeze({ ...reference }));
    },

    async findByRoot(session, root) {
      // 0G Storage is public-by-root and contains ciphertext only. Keeping the
      // root catalog portable lets a recovery pack work after its short-lived
      // authorization session expires; the API still authenticates and rate
      // limits the current session, and decryption stays client-side.
      if (!SESSION_ID.test(session.sessionId) || !SAFE_ROOT.test(root)) {
        return null;
      }
      return byRoot.get(root) ?? null;
    },
  };
  return Object.freeze(repository);
}

async function sessionIdForToken(token: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return `adult-session:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

async function readBoundedJson(
  request: Request,
  maximumBytes: number,
): Promise<unknown> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maximumBytes) {
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
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch {
    return null;
  }
}

function secureRandomBytes(length: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

function encodeBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function serializeSessionCookie(
  token: string,
  maxAge: number,
  secure: boolean,
): string {
  return [
    `${ADULT_SESSION_COOKIE}=${token}`,
    "Path=/api/checkpoints",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAge}`,
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

function readCookie(header: string | null, name: string): string | null {
  if (header === null) return null;
  for (const segment of header.split(";")) {
    const separator = segment.indexOf("=");
    if (separator < 1) continue;
    if (segment.slice(0, separator).trim() === name) {
      return segment.slice(separator + 1).trim();
    }
  }
  return null;
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
        throw new TypeError("Adult session origin is invalid");
      }
      return value;
    }),
  );
}

function isKnownSession(
  session: AdultSession,
  sessions: ReadonlyMap<string, number>,
): boolean {
  return SESSION_ID.test(session.sessionId) && sessions.has(session.sessionId);
}

function assertSessionId(value: string): void {
  if (!SESSION_ID.test(value))
    throw new TypeError("Adult session identifier is invalid");
}

function assertReference(value: AdultCheckpointStorageReference): void {
  if (
    !SAFE_ROOT.test(value.root) ||
    !CONTENT_HASH.test(value.contentHash) ||
    !IDEMPOTENCY_KEY.test(value.idempotencyKey) ||
    (value.checkpointSavedAt !== null &&
      (!Number.isSafeInteger(value.checkpointSavedAt) ||
        value.checkpointSavedAt < 0)) ||
    !Number.isSafeInteger(value.byteLength) ||
    value.byteLength < 1 ||
    !Number.isSafeInteger(value.attachedAt) ||
    value.attachedAt < 0
  ) {
    throw new TypeError("Adult checkpoint reference is invalid");
  }
}

function removeSession(
  sessionId: string,
  sessions: Map<string, number>,
  byIdempotency: Map<string, AdultCheckpointStorageReference>,
): void {
  sessions.delete(sessionId);
  const prefix = `${sessionId}:`;
  for (const key of byIdempotency.keys())
    if (key.startsWith(prefix)) byIdempotency.delete(key);
}

function evictEarliestSession(
  sessions: Map<string, number>,
  byIdempotency: Map<string, AdultCheckpointStorageReference>,
): void {
  let earliestId: string | undefined;
  let earliestExpiry = Number.POSITIVE_INFINITY;
  for (const [sessionId, expiresAt] of sessions) {
    if (expiresAt < earliestExpiry) {
      earliestId = sessionId;
      earliestExpiry = expiresAt;
    }
  }
  if (earliestId !== undefined)
    removeSession(earliestId, sessions, byIdempotency);
}

function referenceKey(sessionId: string, value: string): string {
  return `${sessionId}:${value}`;
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
  if (!Number.isSafeInteger(value) || value < 0)
    throw new TypeError("Invalid timestamp");
  return value;
}

function privateResponseHeaders(): HeadersInit {
  return {
    "cache-control": "private, no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  };
}

function sessionFailure(status: number, retryable = false): Response {
  return Response.json(
    { ok: false, code: "session_rejected", retryable },
    { status, headers: privateResponseHeaders() },
  );
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
