import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import {
  ActionLogSchema,
  CityStateSchema,
  type CityState,
  type TurnAction,
} from "@terra/campaign-schema";
import {
  BUILDING_CATALOGUE,
  createInitialCityState,
  createPlanningSession,
  createRiverValleyWorld,
  getPlanningView,
  hashActionLog,
  hashCityState,
  materializePlanningState,
  networkSnapshotForCity,
  placeProvisional,
  replayCity,
  simulateTurn,
  validatePlacement,
  type PlacementContext,
  type PlacementRequest,
  type PlanningSession,
} from "@terra/simulation";

import { createOfflinePersistence } from "../offline";

const SEED = "phase-one-river-valley";
const CITY_ID = "phase-one-city";
const UNLOCKED_CHAPTER_IDS = [
  "chapter-1-water",
  "chapter-2-power",
  "chapter-3-care",
  "chapter-4-growth",
  "chapter-5-storm",
] as const;
const PLACEMENT_CONTEXT: PlacementContext = {
  unlockedChapterIds: UNLOCKED_CHAPTER_IDS,
};

type ScenarioResult = Readonly<{
  initialState: CityState;
  recordedState: CityState;
  restoredState: CityState;
  restoredActionLog: readonly TurnAction[];
  actionLogHash: string;
  finalStateHash: string;
}>;

describe("Phase 1 executable gate", () => {
  it("reopens a two-turn city and deterministically replays its persisted actions", async () => {
    const first = await runPersistedScenario("phase-one-gate-first");
    const second = await runPersistedScenario("phase-one-gate-second");

    expect(first.recordedState).toEqual(first.restoredState);
    expect(second.recordedState).toEqual(second.restoredState);
    expect(first.restoredState).toEqual(second.restoredState);
    expect(first.restoredActionLog).toEqual(second.restoredActionLog);
    expect(first.actionLogHash).toBe(second.actionLogHash);
    expect(first.finalStateHash).toBe(second.finalStateHash);
    expect(first.actionLogHash).toMatch(/^[a-f0-9]{16}$/);
    expect(first.finalStateHash).toMatch(/^[a-f0-9]{16}$/);
    expect(first.restoredState.turn).toBe(2);
    expect(
      first.restoredState.buildings.map((building) => building.definitionId),
    ).toEqual(
      expect.arrayContaining([
        "water-pump",
        "solar-array",
        "road",
        "community-park",
      ]),
    );
  });
});

async function runPersistedScenario(
  databaseName: string,
): Promise<ScenarioResult> {
  const indexedDB = new IDBFactory();
  const initialState = createInitialCityState(
    createRiverValleyWorld(SEED, { width: 12, height: 10 }),
    {
      cityId: CITY_ID,
      campaignId: "phase-one-campaign",
      campaignVersion: 1,
      budget: 5_000,
    },
  );
  const recordedState = buildTwoTurns(initialState);
  const expectedActionLogHash = hashActionLog(recordedState.actionLog);
  const expectedFinalStateHash = hashCityState(recordedState);

  const firstSession = await createOfflinePersistence({
    indexedDB,
    databaseName,
  });
  expect(firstSession.kind).toBe("indexeddb");
  await firstSession.saveCity({
    cityId: CITY_ID,
    committedAt: 2_000,
    state: recordedState,
  });
  await firstSession.saveActionLog({
    cityId: CITY_ID,
    savedAt: 2_000,
    actions: recordedState.actionLog,
  });
  firstSession.close();

  const reopenedSession = await createOfflinePersistence({
    indexedDB,
    databaseName,
  });
  expect(reopenedSession.kind).toBe("indexeddb");
  const citySave = await reopenedSession.getCity(CITY_ID);
  const actionLogSave = await reopenedSession.getActionLog(CITY_ID);
  reopenedSession.close();

  if (citySave === null || actionLogSave === null) {
    throw new Error("The persisted city or action log was not restored");
  }

  const restoredState = CityStateSchema.parse(citySave.state);
  const restoredActionLog = ActionLogSchema.parse(actionLogSave.actions);
  const replayed = replayCity(
    { initialState, actionLog: restoredActionLog },
    { unlockedChapterIds: UNLOCKED_CHAPTER_IDS },
  );

  expect(replayed.state).toEqual(restoredState);
  expect(replayed.actionLogHash).toBe(expectedActionLogHash);
  expect(replayed.finalStateHash).toBe(expectedFinalStateHash);
  expect(hashActionLog(restoredActionLog)).toBe(expectedActionLogHash);
  expect(hashCityState(restoredState)).toBe(expectedFinalStateHash);

  return {
    initialState,
    recordedState,
    restoredState,
    restoredActionLog,
    actionLogHash: replayed.actionLogHash,
    finalStateHash: replayed.finalStateHash,
  };
}

function buildTwoTurns(initialState: CityState): CityState {
  let firstPlan = createPlanningSession(initialState);
  firstPlan = addBuilding(firstPlan, "water-pump", "water-pump-1");
  firstPlan = addBuilding(firstPlan, "solar-array", "solar-array-1");
  firstPlan = addBuilding(firstPlan, "road", "road-1");

  const firstPlannedCity = materializePlanningState(firstPlan);
  const firstNetwork = networkSnapshotForCity(firstPlannedCity);
  expect(networkSnapshotForCity(firstPlannedCity)).toEqual(firstNetwork);
  const afterFirstTurn = simulateTurn({
    city: initialState,
    planning: firstPlan,
    network: firstNetwork,
  }).state;

  let secondPlan = createPlanningSession(afterFirstTurn);
  secondPlan = addBuilding(secondPlan, "community-park", "community-park-1");
  const secondPlannedCity = materializePlanningState(secondPlan);
  const secondNetwork = networkSnapshotForCity(secondPlannedCity);
  expect(networkSnapshotForCity(secondPlannedCity)).toEqual(secondNetwork);
  return simulateTurn({
    city: afterFirstTurn,
    planning: secondPlan,
    network: secondNetwork,
  }).state;
}

function addBuilding(
  session: PlanningSession,
  buildingId: string,
  instanceId: string,
): PlanningSession {
  const definition = BUILDING_CATALOGUE.find(
    (candidate) => candidate.id === buildingId,
  );
  if (definition === undefined)
    throw new Error(`Unknown fixture building: ${buildingId}`);

  for (const tile of session.baseState.tiles) {
    for (const rotation of definition.allowedRotations) {
      const request: PlacementRequest = {
        instanceId,
        buildingId,
        anchor: tile.coordinate,
        rotation,
      };
      const view = getPlanningView(session);
      const validation = validatePlacement(
        { ...view.city, budget: view.availableBudget },
        request,
        PLACEMENT_CONTEXT,
      );
      if (!validation.valid) continue;

      const placed = placeProvisional(session, request, PLACEMENT_CONTEXT);
      if (placed.accepted) return placed.session;
    }
  }
  throw new Error(`No valid deterministic placement for ${buildingId}`);
}
