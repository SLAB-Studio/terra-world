import {
  CityStateSchema,
  type BuildingDefinition,
  type CauseEffect,
  type CityMetric,
  type CityState,
  type ResourceKind,
  type TurnAction,
} from "@terra/campaign-schema";

import { BUILDING_CATALOGUE } from "./catalogue";
import {
  milestoneCauseCode,
  stageTransitionCauseCode,
  type MilestoneCauseCode,
  type RuntimeStaticCauseCode,
  type StageTransitionCauseCode,
} from "./cause-codes";
import { applyScheduledEvents } from "./events";
import { deterministicHash } from "./hash";
import {
  materializePlanningState,
  type PlanningOperation,
  type PlanningSession,
} from "./placement";
import { advanceProgression, type ProgressionContext } from "./progression";

export type TurnNetworkSnapshot = {
  readonly waterCoverage: number;
  readonly electricityCoverage: number;
  readonly educationCoverage: number;
  readonly healthcareCoverage: number;
  readonly transportCoverage: number;
  readonly natureCoverage: number;
};

export type SimulateTurnInput = {
  readonly city: CityState;
  readonly planning?: PlanningSession;
  readonly network: TurnNetworkSnapshot;
  readonly catalogue?: readonly BuildingDefinition[];
  readonly progression?: ProgressionContext;
};

export type TurnResult = {
  readonly state: CityState;
  readonly causes: readonly CauseEffect[];
  readonly firedEventIds: readonly string[];
  readonly earnedMilestoneIds: readonly string[];
};

export function simulateTurn(input: SimulateTurnInput): TurnResult {
  validateCoverage(input.network);
  const catalogue = input.catalogue ?? BUILDING_CATALOGUE;
  const planning = input.planning;
  if (planning !== undefined && planning.baseState !== input.city) {
    throw new Error(
      "Planning session must be based on the supplied city state",
    );
  }

  const nextTurn = input.city.turn + 1;
  const committed =
    planning === undefined
      ? cloneCity(input.city)
      : cloneCity(materializePlanningState(planning));
  const operations = planning?.operations.slice(0, planning.cursor) ?? [];
  const newBuildings = committed.buildings.filter(
    (building) =>
      !input.city.buildings.some(
        (existing) => existing.instanceId === building.instanceId,
      ),
  );
  const constructionCost = sum(
    newBuildings.map(
      (building) =>
        requiredDefinition(catalogue, building.definitionId).constructionCost,
    ),
  );
  const definitions = committed.buildings.map((building) =>
    requiredDefinition(catalogue, building.definitionId),
  );
  const maintenance = sum(
    definitions.map((definition) => definition.maintenanceCost),
  );
  const production = aggregateFlows(definitions, "outputs");
  const buildingDemand = aggregateFlows(definitions, "inputs");

  const causes: CauseEffect[] = [];
  let state: CityState = {
    ...committed,
    turn: nextTurn,
    actionLog: appendTurnActions(input.city, operations, nextTurn),
  };

  const afterConstruction = Math.max(0, round(state.budget - constructionCost));
  if (constructionCost > 0) {
    causes.push(
      metricCause(
        "construction.committed",
        "construction",
        "neutral",
        1,
        "budget",
        state.budget,
        afterConstruction,
        newBuildings.map((building) => building.instanceId),
        newBuildings.flatMap((building) => building.occupiedTileIds),
      ),
    );
  }
  state = { ...state, budget: afterConstruction };

  const maintenancePaid = Math.min(state.budget, maintenance);
  const afterMaintenance = round(state.budget - maintenancePaid);
  if (maintenance > 0) {
    causes.push(
      metricCause(
        maintenancePaid === maintenance
          ? "budget.maintenance-paid"
          : "budget.maintenance-shortfall",
        "budget",
        maintenancePaid === maintenance ? "neutral" : "critical",
        2,
        "budget",
        state.budget,
        afterMaintenance,
        committed.buildings.map((building) => building.instanceId),
        [],
      ),
    );
  }
  state = { ...state, budget: afterMaintenance };

  const populationDemand = {
    water: round(state.population * 0.4),
    energy: round(state.population * 0.2),
    waste: round(state.population * 0.25),
    transport: round(state.population * 0.3),
  };
  const rawSupply = flow(production, "raw-water");
  const treatedCapacity = flow(production, "clean-water");
  const treatedSupply = Math.min(rawSupply, treatedCapacity);
  const waterDemand = round(
    flow(buildingDemand, "clean-water") + populationDemand.water,
  );
  const generation = flow(production, "electricity");
  const storageCapacity = flow(production, "electricity-storage");
  const energyDemand = round(
    flow(buildingDemand, "electricity") + populationDemand.energy,
  );
  const previousStored = Math.min(
    state.resources.energy.stored,
    storageCapacity,
  );
  const discharge = Math.min(
    previousStored,
    Math.max(0, energyDemand - generation),
  );
  const surplus = Math.max(0, generation - energyDemand);
  const stored = Math.min(
    storageCapacity,
    round(previousStored - discharge + surplus),
  );
  const wasteGenerated = round(populationDemand.waste);
  const wasteProcessed = Math.min(
    wasteGenerated,
    flow(production, "waste-processing"),
  );
  const transportCapacity = flow(production, "transport");
  const transportDemand = round(populationDemand.transport);
  const housingCapacity = flow(production, "housing");

  state = {
    ...state,
    resources: {
      water: { rawSupply, treatedSupply, demand: waterDemand },
      energy: { generation, stored, storageCapacity, demand: energyDemand },
      waste: { generated: wasteGenerated, processed: wasteProcessed },
      transport: { capacity: transportCapacity, demand: transportDemand },
      housingCapacity,
      maintenanceDue: maintenance,
    },
  };

  const waterScore = reliability(
    treatedSupply,
    waterDemand,
    input.network.waterCoverage,
  );
  const energyScore = reliability(
    generation + discharge,
    energyDemand,
    input.network.electricityCoverage,
  );
  causes.push(
    metricCause(
      "water.reliability-calculated",
      "water",
      scoreSeverity(waterScore),
      3,
      "water",
      state.indicators.water,
      waterScore,
      buildingIdsForCategory(committed, catalogue, "water"),
      [],
    ),
  );
  causes.push(
    metricCause(
      "energy.reliability-calculated",
      "energy",
      scoreSeverity(energyScore),
      3,
      "energy",
      state.indicators.energy,
      energyScore,
      buildingIdsForCategory(committed, catalogue, "energy"),
      [],
    ),
  );

  const effects = definitions.flatMap((definition) => definition.effects);
  const natureDelta =
    effectTotal(effects, "nature") +
    effectTotal(effects, "biodiversity") * 0.5 -
    effectTotal(effects, "pollution");
  const communityDelta =
    effectTotal(effects, "community") + serviceBonus(production, input.network);
  const maintenancePenalty = Math.max(0, maintenance - maintenancePaid) * 0.5;
  const resilienceDelta =
    effectTotal(effects, "resilience") - maintenancePenalty;
  const natureScore = percentage(
    state.indicators.nature +
      natureDelta +
      (input.network.natureCoverage - 0.5) * 4,
  );
  const communityScore = percentage(
    state.indicators.community + communityDelta,
  );
  const resilienceScore = percentage(
    state.indicators.resilience + resilienceDelta,
  );
  causes.push(
    metricCause(
      "nature.city-impact",
      "nature",
      deltaSeverity(natureScore - state.indicators.nature),
      4,
      "nature",
      state.indicators.nature,
      natureScore,
      buildingIdsWithMetric(committed, catalogue, [
        "nature",
        "biodiversity",
        "pollution",
      ]),
      [],
    ),
  );
  causes.push(
    metricCause(
      "community.services-impact",
      "community",
      deltaSeverity(communityScore - state.indicators.community),
      4,
      "community",
      state.indicators.community,
      communityScore,
      buildingIdsWithMetric(committed, catalogue, ["community"]),
      [],
    ),
  );
  causes.push(
    metricCause(
      "community.resilience-impact",
      "community",
      deltaSeverity(resilienceScore - state.indicators.resilience),
      4,
      "resilience",
      state.indicators.resilience,
      resilienceScore,
      buildingIdsWithMetric(committed, catalogue, ["resilience"]),
      [],
    ),
  );
  state = {
    ...state,
    indicators: {
      water: waterScore,
      energy: energyScore,
      nature: natureScore,
      community: communityScore,
      resilience: resilienceScore,
    },
  };

  const population = nextPopulation(state);
  causes.push(
    metricCause(
      "community.population-change",
      "community",
      deltaSeverity(population - state.population),
      5,
      "population",
      state.population,
      population,
      buildingIdsForCategory(committed, catalogue, "housing"),
      [],
    ),
  );
  state = { ...state, population };

  const scheduled = applyScheduledEvents(
    state,
    input.progression?.events ?? [],
  );
  state = scheduled.state;
  causes.push(...scheduled.causes);

  const progression = advanceProgression(state, input.progression ?? {});
  state = progression.state;
  for (const milestoneId of progression.earnedMilestoneIds) {
    causes.push(
      emptyCause(milestoneCauseCode(milestoneId), "community", "positive", 7),
    );
  }
  if (progression.transition !== null) {
    causes.push(
      emptyCause(
        stageTransitionCauseCode(
          progression.transition.from,
          progression.transition.to,
        ),
        "community",
        "positive",
        8,
      ),
    );
  }

  return {
    state: CityStateSchema.parse(state),
    causes,
    firedEventIds: scheduled.firedEventIds,
    earnedMilestoneIds: progression.earnedMilestoneIds,
  };
}

function appendTurnActions(
  base: CityState,
  operations: readonly PlanningOperation[],
  turn: number,
): TurnAction[] {
  let sequence = base.actionLog.at(-1)?.sequence ?? -1;
  const actions: TurnAction[] = [...base.actionLog];
  for (const [index, operation] of operations.entries()) {
    sequence += 1;
    const actionId = actionIdentifier(
      base,
      turn,
      sequence,
      index,
      operation.type,
    );
    if (operation.type === "place") {
      actions.push({
        type: "place-building",
        actionId,
        turn,
        sequence,
        buildingId: operation.building.definitionId,
        instanceId: operation.building.instanceId,
        anchor: { ...operation.building.anchor },
        rotation: operation.building.rotation,
      });
    } else {
      actions.push({
        type: "remove-building",
        actionId,
        turn,
        sequence,
        instanceId: operation.instanceId,
      });
    }
  }
  sequence += 1;
  actions.push({
    type: "advance-turn",
    actionId: actionIdentifier(
      base,
      turn,
      sequence,
      operations.length,
      "advance",
    ),
    turn,
    sequence,
  });
  return actions;
}

function actionIdentifier(
  city: CityState,
  turn: number,
  sequence: number,
  index: number,
  kind: string,
): string {
  return `action-${turn}-${sequence}-${deterministicHash({ seed: city.seed, turn, sequence, index, kind }).slice(0, 12)}`;
}

function aggregateFlows(
  definitions: readonly BuildingDefinition[],
  side: "inputs" | "outputs",
): ReadonlyMap<ResourceKind, number> {
  const totals = new Map<ResourceKind, number>();
  for (const definition of definitions) {
    for (const item of definition[side]) {
      totals.set(
        item.resource,
        round((totals.get(item.resource) ?? 0) + item.amount),
      );
    }
  }
  return totals;
}

function flow(
  values: ReadonlyMap<ResourceKind, number>,
  resource: ResourceKind,
): number {
  return values.get(resource) ?? 0;
}

function effectTotal(
  effects: readonly BuildingDefinition["effects"][number][],
  metric: CityMetric,
): number {
  return sum(
    effects
      .filter(
        (effect) => effect.metric === metric && effect.timing === "per-turn",
      )
      .map((effect) => effect.amount),
  );
}

function serviceBonus(
  production: ReadonlyMap<ResourceKind, number>,
  network: TurnNetworkSnapshot,
): number {
  const education =
    (Math.min(flow(production, "education"), 40) / 10) *
    network.educationCoverage;
  const healthcare =
    (Math.min(flow(production, "healthcare"), 35) / 10) *
    network.healthcareCoverage;
  const transport =
    (Math.min(flow(production, "transport"), 25) / 25) *
    network.transportCoverage;
  return round(education + healthcare + transport);
}

function nextPopulation(city: CityState): number {
  const utilityQuality = Math.min(
    city.indicators.water,
    city.indicators.energy,
  );
  if (city.resources.housingCapacity <= city.population) {
    return Math.max(
      0,
      Math.min(city.population, city.resources.housingCapacity),
    );
  }
  if (utilityQuality >= 70) {
    return Math.min(
      city.resources.housingCapacity,
      city.population +
        Math.max(
          1,
          Math.min(
            4,
            Math.ceil((city.resources.housingCapacity - city.population) / 4),
          ),
        ),
    );
  }
  if (utilityQuality < 35) return Math.max(0, city.population - 2);
  return city.population;
}

function reliability(supply: number, demand: number, coverage: number): number {
  const supplyRatio = demand === 0 ? 1 : Math.min(1, supply / demand);
  return percentage(supplyRatio * coverage * 100);
}

function metricCause(
  code: RuntimeStaticCauseCode,
  category: CauseEffect["category"],
  severity: CauseEffect["severity"],
  phase: number,
  metric: CityMetric,
  before: number,
  after: number,
  sourceBuildingIds: readonly string[],
  sourceTileIds: readonly string[],
): CauseEffect {
  return {
    code,
    category,
    severity,
    phase,
    sourceBuildingIds: [...sourceBuildingIds].sort(),
    sourceTileIds: [...new Set(sourceTileIds)].sort(),
    changes: [{ metric, before, after, delta: after - before }],
  };
}

function emptyCause(
  code: MilestoneCauseCode | StageTransitionCauseCode,
  category: CauseEffect["category"],
  severity: CauseEffect["severity"],
  phase: number,
): CauseEffect {
  return {
    code,
    category,
    severity,
    phase,
    sourceBuildingIds: [],
    sourceTileIds: [],
    changes: [],
  };
}

function buildingIdsForCategory(
  city: CityState,
  catalogue: readonly BuildingDefinition[],
  category: BuildingDefinition["category"],
): string[] {
  return city.buildings
    .filter(
      (building) =>
        requiredDefinition(catalogue, building.definitionId).category ===
        category,
    )
    .map((building) => building.instanceId);
}

function buildingIdsWithMetric(
  city: CityState,
  catalogue: readonly BuildingDefinition[],
  metrics: readonly CityMetric[],
): string[] {
  return city.buildings
    .filter((building) =>
      requiredDefinition(catalogue, building.definitionId).effects.some(
        (effect) => metrics.includes(effect.metric),
      ),
    )
    .map((building) => building.instanceId);
}

function requiredDefinition(
  catalogue: readonly BuildingDefinition[],
  id: string,
): BuildingDefinition {
  const definition = catalogue.find((candidate) => candidate.id === id);
  if (definition === undefined)
    throw new Error(`Unknown committed building: ${id}`);
  return definition;
}

function cloneCity(city: CityState): CityState {
  return structuredClone(city);
}

function validateCoverage(network: TurnNetworkSnapshot): void {
  for (const [key, value] of Object.entries(network)) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`${key} must be between 0 and 1`);
    }
  }
}

function scoreSeverity(score: number): CauseEffect["severity"] {
  if (score >= 70) return "positive";
  if (score >= 40) return "warning";
  return "critical";
}

function deltaSeverity(delta: number): CauseEffect["severity"] {
  if (delta > 0) return "positive";
  if (delta === 0) return "neutral";
  return "warning";
}

function percentage(value: number): number {
  return Math.min(100, Math.max(0, round(value)));
}

function sum(values: readonly number[]): number {
  return round(values.reduce((total, value) => total + value, 0));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
