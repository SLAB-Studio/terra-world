import type {
  CauseEffect,
  CityState,
  PlacedBuilding,
} from "@terra/campaign-schema";
import { describe, expect, it } from "vitest";

import {
  missionProgressKey,
  objectiveProgressKey,
  type CampaignProgressState,
} from "../campaign-state";
import { FULL_COVERAGE, makeTestCity } from "../test-fixtures";
import { simulateTurn, type TurnResult } from "../turn";
import { RIVERGATE_FOUNDATIONS_CAMPAIGN } from "./content";
import {
  advanceRivergateCampaignState,
  FINAL_STORM_EVENT_ID,
  type RivergateDirectorEvidence,
} from "./director";
import { RIVERGATE_EN_MESSAGES } from "./en";
import {
  RIVERGATE_ENDING_CONTENT,
  RIVERGATE_ENDING_IDS,
  RIVERGATE_ENDING_MESSAGES,
  RIVERGATE_ENDING_RULES,
  RIVERGATE_TRAIT_CONTENT,
  classifyRivergateEnding,
  createRivergateEnding,
  type RivergateEnding,
  type RivergateEndingInput,
} from "./endings";
import { RIVERGATE_TRACE_CODES, type RivergateTraceCode } from "./explanations";

describe("Rivergate endings and learning summary", () => {
  it.each([
    {
      name: "a prepared city becomes a River Guardian",
      city: () => protectedPreStormCity(),
      endingId: "river-guardian",
      stormOutcomeBand: "protected",
    },
    {
      name: "a strained city becomes a Steady Shaper",
      city: () => recoveringPreStormCity(),
      endingId: "steady-shaper",
      stormOutcomeBand: "recovering",
    },
    {
      name: "a hard-hit city becomes a Brave Rebuilder",
      city: () => hardHitPreStormCity(),
      endingId: "brave-rebuilder",
      stormOutcomeBand: "hard-hit",
    },
  ] as const)(
    "$name through the real final-storm turn and campaign state machine",
    ({ city: makeCity, endingId, stormOutcomeBand }) => {
      const run = completeFinalStorm(makeCity());

      expect(run.turnResult.state.turn).toBe(15);
      expect(run.turnResult.firedEventIds).toEqual([FINAL_STORM_EVENT_ID]);
      expect(run.turnResult.causes).toContainEqual(
        expect.objectContaining({ code: "event.chapter-5-river-storm" }),
      );
      expect(run.campaignResult).toMatchObject({
        ok: true,
        transition: { type: "campaign-completed" },
        state: { phase: "completed" },
        gate: {
          complete: true,
          eventEvidenceSatisfied: true,
          evaluation: { outcomeBand: stormOutcomeBand },
        },
      });
      expect(run.ending).toMatchObject({
        schemaVersion: 1,
        endingId,
        stormOutcomeBand,
        adultLearningSummary: {
          schemaVersion: 1,
          endingId,
          storm: { outcomeBand: stormOutcomeBand },
          finalCity: {
            turn: 15,
            population: run.turnResult.state.population,
            remainingBudget: run.turnResult.state.budget,
          },
        },
      });
      expect(run.ending.strongestSystem.score).toBeGreaterThanOrEqual(
        run.ending.weakestSystem.score,
      );
      expect(run.ending.adultLearningSummary.causeHistory).toEqual(
        expectedCauseSummary(run.turnResult.causes),
      );
    },
  );

  it("reports verified traits, systems, decisions, and learning evidence", () => {
    const { ending, turnResult } = completeFinalStorm(protectedPreStormCity());

    expect(ending.traits.map((trait) => trait.traitId)).toEqual([
      "trait-water-wise",
      "trait-energy-planner",
      "trait-fair-neighbour",
      "trait-growth-balancer",
      "trait-storm-ready",
    ]);
    expect(ending.growthStrategy).toBe("recycling-and-transit");
    expect(ending.actionHistory).toMatchObject({
      totalActions: turnResult.state.actionLog.length,
      placementActions: PROTECTED_BUILDINGS.length,
      removalActions: 0,
      completedTurns: 15,
      latestRecordedTurn: 15,
      differentBuildingTypesTried: 12,
    });
    expect(ending.actionHistory.placementsByBuildingId).toContainEqual({
      buildingId: "home",
      count: 6,
    });
    expect(ending.adultLearningSummary).toMatchObject({
      care: { complete: true, fairnessGap: 0 },
      growth: {
        complete: true,
        strategy: "recycling-and-transit",
      },
      causeHistory: { totalCauses: turnResult.causes.length },
    });
  });

  it("does not award Storm Ready to a hard-hit Brave Rebuilder", () => {
    const { ending, campaignResult } = completeFinalStorm(
      hardHitPreStormCity(),
    );

    expect(campaignResult).toMatchObject({
      ok: true,
      state: { phase: "completed" },
      gate: { acceptableOutcome: false },
    });
    expect(ending.endingId).toBe("brave-rebuilder");
    expect(ending.traits.map((trait) => trait.traitId)).not.toContain(
      "trait-storm-ready",
    );
  });

  it.each([
    [100, "river-guardian"],
    [75, "river-guardian"],
    [74.999, "steady-shaper"],
    [45, "steady-shaper"],
    [44.999, "brave-rebuilder"],
    [0, "brave-rebuilder"],
  ] as const)("classifies boundary score %s as %s", (score, endingId) => {
    expect(classifyRivergateEnding(score)).toBe(endingId);
  });

  it("declares exactly three exhaustive ending rules", () => {
    expect(RIVERGATE_ENDING_IDS).toEqual([
      "river-guardian",
      "steady-shaper",
      "brave-rebuilder",
    ]);
    expect(RIVERGATE_ENDING_RULES).toEqual([
      {
        endingId: "river-guardian",
        stormOutcomeBand: "protected",
        minimumInclusive: 75,
        maximumExclusive: null,
      },
      {
        endingId: "steady-shaper",
        stormOutcomeBand: "recovering",
        minimumInclusive: 45,
        maximumExclusive: 75,
      },
      {
        endingId: "brave-rebuilder",
        stormOutcomeBand: "hard-hit",
        minimumInclusive: 0,
        maximumExclusive: 45,
      },
    ]);
    expect(() => classifyRivergateEnding(-0.01)).toThrow();
    expect(() => classifyRivergateEnding(100.01)).toThrow();
    expect(() => classifyRivergateEnding(Number.NaN)).toThrow();
  });

  it("localizes every ending, reflection, and earned trait", () => {
    const requiredKeys = [
      ...Object.values(RIVERGATE_ENDING_CONTENT).flatMap((content) => [
        content.titleKey,
        content.childSummaryKey,
        content.adultSummaryKey,
        content.reflectionKey,
      ]),
      ...Object.values(RIVERGATE_TRAIT_CONTENT),
    ];

    expect(Object.keys(RIVERGATE_ENDING_MESSAGES).sort()).toEqual(
      [...requiredKeys].sort(),
    );
    for (const key of requiredKeys) {
      expect(
        RIVERGATE_EN_MESSAGES[key],
        `Missing ending message: ${key}`,
      ).toEqual(expect.any(String));
      expect(RIVERGATE_EN_MESSAGES[key]?.trim().length).toBeGreaterThan(0);
    }
  });

  it("replays deterministically, stays JSON-safe and immutable, and preserves its input", () => {
    const city = protectedPreStormCity();
    const before = structuredClone(city);

    const first = completeFinalStorm(city);
    const second = completeFinalStorm(city);
    const transported = JSON.parse(
      JSON.stringify(first.ending),
    ) as RivergateEnding;

    expect(second.turnResult).toEqual(first.turnResult);
    expect(second.campaignResult).toEqual(first.campaignResult);
    expect(second.ending).toEqual(first.ending);
    expect(transported).toEqual(first.ending);
    expect(city).toEqual(before);
    expect(Object.isFrozen(first.ending)).toBe(true);
    expect(Object.isFrozen(first.ending.traits)).toBe(true);
    expect(
      Object.isFrozen(first.ending.adultLearningSummary.storm.damage),
    ).toBe(true);
  });

  it("rejects final-storm evidence after the final city has moved to turn 16", () => {
    const input = finalEndingInput(protectedPreStormCity());
    const staleInput: RivergateEndingInput = {
      ...input,
      city: { ...input.city, turn: 16 },
    };

    expect(() => createRivergateEnding(staleInput)).toThrow(
      "evidence is stale",
    );
  });

  it.each([
    {
      name: "missing fired-event evidence",
      change: (input: RivergateEndingInput) => ({
        ...input,
        evidence: { turn: 15, firedEventIds: [] },
      }),
      message: "requires verified event",
    },
    {
      name: "a forged event without turn history",
      change: (input: RivergateEndingInput) => ({
        ...input,
        city: { ...input.city, actionLog: [] },
      }),
      message: "requires verified event",
    },
    {
      name: "the wrong campaign",
      change: (input: RivergateEndingInput) => ({
        ...input,
        city: { ...input.city, campaignId: "not-rivergate" },
      }),
      message: "requires the Rivergate campaign",
    },
    {
      name: "an action from a future turn",
      change: (input: RivergateEndingInput) => ({
        ...input,
        city: {
          ...input.city,
          actionLog: input.city.actionLog.map((action, index) =>
            index === 0 ? { ...action, turn: 16 } : action,
          ),
        },
      }),
      message: "cannot be ahead",
    },
    {
      name: "an unknown construction action",
      change: (input: RivergateEndingInput) => ({
        ...input,
        city: {
          ...input.city,
          actionLog: input.city.actionLog.map((action, index) =>
            index === 0 && action.type === "place-building"
              ? { ...action, buildingId: "mystery-building" }
              : action,
          ),
        },
      }),
      message: "unknown building",
    },
    {
      name: "a malformed cause/effect delta",
      change: (input: RivergateEndingInput) => ({
        ...input,
        causes: [
          {
            ...input.causes[0]!,
            changes: [{ metric: "nature", before: 70, after: 80, delta: 99 }],
          } as CauseEffect,
        ],
      }),
      message: "invalid cause/effect",
    },
    {
      name: "an invented but schema-valid trace code",
      change: (input: RivergateEndingInput) => ({
        ...input,
        causes: [{ ...input.causes[0]!, code: "invented.trace-code" }],
      }),
      message: "unsupported trace code",
    },
  ])("fails closed for $name", ({ change, message }) => {
    const input = finalEndingInput(protectedPreStormCity());
    expect(() => createRivergateEnding(change(input))).toThrow(message);
  });
});

type CompletedFinalStormRun = {
  readonly turnResult: TurnResult;
  readonly evidence: RivergateDirectorEvidence;
  readonly campaignResult: ReturnType<typeof advanceRivergateCampaignState>;
  readonly ending: RivergateEnding;
};

function completeFinalStorm(city: CityState): CompletedFinalStormRun {
  const turnResult = simulateFinalStorm(city);
  const evidence = evidenceFrom(turnResult);
  const campaignResult = advanceRivergateCampaignState(
    RIVERGATE_FOUNDATIONS_CAMPAIGN,
    turnResult.state,
    finalMissionProgress(),
    evidence,
  );
  if (
    !campaignResult.ok ||
    campaignResult.transition.type !== "campaign-completed" ||
    campaignResult.state.phase !== "completed"
  ) {
    throw new Error("Golden final-storm run did not complete the campaign");
  }
  const ending = createRivergateEnding({
    city: turnResult.state,
    evidence,
    causes: turnResult.causes,
  });
  return { turnResult, evidence, campaignResult, ending };
}

function finalEndingInput(city: CityState): RivergateEndingInput {
  const turnResult = simulateFinalStorm(city);
  return {
    city: turnResult.state,
    evidence: evidenceFrom(turnResult),
    causes: turnResult.causes,
  };
}

function simulateFinalStorm(city: CityState): TurnResult {
  return simulateTurn({
    city,
    network: FULL_COVERAGE,
    progression: { events: RIVERGATE_FOUNDATIONS_CAMPAIGN.events },
  });
}

function evidenceFrom(result: TurnResult): RivergateDirectorEvidence {
  return { turn: result.state.turn, firedEventIds: result.firedEventIds };
}

function expectedCauseSummary(causes: readonly CauseEffect[]) {
  const counts = new Map<RivergateTraceCode, number>();
  for (const cause of causes) {
    expect(RIVERGATE_TRACE_CODES).toContain(cause.code);
    const code = cause.code as RivergateTraceCode;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return {
    totalCauses: causes.length,
    positive: causes.filter((cause) => cause.severity === "positive").length,
    neutral: causes.filter((cause) => cause.severity === "neutral").length,
    warning: causes.filter((cause) => cause.severity === "warning").length,
    critical: causes.filter((cause) => cause.severity === "critical").length,
    causeCodeCounts: [...counts]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([code, count]) => ({ code, count })),
  };
}

function protectedPreStormCity(): CityState {
  return preStormCity(PROTECTED_BUILDINGS, {
    budget: 8_000,
    population: 48,
    indicators: {
      water: 90,
      energy: 90,
      nature: 90,
      community: 90,
      resilience: 90,
    },
    resources: {
      water: { rawSupply: 40, treatedSupply: 40, demand: 24 },
      energy: { generation: 45, stored: 60, storageCapacity: 60, demand: 20 },
      waste: { generated: 10, processed: 10 },
      transport: { capacity: 60, demand: 20 },
      housingCapacity: 48,
      maintenanceDue: 120,
    },
  });
}

function recoveringPreStormCity(): CityState {
  return preStormCity(
    PROTECTED_BUILDINGS.filter(([definitionId]) => definitionId !== "wetland"),
    {
      budget: 350,
      population: 48,
      indicators: {
        water: 70,
        energy: 60,
        nature: 25,
        community: 70,
        resilience: 45,
      },
      resources: {
        water: { rawSupply: 30, treatedSupply: 28, demand: 24 },
        energy: {
          generation: 35,
          stored: 15,
          storageCapacity: 25,
          demand: 20,
        },
        waste: { generated: 10, processed: 10 },
        transport: { capacity: 45, demand: 25 },
        housingCapacity: 48,
        maintenanceDue: 140,
      },
    },
  );
}

function hardHitPreStormCity(): CityState {
  return preStormCity([], {
    budget: 0,
    population: 0,
    indicators: {
      water: 0,
      energy: 0,
      nature: 0,
      community: 0,
      resilience: 0,
    },
    resources: {
      water: { rawSupply: 0, treatedSupply: 0, demand: 0 },
      energy: { generation: 0, stored: 0, storageCapacity: 0, demand: 0 },
      waste: { generated: 0, processed: 0 },
      transport: { capacity: 0, demand: 0 },
      housingCapacity: 0,
      maintenanceDue: 0,
    },
  });
}

const PROTECTED_BUILDINGS = [
  ["home", 1, 1],
  ["home", 3, 1],
  ["home", 5, 1],
  ["home", 1, 4],
  ["home", 3, 4],
  ["home", 5, 4],
  ["road", 1, 0],
  ["road", 3, 0],
  ["road", 5, 0],
  ["road", 1, 5],
  ["road", 3, 5],
  ["road", 5, 5],
  ["road", 0, 2],
  ["road", 1, 2],
  ["road", 2, 2],
  ["water-pump", 0, 3],
  ["water-pump", 0, 1],
  ["water-treatment-plant", 2, 3],
  ["water-treatment-plant", 2, 1],
  ["water-treatment-plant", 6, 5],
  ["solar-array", 5, 2],
  ["solar-array", 7, 2],
  ["solar-array", 6, 0],
  ["battery", 6, 2],
  ["battery", 4, 2],
  ["school", 3, 3],
  ["clinic", 3, 2],
  ["bus-stop", 4, 5],
  ["bus-stop", 7, 5],
  ["recycling-centre", 6, 1],
  ["wetland", 6, 3],
  ["wetland", 7, 4],
  ["community-park", 7, 3],
  ["community-park", 4, 3],
] as const satisfies readonly (readonly [string, number, number])[];

function preStormCity(
  entries: readonly (readonly [string, number, number])[],
  patch: Partial<CityState>,
): CityState {
  const base = makeTestCity();
  const buildings: PlacedBuilding[] = entries.map(
    ([definitionId, x, y], index) => ({
      instanceId: `${definitionId}-${index}`,
      definitionId,
      anchor: { x, y },
      rotation: 0,
      occupiedTileIds: [`tile-${x}-${y}`],
      placedTurn: 1,
    }),
  );
  const occupantByTile = new Map(
    buildings.map((building) => [
      building.occupiedTileIds[0]!,
      building.instanceId,
    ]),
  );
  const tiles = base.tiles.map((tile) => ({
    ...tile,
    floodRisk: occupantByTile.has(tile.id) ? 0.1 : tile.floodRisk,
    occupantId: occupantByTile.get(tile.id) ?? null,
  }));
  const placeActions = buildings.map((building, sequence) => ({
    type: "place-building" as const,
    actionId: `place-${building.instanceId}`,
    turn: 1,
    sequence,
    buildingId: building.definitionId,
    instanceId: building.instanceId,
    anchor: building.anchor,
    rotation: building.rotation,
  }));
  const priorTurns = Array.from({ length: 14 }, (_, index) => ({
    type: "advance-turn" as const,
    actionId: `advance-turn-${index + 1}`,
    turn: index + 1,
    sequence: placeActions.length + index,
  }));

  return {
    ...base,
    ...patch,
    campaignId: "rivergate-foundations",
    campaignVersion: 1,
    mapId: "river-valley",
    turn: 14,
    stage: "resilient-city",
    tiles,
    buildings,
    milestones: [],
    actionLog: [...placeActions, ...priorTurns],
  };
}

function finalMissionProgress(): CampaignProgressState {
  const chapterId = "chapter-5-storm";
  const missionId = "repair-together";
  const ordered = [...RIVERGATE_FOUNDATIONS_CAMPAIGN.chapters]
    .sort((left, right) => left.order - right.order)
    .flatMap((chapter) =>
      [...chapter.missions]
        .sort((left, right) => left.order - right.order)
        .map((mission) => ({ chapter, mission })),
    );
  const currentIndex = ordered.findIndex(
    ({ chapter, mission }) =>
      chapter.id === chapterId && mission.id === missionId,
  );
  const completed = ordered.slice(0, currentIndex);

  return {
    schemaVersion: 1,
    campaignId: RIVERGATE_FOUNDATIONS_CAMPAIGN.id,
    campaignVersion: RIVERGATE_FOUNDATIONS_CAMPAIGN.version,
    chapterId,
    missionId,
    phase: "active",
    completedMissionKeys: completed.map(({ chapter, mission }) =>
      missionProgressKey(chapter.id, mission.id),
    ),
    completedObjectiveKeys: completed.flatMap(({ chapter, mission }) =>
      mission.objectives
        .filter((objective) => objective.required)
        .map((objective) =>
          objectiveProgressKey(chapter.id, mission.id, objective.id),
        ),
    ),
  };
}
