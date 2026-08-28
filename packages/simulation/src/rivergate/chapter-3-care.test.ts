import { describe, expect, it } from "vitest";

import { ChapterSchema } from "@terra/campaign-schema";

import {
  CHAPTER_THREE_CARE,
  evaluateChapterThreeCare,
  type ChapterThreeCareSnapshot,
} from "./chapter-3-care";

const BALANCED_CARE: ChapterThreeCareSnapshot = {
  buildingCounts: { home: 4, road: 6, school: 1, clinic: 1 },
  neighbourhoods: [
    {
      id: "north-bank",
      population: 20,
      schoolReachableResidents: 18,
      clinicReachableResidents: 18,
      safeWalkingResidents: 17,
      roadSafety: 78,
    },
    {
      id: "south-bank",
      population: 20,
      schoolReachableResidents: 17,
      clinicReachableResidents: 18,
      safeWalkingResidents: 17,
      roadSafety: 77,
    },
  ],
  budget: 40,
};

const NORTH_BANK = BALANCED_CARE.neighbourhoods[0]!;
const SOUTH_BANK = BALANCED_CARE.neighbourhoods[1]!;

describe("Chapter 3: Care for residents", () => {
  it("exports a schema-valid three-mission chapter unlocked by power-ready", () => {
    expect(ChapterSchema.parse(CHAPTER_THREE_CARE)).toEqual(CHAPTER_THREE_CARE);
    expect(CHAPTER_THREE_CARE.unlockConditions).toEqual([
      { type: "milestone-earned", milestoneId: "power-ready" },
    ]);
    expect(CHAPTER_THREE_CARE.missions).toHaveLength(3);
    expect(
      CHAPTER_THREE_CARE.missions.flatMap(
        (mission) => mission.allowedBuildingIds,
      ),
    ).toEqual(expect.arrayContaining(["road", "school", "clinic"]));
  });

  it("accepts accessible, balanced services even with a small remaining budget", () => {
    const result = evaluateChapterThreeCare(BALANCED_CARE);

    expect(result).toMatchObject({ complete: true, budget: 40 });
    expect(result.failures).toEqual([]);
    expect(result.populationHealth).toBeGreaterThanOrEqual(80);
    expect(result.fairnessGap).toBeLessThanOrEqual(15);
  });

  it("fails when one neighbourhood receives almost all service coverage", () => {
    const result = evaluateChapterThreeCare({
      ...BALANCED_CARE,
      neighbourhoods: [
        NORTH_BANK,
        {
          ...SOUTH_BANK,
          schoolReachableResidents: 3,
          clinicReachableResidents: 3,
          safeWalkingResidents: 3,
          roadSafety: 35,
        },
      ],
    });

    expect(result.complete).toBe(false);
    expect(result.failures.map((failure) => failure.ruleId)).toEqual([
      "schools-reach-every-neighbourhood",
      "clinics-reach-every-neighbourhood",
      "safe-walks-reach-every-neighbourhood",
      "roads-are-safe-for-every-neighbourhood",
      "care-is-fair",
    ]);
  });

  it.each([
    ["clinic-only", { school: 0, clinic: 1 }, ["school-present"]],
    ["school-only", { school: 1, clinic: 0 }, ["clinic-present"]],
  ] as const)("rejects a %s plan", (_name, counts, requiredFailure) => {
    const result = evaluateChapterThreeCare({
      ...BALANCED_CARE,
      buildingCounts: { ...BALANCED_CARE.buildingCounts, ...counts },
    });

    expect(result.complete).toBe(false);
    expect(result.failures.map((failure) => failure.ruleId)).toEqual(
      requiredFailure,
    );
  });

  it("requires both safe walking access and safe roads", () => {
    const result = evaluateChapterThreeCare({
      ...BALANCED_CARE,
      neighbourhoods: [
        {
          ...NORTH_BANK,
          safeWalkingResidents: 10,
          roadSafety: 55,
        },
        SOUTH_BANK,
      ],
    });

    expect(result.failures.map((failure) => failure.ruleId)).toEqual([
      "safe-walks-reach-every-neighbourhood",
      "roads-are-safe-for-every-neighbourhood",
    ]);
  });

  it("does not let a large budget replace underserved care", () => {
    const result = evaluateChapterThreeCare({
      ...BALANCED_CARE,
      budget: 9_999,
      neighbourhoods: [
        NORTH_BANK,
        {
          ...SOUTH_BANK,
          schoolReachableResidents: 4,
          clinicReachableResidents: 4,
        },
      ],
    });

    expect(result.complete).toBe(false);
    expect(result.budget).toBe(9_999);
    expect(result.failures.map((failure) => failure.ruleId)).toEqual([
      "schools-reach-every-neighbourhood",
      "clinics-reach-every-neighbourhood",
      "care-is-fair",
    ]);
  });

  it("is deterministic after JSON transport and never mutates the snapshot", () => {
    const before = structuredClone(BALANCED_CARE);
    const first = evaluateChapterThreeCare(BALANCED_CARE);
    const transported = JSON.parse(
      JSON.stringify(BALANCED_CARE),
    ) as ChapterThreeCareSnapshot;

    expect(evaluateChapterThreeCare(transported)).toEqual(first);
    expect(evaluateChapterThreeCare(BALANCED_CARE)).toEqual(first);
    expect(BALANCED_CARE).toEqual(before);
  });

  it("rejects malformed aggregate coverage instead of normalizing it", () => {
    expect(() =>
      evaluateChapterThreeCare({
        ...BALANCED_CARE,
        neighbourhoods: [
          { ...NORTH_BANK, clinicReachableResidents: 21 },
          SOUTH_BANK,
        ],
      }),
    ).toThrow(
      "Care neighbourhood values must be valid aggregate coverage facts",
    );
  });

  it("rejects building counts outside the Rivergate catalogue", () => {
    expect(() =>
      evaluateChapterThreeCare({
        ...BALANCED_CARE,
        buildingCounts: {
          ...BALANCED_CARE.buildingCounts,
          ["mystery-tower" as "home"]: 1,
        },
      }),
    ).toThrow("Care snapshot values must be finite, non-negative integers");
  });
});
