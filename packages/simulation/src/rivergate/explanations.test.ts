import type { CauseEffect } from "@terra/campaign-schema";
import { describe, expect, it } from "vitest";

import {
  eventCauseCode,
  milestoneCauseCode,
  RUNTIME_STATIC_CAUSE_CODES,
  stageTransitionCauseCode,
} from "../cause-codes";
import {
  evaluateChapterThreeCare,
  type ChapterThreeCareSnapshot,
} from "./chapter-3-care";
import {
  CHAPTER_FOUR_GROWTH_CAUSE_CODES,
  evaluateChapterFourGrowth,
  type ChapterFourGrowthSnapshot,
} from "./chapter-4-growth";
import {
  CHAPTER_FIVE_STORM_MESSAGES,
  type StormOutcomeBand,
  type StormReadiness,
  type StormSystem,
} from "./chapter-5-storm";
import {
  CHAPTER_ONE_SCENARIO,
  CHAPTER_TWO_SCENARIO,
  RIVERGATE_FOUNDATIONS_CAMPAIGN,
} from "./content";
import { RIVERGATE_EN_MESSAGES } from "./en";
import { evaluateRivergateScenario } from "./evaluate";
import {
  branchCodeForFailure,
  renderRivergateCause,
  renderRivergateEvaluationBranch,
  RIVERGATE_CARE_FAILURE_BRANCHES,
  RIVERGATE_ENERGY_PATHS,
  RIVERGATE_EVALUATION_BRANCH_CODES,
  RIVERGATE_EVALUATION_EXPLANATIONS,
  RIVERGATE_GROWTH_FAILURE_BRANCHES,
  RIVERGATE_GROWTH_STRATEGIES,
  RIVERGATE_REQUIRED_TRACE_CODES,
  RIVERGATE_SCENARIO_FAILURE_BRANCHES,
  RIVERGATE_STORM_OUTCOMES,
  RIVERGATE_STORM_READINESS,
  RIVERGATE_STORM_SYSTEMS,
  RIVERGATE_TRACE_CODES,
  RIVERGATE_TRACE_EXPLANATIONS,
} from "./explanations";
import {
  RIVERGATE_CAUSE_CODES,
  type RivergateScenarioSnapshot,
} from "./scenario-types";

const MESSAGES = RIVERGATE_EN_MESSAGES;

const EMPTY_SCENARIO: RivergateScenarioSnapshot = {
  buildingCounts: {},
  water: {
    rawSupply: 0,
    treatedSupply: 0,
    demand: 10,
    quality: 0,
    connectedHomes: 0,
    homeCount: 0,
    floodRiskByBuilding: { "water-treatment-plant": 1 },
  },
  energy: {
    dayGeneration: 0,
    dayDemand: 10,
    nightGeneration: 0,
    nightDemand: 10,
    storedAtNight: 0,
    storageCapacity: 0,
    clinicSupply: 0,
  },
  budget: { availableForMaintenance: 0, maintenanceDue: 10 },
};

const FAILING_CARE: ChapterThreeCareSnapshot = {
  buildingCounts: {},
  budget: 0,
  neighbourhoods: [
    {
      id: "north-bank",
      population: 2,
      schoolReachableResidents: 0,
      clinicReachableResidents: 0,
      safeWalkingResidents: 0,
      roadSafety: 0,
    },
    {
      id: "south-bank",
      population: 2,
      schoolReachableResidents: 1,
      clinicReachableResidents: 1,
      safeWalkingResidents: 1,
      roadSafety: 50,
    },
  ],
};

const FAILING_GROWTH: ChapterFourGrowthSnapshot = {
  population: 0,
  buildingCounts: {},
  waste: { generated: 10, processed: 0 },
  transport: { capacity: 0, demand: 10 },
  indicators: { pollution: 100, community: 0 },
  budget: { availableForMaintenance: 0, maintenanceDue: 10 },
};

describe("Rivergate offline explanations", () => {
  it("covers every declared trace cause code and Rivergate event", () => {
    const independentlyDerivedCodes = new Set([
      ...RUNTIME_STATIC_CAUSE_CODES,
      ...RIVERGATE_CAUSE_CODES,
      ...CHAPTER_FOUR_GROWTH_CAUSE_CODES,
      ...RIVERGATE_FOUNDATIONS_CAMPAIGN.events.map((event) =>
        eventCauseCode(event.id),
      ),
      ...RIVERGATE_FOUNDATIONS_CAMPAIGN.milestones.map((milestone) =>
        milestoneCauseCode(milestone.id),
      ),
      ...["care-ready", "growth-ready", "storm-ready"].map(milestoneCauseCode),
      stageTransitionCauseCode("seed", "settlement"),
      stageTransitionCauseCode("settlement", "town"),
      stageTransitionCauseCode("town", "city"),
      stageTransitionCauseCode("city", "resilient-city"),
    ]);

    expect(new Set(RIVERGATE_TRACE_CODES).size).toBe(
      RIVERGATE_TRACE_CODES.length,
    );
    expect(new Set(RIVERGATE_REQUIRED_TRACE_CODES)).toEqual(
      independentlyDerivedCodes,
    );
    expect(new Set(RIVERGATE_TRACE_CODES)).toEqual(independentlyDerivedCodes);
    expect(Object.keys(RIVERGATE_TRACE_EXPLANATIONS).sort()).toEqual(
      [...independentlyDerivedCodes].sort(),
    );
  });

  it("covers every authored Chapter 1 and 2 evaluator failure", () => {
    const actual = [CHAPTER_ONE_SCENARIO, CHAPTER_TWO_SCENARIO].flatMap(
      (scenario) =>
        evaluateRivergateScenario(scenario, EMPTY_SCENARIO).failures.map(
          (failure) => branchCodeForFailure(scenario.chapterId, failure.ruleId),
        ),
    );

    expect(actual.sort()).toEqual(
      [...RIVERGATE_SCENARIO_FAILURE_BRANCHES].sort(),
    );
    for (const code of actual) {
      expect(RIVERGATE_EVALUATION_EXPLANATIONS).toHaveProperty(code);
    }
  });

  it("covers every authored care and growth evaluator failure", () => {
    const care = evaluateChapterThreeCare(FAILING_CARE).failures.map(
      (failure) => branchCodeForFailure("chapter-3-care", failure.ruleId),
    );
    const growth = evaluateChapterFourGrowth(FAILING_GROWTH).failures.map(
      (failure) =>
        branchCodeForFailure("chapter-4-growth", failure.requirementId),
    );

    expect(care.sort()).toEqual([...RIVERGATE_CARE_FAILURE_BRANCHES].sort());
    expect(growth.sort()).toEqual(
      [...RIVERGATE_GROWTH_FAILURE_BRANCHES].sort(),
    );
    for (const code of [...care, ...growth]) {
      expect(RIVERGATE_EVALUATION_EXPLANATIONS).toHaveProperty(code);
    }
  });

  it("covers every declared evaluator outcome branch", () => {
    const outcomeCodes = [
      "chapter-1-water.complete",
      "chapter-2-power.complete",
      ...RIVERGATE_ENERGY_PATHS.map(
        (path) => `chapter-2-power.energy-path.${path}`,
      ),
      "chapter-3-care.complete",
      "chapter-4-growth.complete",
      ...RIVERGATE_GROWTH_STRATEGIES.map(
        (strategy) => `chapter-4-growth.strategy.${strategy}`,
      ),
      ...RIVERGATE_STORM_OUTCOMES.map(
        (outcome) => `chapter-5-storm.outcome.${outcome}`,
      ),
      ...RIVERGATE_STORM_SYSTEMS.flatMap((system) =>
        RIVERGATE_STORM_READINESS.map(
          (readiness) => `chapter-5-storm.system.${system}.${readiness}`,
        ),
      ),
      "chapter-5-storm.failure.event-not-completed",
    ];

    const stormOutcomes: readonly StormOutcomeBand[] = RIVERGATE_STORM_OUTCOMES;
    const stormSystems: readonly StormSystem[] = RIVERGATE_STORM_SYSTEMS;
    const stormReadiness: readonly StormReadiness[] = RIVERGATE_STORM_READINESS;
    expect(stormOutcomes).toHaveLength(3);
    expect(stormSystems).toHaveLength(5);
    expect(stormReadiness).toHaveLength(3);
    expect(
      outcomeCodes.every((code) =>
        Object.hasOwn(RIVERGATE_EVALUATION_EXPLANATIONS, code),
      ),
    ).toBe(true);
    expect(Object.keys(RIVERGATE_EVALUATION_EXPLANATIONS).sort()).toEqual(
      [...RIVERGATE_EVALUATION_BRANCH_CODES].sort(),
    );
  });

  it("resolves explanation, question, and hint text for every template", () => {
    for (const [code, template] of Object.entries({
      ...RIVERGATE_TRACE_EXPLANATIONS,
      ...RIVERGATE_EVALUATION_EXPLANATIONS,
    })) {
      for (const key of [
        template.explanationKey,
        template.questionKey,
        template.hintKey,
      ]) {
        expect(MESSAGES[key], `${code} is missing ${key}`).toBeTruthy();
      }
    }
    for (const system of RIVERGATE_STORM_SYSTEMS) {
      expect(CHAPTER_FIVE_STORM_MESSAGES).toHaveProperty(
        `rivergate.storm.finding.${system}-ready`,
      );
      expect(CHAPTER_FIVE_STORM_MESSAGES).toHaveProperty(
        `rivergate.storm.finding.${system}-strained`,
      );
    }
  });

  it("renders deterministically, remains JSON-safe, and never copies PII-like source ids", () => {
    const cause: CauseEffect = {
      code: "water.reliability-calculated",
      category: "water",
      severity: "warning",
      phase: 3,
      sourceBuildingIds: ["private-child-name"],
      sourceTileIds: ["private-home-address"],
      changes: [{ metric: "water", before: 10, after: 20, delta: 10 }],
    };
    const first = renderRivergateCause(cause, MESSAGES);
    const second = renderRivergateCause(structuredClone(cause), MESSAGES);

    expect(first).toEqual(second);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(JSON.stringify(first)).not.toContain("private-child-name");
    expect(JSON.stringify(first)).not.toContain("private-home-address");
  });

  it("fails closed for unknown codes and missing localization", () => {
    const unknownCause: CauseEffect = {
      code: "rivergate.unknown",
      category: "event",
      severity: "neutral",
      phase: 0,
      sourceBuildingIds: [],
      sourceTileIds: [],
      changes: [],
    };

    expect(renderRivergateCause(unknownCause, MESSAGES)).toEqual({
      ok: false,
      error: {
        code: "unsupported-code",
        sourceCode: "rivergate.unknown",
      },
    });
    expect(renderRivergateEvaluationBranch("not-authored", MESSAGES)).toEqual({
      ok: false,
      error: { code: "unsupported-code", sourceCode: "not-authored" },
    });
    expect(
      renderRivergateEvaluationBranch("chapter-1-water.complete", {}),
    ).toMatchObject({
      ok: false,
      error: { code: "missing-localization" },
    });
  });
});
