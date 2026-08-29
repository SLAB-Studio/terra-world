import type { VerifiedCampaignRun } from "../../../../lib/runs/verify-server";
import { RunVerificationError } from "../../../../lib/runs/verify-server";

export const RUN_VERIFICATION_API_LIMITS = {
  maximumBodyBytes: 2_000_000,
  maximumRequestsPerWindow: 30,
  maximumWindowMs: 60 * 60_000,
} as const;

export type RunVerifier = (input: unknown) => Promise<VerifiedCampaignRun>;

export type RunVerificationRateLimiter = Readonly<{
  tryAcquire(): boolean;
}>;

export function createRunVerificationPostHandler(input: {
  readonly verify: RunVerifier;
  readonly rateLimiter: RunVerificationRateLimiter;
  readonly allowedOrigins: readonly string[];
  readonly maximumBodyBytes?: number;
}): (request: Request) => Promise<Response> {
  const allowedOrigins = validateOrigins(input.allowedOrigins);
  const maximumBodyBytes = boundedInteger(
    input.maximumBodyBytes ?? RUN_VERIFICATION_API_LIMITS.maximumBodyBytes,
    1,
    RUN_VERIFICATION_API_LIMITS.maximumBodyBytes,
  );

  return async (request: Request): Promise<Response> => {
    if (!isAllowedOrigin(request, allowedOrigins)) {
      return failure("not_authorized", false, 403);
    }
    if (
      !/^application\/json(?:\s*;|$)/iu.test(
        request.headers.get("content-type") ?? "",
      )
    ) {
      return failure("invalid_request", false, 415);
    }
    if (!input.rateLimiter.tryAcquire()) {
      return failure("rate_limited", true, 429);
    }

    const parsed = await readJson(request, maximumBodyBytes);
    if (!parsed.ok) return failure("invalid_request", false, parsed.status);
    try {
      const verification = await input.verify(parsed.value);
      return Response.json(
        { ok: true, verification },
        { status: 200, headers: responseHeaders() },
      );
    } catch (error) {
      if (error instanceof RunVerificationError) {
        return error.code === "campaign_not_registered"
          ? failure("campaign_not_registered", false, 404)
          : error.code === "replay_rejected"
            ? failure("replay_rejected", false, 422)
            : failure("invalid_request", false, 400);
      }
      return failure("verification_unavailable", true, 503);
    }
  };
}

export function createRunVerificationRateLimiter(input: {
  readonly capacity: number;
  readonly windowMs: number;
  readonly clock?: () => number;
}): RunVerificationRateLimiter {
  const capacity = boundedInteger(
    input.capacity,
    1,
    RUN_VERIFICATION_API_LIMITS.maximumRequestsPerWindow,
  );
  const windowMs = boundedInteger(
    input.windowMs,
    1,
    RUN_VERIFICATION_API_LIMITS.maximumWindowMs,
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

async function readJson(
  request: Request,
  maximumBodyBytes: number,
): Promise<
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly status: 400 | 413 }
> {
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > maximumBodyBytes) {
    return { ok: false, status: 413 };
  }
  const bytes = await readBoundedBytes(request.body, maximumBodyBytes);
  if (!bytes.ok) return bytes;
  try {
    return {
      ok: true,
      value: JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes.value),
      ) as unknown,
    };
  } catch {
    return { ok: false, status: 400 };
  }
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

function failure(
  code:
    | "invalid_request"
    | "not_authorized"
    | "rate_limited"
    | "campaign_not_registered"
    | "replay_rejected"
    | "verification_unavailable",
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

function isAllowedOrigin(request: Request, allowed: Set<string>): boolean {
  const origin = request.headers.get("origin");
  return (
    origin !== null &&
    allowed.has(origin) &&
    new URL(request.url).origin === origin
  );
}

function validateOrigins(origins: readonly string[]): Set<string> {
  if (origins.length === 0)
    throw new RangeError("At least one origin is required");
  const allowed = new Set<string>();
  for (const origin of origins) {
    const parsed = new URL(origin);
    if (
      parsed.origin !== origin ||
      !["http:", "https:"].includes(parsed.protocol)
    ) {
      throw new TypeError("Run verification origin is invalid");
    }
    allowed.add(origin);
  }
  return allowed;
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
    throw new RangeError("Run verification limit is invalid");
  }
  return value;
}
