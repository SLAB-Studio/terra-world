import { describe, expect, it } from "vitest";

import type { CampaignEvent, Milestone } from "@terra/campaign-schema";

import {
  advanceProgression,
  detectMilestones,
  type StageTransitionDefinition,
} from "./progression";
import { FULL_COVERAGE, makeTestCity, placedBuilding } from "./test-fixtures";
import { simulateTurn } from "./turn";

const TRANSITIONS: StageTransitionDefinition[] = [
  {
    id: "01-settlement",
    from: "seed",
    to: "settlement",
    conditions: [
      { type: "metric", metric: "population", comparison: "gte", value: 2 },
    ],
  },
  {
    id: "02-town",
    from: "settlement",
    to: "town",
    conditions: [
      { type: "metric", metric: "population", comparison: "gte", value: 10 },
      {
        type: "building-count",
        buildingId: "school",
        comparison: "gte",
        value: 1,
      },
    ],
  },
  {
    id: "03-city",
    from: "town",
    to: "city",
    conditions: [
      { type: "metric", metric: "population", comparison: "gte", value: 30 },
      { type: "metric", metric: "community", comparison: "gte", value: 60 },
    ],
  },
  {
    id: "04-resilient-city",
    from: "city",
    to: "resilient-city",
    conditions: [
      { type: "metric", metric: "resilience", comparison: "gte", value: 75 },
      { type: "milestone-earned", milestoneId: "storm-ready" },
    ],
  },
];

describe("declared city progression", () => {
  it.each([
    {
      from: "seed" as const,
      to: "settlement",
      population: 2,
      community: 0,
      resilience: 0,
      school: false,
      milestones: [],
    },
    {
      from: "settlement" as const,
      to: "town",
      population: 10,
      community: 0,
      resilience: 0,
      school: true,
      milestones: [],
    },
    {
      from: "town" as const,
      to: "city",
      population: 30,
      community: 60,
      resilience: 0,
      school: false,
      milestones: [],
    },
    {
      from: "city" as const,
      to: "resilient-city",
      population: 30,
      community: 60,
      resilience: 75,
      school: false,
      milestones: ["storm-ready"],
    },
  ])(
    "advances $from to $to only through its declared transition",
    (scenario) => {
      const base = makeTestCity({
        stage: scenario.from,
        population: scenario.population,
        milestones: scenario.milestones,
        indicators: {
          water: 80,
          energy: 80,
          nature: 50,
          community: scenario.community,
          resilience: scenario.resilience,
        },
      });
      const school = placedBuilding(
        "school-1",
        "school",
        base.tiles[0]?.id ?? "missing",
        0,
      );
      const city = scenario.school ? { ...base, buildings: [school] } : base;
      const result = advanceProgression(city, { transitions: TRANSITIONS });
      expect(result.state.stage).toBe(scenario.to);
      expect(result.transition?.from).toBe(scenario.from);
      expect(result.transition?.to).toBe(scenario.to);
    },
  );

  it("does not advance when a declared condition is unmet", () => {
    const city = makeTestCity({ stage: "settlement", population: 50 });
    const result = advanceProgression(city, { transitions: TRANSITIONS });
    expect(result.state.stage).toBe("settlement");
    expect(result.transition).toBeNull();
  });

  it("advances at most one declared stage per evaluation", () => {
    const city = makeTestCity({ stage: "seed", population: 100 });
    expect(
      advanceProgression(city, { transitions: TRANSITIONS }).state.stage,
    ).toBe("settlement");
  });
});

describe("milestone detection", () => {
  const event: CampaignEvent = {
    id: "final-storm",
    titleKey: "event.final-storm.title",
    kind: "storm",
    scheduledTurn: 5,
    magnitude: 5,
    effects: [],
  };
  const milestones: Milestone[] = [
    {
      id: "storm-ready",
      titleKey: "milestone.storm-ready.title",
      traitId: "trait-prepared",
      conditions: [{ type: "event-completed", eventId: "final-storm" }],
    },
    {
      id: "storm-champion",
      titleKey: "milestone.storm-champion.title",
      traitId: "trait-champion",
      conditions: [{ type: "milestone-earned", milestoneId: "storm-ready" }],
    },
  ];

  it("earns scheduled-event and dependent milestones after simulating its turn", () => {
    const result = simulateTurn({
      city: makeTestCity({ turn: 4 }),
      network: FULL_COVERAGE,
      progression: { milestones: [...milestones].reverse(), events: [event] },
    });

    expect(result.state.actionLog).toContainEqual(
      expect.objectContaining({ type: "advance-turn", turn: 5 }),
    );
    expect(result.earnedMilestoneIds).toEqual([
      "storm-ready",
      "storm-champion",
    ]);
    expect(result.state.milestones).toEqual(["storm-ready", "storm-champion"]);
  });

  it("does not earn an event milestone before its scheduled turn", () => {
    expect(
      detectMilestones(
        makeTestCity({
          turn: 4,
          actionLog: [advanceTurnAction(4, 0)],
        }),
        milestones,
        [event],
      ).earnedMilestoneIds,
    ).toEqual([]);
  });

  it("does not treat a later advance as completion when the event turn was skipped", () => {
    expect(
      detectMilestones(
        makeTestCity({
          turn: 6,
          actionLog: [advanceTurnAction(6, 0)],
        }),
        milestones,
        [event],
      ).earnedMilestoneIds,
    ).toEqual([]);
  });
});

function advanceTurnAction(turn: number, sequence: number) {
  return {
    type: "advance-turn" as const,
    actionId: `advance-turn-${turn}-${sequence}`,
    turn,
    sequence,
  };
}
