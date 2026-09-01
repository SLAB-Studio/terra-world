export const ADULT_SESSION_ENDPOINT = "/api/checkpoints/session" as const;

export const ADULT_SESSION_HTTP_LIMITS = Object.freeze({
  defaultTimeoutMs: 15_000,
  maximumTimeoutMs: 30_000,
  maximumResponseBytes: 1_024,
});

export type AdultSessionHttpOptions = Readonly<{
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}>;

export type AdultSessionHttpResult = Readonly<{ expiresAt: number }>;

export type AdultSessionHttpClient = Readonly<{
  begin(): Promise<AdultSessionHttpResult>;
}>;

export class AdultSessionHttpError extends Error {
  override readonly name = "AdultSessionHttpError";

  constructor() {
    super("Adult session is unavailable");
  }
}

/**
 * Starts the existing same-origin adult checkpoint session. Authentication stays
 * in the HttpOnly cookie; this client accepts and returns no token or secret.
 */
export function createAdultSessionHttpClient(
  options: AdultSessionHttpOptions = {},
): AdultSessionHttpClient {
  const fetcher = options.fetch ?? globalThis.fetch;
  if (typeof fetcher !== "function") {
    throw new TypeError("Adult session fetch is unavailable");
  }
  const timeoutMs = validateTimeout(
    options.timeoutMs ?? ADULT_SESSION_HTTP_LIMITS.defaultTimeoutMs,
  );

  return Object.freeze({
    async begin(): Promise<AdultSessionHttpResult> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetcher(ADULT_SESSION_ENDPOINT, {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          redirect: "error",
          referrerPolicy: "no-referrer",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            schemaVersion: 1,
            operation: "begin-adult-session",
            adultConfirmed: true,
          }),
          signal: controller.signal,
        });
        const payload = await readBoundedJson(response);
        if (!response.ok || !isSuccessPayload(payload)) {
          throw new AdultSessionHttpError();
        }
        return Object.freeze({ expiresAt: payload.expiresAt });
      } catch (error) {
        if (error instanceof AdultSessionHttpError) throw error;
        throw new AdultSessionHttpError();
      } finally {
        clearTimeout(timeout);
      }
    },
  });
}

async function readBoundedJson(response: Response): Promise<unknown> {
  if (
    !/^application\/json(?:\s*;|$)/iu.test(
      response.headers.get("content-type") ?? "",
    )
  ) {
    throw new AdultSessionHttpError();
  }
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    if (!/^\d+$/u.test(declared)) throw new AdultSessionHttpError();
    const declaredBytes = Number(declared);
    if (
      !Number.isSafeInteger(declaredBytes) ||
      declaredBytes > ADULT_SESSION_HTTP_LIMITS.maximumResponseBytes
    ) {
      throw new AdultSessionHttpError();
    }
  }
  if (response.body === null) throw new AdultSessionHttpError();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > ADULT_SESSION_HTTP_LIMITS.maximumResponseBytes) {
        await reader.cancel();
        throw new AdultSessionHttpError();
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
    throw new AdultSessionHttpError();
  }
}

function isSuccessPayload(
  value: unknown,
): value is Readonly<{ ok: true; expiresAt: number }> {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["ok", "expiresAt"]) &&
    value.ok === true &&
    Number.isSafeInteger(value.expiresAt) &&
    Number(value.expiresAt) > 0
  );
}

function validateTimeout(value: number): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 1_000 ||
    value > ADULT_SESSION_HTTP_LIMITS.maximumTimeoutMs
  ) {
    throw new RangeError("Adult session request timeout is invalid");
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
