import {
  CityGuideRequestSchema,
  type CityGuideRequest,
} from "../../../../../packages/safety/src/city-guide";
import {
  createCityGuideOrchestrator,
  type CityGuideProviderCall,
} from "../../../../../packages/safety/src/guide-orchestrator";
import type { CityGuideResponse } from "../../../../../packages/safety/src/guide-output";
import { createRivergateGuideCompletion } from "../../../../../packages/safety/src/guide-prompt";
import type { ZeroGComputeClient } from "../../../../../packages/zero-g/src/server/compute";

export const GUIDE_API_LIMITS = {
  maximumBodyBytes: 64 * 1_024,
  maximumProviderOutputCharacters: 16_000,
  maximumRequestsPerWindow: 500,
  maximumWindowMs: 60 * 60 * 1_000,
} as const;

export type AnonymousRateLimiter = Readonly<{
  tryAcquire(): boolean;
}>;

export type GuidePostHandlerOptions = Readonly<{
  callProvider: CityGuideProviderCall;
  rateLimiter: AnonymousRateLimiter;
  timeoutMs: number;
  cacheTtlMs: number;
  maxCacheEntries: number;
  required?: boolean;
  clock?: () => number;
}>;

type GuideApiPayload = Readonly<{
  guide: CityGuideResponse | null;
  source: "provider" | "cache" | "fallback" | "none";
}>;

/** A bounded, process-local limiter with no IP, account, or child identifier. */
export function createAnonymousRateLimiter(input: {
  readonly capacity: number;
  readonly windowMs: number;
  readonly clock?: () => number;
}): AnonymousRateLimiter {
  assertInteger(input.capacity, 1, GUIDE_API_LIMITS.maximumRequestsPerWindow);
  assertInteger(input.windowMs, 1, GUIDE_API_LIMITS.maximumWindowMs);

  const clock = input.clock ?? Date.now;
  let windowStartedAt = clock();
  let used = 0;

  return Object.freeze({
    tryAcquire(): boolean {
      const now = clock();
      if (now < windowStartedAt || now - windowStartedAt >= input.windowMs) {
        windowStartedAt = now;
        used = 0;
      }
      if (used >= input.capacity) return false;
      used += 1;
      return true;
    },
  });
}

/**
 * Creates the POST implementation while keeping secrets and provider failures
 * outside the child-facing response contract.
 */
export function createGuidePostHandler(
  options: GuidePostHandlerOptions,
): (request: Request) => Promise<Response> {
  const orchestrator = createCityGuideOrchestrator({
    callProvider: async (request, context) => {
      if (!options.rateLimiter.tryAcquire()) throw RATE_LIMITED;
      return options.callProvider(request, context);
    },
    lookupFallback: createAuthoredGuideFallback,
    timeoutMs: options.timeoutMs,
    cacheTtlMs: options.cacheTtlMs,
    maxCacheEntries: options.maxCacheEntries,
    ...(options.clock === undefined ? {} : { clock: options.clock }),
  });

  return async (request: Request): Promise<Response> => {
    if (!hasJsonContentType(request)) {
      return guideResponse({ guide: null, source: "none" }, 415);
    }

    const body = await readBoundedJson(request);
    if (!body.ok) {
      return guideResponse({ guide: null, source: "none" }, body.status);
    }

    const parsed = CityGuideRequestSchema.safeParse(body.value);
    if (!parsed.success) {
      return guideResponse({ guide: null, source: "none" }, 400);
    }

    const result = await orchestrator.resolve(parsed.data, {
      signal: request.signal,
    });
    if (!result.ok) {
      return guideResponse({ guide: null, source: "none" }, 503);
    }
    if (options.required === true && result.source === "fallback") {
      return guideResponse({ guide: null, source: "none" }, 503);
    }
    return guideResponse({ guide: result.value, source: result.source }, 200);
  };
}

/** Adapts the verified guide prompt to the private 0G Compute client. */
export function createPrivateZeroGGuideProvider(
  client: Pick<ZeroGComputeClient, "createChatCompletion">,
): CityGuideProviderCall {
  return async (request, context) => {
    if (context.signal.aborted) throw PROVIDER_CANCELLED;
    const completion = createRivergateGuideCompletion(request);
    const result = await client.createChatCompletion(completion, {
      signal: context.signal,
    });
    if (
      context.signal.aborted ||
      result.trustMode !== "private" ||
      result.teeVerificationRequested !== true ||
      result.teeVerified !== true
    ) {
      throw PROVIDER_CANCELLED;
    }

    return {
      trustMode: "private" as const,
      output: extractAssistantContent(result.payload),
    };
  };
}

export function extractAssistantContent(payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    throw new TypeError("Invalid private Compute response");
  }
  const firstChoice = payload.choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    throw new TypeError("Invalid private Compute response");
  }
  const content = firstChoice.message.content;
  if (
    typeof content !== "string" ||
    content.trim().length === 0 ||
    content.length > GUIDE_API_LIMITS.maximumProviderOutputCharacters
  ) {
    throw new TypeError("Invalid private Compute response");
  }
  return content;
}

export function createAuthoredGuideFallback(
  request: CityGuideRequest,
): unknown {
  const grounding = authoredGrounding(request);

  switch (request.task) {
    case "explain":
      return {
        headline: "Look at what changed",
        message:
          "I noticed one verified change in our city. Let us compare what was there before with what appeared after.",
        reflectiveQuestion: "What changed first after your choice?",
        grounding,
      };
    case "hint":
      return {
        headline: "Notice one small clue",
        message:
          "I can help us inspect the verified mission clues one step at a time.",
        hints: [
          "Look around before making another change.",
          "Compare the city before and after your last choice.",
          "Use the highlighted cause to choose the next check.",
        ],
        grounding,
      };
    case "react":
      return {
        headline: "Something changed",
        message:
          "I noticed one verified change in our city. What else looks different around it?",
        grounding,
      };
    case "memory": {
      const milestone = request.causes.find((cause) =>
        cause.code.startsWith("milestone."),
      );
      const factKey =
        request.allowedFactKeys[0] ?? request.relevantMemories[0]?.factKey;
      if (milestone === undefined || factKey === undefined) return {};

      return {
        headline: "A city milestone",
        message:
          "I will remember this verified milestone as part of our city learning story.",
        memoryCandidate: {
          milestoneId: milestone.code.slice("milestone.".length),
          earnedTurn: request.after.turn,
          factKey,
          causeCodes: [milestone.code],
        },
        grounding: {
          metricKeys: [],
          buildingIds: [],
          factKeys: [factKey],
          messageKeys: [],
          causeCodes: [milestone.code],
        },
      };
    }
  }
}

function authoredGrounding(request: CityGuideRequest) {
  const causeCode = request.causes[0]?.code;
  const factKey = request.allowedFactKeys[0];
  if (causeCode !== undefined || factKey !== undefined) {
    return {
      metricKeys: [],
      buildingIds: [],
      factKeys: factKey === undefined ? [] : [factKey],
      messageKeys: [],
      causeCodes: causeCode === undefined ? [] : [causeCode],
    };
  }
  return {
    metricKeys: [],
    buildingIds: [],
    factKeys: [],
    messageKeys: [request.mission.briefingKey],
    causeCodes: [],
  };
}

async function readBoundedJson(
  request: Request,
): Promise<
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly status: 400 | 413 }
> {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    Number(declaredLength) > GUIDE_API_LIMITS.maximumBodyBytes
  ) {
    return { ok: false, status: 413 };
  }

  const boundedBody = await readBoundedBody(request);
  if (!boundedBody.ok) return boundedBody;

  try {
    return { ok: true, value: JSON.parse(boundedBody.value) as unknown };
  } catch {
    return { ok: false, status: 400 };
  }
}

async function readBoundedBody(
  request: Request,
): Promise<
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly status: 400 | 413 }
> {
  if (request.body === null) return { ok: false, status: 400 };

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let totalBytes = 0;
  let body = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      totalBytes += chunk.value.byteLength;
      if (totalBytes > GUIDE_API_LIMITS.maximumBodyBytes) {
        await reader.cancel();
        return { ok: false, status: 413 };
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    return { ok: true, value: body };
  } catch {
    return { ok: false, status: 400 };
  } finally {
    reader.releaseLock();
  }
}

function hasJsonContentType(request: Request): boolean {
  const contentType = request.headers.get("content-type")?.toLowerCase();
  return contentType?.split(";", 1)[0]?.trim() === "application/json";
}

function guideResponse(payload: GuideApiPayload, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function assertInteger(value: number, minimum: number, maximum: number): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(
      `Value must be an integer from ${minimum} to ${maximum}`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const RATE_LIMITED = Symbol("rate-limited");
const PROVIDER_CANCELLED = Symbol("provider-cancelled");
