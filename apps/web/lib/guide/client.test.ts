import type {
  CauseEffect,
  CityState,
  Mission,
  TurnAction,
} from "@terra/campaign-schema";
import { describe, expect, it, vi } from "vitest";

import type { CityGuideProjectionInput } from "../../../../packages/safety/src/city-guide";
import { makeTestCity } from "../../../../packages/simulation/src/test-fixtures";

import {
  CITY_GUIDE_CLIENT_LIMITS,
  createCityGuideClient,
  createCityGuideController,
} from "./client";

const action: TurnAction = {
  actionId: "action-1",
  type: "place-building",
  turn: 1,
  sequence: 0,
  buildingId: "home",
  instanceId: "home-1",
  anchor: { x: 0, y: 0 },
  rotation: 0,
};

const mission: Mission = {
  id: "welcome-first-home",
  titleKey: "rivergate.mission.home.title",
  briefingKey: "rivergate.mission.home.briefing",
  order: 1,
  allowedBuildingIds: ["road", "home"],
  objectives: [
    {
      id: "place-home",
      descriptionKey: "rivergate.mission.home.objective",
      required: true,
      condition: {
        type: "building-count",
        buildingId: "home",
        comparison: "gte",
        value: 1,
      },
    },
  ],
  learningFactKeys: ["rivergate.fact.connected-homes"],
};

const constructionCause: CauseEffect = {
  code: "construction.committed",
  category: "construction",
  severity: "positive",
  phase: 1,
  sourceBuildingIds: ["home-1"],
  sourceTileIds: ["tile-0-0"],
  changes: [{ metric: "budget", before: 2_000, after: 1_900, delta: -100 }],
};

const milestoneCause: CauseEffect = {
  code: "milestone.first-home",
  category: "event",
  severity: "positive",
  phase: 1,
  sourceBuildingIds: ["home-1"],
  sourceTileIds: ["tile-0-0"],
  changes: [],
};

const before = makeTestCity();
const after: CityState = {
  ...before,
  turn: 1,
  stage: "settlement",
  budget: 1_900,
  population: 4,
  indicators: { ...before.indicators, community: 20 },
  buildings: [
    {
      instanceId: "home-1",
      definitionId: "home",
      anchor: { x: 0, y: 0 },
      rotation: 0,
      occupiedTileIds: [before.tiles[0]!.id],
      placedTurn: 1,
    },
  ],
  tiles: [
    { ...before.tiles[0]!, occupantId: "home-1" },
    ...before.tiles.slice(1),
  ],
  actionLog: [action],
};

const safeGuide = {
  headline: "A home joins our city",
  message: "I noticed that our first home changed the neighbourhood.",
  reflectiveQuestion: "Which city clue changed after the home arrived?",
  grounding: {
    metricKeys: [],
    buildingIds: ["home"],
    factKeys: ["rivergate.fact.connected-homes"],
    messageKeys: [],
    causeCodes: ["construction.committed"],
  },
} as const;

describe("browser city guide client", () => {
  it("posts only the projected safe request and surfaces private Compute provenance", async () => {
    const fetch = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const serialized = String(init?.body);
        expect(serialized).not.toContain("Ari");
        expect(serialized).not.toContain("Example School");
        expect(serialized).not.toContain("0x1111");
        expect(serialized).not.toContain(before.cityId);
        expect(init).toMatchObject({
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
          referrerPolicy: "same-origin",
        });
        return jsonResponse({ guide: safeGuide, source: "provider" });
      },
    );
    const input = {
      ...makeInput(),
      childName: "Ari",
      school: "Example School",
      wallet: "0x1111",
      rawChat: "A private message",
    } as CityGuideProjectionInput;

    const result = await createCityGuideClient({ fetch }).request(input);

    expect(result).toMatchObject({
      ok: true,
      source: "private-compute",
      proof: {
        source: "private-compute",
        serverSource: "provider",
        validation: "passed",
        network: "reached",
      },
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[0]).toBe("/api/guide");
  });

  it.each([
    ["invalid JSON", new Response("{broken", { status: 200 })],
    [
      "unexpected fields",
      jsonResponse({ guide: safeGuide, source: "provider", debug: "secret" }),
    ],
    [
      "unsafe guide output",
      jsonResponse({ guide: { message: "raw" }, source: "provider" }),
    ],
    [
      "server failure",
      new Response("sk-secret: upstream exploded", { status: 500 }),
    ],
  ])(
    "uses the same validated local lesson for %s",
    async (_label, response) => {
      const result = await createCityGuideClient({
        fetch: vi.fn().mockResolvedValue(response),
      }).request(makeInput());

      expect(result).toMatchObject({
        ok: true,
        source: "authored-local",
        proof: { validation: "passed", network: "reached" },
      });
      expect(JSON.stringify(result)).not.toContain("sk-secret");
      expect(JSON.stringify(result)).not.toContain("upstream exploded");
    },
  );

  it("falls back after the bounded request timeout without exposing an error", async () => {
    const fetch = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("provider details", "AbortError")),
            { once: true },
          );
        }),
    );

    const result = await createCityGuideClient({ fetch, timeoutMs: 1 }).request(
      makeInput("hint"),
    );

    expect(result).toMatchObject({ ok: true, source: "authored-local" });
    expect(JSON.stringify(result)).not.toContain("provider details");
  });

  it("honours an already-aborted caller without starting a request", async () => {
    const fetch = vi.fn();
    const abort = new AbortController();
    abort.abort();

    const result = await createCityGuideClient({ fetch }).request(makeInput(), {
      signal: abort.signal,
    });

    expect(result).toMatchObject({
      ok: true,
      source: "authored-local",
      proof: { network: "not-reached" },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects oversized response streams before parsing", async () => {
    const oversized = "x".repeat(
      CITY_GUIDE_CLIENT_LIMITS.maximumResponseBytes + 1,
    );
    const result = await createCityGuideClient({
      fetch: vi.fn().mockResolvedValue(new Response(oversized)),
    }).request(makeInput());

    expect(result).toMatchObject({ ok: true, source: "authored-local" });
  });

  it("returns byte-equivalent authored guidance for repeated failures", async () => {
    const client = createCityGuideClient({
      fetch: vi.fn().mockRejectedValue(new Error("offline")),
    });

    const first = await client.request(makeInput("react"));
    const second = await client.request(makeInput("react"));

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(JSON.stringify(first.guide)).toBe(JSON.stringify(second.guide));
    }
  });

  it("maps server-authored and cached results to honest adult proof labels", async () => {
    const fallbackResult = await createCityGuideClient({
      fetch: vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ guide: safeGuide, source: "fallback" }),
        ),
    }).request(makeInput());
    const cachedResult = await createCityGuideClient({
      fetch: vi
        .fn()
        .mockResolvedValue(jsonResponse({ guide: safeGuide, source: "cache" })),
    }).request(makeInput());

    expect(fallbackResult).toMatchObject({
      source: "authored-server",
      proof: { network: "reached", serverSource: "fallback" },
    });
    expect(cachedResult).toMatchObject({
      source: "verified-cache",
      proof: { network: "reached", serverSource: "cache" },
    });
  });

  it("creates a valid local memory only from an allowed milestone fact", async () => {
    const result = await createCityGuideClient({
      fetch: vi.fn().mockRejectedValue(new Error("offline")),
    }).request(makeInput("memory"));

    expect(result).toMatchObject({
      ok: true,
      source: "authored-local",
      guide: {
        memoryCandidate: {
          milestoneId: "first-home",
          earnedTurn: 1,
          factKey: "rivergate.fact.connected-homes",
          causeCodes: ["milestone.first-home"],
        },
      },
    });
  });

  it("fails closed before fetching when projection input is inconsistent", async () => {
    const fetch = vi.fn();
    const result = await createCityGuideClient({ fetch }).request({
      ...makeInput(),
      after: { ...after, cityId: "different-city" },
    });

    expect(result).toMatchObject({
      ok: false,
      source: "unavailable",
      childMessage:
        "Leo is taking a quiet moment. Your city still works without the guide.",
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("turn");
  });
});

describe("city guide controller", () => {
  it("publishes loading immediately and the latest verified result later", async () => {
    let deliver: ((response: Response) => void) | undefined;
    const fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          deliver = resolve;
        }),
    );
    const controller = createCityGuideController({ fetch });
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    const pending = controller.request(makeInput());
    expect(controller.getSnapshot()).toEqual({
      status: "loading",
      result: null,
    });
    deliver?.(jsonResponse({ guide: safeGuide, source: "provider" }));
    await pending;

    expect(controller.getSnapshot()).toMatchObject({
      status: "ready",
      result: { ok: true, source: "private-compute" },
    });
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    controller.dispose();
  });
});

function makeInput(
  task: CityGuideProjectionInput["task"] = "explain",
): CityGuideProjectionInput {
  return {
    ageBand: "8-10",
    task,
    cityPersonality: {
      voice: "hopeful",
      pace: "brief",
      traits: ["kind-neighbour", "curious-builder"],
    },
    mission,
    before,
    action,
    after,
    causes: [constructionCause, milestoneCause],
    allowedFactKeys: ["rivergate.fact.connected-homes"],
    relevantMemories: [],
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
