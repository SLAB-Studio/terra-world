import { ChapterSchema, type Chapter } from "@terra/campaign-schema";

import { BUILDING_IDS, type BuildingId } from "../catalogue";
import type { RivergateCauseCode } from "./scenario-types";

/**
 * Community care is intentionally measured per neighbourhood. A city-wide
 * average can hide a neighbourhood that has been left without an essential
 * service, so this chapter never uses one as its success condition.
 */
export const CARE_NEIGHBOURHOOD_IDS = ["north-bank", "south-bank"] as const;

export type CareNeighbourhoodId = (typeof CARE_NEIGHBOURHOOD_IDS)[number];

export type CareNeighbourhoodSnapshot = {
  /** A neighbourhood label, never a resident name or other personal data. */
  readonly id: CareNeighbourhoodId;
  readonly population: number;
  readonly schoolReachableResidents: number;
  readonly clinicReachableResidents: number;
  readonly safeWalkingResidents: number;
  /** A 0–100 road-safety score calculated by the deterministic map systems. */
  readonly roadSafety: number;
};

/**
 * JSON-safe, post-turn facts provided by the map and network systems. This is
 * deliberately a small boundary: it contains aggregate neighbourhood facts,
 * not tile paths or resident-level data.
 */
export type ChapterThreeCareSnapshot = {
  readonly buildingCounts: Readonly<Partial<Record<BuildingId, number>>>;
  readonly neighbourhoods: readonly CareNeighbourhoodSnapshot[];
  /** Remaining money after the city's current commitments, in game currency. */
  readonly budget: number;
};

export type CareCoverage = {
  readonly school: number;
  readonly clinic: number;
  readonly safeWalking: number;
  readonly roadSafety: number;
  /** A 0–100 combined access-and-safety indicator for this neighbourhood. */
  readonly populationHealth: number;
};

export type CareNeighbourhoodResult = {
  readonly id: CareNeighbourhoodId;
  readonly population: number;
  readonly coverage: CareCoverage;
};

export type CareRuleId =
  | "school-present"
  | "clinic-present"
  | "schools-reach-every-neighbourhood"
  | "clinics-reach-every-neighbourhood"
  | "safe-walks-reach-every-neighbourhood"
  | "roads-are-safe-for-every-neighbourhood"
  | "care-is-fair";

export type ChapterThreeCareFailure = {
  readonly ruleId: CareRuleId;
  readonly causeCode: RivergateCauseCode;
  readonly explanationKey: string;
  readonly hintKey: string;
};

export type ChapterThreeCareResult = {
  readonly complete: boolean;
  readonly passedRuleIds: readonly CareRuleId[];
  readonly failures: readonly ChapterThreeCareFailure[];
  readonly causeCodes: readonly RivergateCauseCode[];
  readonly neighbourhoods: readonly CareNeighbourhoodResult[];
  /** Population-weighted score across Rivergate, rounded to one decimal. */
  readonly populationHealth: number;
  /** The least-served-to-best-served health gap, rounded to one decimal. */
  readonly fairnessGap: number;
  /** Budget is reported for reflection, but never substitutes for care access. */
  readonly budget: number;
};

const MINIMUM_SERVICE_COVERAGE = 0.8;
const MINIMUM_SAFE_WALKING_COVERAGE = 0.8;
const MINIMUM_ROAD_SAFETY = 70;
const MAXIMUM_FAIRNESS_GAP = 15;

export const CHAPTER_THREE_CARE: Chapter = ChapterSchema.parse({
  id: "chapter-3-care",
  titleKey: "rivergate.chapter-3.title",
  order: 3,
  unlockConditions: [{ type: "milestone-earned", milestoneId: "power-ready" }],
  missions: [
    {
      id: "plan-a-safe-walk",
      titleKey: "rivergate.chapter-3.mission-1.title",
      briefingKey: "rivergate.chapter-3.mission-1.briefing",
      order: 1,
      allowedBuildingIds: ["home", "road"],
      objectives: [
        {
          id: "make-a-walking-route",
          descriptionKey: "rivergate.chapter-3.mission-1.objective.road",
          required: true,
          condition: {
            type: "building-count",
            buildingId: "road",
            comparison: "gte",
            value: 2,
          },
        },
        {
          id: "keep-routes-connected",
          descriptionKey: "rivergate.chapter-3.mission-1.objective.community",
          required: false,
          condition: {
            type: "metric",
            metric: "community",
            comparison: "gte",
            value: 35,
          },
        },
      ],
      learningFactKeys: [
        "rivergate.chapter-3.fact.walking",
        "rivergate.chapter-3.fact.road-safety",
      ],
    },
    {
      id: "open-a-school-for-everyone",
      titleKey: "rivergate.chapter-3.mission-2.title",
      briefingKey: "rivergate.chapter-3.mission-2.briefing",
      order: 2,
      allowedBuildingIds: ["home", "road", "school"],
      objectives: [
        {
          id: "build-a-school",
          descriptionKey: "rivergate.chapter-3.mission-2.objective.school",
          required: true,
          condition: {
            type: "building-count",
            buildingId: "school",
            comparison: "gte",
            value: 1,
          },
        },
        {
          id: "strengthen-community",
          descriptionKey: "rivergate.chapter-3.mission-2.objective.community",
          required: true,
          condition: {
            type: "metric",
            metric: "community",
            comparison: "gte",
            value: 50,
          },
        },
      ],
      learningFactKeys: ["rivergate.chapter-3.fact.school-coverage"],
    },
    {
      id: "care-for-every-neighbourhood",
      titleKey: "rivergate.chapter-3.mission-3.title",
      briefingKey: "rivergate.chapter-3.mission-3.briefing",
      order: 3,
      allowedBuildingIds: ["home", "road", "school", "clinic"],
      objectives: [
        {
          id: "build-a-clinic",
          descriptionKey: "rivergate.chapter-3.mission-3.objective.clinic",
          required: true,
          condition: {
            type: "building-count",
            buildingId: "clinic",
            comparison: "gte",
            value: 1,
          },
        },
        {
          id: "keep-care-strong",
          descriptionKey: "rivergate.chapter-3.mission-3.objective.community",
          required: true,
          condition: {
            type: "metric",
            metric: "community",
            comparison: "gte",
            value: 70,
          },
        },
        {
          id: "leave-repair-money",
          descriptionKey: "rivergate.chapter-3.mission-3.objective.budget",
          required: false,
          condition: {
            type: "metric",
            metric: "budget",
            comparison: "gte",
            value: 100,
          },
        },
      ],
      learningFactKeys: [
        "rivergate.chapter-3.fact.clinic-coverage",
        "rivergate.chapter-3.fact.population-health",
        "rivergate.chapter-3.fact.fairness",
      ],
    },
  ],
});

const CARE_RULES: readonly {
  readonly id: CareRuleId;
  readonly causeCode: RivergateCauseCode;
  readonly explanationKey: string;
  readonly hintKey: string;
  readonly passes: (summary: CareSummary) => boolean;
}[] = [
  {
    id: "school-present",
    causeCode: "construction.committed",
    explanationKey: "rivergate.fallback.care.no-school",
    hintKey: "rivergate.hint.care.no-school",
    passes: (summary) => summary.schoolCount > 0,
  },
  {
    id: "clinic-present",
    causeCode: "construction.committed",
    explanationKey: "rivergate.fallback.care.no-clinic",
    hintKey: "rivergate.hint.care.no-clinic",
    passes: (summary) => summary.clinicCount > 0,
  },
  {
    id: "schools-reach-every-neighbourhood",
    causeCode: "community.services-impact",
    explanationKey: "rivergate.fallback.care.school-coverage",
    hintKey: "rivergate.hint.care.school-coverage",
    passes: (summary) =>
      summary.neighbourhoods.every(
        (neighbourhood) =>
          neighbourhood.coverage.school >= MINIMUM_SERVICE_COVERAGE,
      ),
  },
  {
    id: "clinics-reach-every-neighbourhood",
    causeCode: "community.services-impact",
    explanationKey: "rivergate.fallback.care.clinic-coverage",
    hintKey: "rivergate.hint.care.clinic-coverage",
    passes: (summary) =>
      summary.neighbourhoods.every(
        (neighbourhood) =>
          neighbourhood.coverage.clinic >= MINIMUM_SERVICE_COVERAGE,
      ),
  },
  {
    id: "safe-walks-reach-every-neighbourhood",
    causeCode: "community.services-impact",
    explanationKey: "rivergate.fallback.care.walking-access",
    hintKey: "rivergate.hint.care.walking-access",
    passes: (summary) =>
      summary.neighbourhoods.every(
        (neighbourhood) =>
          neighbourhood.coverage.safeWalking >= MINIMUM_SAFE_WALKING_COVERAGE,
      ),
  },
  {
    id: "roads-are-safe-for-every-neighbourhood",
    causeCode: "community.services-impact",
    explanationKey: "rivergate.fallback.care.road-safety",
    hintKey: "rivergate.hint.care.road-safety",
    passes: (summary) =>
      summary.neighbourhoods.every(
        (neighbourhood) =>
          neighbourhood.coverage.roadSafety >= MINIMUM_ROAD_SAFETY,
      ),
  },
  {
    id: "care-is-fair",
    causeCode: "community.services-impact",
    explanationKey: "rivergate.fallback.care.unfair",
    hintKey: "rivergate.hint.care.unfair",
    passes: (summary) => summary.fairnessGap <= MAXIMUM_FAIRNESS_GAP,
  },
];

/**
 * Evaluates Chapter 3 from aggregated, JSON-safe city facts. Budget is not a
 * pass/fail input: retaining money while leaving people without care is not a
 * successful city plan.
 */
export function evaluateChapterThreeCare(
  snapshot: ChapterThreeCareSnapshot,
): ChapterThreeCareResult {
  validateCareSnapshot(snapshot);
  const summary = summariseCare(snapshot);
  const passedRuleIds: CareRuleId[] = [];
  const failures: ChapterThreeCareFailure[] = [];

  for (const rule of CARE_RULES) {
    if (rule.passes(summary)) {
      passedRuleIds.push(rule.id);
    } else {
      failures.push({
        ruleId: rule.id,
        causeCode: rule.causeCode,
        explanationKey: rule.explanationKey,
        hintKey: rule.hintKey,
      });
    }
  }

  return {
    complete: failures.length === 0,
    passedRuleIds,
    failures,
    causeCodes: stableCauseCodes(
      failures.length === 0
        ? ["construction.committed", "community.services-impact"]
        : failures.map((failure) => failure.causeCode),
    ),
    neighbourhoods: summary.neighbourhoods,
    populationHealth: summary.populationHealth,
    fairnessGap: summary.fairnessGap,
    budget: snapshot.budget,
  };
}

type CareSummary = {
  readonly schoolCount: number;
  readonly clinicCount: number;
  readonly neighbourhoods: readonly CareNeighbourhoodResult[];
  readonly populationHealth: number;
  readonly fairnessGap: number;
};

function summariseCare(snapshot: ChapterThreeCareSnapshot): CareSummary {
  const neighbourhoods = CARE_NEIGHBOURHOOD_IDS.map((id) => {
    const neighbourhood = snapshot.neighbourhoods.find(
      (candidate) => candidate.id === id,
    );
    if (!neighbourhood) {
      throw new Error(`Care snapshot is missing neighbourhood: ${id}`);
    }
    const school =
      neighbourhood.schoolReachableResidents / neighbourhood.population;
    const clinic =
      neighbourhood.clinicReachableResidents / neighbourhood.population;
    const safeWalking =
      neighbourhood.safeWalkingResidents / neighbourhood.population;
    const populationHealth = roundOneDecimal(
      school * 30 +
        clinic * 40 +
        safeWalking * 20 +
        neighbourhood.roadSafety * 0.1,
    );

    return {
      id,
      population: neighbourhood.population,
      coverage: {
        school: roundOneDecimal(school * 100) / 100,
        clinic: roundOneDecimal(clinic * 100) / 100,
        safeWalking: roundOneDecimal(safeWalking * 100) / 100,
        roadSafety: neighbourhood.roadSafety,
        populationHealth,
      },
    };
  });
  const totalPopulation = neighbourhoods.reduce(
    (total, neighbourhood) => total + neighbourhood.population,
    0,
  );
  const populationHealth = roundOneDecimal(
    neighbourhoods.reduce(
      (total, neighbourhood) =>
        total +
        neighbourhood.population * neighbourhood.coverage.populationHealth,
      0,
    ) / totalPopulation,
  );
  const healthScores = neighbourhoods.map(
    (neighbourhood) => neighbourhood.coverage.populationHealth,
  );

  return {
    schoolCount: snapshot.buildingCounts.school ?? 0,
    clinicCount: snapshot.buildingCounts.clinic ?? 0,
    neighbourhoods,
    populationHealth,
    fairnessGap: roundOneDecimal(
      Math.max(...healthScores) - Math.min(...healthScores),
    ),
  };
}

function validateCareSnapshot(snapshot: ChapterThreeCareSnapshot): void {
  const buildingCounts = Object.values(snapshot.buildingCounts);
  const hasUnknownBuildingId = Object.keys(snapshot.buildingCounts).some(
    (id) => !BUILDING_IDS.includes(id as BuildingId),
  );
  if (
    !Number.isFinite(snapshot.budget) ||
    snapshot.budget < 0 ||
    hasUnknownBuildingId ||
    buildingCounts.some((value) => !Number.isInteger(value) || value < 0)
  ) {
    throw new Error(
      "Care snapshot values must be finite, non-negative integers",
    );
  }
  if (snapshot.neighbourhoods.length !== CARE_NEIGHBOURHOOD_IDS.length) {
    throw new Error(
      "Care snapshot must contain each Rivergate neighbourhood once",
    );
  }
  const ids = new Set(
    snapshot.neighbourhoods.map((neighbourhood) => neighbourhood.id),
  );
  if (
    ids.size !== CARE_NEIGHBOURHOOD_IDS.length ||
    CARE_NEIGHBOURHOOD_IDS.some((id) => !ids.has(id))
  ) {
    throw new Error(
      "Care snapshot must contain each Rivergate neighbourhood once",
    );
  }

  for (const neighbourhood of snapshot.neighbourhoods) {
    const residentCounts = [
      neighbourhood.population,
      neighbourhood.schoolReachableResidents,
      neighbourhood.clinicReachableResidents,
      neighbourhood.safeWalkingResidents,
    ];
    if (
      residentCounts.some((value) => !Number.isInteger(value) || value < 0) ||
      neighbourhood.population === 0 ||
      neighbourhood.schoolReachableResidents > neighbourhood.population ||
      neighbourhood.clinicReachableResidents > neighbourhood.population ||
      neighbourhood.safeWalkingResidents > neighbourhood.population ||
      !Number.isFinite(neighbourhood.roadSafety) ||
      neighbourhood.roadSafety < 0 ||
      neighbourhood.roadSafety > 100
    ) {
      throw new Error(
        "Care neighbourhood values must be valid aggregate coverage facts",
      );
    }
  }
}

function stableCauseCodes(
  codes: readonly RivergateCauseCode[],
): RivergateCauseCode[] {
  return [...new Set(codes)].sort((left, right) => left.localeCompare(right));
}

function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Local copy for parent integration into the shared Rivergate message record. */
export const CHAPTER_THREE_CARE_MESSAGES: Readonly<Record<string, string>> = {
  "rivergate.chapter-3.title": "Care for residents",
  "rivergate.chapter-3.mission-1.title": "Plan a safe walk",
  "rivergate.chapter-3.mission-1.briefing":
    "Build connected roads so both neighbourhoods can walk safely to future services.",
  "rivergate.chapter-3.mission-1.objective.road":
    "Build two connected road tiles for a walking route.",
  "rivergate.chapter-3.mission-1.objective.community":
    "Optional: raise the community indicator to 35.",
  "rivergate.chapter-3.mission-2.title": "Open a school for everyone",
  "rivergate.chapter-3.mission-2.briefing":
    "Place a school where children from both neighbourhoods can reach it.",
  "rivergate.chapter-3.mission-2.objective.school": "Build one school.",
  "rivergate.chapter-3.mission-2.objective.community":
    "Raise the community indicator to 50.",
  "rivergate.chapter-3.mission-3.title": "Care for every neighbourhood",
  "rivergate.chapter-3.mission-3.briefing":
    "Add a clinic and check that safe roads, school access, and healthcare reach both neighbourhoods.",
  "rivergate.chapter-3.mission-3.objective.clinic": "Build one clinic.",
  "rivergate.chapter-3.mission-3.objective.community":
    "Raise the community indicator to 70.",
  "rivergate.chapter-3.mission-3.objective.budget":
    "Optional: keep 100 for repairs.",
  "rivergate.chapter-3.fact.walking":
    "A service helps most when people can safely walk to it.",
  "rivergate.chapter-3.fact.road-safety":
    "Roads need safe crossings and calm routes, not just enough space for cars.",
  "rivergate.chapter-3.fact.school-coverage":
    "A school can have room for many learners but still be too far from one neighbourhood.",
  "rivergate.chapter-3.fact.clinic-coverage":
    "Clinics support population health when people can reach care safely and regularly.",
  "rivergate.chapter-3.fact.population-health":
    "Health improves through care, learning, and safe everyday journeys.",
  "rivergate.chapter-3.fact.fairness":
    "A strong city checks whether every neighbourhood is served, not only the average score.",
  "rivergate.fallback.care.no-school":
    "Rivergate needs a school before children can have local learning access.",
  "rivergate.hint.care.no-school":
    "Place a school on connected, safe ground within reach of both neighbourhoods.",
  "rivergate.fallback.care.no-clinic":
    "Rivergate needs a clinic before residents can have local healthcare access.",
  "rivergate.hint.care.no-clinic":
    "Place a clinic on connected, safe ground within reach of both neighbourhoods.",
  "rivergate.fallback.care.school-coverage":
    "At least one neighbourhood cannot reach a school easily enough.",
  "rivergate.hint.care.school-coverage":
    "Check school coverage for north and south, then move or add routes to close the gap.",
  "rivergate.fallback.care.clinic-coverage":
    "At least one neighbourhood cannot reach the clinic easily enough.",
  "rivergate.hint.care.clinic-coverage":
    "Check clinic coverage for north and south, then improve the shared plan.",
  "rivergate.fallback.care.walking-access":
    "Some residents do not yet have a safe walking route to local services.",
  "rivergate.hint.care.walking-access":
    "Make sure safe walking routes reach people in both neighbourhoods.",
  "rivergate.fallback.care.road-safety":
    "A route exists, but it is not safe enough for everyday journeys.",
  "rivergate.hint.care.road-safety":
    "Improve the road safety score for every neighbourhood, not only the busiest route.",
  "rivergate.fallback.care.unfair":
    "Care is much stronger in one neighbourhood than the other.",
  "rivergate.hint.care.unfair":
    "Compare each neighbourhood's health score and close the largest access gap.",
};
