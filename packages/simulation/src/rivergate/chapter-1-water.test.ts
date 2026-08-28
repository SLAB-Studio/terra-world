import { describe, expect, it } from "vitest";

import { CHAPTER_ONE_SCENARIO } from "./content";
import { evaluateRivergateScenario } from "./evaluate";
import type { RivergateScenarioSnapshot } from "./scenario-types";

const COMPACT_ROUTE: RivergateScenarioSnapshot = {
  buildingCounts: {
    home: 2,
    road: 3,
    "water-pump": 1,
    "water-treatment-plant": 1,
  },
  water: {
    rawSupply: 24,
    treatedSupply: 16,
    demand: 8,
    quality: 95,
    connectedHomes: 2,
    homeCount: 2,
    floodRiskByBuilding: {
      "water-pump": 0.8,
      "water-treatment-plant": 0.2,
    },
  },
  energy: emptyEnergy(),
  budget: { availableForMaintenance: 300, maintenanceDue: 49 },
};

describe("Chapter 1: Water brings a town to life", () => {
  it("accepts a compact pipe route with one source and one treatment plant", () => {
    const result = evaluateRivergateScenario(
      CHAPTER_ONE_SCENARIO,
      COMPACT_ROUTE,
    );

    expect(result).toMatchObject({ complete: true, energyPath: null });
    expect(result.failures).toEqual([]);
    expect(result.causeCodes).toEqual([
      "community.population-change",
      "construction.committed",
      "water.reliability-calculated",
    ]);
    expect(result.passedRuleIds).toHaveLength(
      CHAPTER_ONE_SCENARIO.rules.length,
    );
  });

  it("accepts an expanded route with extra source capacity and four homes", () => {
    const expandedRoute: RivergateScenarioSnapshot = {
      ...COMPACT_ROUTE,
      buildingCounts: {
        ...COMPACT_ROUTE.buildingCounts,
        home: 4,
        road: 6,
        "water-pump": 2,
      },
      water: {
        ...COMPACT_ROUTE.water,
        rawSupply: 48,
        treatedSupply: 16,
        demand: 16,
        quality: 88,
        connectedHomes: 4,
        homeCount: 4,
        floodRiskByBuilding: {
          "water-pump": 0.9,
          "water-treatment-plant": 0.4,
        },
      },
      budget: { availableForMaintenance: 260, maintenanceDue: 70 },
    };

    expect(
      evaluateRivergateScenario(CHAPTER_ONE_SCENARIO, expandedRoute),
    ).toMatchObject({ complete: true, failures: [] });
  });

  it("explains that pumped but untreated water needs revision", () => {
    const result = evaluateRivergateScenario(CHAPTER_ONE_SCENARIO, {
      ...COMPACT_ROUTE,
      buildingCounts: {
        ...COMPACT_ROUTE.buildingCounts,
        "water-treatment-plant": 0,
      },
      water: {
        ...COMPACT_ROUTE.water,
        treatedSupply: 0,
        quality: 25,
      },
    });

    expect(result.complete).toBe(false);
    expect(result.causeCodes).toEqual(["water.reliability-calculated"]);
    expect(result.failures.map((failure) => failure.ruleId)).toEqual([
      "treatment-present",
      "safe-water-for-demand",
    ]);
    expect(result.failures[0]).toMatchObject({
      causeCode: "water.reliability-calculated",
      explanationKey: "rivergate.fallback.water.untreated",
      hintKey: "rivergate.hint.water.untreated",
    });
  });

  it("finds a pipe gap even when enough clean water exists", () => {
    const result = evaluateRivergateScenario(CHAPTER_ONE_SCENARIO, {
      ...COMPACT_ROUTE,
      water: { ...COMPACT_ROUTE.water, connectedHomes: 1 },
    });

    expect(result.complete).toBe(false);
    expect(result.failures).toEqual([
      expect.objectContaining({
        ruleId: "pipes-reach-every-home",
        explanationKey: "rivergate.fallback.water.disconnected",
      }),
    ]);
  });

  it("applies the declared flood-zone consequence to exposed treatment", () => {
    const result = evaluateRivergateScenario(CHAPTER_ONE_SCENARIO, {
      ...COMPACT_ROUTE,
      water: {
        ...COMPACT_ROUTE.water,
        floodRiskByBuilding: {
          ...COMPACT_ROUTE.water.floodRiskByBuilding,
          "water-treatment-plant": 0.65,
        },
      },
    });

    expect(result.complete).toBe(false);
    expect(result.failures).toEqual([
      expect.objectContaining({
        ruleId: "treatment-above-flood-zone",
        causeCode: "event.chapter-1-river-rain",
      }),
    ]);
  });

  it("finds a capacity or quality shortfall without changing the snapshot", () => {
    const snapshot: RivergateScenarioSnapshot = {
      ...COMPACT_ROUTE,
      water: {
        ...COMPACT_ROUTE.water,
        treatedSupply: 6,
        demand: 8,
        quality: 75,
      },
    };
    const before = structuredClone(snapshot);

    const result = evaluateRivergateScenario(CHAPTER_ONE_SCENARIO, snapshot);

    expect(result.failures.map((failure) => failure.ruleId)).toEqual([
      "safe-water-for-demand",
    ]);
    expect(snapshot).toEqual(before);
  });

  it("is deterministic after JSON transport", () => {
    const transported = JSON.parse(
      JSON.stringify(COMPACT_ROUTE),
    ) as RivergateScenarioSnapshot;
    const first = evaluateRivergateScenario(
      CHAPTER_ONE_SCENARIO,
      COMPACT_ROUTE,
    );
    expect(
      evaluateRivergateScenario(CHAPTER_ONE_SCENARIO, transported),
    ).toEqual(first);
    expect(
      evaluateRivergateScenario(CHAPTER_ONE_SCENARIO, COMPACT_ROUTE),
    ).toEqual(first);
  });
});

function emptyEnergy(): RivergateScenarioSnapshot["energy"] {
  return {
    dayGeneration: 0,
    dayDemand: 0,
    nightGeneration: 0,
    nightDemand: 0,
    storedAtNight: 0,
    storageCapacity: 0,
    clinicSupply: 0,
  };
}
