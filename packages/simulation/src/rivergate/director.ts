import type {
  Campaign,
  CityState,
  PlacedBuilding,
  TileState,
} from "@terra/campaign-schema";

import {
  BUILDING_CATALOGUE,
  BUILDING_IDS,
  type BuildingId,
} from "../catalogue";
import {
  advanceCampaignState,
  missionProgressKey,
  objectiveProgressKey,
  type AdvanceCampaignResult,
  type CampaignProgressState,
} from "../campaign-state";
import { analyzeCityNetworks, calculateCoverage } from "../networks";
import {
  evaluateChapterThreeCare,
  type ChapterThreeCareResult,
  type ChapterThreeCareSnapshot,
  type CareNeighbourhoodId,
} from "./chapter-3-care";
import {
  evaluateChapterFourGrowth,
  type ChapterFourGrowthResult,
  type ChapterFourGrowthSnapshot,
} from "./chapter-4-growth";
import {
  evaluateFinalStorm,
  type StormEvaluationResult,
  type StormEvaluationSnapshot,
} from "./chapter-5-storm";
import { CHAPTER_ONE_SCENARIO, CHAPTER_TWO_SCENARIO } from "./content";
import { evaluateRivergateScenario } from "./evaluate";
import type {
  RivergateScenarioSnapshot,
  ScenarioEvaluation,
} from "./scenario-types";

export const RIVERGATE_CHAPTER_IDS = [
  "chapter-1-water",
  "chapter-2-power",
  "chapter-3-care",
  "chapter-4-growth",
  "chapter-5-storm",
] as const;

export type RivergateChapterId = (typeof RIVERGATE_CHAPTER_IDS)[number];

export type RivergateEventHistoryEntry = {
  /** TurnResult.state.turn for the result that supplied firedEventIds. */
  readonly turn: number;
  /** Exact IDs returned by that turn's TurnResult. */
  readonly firedEventIds: readonly string[];
};

export type RivergateDirectorEvidence = {
  /** TurnResult.state.turn for the same result that supplied firedEventIds. */
  readonly turn: number;
  /** IDs returned by the TurnResult that is being evaluated. */
  readonly firedEventIds: readonly string[];
  /**
   * Optional ordered evidence from earlier completed turns. The current turn
   * may also be present, but must exactly match turn/firedEventIds above.
   */
  readonly eventHistory?: readonly RivergateEventHistoryEntry[];
};

type ScenarioGateResult = {
  readonly chapterId: "chapter-1-water" | "chapter-2-power";
  readonly complete: boolean;
  readonly snapshot: RivergateScenarioSnapshot;
  readonly evaluation: ScenarioEvaluation;
};

type CareGateResult = {
  readonly chapterId: "chapter-3-care";
  readonly complete: boolean;
  readonly snapshot: ChapterThreeCareSnapshot;
  readonly evaluation: ChapterThreeCareResult;
};

type GrowthGateResult = {
  readonly chapterId: "chapter-4-growth";
  readonly complete: boolean;
  readonly snapshot: ChapterFourGrowthSnapshot;
  readonly evaluation: ChapterFourGrowthResult;
};

type StormGateResult = {
  readonly chapterId: "chapter-5-storm";
  readonly complete: boolean;
  readonly requiredEventId: typeof FINAL_STORM_EVENT_ID;
  readonly eventEvidenceSatisfied: boolean;
  readonly acceptableOutcome: boolean;
  readonly snapshot: StormEvaluationSnapshot;
  readonly evaluation: StormEvaluationResult;
};

export type RivergateChapterGateResult =
  ScenarioGateResult | CareGateResult | GrowthGateResult | StormGateResult;

export type AdvanceRivergateCampaignResult =
  | (Extract<AdvanceCampaignResult, { readonly ok: true }> & {
      readonly gate: RivergateChapterGateResult | null;
    })
  | (Extract<AdvanceCampaignResult, { readonly ok: false }> & {
      readonly gate: null;
    });

export const FINAL_STORM_EVENT_ID = "chapter-5-river-storm" as const;
const FINAL_STORM_TURN = 15;

/**
 * A final storm is acceptable at a readiness score of 45 or above: the
 * evaluator calls this "recovering" or "protected". A "hard-hit" result is
 * still a completed storm and becomes the constructive rebuilding ending.
 */
export const MINIMUM_ACCEPTABLE_STORM_READINESS = 45;

const DIRECTOR_MILESTONES = [
  "care-ready",
  "growth-ready",
  "storm-ready",
] as const;
const FLOOD_EXPOSURE_THRESHOLD = 0.5;
const HOME_CAPACITY = 8;
const FLOOD_CRITICAL_INFRASTRUCTURE_IDS = [
  "water-pump",
  "water-treatment-plant",
  "clinic",
] as const satisfies readonly BuildingId[];
const ROAD_ACCESS_DESTINATION_IDS = [
  "water-treatment-plant",
  "clinic",
] as const satisfies readonly BuildingId[];

/** Evaluates the chapter's authored scenario against facts derived from CityState. */
export function evaluateRivergateChapterGate(
  city: CityState,
  chapterId: RivergateChapterId,
  evidence: RivergateDirectorEvidence,
): RivergateChapterGateResult {
  assertEvidence(evidence);

  switch (chapterId) {
    case "chapter-1-water": {
      const snapshot = adaptCityToRivergateScenario(city);
      const evaluation = evaluateRivergateScenario(
        CHAPTER_ONE_SCENARIO,
        snapshot,
      );
      return { chapterId, complete: evaluation.complete, snapshot, evaluation };
    }
    case "chapter-2-power": {
      const snapshot = adaptCityToRivergateScenario(city);
      const evaluation = evaluateRivergateScenario(
        CHAPTER_TWO_SCENARIO,
        snapshot,
      );
      return { chapterId, complete: evaluation.complete, snapshot, evaluation };
    }
    case "chapter-3-care": {
      const snapshot = adaptCityToChapterThreeCare(city);
      const evaluation = evaluateChapterThreeCare(snapshot);
      return { chapterId, complete: evaluation.complete, snapshot, evaluation };
    }
    case "chapter-4-growth": {
      const snapshot = adaptCityToChapterFourGrowth(city);
      const evaluation = evaluateChapterFourGrowth(snapshot);
      return { chapterId, complete: evaluation.complete, snapshot, evaluation };
    }
    case "chapter-5-storm": {
      const snapshot = adaptCityToStormEvaluation(city);
      const evaluation = evaluateFinalStorm(snapshot);
      const eventEvidenceSatisfied = hasVerifiedFinalStormEvidence(
        city,
        evidence,
      );
      const acceptableOutcome =
        evaluation.readinessScore >= MINIMUM_ACCEPTABLE_STORM_READINESS &&
        evaluation.outcomeBand !== "hard-hit";
      return {
        chapterId,
        complete: eventEvidenceSatisfied,
        requiredEventId: FINAL_STORM_EVENT_ID,
        eventEvidenceSatisfied,
        acceptableOutcome,
        snapshot,
        evaluation,
      };
    }
  }
}

/**
 * Advances at most one normal campaign boundary, while making the final
 * mission in every Rivergate chapter depend on its chapter evaluator.
 *
 * The returned cursor is new data. Neither the city, evidence, nor the input
 * cursor is mutated. Evaluator-owned milestones are removed from the working
 * city and reintroduced only when their evaluator passes, preventing generic
 * citywide milestone conditions from unlocking later chapters.
 */
export function advanceRivergateCampaignState(
  campaign: Campaign,
  city: CityState,
  progress: CampaignProgressState,
  evidence: RivergateDirectorEvidence,
): AdvanceRivergateCampaignResult {
  assertEvidence(evidence);
  const effectiveCity = cityWithDirectorMilestones(city, progress, evidence);
  const currentChapter = rivergateChapterId(progress.chapterId);
  const gate =
    currentChapter !== null &&
    isFinalMission(campaign, progress.chapterId, progress.missionId)
      ? evaluateRivergateChapterGate(effectiveCity, currentChapter, evidence)
      : null;
  const effectiveProgress =
    gate?.chapterId === "chapter-5-storm" && gate.eventEvidenceSatisfied
      ? withCompletedObjective(
          progress,
          objectiveProgressKey(
            "chapter-5-storm",
            "repair-together",
            "weather-the-final-storm",
          ),
        )
      : progress;
  const attempted = advanceCampaignState(
    campaign,
    effectiveCity,
    effectiveProgress,
  );

  if (!attempted.ok) return { ...attempted, gate: null };
  if (
    gate === null ||
    gate.complete ||
    !transitionCompletesMission(attempted.transition)
  ) {
    return { ...attempted, gate };
  }

  const currentMissionKey = missionProgressKey(
    progress.chapterId,
    progress.missionId,
  );
  return {
    ok: true,
    gate,
    state: {
      ...attempted.state,
      chapterId: progress.chapterId,
      missionId: progress.missionId,
      phase: "active",
      completedMissionKeys: attempted.state.completedMissionKeys.filter(
        (key) => key !== currentMissionKey,
      ),
    },
    transition: { type: "none" },
  };
}

/**
 * Shared Chapter 1/2 adapter. Coverage is geometric and aggregate; no paths or
 * resident identities cross this boundary. Night power is deliberately
 * conservative: only stored energy is available after solar generation stops.
 */
export function adaptCityToRivergateScenario(
  city: CityState,
): RivergateScenarioSnapshot {
  const counts = countBuildings(city);
  const waterCoverage = calculateCoverage(city, "water");
  const coveredIds = new Set(
    waterCoverage.buildingCoverage
      .filter((entry) => entry.covered)
      .map((entry) => entry.buildingInstanceId),
  );
  const homes = buildingsOfType(city, "home");
  const availableClinicReserve = Math.max(
    0,
    city.resources.energy.generation +
      city.resources.energy.stored -
      city.resources.energy.demand,
  );

  return {
    buildingCounts: counts,
    water: {
      rawSupply: city.resources.water.rawSupply,
      treatedSupply: city.resources.water.treatedSupply,
      demand: city.resources.water.demand,
      quality: city.indicators.water,
      connectedHomes: homes.filter((home) => coveredIds.has(home.instanceId))
        .length,
      homeCount: homes.length,
      floodRiskByBuilding: Object.fromEntries(
        (["water-pump", "water-treatment-plant"] as const).map((id) => [
          id,
          maximumFloodRisk(city, buildingsOfType(city, id)),
        ]),
      ),
    },
    energy: {
      dayGeneration: city.resources.energy.generation,
      dayDemand: city.resources.energy.demand,
      nightGeneration: 0,
      nightDemand: city.resources.energy.demand,
      storedAtNight: city.resources.energy.stored,
      storageCapacity: city.resources.energy.storageCapacity,
      clinicSupply: Math.min(4, availableClinicReserve),
    },
    budget: {
      availableForMaintenance: city.budget,
      maintenanceDue: city.resources.maintenanceDue,
    },
  };
}

/**
 * Splits the map horizontally at its coordinate midpoint. Homes above the
 * midpoint form north-bank; the rest form south-bank. Population is allocated
 * deterministically across homes (instance-id order). An empty neighbourhood
 * receives one uncovered planning unit so the care evaluator remains valid
 * and, conservatively, cannot pass.
 */
export function adaptCityToChapterThreeCare(
  city: CityState,
): ChapterThreeCareSnapshot {
  const networks = analyzeCityNetworks(city);
  const education = coverageSet(networks.coverage.education.buildingCoverage);
  const healthcare = coverageSet(networks.coverage.healthcare.buildingCoverage);
  const roadConnected = new Set(networks.road.connectedBuildingIds);
  const homes = buildingsOfType(city, "home").sort((left, right) =>
    left.instanceId.localeCompare(right.instanceId),
  );
  const populationByHome = allocatePopulation(
    Math.max(city.population, homes.length * HOME_CAPACITY),
    homes,
  );

  return {
    buildingCounts: countBuildings(city),
    neighbourhoods: (["north-bank", "south-bank"] as const).map((id) => {
      const neighbourhoodHomes = homes.filter(
        (home) => neighbourhoodFor(city, home) === id,
      );
      const population = sumPopulation(neighbourhoodHomes, populationByHome);
      const relevantRoadTiles = roadTilesInNeighbourhood(city, id);
      const roadSafety =
        relevantRoadTiles.length === 0
          ? 0
          : round(
              (1 -
                relevantRoadTiles.reduce(
                  (total, tile) => total + tile.floodRisk,
                  0,
                ) /
                  relevantRoadTiles.length) *
                100,
            );
      return {
        id,
        population: Math.max(1, population),
        schoolReachableResidents: reachablePopulation(
          neighbourhoodHomes,
          populationByHome,
          education,
        ),
        clinicReachableResidents: reachablePopulation(
          neighbourhoodHomes,
          populationByHome,
          healthcare,
        ),
        safeWalkingResidents: reachablePopulation(
          neighbourhoodHomes,
          populationByHome,
          roadConnected,
        ),
        roadSafety,
      };
    }),
    budget: city.budget,
  };
}

export function adaptCityToChapterFourGrowth(
  city: CityState,
): ChapterFourGrowthSnapshot {
  return {
    population: city.population,
    buildingCounts: countBuildings(city),
    waste: { ...city.resources.waste },
    transport: { ...city.resources.transport },
    indicators: {
      pollution: 100 - city.indicators.nature,
      community: city.indicators.community,
    },
    budget: {
      availableForMaintenance: city.budget,
      maintenanceDue: city.resources.maintenanceDue,
    },
  };
}

/**
 * Storm rules are intentionally explicit. Flood exposure begins at tile risk
 * 0.5. Wetlands provide 25 drainage units, parks 8, and each unbuilt natural
 * wetland tile 2. Runoff load is magnitude 5 times the number of roads, homes,
 * and critical services. Emergency access comes from the deterministic road
 * graph; water reach comes from geometric coverage.
 */
export function adaptCityToStormEvaluation(
  city: CityState,
): StormEvaluationSnapshot {
  const counts = countBuildings(city);
  const networks = analyzeCityNetworks(city);
  const homes = buildingsOfType(city, "home");
  const criticalInfrastructure = city.buildings.filter((building) =>
    (FLOOD_CRITICAL_INFRASTRUCTURE_IDS as readonly BuildingId[]).includes(
      building.definitionId as BuildingId,
    ),
  );
  const emergencyDestinations = criticalInfrastructure.filter((building) =>
    (ROAD_ACCESS_DESTINATION_IDS as readonly BuildingId[]).includes(
      building.definitionId as BuildingId,
    ),
  );
  const waterCovered = coverageSet(networks.coverage.water.buildingCoverage);
  const roadConnected = new Set(networks.road.connectedBuildingIds);
  const roadTiles = uniqueOccupiedTiles(buildingsOfType(city, "road"));
  const exposedRoadTiles = roadTiles.filter(
    (tileId) =>
      (tileById(city, tileId)?.floodRisk ?? 1) >= FLOOD_EXPOSURE_THRESHOLD,
  );
  const criticalDemand = sumElectricityInputs(criticalInfrastructure);
  const naturalWetlandTiles = city.tiles.filter(
    (tile) => tile.terrain === "wetland" && tile.occupantId === null,
  ).length;
  const drainageCapacity =
    (counts.wetland ?? 0) * 25 +
    (counts["community-park"] ?? 0) * 8 +
    naturalWetlandTiles * 2;

  return {
    schemaVersion: 1,
    storm: { magnitude: 5 },
    buildingCounts: counts,
    indicators: {
      water: city.indicators.water,
      energy: city.indicators.energy,
      nature: city.indicators.nature,
      resilience: city.indicators.resilience,
    },
    water: {
      connectedHomes: homes.filter((home) => waterCovered.has(home.instanceId))
        .length,
      homeCount: homes.length,
      criticalInfrastructureFloodRisk: maximumFloodRisk(
        city,
        city.buildings.filter((building) =>
          (["water-pump", "water-treatment-plant"] as const).includes(
            building.definitionId as "water-pump" | "water-treatment-plant",
          ),
        ),
      ),
    },
    energy: {
      criticalDemand,
      backupSupply: Math.min(city.resources.energy.stored, criticalDemand),
      storageCapacity: city.resources.energy.storageCapacity,
    },
    nature: {
      drainageCapacity,
      runoffLoad: Math.max(
        1,
        5 * (roadTiles.length + homes.length + criticalInfrastructure.length),
      ),
    },
    transport: {
      emergencyDestinations: emergencyDestinations.length,
      accessibleEmergencyDestinations: emergencyDestinations.filter(
        (building) => roadConnected.has(building.instanceId),
      ).length,
      roadTiles: roadTiles.length,
      exposedRoadTiles: exposedRoadTiles.length,
    },
    floodExposure: {
      homes: homes.length,
      exposedHomes: exposedBuildingCount(city, homes),
      criticalServices: criticalInfrastructure.length,
      exposedCriticalServices: exposedBuildingCount(
        city,
        criticalInfrastructure,
      ),
    },
    budget: {
      availableForRecovery: city.budget,
      maintenanceDue: city.resources.maintenanceDue,
    },
  };
}

function cityWithDirectorMilestones(
  city: CityState,
  progress: CampaignProgressState,
  evidence: RivergateDirectorEvidence,
): CityState {
  const retained = city.milestones.filter(
    (id) =>
      !DIRECTOR_MILESTONES.includes(id as (typeof DIRECTOR_MILESTONES)[number]),
  );
  const derived = DIRECTOR_MILESTONES.filter((milestoneId) => {
    const chapterId =
      milestoneId === "care-ready"
        ? "chapter-3-care"
        : milestoneId === "growth-ready"
          ? "chapter-4-growth"
          : "chapter-5-storm";
    const finalMissionId =
      chapterId === "chapter-3-care"
        ? "care-for-every-neighbourhood"
        : chapterId === "chapter-4-growth"
          ? "make-room-for-rivergate"
          : "repair-together";
    const alreadyEarned = progress.completedMissionKeys.includes(
      missionProgressKey(chapterId, finalMissionId),
    );
    const gate = evaluateRivergateChapterGate(city, chapterId, evidence);
    if (milestoneId === "storm-ready") {
      return (
        gate.chapterId === "chapter-5-storm" &&
        gate.eventEvidenceSatisfied &&
        gate.acceptableOutcome
      );
    }
    return alreadyEarned || gate.complete;
  });
  return { ...city, milestones: [...retained, ...derived] };
}

function countBuildings(
  city: CityState,
): Readonly<Partial<Record<BuildingId, number>>> {
  return Object.fromEntries(
    BUILDING_IDS.flatMap((id) => {
      const count = city.buildings.filter(
        (building) => building.definitionId === id,
      ).length;
      return count === 0 ? [] : [[id, count] as const];
    }),
  );
}

function buildingsOfType(
  city: CityState,
  definitionId: BuildingId,
): PlacedBuilding[] {
  return city.buildings.filter(
    (building) => building.definitionId === definitionId,
  );
}

function maximumFloodRisk(
  city: CityState,
  buildings: readonly PlacedBuilding[],
): number {
  if (buildings.length === 0) return 0;
  return Math.max(
    ...buildings.flatMap((building) =>
      building.occupiedTileIds.map(
        (tileId) => tileById(city, tileId)?.floodRisk ?? 1,
      ),
    ),
  );
}

function exposedBuildingCount(
  city: CityState,
  buildings: readonly PlacedBuilding[],
): number {
  return buildings.filter(
    (building) =>
      maximumFloodRisk(city, [building]) >= FLOOD_EXPOSURE_THRESHOLD,
  ).length;
}

function coverageSet(
  coverage: readonly {
    readonly buildingInstanceId: string;
    readonly covered: boolean;
  }[],
): ReadonlySet<string> {
  return new Set(
    coverage
      .filter((entry) => entry.covered)
      .map((entry) => entry.buildingInstanceId),
  );
}

function allocatePopulation(
  population: number,
  homes: readonly PlacedBuilding[],
): ReadonlyMap<string, number> {
  if (homes.length === 0) return new Map();
  const base = Math.floor(population / homes.length);
  const remainder = population % homes.length;
  return new Map(
    homes.map((home, index) => [
      home.instanceId,
      base + (index < remainder ? 1 : 0),
    ]),
  );
}

function sumPopulation(
  homes: readonly PlacedBuilding[],
  populationByHome: ReadonlyMap<string, number>,
): number {
  return homes.reduce(
    (total, home) => total + (populationByHome.get(home.instanceId) ?? 0),
    0,
  );
}

function reachablePopulation(
  homes: readonly PlacedBuilding[],
  populationByHome: ReadonlyMap<string, number>,
  reachableIds: ReadonlySet<string>,
): number {
  return sumPopulation(
    homes.filter((home) => reachableIds.has(home.instanceId)),
    populationByHome,
  );
}

function neighbourhoodFor(
  city: CityState,
  building: PlacedBuilding,
): CareNeighbourhoodId {
  const occupied = building.occupiedTileIds
    .map((tileId) => tileById(city, tileId))
    .filter((tile): tile is TileState => tile !== undefined);
  const averageY =
    occupied.length === 0
      ? building.anchor.y
      : occupied.reduce((total, tile) => total + tile.coordinate.y, 0) /
        occupied.length;
  const yCoordinates = city.tiles.map((tile) => tile.coordinate.y);
  const midpoint =
    yCoordinates.length === 0
      ? 0
      : (Math.min(...yCoordinates) + Math.max(...yCoordinates) + 1) / 2;
  return averageY < midpoint ? "north-bank" : "south-bank";
}

function roadTilesInNeighbourhood(
  city: CityState,
  id: CareNeighbourhoodId,
): TileState[] {
  const roadTileIds = new Set(
    uniqueOccupiedTiles(buildingsOfType(city, "road")),
  );
  return city.tiles.filter(
    (tile) =>
      roadTileIds.has(tile.id) &&
      neighbourhoodFor(city, {
        instanceId: tile.id,
        definitionId: "road",
        anchor: tile.coordinate,
        rotation: 0,
        occupiedTileIds: [tile.id],
        placedTurn: 0,
      }) === id,
  );
}

function uniqueOccupiedTiles(buildings: readonly PlacedBuilding[]): string[] {
  return [
    ...new Set(buildings.flatMap((building) => building.occupiedTileIds)),
  ].sort();
}

function tileById(city: CityState, tileId: string): TileState | undefined {
  return city.tiles.find((tile) => tile.id === tileId);
}

function sumElectricityInputs(buildings: readonly PlacedBuilding[]): number {
  const definitionById = new Map(
    BUILDING_CATALOGUE.map((definition) => [definition.id, definition]),
  );
  return buildings.reduce((total, building) => {
    const definition = definitionById.get(building.definitionId);
    return (
      total +
      (definition?.inputs
        .filter((input) => input.resource === "electricity")
        .reduce((sum, input) => sum + input.amount, 0) ?? 0)
    );
  }, 0);
}

function isFinalMission(
  campaign: Campaign,
  chapterId: string,
  missionId: string,
): boolean {
  const chapter = campaign.chapters.find((entry) => entry.id === chapterId);
  if (chapter === undefined) return false;
  const ordered = [...chapter.missions].sort(
    (left, right) =>
      left.order - right.order || left.id.localeCompare(right.id),
  );
  return ordered.at(-1)?.id === missionId;
}

function rivergateChapterId(chapterId: string): RivergateChapterId | null {
  return RIVERGATE_CHAPTER_IDS.includes(chapterId as RivergateChapterId)
    ? (chapterId as RivergateChapterId)
    : null;
}

function transitionCompletesMission(
  transition: Extract<
    AdvanceCampaignResult,
    { readonly ok: true }
  >["transition"],
): boolean {
  return (
    transition.type === "mission-advanced" ||
    transition.type === "chapter-advanced" ||
    transition.type === "campaign-completed"
  );
}

function withCompletedObjective(
  progress: CampaignProgressState,
  objectiveKey: string,
): CampaignProgressState {
  return progress.completedObjectiveKeys.includes(objectiveKey)
    ? progress
    : {
        ...progress,
        completedObjectiveKeys: [
          ...progress.completedObjectiveKeys,
          objectiveKey,
        ],
      };
}

function assertEvidence(
  evidence: RivergateDirectorEvidence,
): asserts evidence is RivergateDirectorEvidence {
  if (
    typeof evidence !== "object" ||
    evidence === null ||
    !Number.isInteger(evidence.turn) ||
    evidence.turn < 0 ||
    !Array.isArray(evidence.firedEventIds) ||
    evidence.firedEventIds.some((id) => typeof id !== "string")
  ) {
    throw new Error(
      "Rivergate director evidence must include its turn and firedEventIds",
    );
  }
  assertEventIds(evidence.firedEventIds);

  if (evidence.eventHistory === undefined) return;
  if (!Array.isArray(evidence.eventHistory)) {
    throw new Error("Rivergate director event history must be an array");
  }
  let previousTurn = -1;
  for (const entry of evidence.eventHistory) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !Number.isInteger(entry.turn) ||
      entry.turn < 0 ||
      entry.turn > evidence.turn ||
      entry.turn <= previousTurn ||
      !Array.isArray(entry.firedEventIds)
    ) {
      throw new Error(
        "Rivergate director event history must contain ordered completed turns",
      );
    }
    assertEventIds(entry.firedEventIds);
    if (
      entry.turn === evidence.turn &&
      !sameStrings(entry.firedEventIds, evidence.firedEventIds)
    ) {
      throw new Error(
        "Rivergate director current event history does not match its turn evidence",
      );
    }
    previousTurn = entry.turn;
  }
}

function hasVerifiedFinalStormEvidence(
  city: CityState,
  evidence: RivergateDirectorEvidence,
): boolean {
  if (evidence.turn !== city.turn) return false;

  const eventsByTurn = new Map<number, readonly string[]>();
  for (const entry of evidence.eventHistory ?? []) {
    eventsByTurn.set(entry.turn, entry.firedEventIds);
  }
  if (!eventsByTurn.has(evidence.turn)) {
    eventsByTurn.set(evidence.turn, evidence.firedEventIds);
  }

  const stormTurns = [...eventsByTurn]
    .filter(([, eventIds]) => eventIds.includes(FINAL_STORM_EVENT_ID))
    .map(([turn]) => turn);
  const authoredTurnAdvanced = city.actionLog.filter(
    (action) =>
      action.type === "advance-turn" && action.turn === FINAL_STORM_TURN,
  );
  return (
    stormTurns.length === 1 &&
    stormTurns[0] === FINAL_STORM_TURN &&
    authoredTurnAdvanced.length === 1
  );
}

function assertEventIds(eventIds: readonly string[]): void {
  if (
    eventIds.some((id) => typeof id !== "string" || id.length === 0) ||
    new Set(eventIds).size !== eventIds.length
  ) {
    throw new Error(
      "Rivergate director firedEventIds must be unique non-empty strings",
    );
  }
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function round(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10;
}
