import {
  CauseEffectSchema,
  CityStateSchema,
  type CauseEffect,
  type CityState,
} from "@terra/campaign-schema";

import { BUILDING_IDS, type BuildingId } from "../catalogue";
import type { ChapterFourGrowthStrategy } from "./chapter-4-growth";
import {
  FINAL_STORM_EVENT_ID,
  evaluateRivergateChapterGate,
  type RivergateDirectorEvidence,
} from "./director";
import type {
  StormDamageResult,
  StormOutcomeBand,
  StormReadiness,
  StormRecoveryResult,
  StormSystem,
} from "./chapter-5-storm";
import { classifyStormOutcome } from "./chapter-5-storm";
import { RIVERGATE_TRACE_CODES, type RivergateTraceCode } from "./explanations";

export const RIVERGATE_ENDING_IDS = [
  "river-guardian",
  "steady-shaper",
  "brave-rebuilder",
] as const;

export type RivergateEndingId = (typeof RIVERGATE_ENDING_IDS)[number];

export const RIVERGATE_ENDING_RULES = [
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
] as const;

export const RIVERGATE_ENDING_CONTENT = {
  "river-guardian": {
    titleKey: "rivergate.ending.river-guardian.title",
    childSummaryKey: "rivergate.ending.river-guardian.child-summary",
    adultSummaryKey: "rivergate.ending.river-guardian.adult-summary",
    reflectionKey: "rivergate.ending.river-guardian.reflection",
  },
  "steady-shaper": {
    titleKey: "rivergate.ending.steady-shaper.title",
    childSummaryKey: "rivergate.ending.steady-shaper.child-summary",
    adultSummaryKey: "rivergate.ending.steady-shaper.adult-summary",
    reflectionKey: "rivergate.ending.steady-shaper.reflection",
  },
  "brave-rebuilder": {
    titleKey: "rivergate.ending.brave-rebuilder.title",
    childSummaryKey: "rivergate.ending.brave-rebuilder.child-summary",
    adultSummaryKey: "rivergate.ending.brave-rebuilder.adult-summary",
    reflectionKey: "rivergate.ending.brave-rebuilder.reflection",
  },
} as const;

export const RIVERGATE_ENDING_MESSAGES: Readonly<Record<string, string>> = {
  "rivergate.ending.river-guardian.title": "River Guardian",
  "rivergate.ending.river-guardian.child-summary":
    "Your wetlands, backup power, safe routes, and careful budget helped Rivergate stand strong through the storm.",
  "rivergate.ending.river-guardian.adult-summary":
    "The city remained protected because several systems were prepared together. Use the strongest and weakest system scores to discuss how balanced planning reduced damage and recovery time.",
  "rivergate.ending.river-guardian.reflection":
    "Which choice helped Rivergate most, and what would you improve next?",
  "rivergate.ending.steady-shaper.title": "Steady Shaper",
  "rivergate.ending.steady-shaper.child-summary":
    "The storm tested Rivergate, but your city kept working and started recovering. A few smart changes could make it even stronger.",
  "rivergate.ending.steady-shaper.adult-summary":
    "The city entered recovery with some systems prepared and others strained. Use the system scores and action history to explore trade-offs and identify the next improvement.",
  "rivergate.ending.steady-shaper.reflection":
    "Which strained system would you strengthen before the next storm?",
  "rivergate.ending.brave-rebuilder.title": "Brave Rebuilder",
  "rivergate.ending.brave-rebuilder.child-summary":
    "The storm hit Rivergate hard, but rebuilding has already begun. Every clue shows what to strengthen for the next storm.",
  "rivergate.ending.brave-rebuilder.adult-summary":
    "The city experienced significant disruption. The summary highlights its weakest system and recovery needs so the learner can revise the plan without framing the outcome as failure.",
  "rivergate.ending.brave-rebuilder.reflection":
    "What would you rebuild first to keep people safe next time?",
  "rivergate.trait.water-wise.title": "Water Wise",
  "rivergate.trait.energy-planner.title": "Energy Planner",
  "rivergate.trait.fair-neighbour.title": "Fair Neighbour",
  "rivergate.trait.growth-balancer.title": "Growth Balancer",
  "rivergate.trait.storm-ready.title": "Storm Ready",
};

export const RIVERGATE_TRAIT_CONTENT = {
  "trait-water-wise": "rivergate.trait.water-wise.title",
  "trait-energy-planner": "rivergate.trait.energy-planner.title",
  "trait-fair-neighbour": "rivergate.trait.fair-neighbour.title",
  "trait-growth-balancer": "rivergate.trait.growth-balancer.title",
  "trait-storm-ready": "rivergate.trait.storm-ready.title",
} as const;

export type RivergateTraitId = keyof typeof RIVERGATE_TRAIT_CONTENT;

export type RivergateEndingInput = {
  readonly city: CityState;
  readonly evidence: RivergateDirectorEvidence;
  /** Ordered cause/effect records accumulated by the local play session. */
  readonly causes: readonly CauseEffect[];
};

export type RivergateSystemStanding = {
  readonly system: StormSystem;
  readonly score: number;
  readonly readiness: StormReadiness;
};

export type RivergateMilestoneTrait = {
  readonly milestoneId:
    | "water-ready"
    | "power-ready"
    | "care-ready"
    | "growth-ready"
    | "storm-ready";
  readonly traitId: RivergateTraitId;
  readonly titleKey: (typeof RIVERGATE_TRAIT_CONTENT)[RivergateTraitId];
};

export type RivergateActionHistorySummary = {
  readonly totalActions: number;
  readonly placementActions: number;
  readonly removalActions: number;
  readonly completedTurns: number;
  readonly latestRecordedTurn: number;
  readonly differentBuildingTypesTried: number;
  readonly placementsByBuildingId: readonly {
    readonly buildingId: BuildingId;
    readonly count: number;
  }[];
};

export type RivergateCauseHistorySummary = {
  readonly totalCauses: number;
  readonly positive: number;
  readonly neutral: number;
  readonly warning: number;
  readonly critical: number;
  readonly causeCodeCounts: readonly {
    readonly code: RivergateTraceCode;
    readonly count: number;
  }[];
};

export type RivergateAdultLearningSummary = {
  readonly schemaVersion: 1;
  readonly endingId: RivergateEndingId;
  readonly adultSummaryKey: (typeof RIVERGATE_ENDING_CONTENT)[RivergateEndingId]["adultSummaryKey"];
  readonly reflectionKey: (typeof RIVERGATE_ENDING_CONTENT)[RivergateEndingId]["reflectionKey"];
  readonly finalCity: {
    readonly turn: number;
    readonly stage: CityState["stage"];
    readonly population: number;
    readonly remainingBudget: number;
  };
  readonly care: {
    readonly complete: boolean;
    readonly populationHealth: number;
    readonly fairnessGap: number;
  };
  readonly growth: {
    readonly complete: boolean;
    readonly strategy: ChapterFourGrowthStrategy;
  };
  readonly storm: {
    readonly outcomeBand: StormOutcomeBand;
    readonly readinessScore: number;
    readonly damage: StormDamageResult;
    readonly recovery: StormRecoveryResult;
  };
  readonly strongestSystem: RivergateSystemStanding;
  readonly weakestSystem: RivergateSystemStanding;
  readonly traits: readonly RivergateMilestoneTrait[];
  readonly actionHistory: RivergateActionHistorySummary;
  readonly causeHistory: RivergateCauseHistorySummary;
};

export type RivergateEnding = {
  readonly schemaVersion: 1;
  readonly endingId: RivergateEndingId;
  readonly titleKey: (typeof RIVERGATE_ENDING_CONTENT)[RivergateEndingId]["titleKey"];
  readonly childSummaryKey: (typeof RIVERGATE_ENDING_CONTENT)[RivergateEndingId]["childSummaryKey"];
  readonly stormOutcomeBand: StormOutcomeBand;
  readonly strongestSystem: RivergateSystemStanding;
  readonly weakestSystem: RivergateSystemStanding;
  readonly traits: readonly RivergateMilestoneTrait[];
  readonly actionHistory: RivergateActionHistorySummary;
  readonly growthStrategy: ChapterFourGrowthStrategy;
  readonly adultLearningSummary: RivergateAdultLearningSummary;
};

/** Classifies the declared 75/45 storm-readiness boundaries into an ending. */
export function classifyRivergateEnding(
  readinessScore: number,
): RivergateEndingId {
  return endingIdFor(classifyStormOutcome(readinessScore));
}

const SYSTEM_ORDER = [
  "water",
  "energy",
  "nature",
  "transport",
  "budget",
] as const satisfies readonly StormSystem[];

const TRAIT_DEFINITIONS = [
  {
    chapterId: "chapter-1-water",
    milestoneId: "water-ready",
    traitId: "trait-water-wise",
  },
  {
    chapterId: "chapter-2-power",
    milestoneId: "power-ready",
    traitId: "trait-energy-planner",
  },
  {
    chapterId: "chapter-3-care",
    milestoneId: "care-ready",
    traitId: "trait-fair-neighbour",
  },
  {
    chapterId: "chapter-4-growth",
    milestoneId: "growth-ready",
    traitId: "trait-growth-balancer",
  },
  {
    chapterId: "chapter-5-storm",
    milestoneId: "storm-ready",
    traitId: "trait-storm-ready",
  },
] as const;

/**
 * Creates the same JSON-safe ending for the same verified final city. It reads
 * only aggregate city facts and authored action/cause records: no identity,
 * wallet, network, AI, random source, or clock is involved.
 */
export function createRivergateEnding(
  input: RivergateEndingInput,
): RivergateEnding {
  const { city, evidence, causes } = validateInput(input);
  const stormGate = evaluateRivergateChapterGate(
    city,
    "chapter-5-storm",
    evidence,
  );
  if (stormGate.chapterId !== "chapter-5-storm") {
    throw new Error("Rivergate ending requires a final-storm evaluation");
  }
  if (!stormGate.eventEvidenceSatisfied) {
    throw new Error(
      `Rivergate ending requires verified event: ${FINAL_STORM_EVENT_ID}`,
    );
  }

  const careGate = evaluateRivergateChapterGate(
    city,
    "chapter-3-care",
    evidence,
  );
  const growthGate = evaluateRivergateChapterGate(
    city,
    "chapter-4-growth",
    evidence,
  );
  if (
    careGate.chapterId !== "chapter-3-care" ||
    growthGate.chapterId !== "chapter-4-growth"
  ) {
    throw new Error("Rivergate ending could not evaluate learning chapters");
  }

  const endingId = endingIdFor(stormGate.evaluation.outcomeBand);
  const content = RIVERGATE_ENDING_CONTENT[endingId];
  const standings = SYSTEM_ORDER.map((system) => ({
    system,
    score: stormGate.evaluation.systems[system].score,
    readiness: stormGate.evaluation.systems[system].readiness,
  }));
  const strongestSystem = selectStanding(standings, "strongest");
  const weakestSystem = selectStanding(standings, "weakest");
  const traits = earnedTraits(city, evidence);
  const actionHistory = summariseActions(city);
  const causeHistory = summariseCauses(causes);

  return deepFreeze({
    schemaVersion: 1,
    endingId,
    titleKey: content.titleKey,
    childSummaryKey: content.childSummaryKey,
    stormOutcomeBand: stormGate.evaluation.outcomeBand,
    strongestSystem,
    weakestSystem,
    traits,
    actionHistory,
    growthStrategy: growthGate.evaluation.strategy,
    adultLearningSummary: {
      schemaVersion: 1,
      endingId,
      adultSummaryKey: content.adultSummaryKey,
      reflectionKey: content.reflectionKey,
      finalCity: {
        turn: city.turn,
        stage: city.stage,
        population: city.population,
        remainingBudget: city.budget,
      },
      care: {
        complete: careGate.evaluation.complete,
        populationHealth: careGate.evaluation.populationHealth,
        fairnessGap: careGate.evaluation.fairnessGap,
      },
      growth: {
        complete: growthGate.evaluation.complete,
        strategy: growthGate.evaluation.strategy,
      },
      storm: {
        outcomeBand: stormGate.evaluation.outcomeBand,
        readinessScore: stormGate.evaluation.readinessScore,
        damage: stormGate.evaluation.damage,
        recovery: stormGate.evaluation.recovery,
      },
      strongestSystem,
      weakestSystem,
      traits,
      actionHistory,
      causeHistory,
    },
  });
}

function validateInput(input: RivergateEndingInput): RivergateEndingInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Rivergate ending input must be an object");
  }
  const parsedCity = CityStateSchema.safeParse(input.city);
  if (!parsedCity.success) {
    throw new Error("Rivergate ending requires a valid CityState");
  }
  if (parsedCity.data.campaignId !== "rivergate-foundations") {
    throw new Error("Rivergate ending requires the Rivergate campaign");
  }
  if (
    typeof input.evidence !== "object" ||
    input.evidence === null ||
    !Number.isInteger(input.evidence.turn) ||
    input.evidence.turn < 0 ||
    !Array.isArray(input.evidence.firedEventIds) ||
    input.evidence.firedEventIds.some(
      (eventId) => typeof eventId !== "string" || eventId.length === 0,
    )
  ) {
    throw new Error("Rivergate ending requires valid event evidence");
  }
  if (input.evidence.turn !== parsedCity.data.turn) {
    throw new Error(
      "Rivergate ending evidence is stale for the supplied city turn",
    );
  }
  if (!Array.isArray(input.causes)) {
    throw new Error("Rivergate ending requires a cause/effect history");
  }
  const parsedCauses = input.causes.map((cause) => {
    const parsed = CauseEffectSchema.safeParse(cause);
    if (!parsed.success) {
      throw new Error(
        "Rivergate ending received an invalid cause/effect record",
      );
    }
    if (
      !RIVERGATE_TRACE_CODES.includes(parsed.data.code as RivergateTraceCode)
    ) {
      throw new Error(
        `Rivergate ending received an unsupported trace code: ${parsed.data.code}`,
      );
    }
    return parsed.data;
  });
  for (const action of parsedCity.data.actionLog) {
    if (action.turn > parsedCity.data.turn) {
      throw new Error("Rivergate action history cannot be ahead of the city");
    }
    if (
      action.type === "place-building" &&
      !BUILDING_IDS.includes(action.buildingId as BuildingId)
    ) {
      throw new Error("Rivergate action history contains an unknown building");
    }
  }

  return {
    city: parsedCity.data,
    evidence: {
      turn: input.evidence.turn,
      firedEventIds: [...input.evidence.firedEventIds],
    },
    causes: parsedCauses,
  };
}

function endingIdFor(outcomeBand: StormOutcomeBand): RivergateEndingId {
  switch (outcomeBand) {
    case "protected":
      return "river-guardian";
    case "recovering":
      return "steady-shaper";
    case "hard-hit":
      return "brave-rebuilder";
  }
}

function earnedTraits(
  city: CityState,
  evidence: RivergateDirectorEvidence,
): RivergateMilestoneTrait[] {
  return TRAIT_DEFINITIONS.flatMap((definition) => {
    const gate = evaluateRivergateChapterGate(
      city,
      definition.chapterId,
      evidence,
    );
    const earned =
      gate.chapterId === "chapter-5-storm"
        ? gate.eventEvidenceSatisfied && gate.acceptableOutcome
        : gate.complete;
    return earned
      ? [
          {
            milestoneId: definition.milestoneId,
            traitId: definition.traitId,
            titleKey: RIVERGATE_TRAIT_CONTENT[definition.traitId],
          },
        ]
      : [];
  });
}

function selectStanding(
  standings: readonly RivergateSystemStanding[],
  direction: "strongest" | "weakest",
): RivergateSystemStanding {
  const selected = standings.reduce((best, candidate) => {
    if (direction === "strongest" && candidate.score > best.score) {
      return candidate;
    }
    if (direction === "weakest" && candidate.score < best.score) {
      return candidate;
    }
    return best;
  });
  return { ...selected };
}

function summariseActions(city: CityState): RivergateActionHistorySummary {
  const placements = city.actionLog.filter(
    (action) => action.type === "place-building",
  );
  const completedTurns = city.actionLog.filter(
    (action) => action.type === "advance-turn",
  );
  const placementsByBuildingId = BUILDING_IDS.flatMap((buildingId) => {
    const count = placements.filter(
      (action) =>
        action.type === "place-building" && action.buildingId === buildingId,
    ).length;
    return count === 0 ? [] : [{ buildingId, count }];
  });

  return {
    totalActions: city.actionLog.length,
    placementActions: placements.length,
    removalActions: city.actionLog.filter(
      (action) => action.type === "remove-building",
    ).length,
    completedTurns: completedTurns.length,
    latestRecordedTurn: completedTurns.reduce(
      (latest, action) => Math.max(latest, action.turn),
      0,
    ),
    differentBuildingTypesTried: placementsByBuildingId.length,
    placementsByBuildingId,
  };
}

function summariseCauses(
  causes: readonly CauseEffect[],
): RivergateCauseHistorySummary {
  const counts = new Map<RivergateTraceCode, number>();
  for (const cause of causes) {
    const code = cause.code as RivergateTraceCode;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return {
    totalCauses: causes.length,
    positive: countSeverity(causes, "positive"),
    neutral: countSeverity(causes, "neutral"),
    warning: countSeverity(causes, "warning"),
    critical: countSeverity(causes, "critical"),
    causeCodeCounts: [...counts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([code, count]) => ({ code, count })),
  };
}

function countSeverity(
  causes: readonly CauseEffect[],
  severity: CauseEffect["severity"],
): number {
  return causes.filter((cause) => cause.severity === severity).length;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return value;
}
