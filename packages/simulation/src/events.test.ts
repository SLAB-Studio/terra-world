import { describe, expect, it, vi } from "vitest";

import type { CampaignEvent } from "@terra/campaign-schema";

import {
  applyScheduledEvents,
  eventsForTurn,
  seededUnitInterval,
} from "./events";
import { makeTestCity } from "./test-fixtures";

const EVENTS: CampaignEvent[] = [
  {
    id: "storm-zeta",
    titleKey: "event.storm-zeta.title",
    kind: "storm",
    scheduledTurn: 3,
    magnitude: 4,
    effects: [
      { metric: "energy", amount: -20 },
      { metric: "resilience", amount: -10 },
    ],
  },
  {
    id: "rain-alpha",
    titleKey: "event.rain-alpha.title",
    kind: "rain",
    scheduledTurn: 3,
    magnitude: 2,
    effects: [{ metric: "nature", amount: 5 }],
  },
];

describe("seeded scheduled events", () => {
  it("provides stable scoped random values without ambient randomness", () => {
    const ambient = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("ambient randomness is forbidden");
    });
    const roll = seededUnitInterval("city-seed", "storm:tile-1");
    expect(roll).toBe(seededUnitInterval("city-seed", "storm:tile-1"));
    expect(roll).toBeGreaterThanOrEqual(0);
    expect(roll).toBeLessThan(1);
    expect(roll).not.toBe(seededUnitInterval("city-seed", "storm:tile-2"));
    expect(ambient).not.toHaveBeenCalled();
    ambient.mockRestore();
  });

  it("selects only the turn's events in stable id order", () => {
    expect(eventsForTurn(EVENTS, 3).map((event) => event.id)).toEqual([
      "rain-alpha",
      "storm-zeta",
    ]);
    expect(eventsForTurn(EVENTS, 2)).toEqual([]);
  });

  it("applies declared effects and seeded impacted tiles without mutation", () => {
    const city = makeTestCity({
      turn: 3,
      indicators: {
        water: 70,
        energy: 80,
        nature: 50,
        community: 60,
        resilience: 40,
      },
    });
    const before = structuredClone(city);
    const first = applyScheduledEvents(city, EVENTS);
    const second = applyScheduledEvents(city, [...EVENTS].reverse());

    expect(first).toEqual(second);
    expect(first.firedEventIds).toEqual(["rain-alpha", "storm-zeta"]);
    expect(first.state.indicators).toMatchObject({
      energy: 60,
      nature: 55,
      resilience: 30,
    });
    expect(first.causes[0]?.sourceTileIds).toHaveLength(2);
    expect(first.causes[1]?.sourceTileIds).toHaveLength(4);
    expect(city).toEqual(before);
  });
});
