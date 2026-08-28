import { ChapterSchema, type Chapter } from "@terra/campaign-schema";

import { BUILDING_IDS, type BuildingId } from "../catalogue";

/**
 * Chapter four stays separate from the earlier water and power scenario
 * contract. Its values correspond to the existing turn resource and indicator
 * fields, but are deliberately plain data so they can cross a JSON boundary.
 */
export type ChapterFourGrowthSnapshot = {
  readonly population: number;
  readonly buildingCounts: Readonly<Partial<Record<BuildingId, number>>>;
  readonly waste: {
    readonly generated: number;
    readonly processed: number;
  };
  readonly transport: {
    readonly capacity: number;
    readonly demand: number;
  };
  readonly indicators: {
    /** Pollution is 0 (cleaner) through 100 (more polluted). */
    readonly pollution: number;
    readonly community: number;
  };
  readonly budget: {
    readonly availableForMaintenance: number;
    readonly maintenanceDue: number;
  };
};

export const CHAPTER_FOUR_GROWTH_CAUSE_CODES = [
  "community.population-growth",
  "waste.processing-balance",
  "transport.congestion-calculated",
  "nature.pollution-impact",
  "budget.maintenance-paid",
  "budget.maintenance-shortfall",
] as const;

export type ChapterFourGrowthCauseCode =
  (typeof CHAPTER_FOUR_GROWTH_CAUSE_CODES)[number];

export type ChapterFourGrowthFailure = {
  readonly requirementId: string;
  readonly causeCode: ChapterFourGrowthCauseCode;
  readonly explanationKey: string;
  readonly hintKey: string;
};

export type ChapterFourGrowthStrategy =
  | "recycling-and-transit"
  | "recycling-and-roads"
  | "overloaded"
  | "waste-heavy"
  | "underfunded"
  | "needs-revision";

export type ChapterFourGrowthResult = {
  readonly scenarioId: "chapter-4-growth-check";
  readonly complete: boolean;
  readonly strategy: ChapterFourGrowthStrategy;
  readonly passedRequirementIds: readonly string[];
  readonly failures: readonly ChapterFourGrowthFailure[];
  readonly causeCodes: readonly ChapterFourGrowthCauseCode[];
};

export const CHAPTER_FOUR_GROWTH: Chapter = ChapterSchema.parse({
  id: "chapter-4-growth",
  titleKey: "rivergate.chapter-4.title",
  order: 4,
  unlockConditions: [{ type: "milestone-earned", milestoneId: "care-ready" }],
  missions: [
    {
      id: "sort-the-growing-pile",
      titleKey: "rivergate.chapter-4.mission-1.title",
      briefingKey: "rivergate.chapter-4.mission-1.briefing",
      order: 1,
      allowedBuildingIds: ["road", "home", "recycling-centre"],
      objectives: [
        {
          id: "build-recycling-centre",
          descriptionKey:
            "rivergate.chapter-4.mission-1.objective.recycling-centre",
          required: true,
          condition: {
            type: "building-count",
            buildingId: "recycling-centre",
            comparison: "gte",
            value: 1,
          },
        },
        {
          id: "keep-waste-pollution-low",
          descriptionKey: "rivergate.chapter-4.mission-1.objective.pollution",
          required: true,
          condition: {
            type: "metric",
            metric: "pollution",
            comparison: "lte",
            value: 40,
          },
        },
      ],
      learningFactKeys: [
        "rivergate.chapter-4.fact.waste-grows",
        "rivergate.chapter-4.fact.recycling",
      ],
    },
    {
      id: "give-everyone-a-way-to-go",
      titleKey: "rivergate.chapter-4.mission-2.title",
      briefingKey: "rivergate.chapter-4.mission-2.briefing",
      order: 2,
      allowedBuildingIds: ["home", "road", "bus-stop", "recycling-centre"],
      objectives: [
        {
          id: "build-bus-stop",
          descriptionKey: "rivergate.chapter-4.mission-2.objective.bus-stop",
          required: false,
          condition: {
            type: "building-count",
            buildingId: "bus-stop",
            comparison: "gte",
            value: 1,
          },
        },
        {
          id: "keep-community-moving",
          descriptionKey: "rivergate.chapter-4.mission-2.objective.community",
          required: true,
          condition: {
            type: "metric",
            metric: "community",
            comparison: "gte",
            value: 70,
          },
        },
      ],
      learningFactKeys: [
        "rivergate.chapter-4.fact.transport-demand",
        "rivergate.chapter-4.fact.congestion",
      ],
    },
    {
      id: "make-room-for-rivergate",
      titleKey: "rivergate.chapter-4.mission-3.title",
      briefingKey: "rivergate.chapter-4.mission-3.briefing",
      order: 3,
      allowedBuildingIds: ["home", "road", "bus-stop", "recycling-centre"],
      objectives: [
        {
          id: "welcome-more-neighbours",
          descriptionKey: "rivergate.chapter-4.mission-3.objective.homes",
          required: true,
          condition: {
            type: "building-count",
            buildingId: "home",
            comparison: "gte",
            value: 6,
          },
        },
        {
          id: "protect-air-and-streets",
          descriptionKey: "rivergate.chapter-4.mission-3.objective.pollution",
          required: true,
          condition: {
            type: "metric",
            metric: "pollution",
            comparison: "lte",
            value: 35,
          },
        },
        {
          id: "save-for-upkeep",
          descriptionKey: "rivergate.chapter-4.mission-3.objective.budget",
          required: false,
          condition: {
            type: "metric",
            metric: "budget",
            comparison: "gte",
            value: 200,
          },
        },
      ],
      learningFactKeys: [
        "rivergate.chapter-4.fact.maintenance",
        "rivergate.chapter-4.fact.trade-offs",
      ],
    },
  ],
});

type GrowthRequirement = {
  readonly id: string;
  readonly causeCode: ChapterFourGrowthCauseCode;
  readonly explanationKey: string;
  readonly hintKey: string;
  readonly passes: (snapshot: ChapterFourGrowthSnapshot) => boolean;
};

const GROWTH_REQUIREMENTS: readonly GrowthRequirement[] = [
  {
    id: "growing-neighbourhood-present",
    causeCode: "community.population-growth",
    explanationKey: "rivergate.fallback.growth.not-growing-yet",
    hintKey: "rivergate.hint.growth.not-growing-yet",
    passes: (snapshot) =>
      (snapshot.buildingCounts.home ?? 0) >= 6 && snapshot.population >= 32,
  },
  {
    id: "recycling-centre-present",
    causeCode: "waste.processing-balance",
    explanationKey: "rivergate.fallback.growth.no-recycling",
    hintKey: "rivergate.hint.growth.no-recycling",
    passes: (snapshot) =>
      (snapshot.buildingCounts["recycling-centre"] ?? 0) >= 1,
  },
  {
    id: "waste-keeps-up",
    causeCode: "waste.processing-balance",
    explanationKey: "rivergate.fallback.growth.waste-pile",
    hintKey: "rivergate.hint.growth.waste-pile",
    passes: (snapshot) => snapshot.waste.processed >= snapshot.waste.generated,
  },
  {
    id: "transport-plan-present",
    causeCode: "transport.congestion-calculated",
    explanationKey: "rivergate.fallback.growth.no-transport-plan",
    hintKey: "rivergate.hint.growth.no-transport-plan",
    passes: (snapshot) =>
      (snapshot.buildingCounts["bus-stop"] ?? 0) >= 1 ||
      (snapshot.buildingCounts.road ?? 0) >= 5,
  },
  {
    id: "transport-keeps-up",
    causeCode: "transport.congestion-calculated",
    explanationKey: "rivergate.fallback.growth.congestion",
    hintKey: "rivergate.hint.growth.congestion",
    passes: (snapshot) =>
      snapshot.transport.capacity >= snapshot.transport.demand,
  },
  {
    id: "pollution-kept-low",
    causeCode: "nature.pollution-impact",
    explanationKey: "rivergate.fallback.growth.pollution",
    hintKey: "rivergate.hint.growth.pollution",
    passes: (snapshot) => snapshot.indicators.pollution <= 40,
  },
  {
    id: "maintenance-covered",
    causeCode: "budget.maintenance-shortfall",
    explanationKey: "rivergate.fallback.growth.maintenance",
    hintKey: "rivergate.hint.growth.maintenance",
    passes: (snapshot) =>
      snapshot.budget.availableForMaintenance >= snapshot.budget.maintenanceDue,
  },
];

export function evaluateChapterFourGrowth(
  snapshot: ChapterFourGrowthSnapshot,
): ChapterFourGrowthResult {
  validateChapterFourGrowthSnapshot(snapshot);

  const passedRequirementIds: string[] = [];
  const failures: ChapterFourGrowthFailure[] = [];

  for (const requirement of GROWTH_REQUIREMENTS) {
    if (requirement.passes(snapshot)) {
      passedRequirementIds.push(requirement.id);
    } else {
      failures.push({
        requirementId: requirement.id,
        causeCode: requirement.causeCode,
        explanationKey: requirement.explanationKey,
        hintKey: requirement.hintKey,
      });
    }
  }

  const complete = failures.length === 0;
  return {
    scenarioId: "chapter-4-growth-check",
    complete,
    strategy: classifyChapterFourGrowth(snapshot, complete),
    passedRequirementIds,
    failures,
    causeCodes: stableCauseCodes(
      complete
        ? [
            "community.population-growth",
            "waste.processing-balance",
            "transport.congestion-calculated",
            "nature.pollution-impact",
            "budget.maintenance-paid",
          ]
        : failures.map((failure) => failure.causeCode),
    ),
  };
}

export function classifyChapterFourGrowth(
  snapshot: ChapterFourGrowthSnapshot,
  complete = allGrowthRequirementsPass(snapshot),
): ChapterFourGrowthStrategy {
  validateChapterFourGrowthSnapshot(snapshot);

  if (complete) {
    return (snapshot.buildingCounts["bus-stop"] ?? 0) >= 1
      ? "recycling-and-transit"
      : "recycling-and-roads";
  }
  if (
    snapshot.budget.availableForMaintenance < snapshot.budget.maintenanceDue
  ) {
    return "underfunded";
  }
  if (snapshot.waste.processed < snapshot.waste.generated) {
    return "waste-heavy";
  }
  if (
    snapshot.transport.capacity < snapshot.transport.demand ||
    ((snapshot.buildingCounts["bus-stop"] ?? 0) === 0 &&
      (snapshot.buildingCounts.road ?? 0) < 5)
  ) {
    return "overloaded";
  }
  return "needs-revision";
}

export function validateChapterFourGrowthSnapshot(
  snapshot: ChapterFourGrowthSnapshot,
): void {
  const values = [
    snapshot.population,
    ...Object.values(snapshot.buildingCounts),
    snapshot.waste.generated,
    snapshot.waste.processed,
    snapshot.transport.capacity,
    snapshot.transport.demand,
    snapshot.indicators.pollution,
    snapshot.indicators.community,
    snapshot.budget.availableForMaintenance,
    snapshot.budget.maintenanceDue,
  ];

  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("Growth snapshot values must be finite and non-negative");
  }
  if (!Number.isInteger(snapshot.population)) {
    throw new Error("Growth population must be a whole number");
  }
  if (
    Object.values(snapshot.buildingCounts).some(
      (value) => !Number.isInteger(value),
    )
  ) {
    throw new Error("Growth building counts must be whole numbers");
  }
  if (
    Object.keys(snapshot.buildingCounts).some(
      (id) => !BUILDING_IDS.includes(id as BuildingId),
    )
  ) {
    throw new Error("Growth snapshot contains an unknown building id");
  }
  if (
    snapshot.indicators.pollution > 100 ||
    snapshot.indicators.community > 100
  ) {
    throw new Error("Growth indicators must be between 0 and 100");
  }
  if (snapshot.waste.processed > snapshot.waste.generated) {
    throw new Error("Processed waste cannot exceed generated waste");
  }
}

function allGrowthRequirementsPass(
  snapshot: ChapterFourGrowthSnapshot,
): boolean {
  return GROWTH_REQUIREMENTS.every((requirement) =>
    requirement.passes(snapshot),
  );
}

function stableCauseCodes(
  causeCodes: readonly ChapterFourGrowthCauseCode[],
): ChapterFourGrowthCauseCode[] {
  return [...new Set(causeCodes)].sort((left, right) =>
    left.localeCompare(right),
  );
}

/** Localised copy remains local until Chapter 4 is composed into the campaign. */
export const CHAPTER_FOUR_GROWTH_MESSAGES: Readonly<Record<string, string>> = {
  "rivergate.chapter-4.title": "Handle growth with care",
  "rivergate.chapter-4.mission-1.title": "Sort the growing pile",
  "rivergate.chapter-4.mission-1.briefing":
    "More neighbours create more rubbish. Build a recycling centre so useful materials do not become a growing pile.",
  "rivergate.chapter-4.mission-1.objective.recycling-centre":
    "Build one recycling centre.",
  "rivergate.chapter-4.mission-1.objective.pollution":
    "Keep pollution at 40 or less.",
  "rivergate.chapter-4.mission-2.title": "Give everyone a way to go",
  "rivergate.chapter-4.mission-2.briefing":
    "As Rivergate grows, trips can crowd the roads. Add a bus stop so more people can travel together.",
  "rivergate.chapter-4.mission-2.objective.bus-stop":
    "Optional: add a bus stop so more neighbours can share each trip.",
  "rivergate.chapter-4.mission-2.objective.community":
    "Raise community to 70 or more.",
  "rivergate.chapter-4.mission-3.title": "Make room for Rivergate",
  "rivergate.chapter-4.mission-3.briefing":
    "Welcome new neighbours while keeping waste, traffic, pollution, and upkeep in balance.",
  "rivergate.chapter-4.mission-3.objective.homes": "Build six homes.",
  "rivergate.chapter-4.mission-3.objective.pollution":
    "Keep pollution at 35 or less.",
  "rivergate.chapter-4.mission-3.objective.budget":
    "Keep 200 in the city budget for upkeep.",
  "rivergate.chapter-4.fact.waste-grows":
    "When more people live in a town, they create more waste each day.",
  "rivergate.chapter-4.fact.recycling":
    "A recycling centre can sort useful materials instead of leaving them as waste.",
  "rivergate.chapter-4.fact.transport-demand":
    "More neighbours also mean more trips to school, shops, and services.",
  "rivergate.chapter-4.fact.congestion":
    "When more people need to travel than streets can carry, journeys slow down and congestion grows.",
  "rivergate.chapter-4.fact.maintenance":
    "Roads, buses, and recycling equipment need regular care after they are built.",
  "rivergate.chapter-4.fact.trade-offs":
    "A growing town needs a plan that balances space, clean air, travel, waste, and money.",
  "rivergate.fallback.growth.not-growing-yet":
    "Rivergate needs more homes and neighbours before this growth plan can be checked.",
  "rivergate.hint.growth.not-growing-yet":
    "Build at least six homes, then see what the larger town needs.",
  "rivergate.fallback.growth.no-recycling":
    "The town is growing, but it has no place to sort its waste.",
  "rivergate.hint.growth.no-recycling":
    "Connect a recycling centre to a road on safe ground.",
  "rivergate.fallback.growth.waste-pile":
    "More waste is arriving than Rivergate can process, so the pile will grow.",
  "rivergate.hint.growth.waste-pile":
    "Add enough recycling capacity for all the waste the town makes.",
  "rivergate.fallback.growth.no-transport-plan":
    "New homes need either a bus stop or enough connected roads for daily trips.",
  "rivergate.hint.growth.no-transport-plan":
    "Try a bus stop, or extend the road network carefully.",
  "rivergate.fallback.growth.congestion":
    "More people need to travel than Rivergate's transport network can carry.",
  "rivergate.hint.growth.congestion":
    "Compare travel demand with capacity, then add a bus stop or improve routes.",
  "rivergate.fallback.growth.pollution":
    "The plan has enough movement, but pollution is still too high for a healthy growing town.",
  "rivergate.hint.growth.pollution":
    "Use recycling and shared bus trips to help keep the air cleaner.",
  "rivergate.fallback.growth.maintenance":
    "The new services help today, but there is not enough money left to care for them.",
  "rivergate.hint.growth.maintenance":
    "Choose a plan that works and still leaves money for regular upkeep.",
};
