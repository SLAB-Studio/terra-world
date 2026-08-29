import { z } from "zod";

import { CityGuideRequestSchema, type CityGuideRequest } from "./city-guide";
import {
  resolveCityGuideResponse,
  validateCityGuideResponse,
  type CityGuideResponse,
} from "./guide-output";

export const CITY_GUIDE_ORCHESTRATOR_LIMITS = {
  minimumTimeoutMs: 1,
  maximumTimeoutMs: 30_000,
  minimumCacheTtlMs: 1,
  maximumCacheTtlMs: 24 * 60 * 60 * 1_000,
  maximumCacheEntries: 500,
} as const;

const PrivateProviderResultSchema = z
  .object({
    trustMode: z.literal("private"),
    output: z.unknown(),
  })
  .strict();

export type CityGuideProviderContext = {
  readonly signal: AbortSignal;
};

/**
 * The server adapter must attest that the response came from private trust
 * mode. Raw or public-tier responses are deliberately rejected at runtime.
 */
export type CityGuideProviderCall = (
  request: CityGuideRequest,
  context: CityGuideProviderContext,
) => Promise<unknown>;

export type CityGuideFallbackLookup = (request: CityGuideRequest) => unknown;

export type CityGuideOrchestrationResult =
  | {
      readonly ok: true;
      readonly source: "provider" | "cache" | "fallback";
      readonly value: CityGuideResponse;
    }
  | { readonly ok: false; readonly source: "none" };

export type CityGuideOrchestratorOptions = {
  readonly callProvider: CityGuideProviderCall;
  readonly lookupFallback: CityGuideFallbackLookup;
  readonly timeoutMs: number;
  readonly cacheTtlMs: number;
  readonly maxCacheEntries: number;
  readonly clock?: () => number;
};

export type CityGuideOrchestrator = {
  readonly resolve: (request: unknown) => Promise<CityGuideOrchestrationResult>;
  readonly clearCache: () => void;
  readonly cacheSize: () => number;
};

type CacheEntry = {
  readonly expiresAt: number;
  readonly serializedResponse: string;
};

/**
 * Runs optional city narration without coupling it to the simulation turn.
 * Every provider failure becomes a separately validated authored fallback.
 */
export function createCityGuideOrchestrator(
  options: CityGuideOrchestratorOptions,
): CityGuideOrchestrator {
  validateOptions(options);

  const clock = options.clock ?? Date.now;
  const cache = new Map<string, CacheEntry>();
  const inFlight = new Map<string, Promise<unknown>>();

  const resolve = async (
    requestInput: unknown,
  ): Promise<CityGuideOrchestrationResult> => {
    const requestResult = CityGuideRequestSchema.safeParse(requestInput);
    if (!requestResult.success) return { ok: false, source: "none" };

    const request = requestResult.data;
    const cacheEligible = isCacheEligibleRequest(request);
    const cacheKey = cacheEligible
      ? createCityGuideCacheKey(request)
      : undefined;
    // Coalescing is deliberately stricter than persistent caching. We do not
    // know whether provider output is generic until after validation, so only
    // byte-identical validated requests may share an in-flight call.
    const inFlightKey = cacheEligible ? JSON.stringify(request) : undefined;

    if (cacheKey !== undefined) {
      const cached = readCache(cache, cacheKey, clock());
      if (cached !== undefined) {
        const validation = validateCityGuideResponse(request, cached);
        if (validation.ok) {
          return { ok: true, source: "cache", value: validation.value };
        }
        cache.delete(cacheKey);
      }
    }

    let providerResult: unknown;
    try {
      providerResult = await getProviderResult({
        request,
        inFlightKey,
        inFlight,
        callProvider: options.callProvider,
        timeoutMs: options.timeoutMs,
      });
    } catch {
      return resolveFallback(request, options.lookupFallback);
    }

    const privateResult = PrivateProviderResultSchema.safeParse(providerResult);
    if (!privateResult.success) {
      return resolveFallback(request, options.lookupFallback);
    }

    const validation = validateCityGuideResponse(
      request,
      privateResult.data.output,
    );
    if (!validation.ok) {
      return resolveFallback(request, options.lookupFallback);
    }

    if (
      cacheKey !== undefined &&
      isGenericCacheableResponse(validation.value)
    ) {
      writeCache(cache, cacheKey, validation.value, {
        now: clock(),
        ttlMs: options.cacheTtlMs,
        maxEntries: options.maxCacheEntries,
      });
    }

    return { ok: true, source: "provider", value: validation.value };
  };

  return {
    resolve,
    clearCache: () => cache.clear(),
    cacheSize: () => cache.size,
  };
}

/**
 * The key intentionally contains only stable, verified instructional facts.
 * It cannot vary by city, action coordinates, scores, free text, or memories.
 */
export function createCityGuideCacheKey(requestInput: unknown): string {
  const request = CityGuideRequestSchema.parse(requestInput);
  return JSON.stringify({
    version: 1,
    ageBand: request.ageBand,
    task: request.task,
    causeCodes: sortedUnique(request.causes.map((cause) => cause.code)),
    factKeys: sortedUnique(request.allowedFactKeys),
  });
}

function validateOptions(options: CityGuideOrchestratorOptions): void {
  assertBoundedInteger(
    options.timeoutMs,
    CITY_GUIDE_ORCHESTRATOR_LIMITS.minimumTimeoutMs,
    CITY_GUIDE_ORCHESTRATOR_LIMITS.maximumTimeoutMs,
    "timeoutMs",
  );
  assertBoundedInteger(
    options.cacheTtlMs,
    CITY_GUIDE_ORCHESTRATOR_LIMITS.minimumCacheTtlMs,
    CITY_GUIDE_ORCHESTRATOR_LIMITS.maximumCacheTtlMs,
    "cacheTtlMs",
  );
  assertBoundedInteger(
    options.maxCacheEntries,
    1,
    CITY_GUIDE_ORCHESTRATOR_LIMITS.maximumCacheEntries,
    "maxCacheEntries",
  );
}

function assertBoundedInteger(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(
      `${label} must be an integer from ${minimum} to ${maximum}`,
    );
  }
}

function isCacheEligibleRequest(request: CityGuideRequest): boolean {
  return request.task === "explain" && request.relevantMemories.length === 0;
}

function isGenericCacheableResponse(response: CityGuideResponse): boolean {
  const grounding = response.grounding;
  if (
    grounding.metricKeys.length > 0 ||
    grounding.buildingIds.length > 0 ||
    grounding.messageKeys.length > 0 ||
    response.hints !== undefined ||
    response.memoryCandidate !== undefined
  ) {
    return false;
  }

  const visibleText = [
    response.headline,
    response.message,
    ...(response.reflectiveQuestion === undefined
      ? []
      : [response.reflectiveQuestion]),
    ...(response.vocabulary?.flatMap((entry) => [entry.term, entry.meaning]) ??
      []),
  ];
  return visibleText.every((text) => !/\d/u.test(text));
}

function readCache(
  cache: Map<string, CacheEntry>,
  key: string,
  now: number,
): string | undefined {
  const entry = cache.get(key);
  if (entry === undefined) return undefined;
  if (entry.expiresAt <= now) {
    cache.delete(key);
    return undefined;
  }

  // LRU order changes, but the fixed expiry does not.
  cache.delete(key);
  cache.set(key, entry);
  return entry.serializedResponse;
}

function writeCache(
  cache: Map<string, CacheEntry>,
  key: string,
  response: CityGuideResponse,
  options: {
    readonly now: number;
    readonly ttlMs: number;
    readonly maxEntries: number;
  },
): void {
  cache.delete(key);
  while (cache.size >= options.maxEntries) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
  cache.set(key, {
    expiresAt: options.now + options.ttlMs,
    serializedResponse: JSON.stringify(response),
  });
}

async function getProviderResult(input: {
  readonly request: CityGuideRequest;
  readonly inFlightKey: string | undefined;
  readonly inFlight: Map<string, Promise<unknown>>;
  readonly callProvider: CityGuideProviderCall;
  readonly timeoutMs: number;
}): Promise<unknown> {
  if (input.inFlightKey === undefined) {
    return callProviderWithTimeout(
      input.callProvider,
      input.request,
      input.timeoutMs,
    );
  }

  const existing = input.inFlight.get(input.inFlightKey);
  if (existing !== undefined) return existing;

  const inFlightKey = input.inFlightKey;
  const pending = callProviderWithTimeout(
    input.callProvider,
    input.request,
    input.timeoutMs,
  ).finally(() => {
    if (input.inFlight.get(inFlightKey) === pending) {
      input.inFlight.delete(inFlightKey);
    }
  });
  input.inFlight.set(inFlightKey, pending);
  return pending;
}

function callProviderWithTimeout(
  callProvider: CityGuideProviderCall,
  request: CityGuideRequest,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      controller.abort();
      reject(new Error("City guide provider timed out"));
    }, timeoutMs);

    void Promise.resolve()
      .then(() => callProvider(request, { signal: controller.signal }))
      .then(
        (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        },
      );
  });
}

function resolveFallback(
  request: CityGuideRequest,
  lookupFallback: CityGuideFallbackLookup,
): CityGuideOrchestrationResult {
  let fallback: unknown;
  try {
    fallback = lookupFallback(request);
  } catch {
    return { ok: false, source: "none" };
  }

  return resolveCityGuideResponse({
    request,
    providerOutput: undefined,
    fallback,
  });
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
