import type {
  EnergyPath,
  RivergateCauseCode,
  RivergateScenarioSnapshot,
  ScenarioDefinition,
  ScenarioEvaluation,
  ScenarioRule,
} from "./scenario-types";

export function evaluateRivergateScenario(
  definition: ScenarioDefinition,
  snapshot: RivergateScenarioSnapshot,
): ScenarioEvaluation {
  validateSnapshot(snapshot);
  const passedRuleIds: string[] = [];
  const failures: ScenarioEvaluation["failures"][number][] = [];

  for (const rule of definition.rules) {
    if (rulePasses(rule, snapshot)) {
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
    scenarioId: definition.id,
    complete: failures.length === 0,
    passedRuleIds,
    failures,
    causeCodes: stableUniqueCauseCodes(
      failures.length === 0
        ? definition.successCauseCodes
        : failures.map((failure) => failure.causeCode),
    ),
    energyPath:
      definition.chapterId === "chapter-2-power"
        ? classifyEnergyPath(snapshot)
        : null,
  };
}

export function classifyEnergyPath(
  snapshot: RivergateScenarioSnapshot,
): EnergyPath {
  validateSnapshot(snapshot);
  const solarCount = snapshot.buildingCounts["solar-array"] ?? 0;
  const batteryCount = snapshot.buildingCounts.battery ?? 0;
  const dayReliable =
    solarCount > 0 &&
    snapshot.energy.dayGeneration >= snapshot.energy.dayDemand;
  const nightAvailable =
    snapshot.energy.nightGeneration + snapshot.energy.storedAtNight;
  const nightReliable = nightAvailable >= snapshot.energy.nightDemand;
  const clinicReliable = snapshot.energy.clinicSupply >= 4;
  const maintenancePaid =
    snapshot.budget.availableForMaintenance >= snapshot.budget.maintenanceDue;

  if (!dayReliable) return "blackout";
  if (batteryCount === 0 || snapshot.energy.storageCapacity === 0) {
    return "solar-only";
  }
  if (!nightReliable || !clinicReliable || !maintenancePaid) {
    return "solar-plus-storage";
  }
  return "stable-grid";
}

function rulePasses(
  rule: ScenarioRule,
  snapshot: RivergateScenarioSnapshot,
): boolean {
  switch (rule.type) {
    case "building-count":
      return (snapshot.buildingCounts[rule.buildingId] ?? 0) >= rule.minimum;
    case "treated-water-balance":
      return (
        snapshot.water.rawSupply >= snapshot.water.demand &&
        snapshot.water.treatedSupply >= snapshot.water.demand &&
        snapshot.water.quality >= rule.minimumQuality
      );
    case "home-water-connections":
      return (
        snapshot.water.homeCount >= rule.minimumConnectedHomes &&
        snapshot.water.connectedHomes === snapshot.water.homeCount
      );
    case "maximum-flood-exposure":
      return rule.buildingIds.every(
        (buildingId) =>
          (snapshot.water.floodRiskByBuilding[buildingId] ?? 0) <=
          rule.maximumRisk,
      );
    case "day-generation-balance":
      return (
        snapshot.energy.dayGeneration >= snapshot.energy.dayDemand &&
        (snapshot.buildingCounts["solar-array"] ?? 0) > 0
      );
    case "night-storage-balance":
      return (
        (snapshot.buildingCounts.battery ?? 0) > 0 &&
        snapshot.energy.storageCapacity > 0 &&
        snapshot.energy.nightGeneration + snapshot.energy.storedAtNight >=
          snapshot.energy.nightDemand
      );
    case "reserved-clinic-load":
      return snapshot.energy.clinicSupply >= rule.requiredSupply;
    case "maintenance-affordable":
      return (
        snapshot.budget.availableForMaintenance >=
        snapshot.budget.maintenanceDue
      );
  }
}

function stableUniqueCauseCodes(
  codes: readonly RivergateCauseCode[],
): RivergateCauseCode[] {
  return [...new Set(codes)].sort((left, right) => left.localeCompare(right));
}

function validateSnapshot(snapshot: RivergateScenarioSnapshot): void {
  const values = [
    ...Object.values(snapshot.buildingCounts),
    snapshot.water.rawSupply,
    snapshot.water.treatedSupply,
    snapshot.water.demand,
    snapshot.water.quality,
    snapshot.water.connectedHomes,
    snapshot.water.homeCount,
    ...Object.values(snapshot.water.floodRiskByBuilding),
    snapshot.energy.dayGeneration,
    snapshot.energy.dayDemand,
    snapshot.energy.nightGeneration,
    snapshot.energy.nightDemand,
    snapshot.energy.storedAtNight,
    snapshot.energy.storageCapacity,
    snapshot.energy.clinicSupply,
    snapshot.budget.availableForMaintenance,
    snapshot.budget.maintenanceDue,
  ];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("Scenario snapshot values must be finite and non-negative");
  }
  if (snapshot.water.quality > 100) {
    throw new Error("Water quality must be between 0 and 100");
  }
  if (
    Object.values(snapshot.water.floodRiskByBuilding).some((value) => value > 1)
  ) {
    throw new Error("Flood risk must be between 0 and 1");
  }
  if (snapshot.water.connectedHomes > snapshot.water.homeCount) {
    throw new Error("Connected homes cannot exceed total homes");
  }
  if (snapshot.energy.storedAtNight > snapshot.energy.storageCapacity) {
    throw new Error("Stored energy cannot exceed storage capacity");
  }
}
