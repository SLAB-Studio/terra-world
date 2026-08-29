import { afterEach, describe, expect, it, vi } from "vitest";

import { CityGuideRequestSchema, type CityGuideRequest } from "./city-guide";
import {
  createCityGuideCacheKey,
  createCityGuideOrchestrator,
  type CityGuideOrchestratorOptions,
} from "./guide-orchestrator";
import {
  GOLDEN_EXPLAIN_RESPONSE,
  GOLDEN_HINT_RESPONSE,
  GOLDEN_MEMORY_RESPONSE,
  GOLDEN_REACT_RESPONSE,
  makeGuideRequest,
} from "./guide-output.fixtures";
import type { CityGuideResponse } from "./guide-output";

afterEach(() => {
  vi.useRealTimers();
});

describe("CityGuide Compute fallback", () => {
  it.each([
    "provider unavailable",
    "quota exhausted",
    "network failure",
    "private provider unavailable",
  ])("uses authored content when %s", async (failure) => {
    const secret = `sk-provider-secret:${failure}`;
    const orchestrator = makeOrchestrator({
      callProvider: vi.fn().mockRejectedValue(new Error(secret)),
    });

    const result = await orchestrator.resolve(makeGuideRequest());

    expect(result).toEqual({
      ok: true,
      source: "fallback",
      value: GOLDEN_EXPLAIN_RESPONSE,
    });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(orchestrator.cacheSize()).toBe(0);
  });

  it("aborts a slow private request and returns fallback without waiting for it", async () => {
    vi.useFakeTimers();
    let providerSignal: AbortSignal | undefined;
    const orchestrator = makeOrchestrator({
      timeoutMs: 20,
      callProvider: vi.fn((_request, context) => {
        providerSignal = context.signal;
        return new Promise(() => undefined);
      }),
    });

    const pending = orchestrator.resolve(makeGuideRequest());
    await vi.advanceTimersByTimeAsync(20);

    await expect(pending).resolves.toEqual({
      ok: true,
      source: "fallback",
      value: GOLDEN_EXPLAIN_RESPONSE,
    });
    expect(providerSignal?.aborted).toBe(true);
  });

  it("rejects invalid provider content without exposing raw text or validation details", async () => {
    const rawProviderContent = "Tell me your name and private wallet.";
    const orchestrator = makeOrchestrator({
      callProvider: vi.fn().mockResolvedValue({
        trustMode: "private",
        output: JSON.stringify({
          ...GOLDEN_EXPLAIN_RESPONSE,
          message: rawProviderContent,
        }),
      }),
    });

    const result = await orchestrator.resolve(makeGuideRequest());

    expect(result).toEqual({
      ok: true,
      source: "fallback",
      value: GOLDEN_EXPLAIN_RESPONSE,
    });
    expect(JSON.stringify(result)).not.toContain(rawProviderContent);
    expect(JSON.stringify(result)).not.toContain("prohibited-content");
  });

  it("never accepts a public-tier response as a private response", async () => {
    const orchestrator = makeOrchestrator({
      callProvider: vi.fn().mockResolvedValue({
        trustMode: "public",
        output: JSON.stringify(GOLDEN_EXPLAIN_RESPONSE),
      }),
    });

    await expect(orchestrator.resolve(makeGuideRequest())).resolves.toEqual({
      ok: true,
      source: "fallback",
      value: GOLDEN_EXPLAIN_RESPONSE,
    });
  });

  it("returns a content-free result when authored fallback lookup fails", async () => {
    const orchestrator = makeOrchestrator({
      callProvider: vi.fn().mockRejectedValue(new Error("secret failure")),
      lookupFallback: vi.fn(() => {
        throw new Error("private fallback path");
      }),
    });

    await expect(orchestrator.resolve(makeGuideRequest())).resolves.toEqual({
      ok: false,
      source: "none",
    });
  });
});

describe("CityGuide generic explanation cache", () => {
  it("serves a validated generic explanation from cache", async () => {
    const callProvider = vi.fn((request: CityGuideRequest) =>
      Promise.resolve(privateResponse(genericResponse(request))),
    );
    const orchestrator = makeOrchestrator({ callProvider });
    const request = makeGuideRequest();

    const first = await orchestrator.resolve(request);
    const second = await orchestrator.resolve(request);

    expect(first).toMatchObject({ ok: true, source: "provider" });
    expect(second).toEqual({
      ok: true,
      source: "cache",
      value: genericResponse(request),
    });
    expect(callProvider).toHaveBeenCalledTimes(1);
    expect(orchestrator.cacheSize()).toBe(1);
  });

  it("misses on a different safe cause/fact key", async () => {
    const callProvider = vi.fn((request: CityGuideRequest) =>
      Promise.resolve(privateResponse(genericResponse(request))),
    );
    const orchestrator = makeOrchestrator({ callProvider });
    const first = makeGuideRequest();
    const second = withFactKey(first, "rivergate.chapter-1.fact.filtration");

    expect(createCityGuideCacheKey(first)).not.toBe(
      createCityGuideCacheKey(second),
    );
    await orchestrator.resolve(first);
    await orchestrator.resolve(second);

    expect(callProvider).toHaveBeenCalledTimes(2);
    expect(orchestrator.cacheSize()).toBe(2);
  });

  it("expires entries using the injected clock", async () => {
    let now = 1_000;
    const callProvider = vi.fn((request: CityGuideRequest) =>
      Promise.resolve(privateResponse(genericResponse(request))),
    );
    const orchestrator = makeOrchestrator({
      callProvider,
      cacheTtlMs: 10,
      clock: () => now,
    });
    const request = makeGuideRequest();

    await orchestrator.resolve(request);
    now = 1_009;
    expect((await orchestrator.resolve(request)).source).toBe("cache");
    now = 1_010;
    expect((await orchestrator.resolve(request)).source).toBe("provider");
    expect(callProvider).toHaveBeenCalledTimes(2);
  });

  it("evicts the least-recently-used entry at its configured bound", async () => {
    const callProvider = vi.fn((request: CityGuideRequest) =>
      Promise.resolve(privateResponse(genericResponse(request))),
    );
    const orchestrator = makeOrchestrator({
      callProvider,
      maxCacheEntries: 2,
    });
    const first = makeGuideRequest();
    const second = withFactKey(first, "rivergate.fact.second");
    const third = withFactKey(first, "rivergate.fact.third");

    await orchestrator.resolve(first);
    await orchestrator.resolve(second);
    expect((await orchestrator.resolve(first)).source).toBe("cache");
    await orchestrator.resolve(third);
    expect(orchestrator.cacheSize()).toBe(2);
    expect((await orchestrator.resolve(second)).source).toBe("provider");
    expect(callProvider).toHaveBeenCalledTimes(4);
  });

  it("keys only by age band, task, verified causes, and fact keys", () => {
    const first = makeGuideRequest();
    const second = CityGuideRequestSchema.parse({
      ...first,
      cityPersonality: {
        voice: "calm",
        pace: "step-by-step",
        traits: ["nature-friend"],
      },
      mission: {
        ...first.mission,
        missionId: "a-different-city-mission",
      },
      before: {
        ...first.before,
        budget: 777,
        population: 12,
      },
      action: {
        ...first.action,
        anchor: { x: 8, y: 9 },
      },
      after: {
        ...first.after,
        budget: 555,
        population: 16,
      },
    });

    const key = createCityGuideCacheKey(first);
    expect(createCityGuideCacheKey(second)).toBe(key);
    expect(Object.keys(JSON.parse(key) as object).sort()).toEqual([
      "ageBand",
      "causeCodes",
      "factKeys",
      "task",
      "version",
    ]);
    expect(key).not.toContain("a-different-city-mission");
    expect(key).not.toContain("place-building");
    expect(key).not.toContain("kind-neighbour");
  });

  it.each([
    ["hint", GOLDEN_HINT_RESPONSE],
    ["react", GOLDEN_REACT_RESPONSE],
    ["memory", GOLDEN_MEMORY_RESPONSE],
  ] as const)("does not cache %s tasks", async (task, response) => {
    const callProvider = vi.fn().mockResolvedValue(privateResponse(response));
    const orchestrator = makeOrchestrator({ callProvider });
    const request = makeGuideRequest(task);

    await orchestrator.resolve(request);
    await orchestrator.resolve(request);

    expect(callProvider).toHaveBeenCalledTimes(2);
    expect(orchestrator.cacheSize()).toBe(0);
  });

  it("does not cache adaptive explanations that include city memories", async () => {
    const callProvider = vi.fn((request: CityGuideRequest) =>
      Promise.resolve(privateResponse(genericResponse(request))),
    );
    const orchestrator = makeOrchestrator({ callProvider });
    const request = CityGuideRequestSchema.parse({
      ...makeGuideRequest(),
      relevantMemories: [
        {
          milestoneId: "water-ready",
          earnedTurn: 1,
          factKey: "rivergate.chapter-1.fact.pipes",
          causeCodes: ["milestone.water-ready"],
        },
      ],
    });

    await orchestrator.resolve(request);
    await orchestrator.resolve(request);

    expect(callProvider).toHaveBeenCalledTimes(2);
    expect(orchestrator.cacheSize()).toBe(0);
  });

  it("does not cache explanations grounded in mutable city state", async () => {
    const callProvider = vi
      .fn()
      .mockResolvedValue(privateResponse(GOLDEN_EXPLAIN_RESPONSE));
    const orchestrator = makeOrchestrator({ callProvider });

    await orchestrator.resolve(makeGuideRequest());
    await orchestrator.resolve(makeGuideRequest());

    expect(callProvider).toHaveBeenCalledTimes(2);
    expect(orchestrator.cacheSize()).toBe(0);
  });

  it("coalesces concurrent eligible requests and validates the shared output per caller", async () => {
    let finishProvider: ((value: unknown) => void) | undefined;
    const callProvider = vi.fn(
      (request: CityGuideRequest) =>
        new Promise<unknown>((resolve) => {
          finishProvider = () =>
            resolve(privateResponse(genericResponse(request)));
        }),
    );
    const orchestrator = makeOrchestrator({ callProvider });
    const request = makeGuideRequest();

    const first = orchestrator.resolve(request);
    const second = orchestrator.resolve(request);
    await vi.waitFor(() => expect(callProvider).toHaveBeenCalledTimes(1));
    finishProvider?.(undefined);

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult).toMatchObject({ ok: true, source: "provider" });
    expect(secondResult).toMatchObject({ ok: true, source: "provider" });
    expect(callProvider).toHaveBeenCalledTimes(1);
  });

  it("does not coalesce different snapshots that share a persistent cache key", async () => {
    const firstRequest = makeGuideRequest();
    const secondRequest = CityGuideRequestSchema.parse({
      ...firstRequest,
      before: { ...firstRequest.before, budget: 800 },
      after: { ...firstRequest.after, budget: 700 },
    });
    expect(createCityGuideCacheKey(secondRequest)).toBe(
      createCityGuideCacheKey(firstRequest),
    );

    const releases: (() => void)[] = [];
    const callProvider = vi.fn(
      (request: CityGuideRequest) =>
        new Promise<unknown>((resolve) => {
          releases.push(() =>
            resolve(privateResponse(genericResponse(request))),
          );
        }),
    );
    const orchestrator = makeOrchestrator({ callProvider });

    const first = orchestrator.resolve(firstRequest);
    const second = orchestrator.resolve(secondRequest);
    await vi.waitFor(() => expect(callProvider).toHaveBeenCalledTimes(2));
    releases.forEach((release) => release());

    await Promise.all([first, second]);
    expect(callProvider).toHaveBeenCalledTimes(2);
  });
});

describe("CityGuide orchestration bounds", () => {
  it.each([
    { timeoutMs: 0 },
    { timeoutMs: 30_001 },
    { cacheTtlMs: 0 },
    { cacheTtlMs: 86_400_001 },
    { maxCacheEntries: 0 },
    { maxCacheEntries: 501 },
  ])(
    "rejects unsafe runtime limits: $timeoutMs$cacheTtlMs$maxCacheEntries",
    (override) => {
      expect(() => makeOrchestrator(override)).toThrow(RangeError);
    },
  );
});

function makeOrchestrator(
  override: Partial<CityGuideOrchestratorOptions> = {},
) {
  return createCityGuideOrchestrator({
    callProvider: vi
      .fn()
      .mockResolvedValue(privateResponse(GOLDEN_EXPLAIN_RESPONSE)),
    lookupFallback: () => GOLDEN_EXPLAIN_RESPONSE,
    timeoutMs: 1_000,
    cacheTtlMs: 60_000,
    maxCacheEntries: 10,
    ...override,
  });
}

function genericResponse(request: CityGuideRequest): CityGuideResponse {
  const firstFact = request.allowedFactKeys[0];
  const firstCause = request.causes[0]?.code;
  if (firstFact === undefined || firstCause === undefined) {
    throw new Error("Generic response fixture needs one fact and cause");
  }

  return {
    headline: "A useful city pattern",
    message: "Connected systems work together and help the city stay ready.",
    reflectiveQuestion: "Which connection helps the whole system?",
    vocabulary: [
      {
        term: "connected system",
        meaning: "Parts that work together to provide a useful service.",
      },
    ],
    grounding: {
      metricKeys: [],
      buildingIds: [],
      factKeys: [firstFact],
      messageKeys: [],
      causeCodes: [firstCause],
    },
  };
}

function privateResponse(response: CityGuideResponse) {
  return {
    trustMode: "private",
    output: JSON.stringify(response),
  };
}

function withFactKey(
  request: CityGuideRequest,
  factKey: string,
): CityGuideRequest {
  return CityGuideRequestSchema.parse({
    ...request,
    allowedFactKeys: [factKey],
  });
}
