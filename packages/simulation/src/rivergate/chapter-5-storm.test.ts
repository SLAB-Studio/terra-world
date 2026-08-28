import { ChapterSchema } from "@terra/campaign-schema";
import { describe, expect, it } from "vitest";

import {
  CHAPTER_FIVE_STORM,
  CHAPTER_FIVE_STORM_MESSAGES,
  CHAPTER_FIVE_UNLOCK_MILESTONE_ID,
  evaluateFinalStorm,
  type StormEvaluationSnapshot,
} from "./chapter-5-storm";

describe("Chapter 5: Survive the storm", () => {
  it("is schema-valid, ordered, localized, and waits for growth readiness", () => {
    expect(ChapterSchema.parse(CHAPTER_FIVE_STORM)).toEqual(CHAPTER_FIVE_STORM);
    expect(CHAPTER_FIVE_STORM.order).toBe(5);
    expect(CHAPTER_FIVE_STORM.unlockConditions).toEqual([
      {
        type: "milestone-earned",
        milestoneId: CHAPTER_FIVE_UNLOCK_MILESTONE_ID,
      },
    ]);
    expect(CHAPTER_FIVE_STORM.missions).toHaveLength(3);
    expect(CHAPTER_FIVE_STORM.missions.map((mission) => mission.order)).toEqual(
      [1, 2, 3],
    );

    for (const key of chapterMessageKeys()) {
      expect(key in CHAPTER_FIVE_STORM_MESSAGES, key).toBe(true);
    }
  });

  it("covers preparation, drainage, access, backup power, damage, and recovery", () => {
    const allText = Object.values(CHAPTER_FIVE_STORM_MESSAGES)
      .join(" ")
      .toLowerCase();

    for (const concept of [
      "storm",
      "wetland",
      "drain",
      "flood",
      "route",
      "stored energy",
      "damaged",
      "repair",
    ]) {
      expect(allText, concept).toContain(concept);
    }
  });

  it.each([
    {
      name: "balanced preparation protects the town",
      patch: {},
      band: "protected",
      weakest: "water",
      outages: [0, 0, 0],
    },
    {
      name: "poor drainage without wetlands increases home damage",
      patch: {
        buildingCounts: { wetland: 0 },
        indicators: { nature: 35 },
        nature: { drainageCapacity: 20 },
      },
      band: "recovering",
      weakest: "nature",
    },
    {
      name: "an exposed water plan causes a longer water outage",
      patch: {
        indicators: { water: 45 },
        water: {
          connectedHomes: 5,
          criticalInfrastructureFloodRisk: 0.9,
        },
      },
      band: "recovering",
      weakest: "water",
    },
    {
      name: "missing storage leaves essential services without backup",
      patch: {
        buildingCounts: { battery: 0 },
        indicators: { energy: 45 },
        energy: { backupSupply: 0, storageCapacity: 0 },
      },
      band: "recovering",
      weakest: "energy",
    },
    {
      name: "a broken emergency route delays road recovery",
      patch: {
        buildingCounts: { "bus-stop": 0 },
        transport: {
          accessibleEmergencyDestinations: 1,
          exposedRoadTiles: 8,
        },
      },
      band: "recovering",
      weakest: "transport",
    },
    {
      name: "an empty repair reserve creates an unfunded delay",
      patch: { budget: { availableForRecovery: 90 } },
      band: "recovering",
      weakest: "budget",
    },
    {
      name: "several fragile systems make the town hard-hit",
      patch: {
        buildingCounts: { battery: 0, wetland: 0, "bus-stop": 0 },
        indicators: {
          water: 30,
          energy: 25,
          nature: 25,
          resilience: 25,
        },
        water: {
          connectedHomes: 3,
          criticalInfrastructureFloodRisk: 1,
        },
        energy: { backupSupply: 0, storageCapacity: 0 },
        nature: { drainageCapacity: 10 },
        transport: {
          accessibleEmergencyDestinations: 0,
          exposedRoadTiles: 12,
        },
        floodExposure: {
          exposedHomes: 8,
          exposedCriticalServices: 3,
        },
        budget: { availableForRecovery: 40 },
      },
      band: "hard-hit",
      weakest: "transport",
    },
  ] as const)("$name", ({ patch, band, weakest, outages }) => {
    const result = evaluateFinalStorm(stormSnapshot(patch));
    const weakestScore = Math.min(
      ...Object.values(result.systems).map((system) => system.score),
    );

    expect(result.outcomeBand).toBe(band);
    expect(result.systems[weakest].score).toBe(weakestScore);
    if (outages !== undefined) {
      expect([
        result.damage.waterOutageTurns,
        result.damage.powerOutageTurns,
        result.damage.roadClosureTurns,
      ]).toEqual(outages);
    }
  });

  it("makes each earlier system materially change its storm consequence", () => {
    const prepared = evaluateFinalStorm(stormSnapshot());
    const water = evaluateFinalStorm(
      stormSnapshot({
        indicators: { water: 35 },
        water: {
          connectedHomes: 4,
          criticalInfrastructureFloodRisk: 1,
        },
      }),
    );
    const energy = evaluateFinalStorm(
      stormSnapshot({
        buildingCounts: { battery: 0 },
        energy: { backupSupply: 0, storageCapacity: 0 },
      }),
    );
    const nature = evaluateFinalStorm(
      stormSnapshot({
        buildingCounts: { wetland: 0 },
        nature: { drainageCapacity: 15 },
      }),
    );
    const transport = evaluateFinalStorm(
      stormSnapshot({
        transport: {
          accessibleEmergencyDestinations: 0,
          exposedRoadTiles: 9,
        },
      }),
    );
    const budget = evaluateFinalStorm(
      stormSnapshot({ budget: { availableForRecovery: 50 } }),
    );

    expect(water.damage.waterOutageTurns).toBeGreaterThan(
      prepared.damage.waterOutageTurns,
    );
    expect(energy.damage.powerOutageTurns).toBeGreaterThan(
      prepared.damage.powerOutageTurns,
    );
    expect(nature.damage.damagedHomes).toBeGreaterThanOrEqual(
      prepared.damage.damagedHomes,
    );
    expect(nature.readinessScore).toBeLessThan(prepared.readinessScore);
    expect(transport.damage.roadClosureTurns).toBeGreaterThan(
      prepared.damage.roadClosureTurns,
    );
    expect(budget.recovery.unfundedRepairCost).toBeGreaterThan(
      prepared.recovery.unfundedRepairCost,
    );
    expect(budget.recovery.estimatedTurns).toBeGreaterThan(
      prepared.recovery.estimatedTurns,
    );
  });

  it("is deterministic, JSON-safe, and does not mutate the snapshot", () => {
    const snapshot = stormSnapshot();
    const before = structuredClone(snapshot);
    const first = evaluateFinalStorm(snapshot);
    const transported = JSON.parse(
      JSON.stringify(snapshot),
    ) as StormEvaluationSnapshot;
    const transportedResult = JSON.parse(JSON.stringify(first)) as typeof first;

    expect(evaluateFinalStorm(snapshot)).toEqual(first);
    expect(evaluateFinalStorm(transported)).toEqual(first);
    expect(transportedResult).toEqual(first);
    expect(snapshot).toEqual(before);
  });

  it.each([
    {
      name: "an invalid percentage",
      patch: { indicators: { nature: 101 } },
      message: "Nature indicator must be from 0 to 100",
    },
    {
      name: "impossible backup storage",
      patch: { energy: { backupSupply: 31, storageCapacity: 30 } },
      message: "Backup supply cannot exceed storage capacity",
    },
    {
      name: "more exposed roads than roads",
      patch: { transport: { exposedRoadTiles: 13 } },
      message: "Exposed road tiles cannot exceed total road tiles",
    },
    {
      name: "mismatched home totals",
      patch: { floodExposure: { homes: 7 } },
      message: "Flood exposure homes must match water home count",
    },
    {
      name: "an unknown building",
      patch: { buildingCounts: { dam: 1 } },
      message: "Unknown storm building id: dam",
    },
  ] as const)("rejects $name", ({ patch, message }) => {
    expect(() => evaluateFinalStorm(stormSnapshot(patch))).toThrow(message);
  });
});

type SnapshotPatch = {
  readonly buildingCounts?: Readonly<Record<string, number>>;
  readonly indicators?: Partial<StormEvaluationSnapshot["indicators"]>;
  readonly water?: Partial<StormEvaluationSnapshot["water"]>;
  readonly energy?: Partial<StormEvaluationSnapshot["energy"]>;
  readonly nature?: Partial<StormEvaluationSnapshot["nature"]>;
  readonly transport?: Partial<StormEvaluationSnapshot["transport"]>;
  readonly floodExposure?: Partial<StormEvaluationSnapshot["floodExposure"]>;
  readonly budget?: Partial<StormEvaluationSnapshot["budget"]>;
};

function stormSnapshot(patch: SnapshotPatch = {}): StormEvaluationSnapshot {
  const snapshot = {
    schemaVersion: 1,
    storm: { magnitude: 5 },
    buildingCounts: {
      home: 8,
      road: 12,
      "water-pump": 1,
      "water-treatment-plant": 1,
      "solar-array": 2,
      battery: 1,
      clinic: 1,
      "bus-stop": 2,
      wetland: 2,
      ...patch.buildingCounts,
    },
    indicators: {
      water: 90,
      energy: 90,
      nature: 85,
      resilience: 90,
      ...patch.indicators,
    },
    water: {
      connectedHomes: 8,
      homeCount: 8,
      criticalInfrastructureFloodRisk: 0.15,
      ...patch.water,
    },
    energy: {
      criticalDemand: 12,
      backupSupply: 12,
      storageCapacity: 30,
      ...patch.energy,
    },
    nature: {
      drainageCapacity: 100,
      runoffLoad: 100,
      ...patch.nature,
    },
    transport: {
      emergencyDestinations: 3,
      accessibleEmergencyDestinations: 3,
      roadTiles: 12,
      exposedRoadTiles: 1,
      ...patch.transport,
    },
    floodExposure: {
      homes: 8,
      exposedHomes: 2,
      criticalServices: 3,
      exposedCriticalServices: 1,
      ...patch.floodExposure,
    },
    budget: {
      availableForRecovery: 850,
      maintenanceDue: 120,
      ...patch.budget,
    },
  };
  return snapshot as StormEvaluationSnapshot;
}

function chapterMessageKeys(): string[] {
  return [
    CHAPTER_FIVE_STORM.titleKey,
    ...CHAPTER_FIVE_STORM.missions.flatMap((mission) => [
      mission.titleKey,
      mission.briefingKey,
      ...mission.learningFactKeys,
      ...mission.objectives.map((objective) => objective.descriptionKey),
    ]),
  ];
}
