import { ChapterSchema, type Chapter } from "@terra/campaign-schema";

import { BUILDING_IDS, type BuildingId } from "../catalogue";

/**
 * This chapter intentionally unlocks from the milestone authored by Chapter 4.
 * Keeping the forward reference as data lets the full campaign compose the
 * chapters without making either chapter module depend on the other.
 */
export const CHAPTER_FIVE_UNLOCK_MILESTONE_ID = "growth-ready";

export const CHAPTER_FIVE_STORM: Chapter = ChapterSchema.parse({
  id: "chapter-5-storm",
  titleKey: "rivergate.chapter-5.title",
  order: 5,
  unlockConditions: [
    {
      type: "milestone-earned",
      milestoneId: CHAPTER_FIVE_UNLOCK_MILESTONE_ID,
    },
  ],
  missions: [
    {
      id: "make-room-for-rain",
      titleKey: "rivergate.chapter-5.mission-1.title",
      briefingKey: "rivergate.chapter-5.mission-1.briefing",
      order: 1,
      allowedBuildingIds: ["wetland", "community-park", "road"],
      objectives: [
        {
          id: "restore-a-wetland",
          descriptionKey: "rivergate.chapter-5.mission-1.objective.wetland",
          required: true,
          condition: {
            type: "building-count",
            buildingId: "wetland",
            comparison: "gte",
            value: 1,
          },
        },
        {
          id: "give-water-space",
          descriptionKey: "rivergate.chapter-5.mission-1.objective.nature",
          required: true,
          condition: {
            type: "metric",
            metric: "nature",
            comparison: "gte",
            value: 65,
          },
        },
        {
          id: "save-a-repair-fund",
          descriptionKey: "rivergate.chapter-5.mission-1.objective.budget",
          required: false,
          condition: {
            type: "metric",
            metric: "budget",
            comparison: "gte",
            value: 300,
          },
        },
      ],
      learningFactKeys: [
        "rivergate.chapter-5.fact.wetlands",
        "rivergate.chapter-5.fact.drainage",
      ],
    },
    {
      id: "keep-help-moving",
      titleKey: "rivergate.chapter-5.mission-2.title",
      briefingKey: "rivergate.chapter-5.mission-2.briefing",
      order: 2,
      allowedBuildingIds: [
        "road",
        "bus-stop",
        "solar-array",
        "battery",
        "clinic",
        "water-treatment-plant",
      ],
      objectives: [
        {
          id: "prepare-backup-power",
          descriptionKey: "rivergate.chapter-5.mission-2.objective.backup",
          required: true,
          condition: {
            type: "building-count",
            buildingId: "battery",
            comparison: "gte",
            value: 1,
          },
        },
        {
          id: "keep-energy-reliable",
          descriptionKey: "rivergate.chapter-5.mission-2.objective.energy",
          required: true,
          condition: {
            type: "metric",
            metric: "energy",
            comparison: "gte",
            value: 75,
          },
        },
        {
          id: "strengthen-emergency-routes",
          descriptionKey: "rivergate.chapter-5.mission-2.objective.routes",
          required: true,
          condition: {
            type: "metric",
            metric: "resilience",
            comparison: "gte",
            value: 70,
          },
        },
      ],
      learningFactKeys: [
        "rivergate.chapter-5.fact.emergency-access",
        "rivergate.chapter-5.fact.backup-energy",
      ],
    },
    {
      id: "repair-together",
      titleKey: "rivergate.chapter-5.mission-3.title",
      briefingKey: "rivergate.chapter-5.mission-3.briefing",
      order: 3,
      allowedBuildingIds: [...BUILDING_IDS],
      objectives: [
        {
          id: "weather-the-final-storm",
          descriptionKey: "rivergate.chapter-5.mission-3.objective.storm",
          required: true,
          condition: {
            type: "event-completed",
            eventId: "chapter-5-river-storm",
          },
        },
        {
          id: "restore-safe-water",
          descriptionKey: "rivergate.chapter-5.mission-3.objective.water",
          required: true,
          condition: {
            type: "metric",
            metric: "water",
            comparison: "gte",
            value: 55,
          },
        },
        {
          id: "keep-recovery-reserve",
          descriptionKey: "rivergate.chapter-5.mission-3.objective.recovery",
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
        "rivergate.chapter-5.fact.damage",
        "rivergate.chapter-5.fact.recovery",
      ],
    },
  ],
});

/** Temporary local copy for Chapter 5 until the campaign locale is composed. */
export const CHAPTER_FIVE_STORM_MESSAGES = {
  "rivergate.chapter-5.title": "Survive the storm",
  "rivergate.chapter-5.mission-1.title": "Make room for rain",
  "rivergate.chapter-5.mission-1.briefing":
    "A big storm is coming. Restore a wetland so rain can spread out safely instead of rushing toward homes and roads.",
  "rivergate.chapter-5.mission-1.objective.wetland":
    "Restore at least one wetland beside the river.",
  "rivergate.chapter-5.mission-1.objective.nature":
    "Raise nature to 65 so more ground can soak up rain.",
  "rivergate.chapter-5.mission-1.objective.budget":
    "If you can, save 300 for repairs after the storm.",
  "rivergate.chapter-5.mission-2.title": "Keep help moving",
  "rivergate.chapter-5.mission-2.briefing":
    "Check the clinic route, water equipment, and stored power. Helpers need an open road and essential services need energy when clouds cover the solar panels.",
  "rivergate.chapter-5.mission-2.objective.backup":
    "Keep at least one battery ready for essential services.",
  "rivergate.chapter-5.mission-2.objective.energy":
    "Raise reliable energy to 75 before the clouds arrive.",
  "rivergate.chapter-5.mission-2.objective.routes":
    "Raise resilience to 70 by protecting important routes and services.",
  "rivergate.chapter-5.mission-3.title": "Repair together",
  "rivergate.chapter-5.mission-3.briefing":
    "Run the storm, inspect what was damaged, and help Rivergate restore water, roads, and services. Every earlier plan changes how quickly the town recovers.",
  "rivergate.chapter-5.mission-3.objective.storm":
    "Run the final river storm and inspect the result.",
  "rivergate.chapter-5.mission-3.objective.water":
    "Restore safe water to 55 or higher.",
  "rivergate.chapter-5.mission-3.objective.recovery":
    "If you can, finish with 100 left for future repairs.",
  "rivergate.chapter-5.fact.wetlands":
    "Wetlands hold and slow storm water, giving rivers and drains more time.",
  "rivergate.chapter-5.fact.drainage":
    "Drainage works best when water has several safe places to flow and soak in.",
  "rivergate.chapter-5.fact.emergency-access":
    "An emergency route only helps when it still reaches homes and essential services.",
  "rivergate.chapter-5.fact.backup-energy":
    "Stored energy can keep pumps and clinics working when storm clouds reduce solar power.",
  "rivergate.chapter-5.fact.damage":
    "Buildings and roads in deeper flood zones are more likely to need repairs.",
  "rivergate.chapter-5.fact.recovery":
    "Maintenance, safe access, and a repair fund help a town recover sooner.",
  "rivergate.storm.finding.water-ready":
    "Safe water keeps moving through the storm.",
  "rivergate.storm.finding.water-strained":
    "Flood exposure interrupts part of the water system.",
  "rivergate.storm.finding.energy-ready":
    "Stored energy covers the essential storm load.",
  "rivergate.storm.finding.energy-strained":
    "Essential services do not have enough backup energy.",
  "rivergate.storm.finding.nature-ready":
    "Wetlands and open ground slow the runoff.",
  "rivergate.storm.finding.nature-strained":
    "Runoff arrives faster than the land can drain it.",
  "rivergate.storm.finding.transport-ready":
    "Emergency routes remain open to essential services.",
  "rivergate.storm.finding.transport-strained":
    "Flooded road tiles make some emergency trips slower.",
  "rivergate.storm.finding.budget-ready":
    "The repair reserve covers the storm work.",
  "rivergate.storm.finding.budget-strained":
    "The repair reserve is too small, so recovery takes longer.",
} as const satisfies Readonly<Record<string, string>>;

export type StormOutcomeBand = "protected" | "recovering" | "hard-hit";

export type StormSystem =
  "water" | "energy" | "nature" | "transport" | "budget";

export type StormReadiness = "ready" | "strained" | "fragile";

/**
 * A JSON-safe adapter boundary for the final storm. Network analysis supplies
 * access/exposure counts; the turn engine supplies indicators and resources.
 */
export type StormEvaluationSnapshot = {
  readonly schemaVersion: 1;
  readonly storm: {
    readonly magnitude: 1 | 2 | 3 | 4 | 5;
  };
  readonly buildingCounts: Readonly<Partial<Record<BuildingId, number>>>;
  readonly indicators: {
    readonly water: number;
    readonly energy: number;
    readonly nature: number;
    readonly resilience: number;
  };
  readonly water: {
    readonly connectedHomes: number;
    readonly homeCount: number;
    readonly criticalInfrastructureFloodRisk: number;
  };
  readonly energy: {
    readonly criticalDemand: number;
    readonly backupSupply: number;
    readonly storageCapacity: number;
  };
  readonly nature: {
    readonly drainageCapacity: number;
    readonly runoffLoad: number;
  };
  readonly transport: {
    readonly emergencyDestinations: number;
    readonly accessibleEmergencyDestinations: number;
    readonly roadTiles: number;
    readonly exposedRoadTiles: number;
  };
  readonly floodExposure: {
    readonly homes: number;
    readonly exposedHomes: number;
    readonly criticalServices: number;
    readonly exposedCriticalServices: number;
  };
  readonly budget: {
    readonly availableForRecovery: number;
    readonly maintenanceDue: number;
  };
};

export type StormSystemResult = {
  readonly system: StormSystem;
  readonly score: number;
  readonly readiness: StormReadiness;
  readonly messageKey: keyof typeof CHAPTER_FIVE_STORM_MESSAGES;
};

export type StormDamageResult = {
  readonly damagedHomes: number;
  readonly damagedCriticalServices: number;
  readonly waterOutageTurns: number;
  readonly powerOutageTurns: number;
  readonly roadClosureTurns: number;
  readonly estimatedRepairCost: number;
};

export type StormRecoveryResult = {
  readonly maintenanceShortfall: number;
  readonly repairCostCovered: number;
  readonly unfundedRepairCost: number;
  readonly remainingRecoveryBudget: number;
  readonly estimatedTurns: number;
};

/** This is a storm severity band, deliberately not a campaign ending. */
export type StormEvaluationResult = {
  readonly schemaVersion: 1;
  readonly outcomeBand: StormOutcomeBand;
  readonly readinessScore: number;
  readonly systems: Readonly<Record<StormSystem, StormSystemResult>>;
  readonly damage: StormDamageResult;
  readonly recovery: StormRecoveryResult;
};

const SCORE_WEIGHTS = {
  water: 0.2,
  energy: 0.2,
  nature: 0.2,
  transport: 0.2,
  budget: 0.1,
  resilience: 0.1,
} as const;

/**
 * Evaluates the same snapshot identically in every runtime. The evaluator does
 * not read time, randomness, global state, or mutate its input.
 */
export function evaluateFinalStorm(
  snapshot: StormEvaluationSnapshot,
): StormEvaluationResult {
  validateStormSnapshot(snapshot);

  const waterScore = roundScore(
    snapshot.indicators.water * 0.45 +
      ratio(snapshot.water.connectedHomes, snapshot.water.homeCount) * 25 +
      (1 - snapshot.water.criticalInfrastructureFloodRisk) * 30,
  );
  const hasStorage =
    (snapshot.buildingCounts.battery ?? 0) > 0 &&
    snapshot.energy.storageCapacity > 0;
  const backupRatio = hasStorage
    ? ratio(snapshot.energy.backupSupply, snapshot.energy.criticalDemand)
    : 0;
  const energyScore = roundScore(
    snapshot.indicators.energy * 0.45 +
      backupRatio * 40 +
      (hasStorage ? 15 : 0),
  );
  const wetlandProtection = Math.min(
    1,
    (snapshot.buildingCounts.wetland ?? 0) / 2,
  );
  const natureScore = roundScore(
    snapshot.indicators.nature * 0.45 +
      ratio(snapshot.nature.drainageCapacity, snapshot.nature.runoffLoad) * 35 +
      wetlandProtection * 20,
  );
  const transportScore = roundScore(
    ratio(
      snapshot.transport.accessibleEmergencyDestinations,
      snapshot.transport.emergencyDestinations,
    ) *
      60 +
      (1 -
        ratio(
          snapshot.transport.exposedRoadTiles,
          snapshot.transport.roadTiles,
        )) *
        30 +
      Math.min(1, (snapshot.buildingCounts["bus-stop"] ?? 0) / 2) * 10,
  );
  const repairReserve = Math.max(
    0,
    snapshot.budget.availableForRecovery - snapshot.budget.maintenanceDue,
  );
  const reserveTarget = 400 + snapshot.storm.magnitude * 40;
  const budgetScore = roundScore(ratio(repairReserve, reserveTarget) * 100);

  const rawReadiness =
    waterScore * SCORE_WEIGHTS.water +
    energyScore * SCORE_WEIGHTS.energy +
    natureScore * SCORE_WEIGHTS.nature +
    transportScore * SCORE_WEIGHTS.transport +
    budgetScore * SCORE_WEIGHTS.budget +
    snapshot.indicators.resilience * SCORE_WEIGHTS.resilience;
  const stormPenalty = (snapshot.storm.magnitude - 3) * 5;
  const readinessScore = roundScore(rawReadiness - stormPenalty);
  const outcomeBand = classifyStormOutcome(readinessScore);

  const systems: StormEvaluationResult["systems"] = {
    water: systemResult("water", waterScore),
    energy: systemResult("energy", energyScore),
    nature: systemResult("nature", natureScore),
    transport: systemResult("transport", transportScore),
    budget: systemResult("budget", budgetScore),
  };
  const damage = calculateDamage(snapshot, systems, readinessScore);
  const recovery = calculateRecovery(snapshot, damage, repairReserve);

  return {
    schemaVersion: 1,
    outcomeBand,
    readinessScore,
    systems,
    damage,
    recovery,
  };
}

export function classifyStormOutcome(score: number): StormOutcomeBand {
  assertFiniteInRange(score, 0, 100, "Storm readiness score");
  if (score >= 75) return "protected";
  if (score >= 45) return "recovering";
  return "hard-hit";
}

function systemResult(system: StormSystem, score: number): StormSystemResult {
  const readiness: StormReadiness =
    score >= 70 ? "ready" : score >= 42 ? "strained" : "fragile";
  const suffix = readiness === "ready" ? "ready" : "strained";
  const messageKey = `rivergate.storm.finding.${system}-${suffix}` as const;
  return { system, score, readiness, messageKey };
}

function calculateDamage(
  snapshot: StormEvaluationSnapshot,
  systems: StormEvaluationResult["systems"],
  readinessScore: number,
): StormDamageResult {
  const pressure = snapshot.storm.magnitude / 5;
  const protectionGap = 1 - readinessScore / 100;
  const homeDamageRate = Math.min(1, (0.1 + protectionGap * 0.9) * pressure);
  const serviceProtectionGap =
    1 -
    (systems.water.score + systems.energy.score + systems.transport.score) /
      300;
  const serviceDamageRate = Math.min(
    1,
    (0.1 + serviceProtectionGap * 0.9) * pressure,
  );
  const damagedHomes = boundedCeil(
    snapshot.floodExposure.exposedHomes * homeDamageRate,
    snapshot.floodExposure.homes,
  );
  const damagedCriticalServices = boundedCeil(
    snapshot.floodExposure.exposedCriticalServices * serviceDamageRate,
    snapshot.floodExposure.criticalServices,
  );
  const waterOutageTurns = outageTurns(
    systems.water.score,
    snapshot.storm.magnitude,
  );
  const powerOutageTurns = outageTurns(
    systems.energy.score,
    snapshot.storm.magnitude,
  );
  const roadClosureTurns = outageTurns(
    systems.transport.score,
    snapshot.storm.magnitude,
  );
  const estimatedRepairCost =
    damagedHomes * 55 +
    damagedCriticalServices * 110 +
    roadClosureTurns * 20 +
    (waterOutageTurns + powerOutageTurns) * 15;

  return {
    damagedHomes,
    damagedCriticalServices,
    waterOutageTurns,
    powerOutageTurns,
    roadClosureTurns,
    estimatedRepairCost,
  };
}

function calculateRecovery(
  snapshot: StormEvaluationSnapshot,
  damage: StormDamageResult,
  repairReserve: number,
): StormRecoveryResult {
  const maintenanceShortfall = Math.max(
    0,
    snapshot.budget.maintenanceDue - snapshot.budget.availableForRecovery,
  );
  const repairCostCovered = Math.min(repairReserve, damage.estimatedRepairCost);
  const unfundedRepairCost = damage.estimatedRepairCost - repairCostCovered;
  const remainingRecoveryBudget = Math.max(
    0,
    repairReserve - damage.estimatedRepairCost,
  );
  const longestInterruption = Math.max(
    damage.waterOutageTurns,
    damage.powerOutageTurns,
    damage.roadClosureTurns,
  );
  const handsOnRepairTurns = Math.ceil(damage.estimatedRepairCost / 200);
  const fundingDelayTurns = Math.ceil(
    (unfundedRepairCost + maintenanceShortfall) / 100,
  );
  const estimatedTurns =
    damage.estimatedRepairCost === 0
      ? 0
      : longestInterruption + handsOnRepairTurns + fundingDelayTurns;

  return {
    maintenanceShortfall,
    repairCostCovered,
    unfundedRepairCost,
    remainingRecoveryBudget,
    estimatedTurns,
  };
}

function outageTurns(score: number, magnitude: number): number {
  if (score >= 85) return 0;
  return Math.ceil((1 - score / 100) * magnitude * 1.4);
}

function boundedCeil(value: number, maximum: number): number {
  return Math.min(maximum, Math.ceil(value));
}

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.min(1, numerator / denominator);
}

function roundScore(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)) * 100) / 100;
}

function validateStormSnapshot(snapshot: StormEvaluationSnapshot): void {
  assertRecord(snapshot, "Storm snapshot");
  if (snapshot.schemaVersion !== 1) {
    throw new Error("Storm snapshot schemaVersion must be 1");
  }

  assertRecord(snapshot.storm, "Storm");
  assertIntegerInRange(snapshot.storm.magnitude, 1, 5, "Storm magnitude");
  assertRecord(snapshot.buildingCounts, "Building counts");
  for (const [buildingId, count] of Object.entries(snapshot.buildingCounts)) {
    if (!BUILDING_IDS.includes(buildingId as BuildingId)) {
      throw new Error(`Unknown storm building id: ${buildingId}`);
    }
    assertIntegerInRange(count, 0, Number.MAX_SAFE_INTEGER, "Building count");
  }

  assertRecord(snapshot.indicators, "Indicators");
  assertPercentage(snapshot.indicators.water, "Water indicator");
  assertPercentage(snapshot.indicators.energy, "Energy indicator");
  assertPercentage(snapshot.indicators.nature, "Nature indicator");
  assertPercentage(snapshot.indicators.resilience, "Resilience indicator");

  assertRecord(snapshot.water, "Water");
  assertCount(snapshot.water.connectedHomes, "Connected homes");
  assertCount(snapshot.water.homeCount, "Home count");
  if (snapshot.water.connectedHomes > snapshot.water.homeCount) {
    throw new Error("Connected homes cannot exceed total homes");
  }
  assertFiniteInRange(
    snapshot.water.criticalInfrastructureFloodRisk,
    0,
    1,
    "Critical water infrastructure flood risk",
  );

  assertRecord(snapshot.energy, "Energy");
  assertNonNegative(snapshot.energy.criticalDemand, "Critical energy demand");
  assertNonNegative(snapshot.energy.backupSupply, "Backup energy supply");
  assertNonNegative(snapshot.energy.storageCapacity, "Energy storage capacity");
  if (snapshot.energy.backupSupply > snapshot.energy.storageCapacity) {
    throw new Error("Backup supply cannot exceed storage capacity");
  }

  assertRecord(snapshot.nature, "Nature");
  assertNonNegative(snapshot.nature.drainageCapacity, "Drainage capacity");
  assertNonNegative(snapshot.nature.runoffLoad, "Runoff load");

  assertRecord(snapshot.transport, "Transport");
  assertCount(
    snapshot.transport.emergencyDestinations,
    "Emergency destinations",
  );
  assertCount(
    snapshot.transport.accessibleEmergencyDestinations,
    "Accessible emergency destinations",
  );
  if (
    snapshot.transport.accessibleEmergencyDestinations >
    snapshot.transport.emergencyDestinations
  ) {
    throw new Error(
      "Accessible emergency destinations cannot exceed total destinations",
    );
  }
  assertCount(snapshot.transport.roadTiles, "Road tiles");
  assertCount(snapshot.transport.exposedRoadTiles, "Exposed road tiles");
  if (snapshot.transport.exposedRoadTiles > snapshot.transport.roadTiles) {
    throw new Error("Exposed road tiles cannot exceed total road tiles");
  }

  assertRecord(snapshot.floodExposure, "Flood exposure");
  assertCount(snapshot.floodExposure.homes, "Flood exposure homes");
  assertCount(snapshot.floodExposure.exposedHomes, "Exposed homes");
  if (snapshot.floodExposure.exposedHomes > snapshot.floodExposure.homes) {
    throw new Error("Exposed homes cannot exceed total homes");
  }
  if (snapshot.floodExposure.homes !== snapshot.water.homeCount) {
    throw new Error("Flood exposure homes must match water home count");
  }
  assertCount(snapshot.floodExposure.criticalServices, "Critical services");
  assertCount(
    snapshot.floodExposure.exposedCriticalServices,
    "Exposed critical services",
  );
  if (
    snapshot.floodExposure.exposedCriticalServices >
    snapshot.floodExposure.criticalServices
  ) {
    throw new Error(
      "Exposed critical services cannot exceed total critical services",
    );
  }

  assertRecord(snapshot.budget, "Budget");
  assertNonNegative(
    snapshot.budget.availableForRecovery,
    "Available recovery budget",
  );
  assertNonNegative(snapshot.budget.maintenanceDue, "Maintenance due");
}

function assertRecord(value: unknown, label: string): asserts value is object {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertCount(value: number, label: string): void {
  assertIntegerInRange(value, 0, Number.MAX_SAFE_INTEGER, label);
}

function assertPercentage(value: number, label: string): void {
  assertFiniteInRange(value, 0, 100, label);
}

function assertNonNegative(value: number, label: string): void {
  assertFiniteInRange(value, 0, Number.MAX_VALUE, label);
}

function assertIntegerInRange(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${label} must be an integer from ${minimum} to ${maximum}`,
    );
  }
}

function assertFiniteInRange(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be from ${minimum} to ${maximum}`);
  }
}
