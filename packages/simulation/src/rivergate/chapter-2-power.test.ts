import { describe, expect, it } from "vitest";

import { CHAPTER_TWO_SCENARIO } from "./content";
import { classifyEnergyPath, evaluateRivergateScenario } from "./evaluate";
import type { RivergateScenarioSnapshot } from "./scenario-types";

describe("Chapter 2: Power the neighbourhood", () => {
  it.each([
    {
      name: "solar-only",
      snapshot: powerSnapshot({
        solar: 1,
        battery: 0,
        dayGeneration: 20,
        dayDemand: 12,
        nightDemand: 8,
        storedAtNight: 0,
        storageCapacity: 0,
        clinicSupply: 0,
      }),
      path: "solar-only",
      complete: false,
      failedRules: ["night-demand-met", "clinic-reserve-met"],
    },
    {
      name: "solar plus storage that still needs revision",
      snapshot: powerSnapshot({
        solar: 1,
        battery: 1,
        dayGeneration: 20,
        dayDemand: 16,
        nightDemand: 12,
        storedAtNight: 10,
        storageCapacity: 30,
        clinicSupply: 4,
      }),
      path: "solar-plus-storage",
      complete: false,
      failedRules: ["night-demand-met"],
    },
    {
      name: "blackout",
      snapshot: powerSnapshot({
        solar: 0,
        battery: 0,
        dayGeneration: 0,
        dayDemand: 12,
        nightDemand: 8,
        storedAtNight: 0,
        storageCapacity: 0,
        clinicSupply: 0,
      }),
      path: "blackout",
      complete: false,
      failedRules: [
        "solar-present",
        "day-demand-met",
        "night-demand-met",
        "clinic-reserve-met",
      ],
    },
    {
      name: "stable grid",
      snapshot: powerSnapshot({
        solar: 2,
        battery: 1,
        dayGeneration: 40,
        dayDemand: 20,
        nightDemand: 12,
        storedAtNight: 20,
        storageCapacity: 30,
        clinicSupply: 4,
      }),
      path: "stable-grid",
      complete: true,
      failedRules: [],
    },
  ] as const)(
    "distinguishes the $name golden path",
    ({ snapshot, path, complete, failedRules }) => {
      const result = evaluateRivergateScenario(CHAPTER_TWO_SCENARIO, snapshot);

      expect(result.energyPath).toBe(path);
      expect(result.complete).toBe(complete);
      expect(result.failures.map((failure) => failure.ruleId)).toEqual(
        failedRules,
      );
      if (path === "stable-grid") {
        expect(result.causeCodes).toContain("budget.maintenance-paid");
        expect(result.causeCodes).not.toContain("budget.maintenance-shortfall");
      }
      expect(classifyEnergyPath(snapshot)).toBe(path);
    },
  );

  it("keeps a clinic reserve distinct from ordinary night demand", () => {
    const snapshot = powerSnapshot({
      solar: 2,
      battery: 1,
      dayGeneration: 40,
      dayDemand: 20,
      nightDemand: 12,
      storedAtNight: 20,
      storageCapacity: 30,
      clinicSupply: 2,
    });
    const result = evaluateRivergateScenario(CHAPTER_TWO_SCENARIO, snapshot);

    expect(result.energyPath).toBe("solar-plus-storage");
    expect(result.failures).toEqual([
      expect.objectContaining({
        ruleId: "clinic-reserve-met",
        causeCode: "community.services-impact",
        explanationKey: "rivergate.fallback.energy.clinic",
      }),
    ]);
  });

  it("turns an otherwise stable grid into a maintenance trade-off", () => {
    const snapshot = powerSnapshot({
      solar: 2,
      battery: 1,
      dayGeneration: 40,
      dayDemand: 20,
      nightDemand: 12,
      storedAtNight: 20,
      storageCapacity: 30,
      clinicSupply: 4,
      maintenanceAvailable: 20,
      maintenanceDue: 38,
    });
    const result = evaluateRivergateScenario(CHAPTER_TWO_SCENARIO, snapshot);

    expect(result.energyPath).toBe("solar-plus-storage");
    expect(result.failures).toEqual([
      expect.objectContaining({
        ruleId: "maintenance-covered",
        causeCode: "budget.maintenance-shortfall",
      }),
    ]);
  });

  it("is deterministic, replay-safe, and does not mutate input", () => {
    const snapshot = powerSnapshot({
      solar: 2,
      battery: 1,
      dayGeneration: 40,
      dayDemand: 20,
      nightDemand: 12,
      storedAtNight: 20,
      storageCapacity: 30,
      clinicSupply: 4,
    });
    const before = structuredClone(snapshot);
    const first = evaluateRivergateScenario(CHAPTER_TWO_SCENARIO, snapshot);
    const transported = JSON.parse(
      JSON.stringify(snapshot),
    ) as RivergateScenarioSnapshot;

    expect(
      evaluateRivergateScenario(CHAPTER_TWO_SCENARIO, transported),
    ).toEqual(first);
    expect(evaluateRivergateScenario(CHAPTER_TWO_SCENARIO, snapshot)).toEqual(
      first,
    );
    expect(snapshot).toEqual(before);
  });

  it("rejects impossible stored energy instead of silently normalizing it", () => {
    const snapshot = powerSnapshot({
      solar: 1,
      battery: 1,
      dayGeneration: 20,
      dayDemand: 10,
      nightDemand: 8,
      storedAtNight: 31,
      storageCapacity: 30,
      clinicSupply: 4,
    });

    expect(() =>
      evaluateRivergateScenario(CHAPTER_TWO_SCENARIO, snapshot),
    ).toThrow("Stored energy cannot exceed storage capacity");
  });
});

type PowerPatch = {
  readonly solar: number;
  readonly battery: number;
  readonly dayGeneration: number;
  readonly dayDemand: number;
  readonly nightDemand: number;
  readonly storedAtNight: number;
  readonly storageCapacity: number;
  readonly clinicSupply: number;
  readonly maintenanceAvailable?: number;
  readonly maintenanceDue?: number;
};

function powerSnapshot(patch: PowerPatch): RivergateScenarioSnapshot {
  return {
    buildingCounts: {
      "solar-array": patch.solar,
      battery: patch.battery,
    },
    water: {
      rawSupply: 0,
      treatedSupply: 0,
      demand: 0,
      quality: 0,
      connectedHomes: 0,
      homeCount: 0,
      floodRiskByBuilding: {},
    },
    energy: {
      dayGeneration: patch.dayGeneration,
      dayDemand: patch.dayDemand,
      nightGeneration: 0,
      nightDemand: patch.nightDemand,
      storedAtNight: patch.storedAtNight,
      storageCapacity: patch.storageCapacity,
      clinicSupply: patch.clinicSupply,
    },
    budget: {
      availableForMaintenance: patch.maintenanceAvailable ?? 100,
      maintenanceDue: patch.maintenanceDue ?? 38,
    },
  };
}
