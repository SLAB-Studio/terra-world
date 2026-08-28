import { describe, expect, it } from "vitest";

import { ChapterSchema } from "@terra/campaign-schema";

import {
  CHAPTER_FOUR_GROWTH,
  CHAPTER_FOUR_GROWTH_MESSAGES,
  classifyChapterFourGrowth,
  evaluateChapterFourGrowth,
  type ChapterFourGrowthSnapshot,
} from "./chapter-4-growth";

describe("Chapter 4: Handle growth with care", () => {
  it("is a schema-valid three-mission chapter unlocked by care readiness", () => {
    expect(ChapterSchema.parse(CHAPTER_FOUR_GROWTH)).toEqual(
      CHAPTER_FOUR_GROWTH,
    );
    expect(CHAPTER_FOUR_GROWTH.unlockConditions).toEqual([
      { type: "milestone-earned", milestoneId: "care-ready" },
    ]);
    expect(CHAPTER_FOUR_GROWTH.missions).toHaveLength(3);
    expect(CHAPTER_FOUR_GROWTH.missions.map((mission) => mission.id)).toEqual([
      "sort-the-growing-pile",
      "give-everyone-a-way-to-go",
      "make-room-for-rivergate",
    ]);
    expect(CHAPTER_FOUR_GROWTH_MESSAGES).toEqual(
      expect.objectContaining({
        "rivergate.chapter-4.fact.waste-grows": expect.any(String),
        "rivergate.chapter-4.fact.congestion": expect.any(String),
        "rivergate.chapter-4.fact.maintenance": expect.any(String),
      }),
    );
  });

  it("accepts a transit-oriented growth plan", () => {
    const result = evaluateChapterFourGrowth(growthSnapshot());

    expect(result).toMatchObject({
      complete: true,
      strategy: "recycling-and-transit",
      failures: [],
    });
    expect(result.causeCodes).toContain("budget.maintenance-paid");
  });

  it("accepts a second viable strategy that expands roads instead of adding transit", () => {
    const snapshot = growthSnapshot({
      buildingCounts: {
        home: 6,
        road: 5,
        "recycling-centre": 1,
      },
      transport: { capacity: 50, demand: 15 },
      indicators: { pollution: 38, community: 72 },
    });

    expect(evaluateChapterFourGrowth(snapshot)).toMatchObject({
      complete: true,
      strategy: "recycling-and-roads",
      failures: [],
    });
  });

  it("detects high growth that overloads a small transport network", () => {
    const result = evaluateChapterFourGrowth(
      growthSnapshot({
        population: 56,
        transport: { capacity: 12, demand: 18 },
      }),
    );

    expect(result.complete).toBe(false);
    expect(result.strategy).toBe("overloaded");
    expect(result.failures.map((failure) => failure.requirementId)).toEqual([
      "transport-keeps-up",
    ]);
  });

  it("shows that a low maintenance budget makes an otherwise good plan underfunded", () => {
    const result = evaluateChapterFourGrowth(
      growthSnapshot({
        budget: { availableForMaintenance: 18, maintenanceDue: 46 },
      }),
    );

    expect(result).toMatchObject({ complete: false, strategy: "underfunded" });
    expect(result.failures).toEqual([
      expect.objectContaining({
        requirementId: "maintenance-covered",
        causeCode: "budget.maintenance-shortfall",
      }),
    ]);
  });

  it("makes waste-heavy growth a distinct revision path", () => {
    const result = evaluateChapterFourGrowth(
      growthSnapshot({ waste: { generated: 14, processed: 8 } }),
    );

    expect(result).toMatchObject({ complete: false, strategy: "waste-heavy" });
    expect(result.failures).toEqual([
      expect.objectContaining({ requirementId: "waste-keeps-up" }),
    ]);
  });

  it("does not mistake a large budget for a healthy city when pollution and congestion remain", () => {
    const result = evaluateChapterFourGrowth(
      growthSnapshot({
        budget: { availableForMaintenance: 900, maintenanceDue: 46 },
        transport: { capacity: 10, demand: 18 },
        indicators: { pollution: 72, community: 76 },
      }),
    );

    expect(result).toMatchObject({ complete: false, strategy: "overloaded" });
    expect(result.failures.map((failure) => failure.requirementId)).toEqual([
      "transport-keeps-up",
      "pollution-kept-low",
    ]);
  });

  it("is deterministic, JSON-safe, and never mutates its snapshot", () => {
    const snapshot = growthSnapshot();
    const before = structuredClone(snapshot);
    const first = evaluateChapterFourGrowth(snapshot);
    const transported = JSON.parse(
      JSON.stringify(snapshot),
    ) as ChapterFourGrowthSnapshot;

    expect(evaluateChapterFourGrowth(transported)).toEqual(first);
    expect(evaluateChapterFourGrowth(snapshot)).toEqual(first);
    expect(classifyChapterFourGrowth(snapshot)).toBe("recycling-and-transit");
    expect(snapshot).toEqual(before);
  });

  it("rejects invalid values instead of silently normalizing a scenario", () => {
    expect(() =>
      evaluateChapterFourGrowth(
        growthSnapshot({ waste: { generated: 10, processed: 11 } }),
      ),
    ).toThrow("Processed waste cannot exceed generated waste");
  });
});

type GrowthPatch = Partial<ChapterFourGrowthSnapshot>;

function growthSnapshot(patch: GrowthPatch = {}): ChapterFourGrowthSnapshot {
  return {
    population: 48,
    buildingCounts: {
      home: 6,
      road: 2,
      "bus-stop": 1,
      "recycling-centre": 1,
    },
    waste: { generated: 12, processed: 12 },
    transport: { capacity: 35, demand: 15 },
    indicators: { pollution: 28, community: 76 },
    budget: { availableForMaintenance: 120, maintenanceDue: 46 },
    ...patch,
  };
}
