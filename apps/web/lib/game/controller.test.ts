import { describe, expect, it } from "vitest";
import type { CityState } from "@terra/campaign-schema";
import {
  RIVERGATE_FOUNDATIONS_CAMPAIGN,
  calculateCoverage,
  createPlanningSession,
  getPlanningView,
  missionProgressKey,
  objectiveProgressKey,
  placeProvisional,
  validatePlacement,
  type CampaignProgressState,
} from "@terra/simulation";

import {
  ALL_CHAPTERS,
  createDeveloperGame,
  createGameSessionSave,
  gameReducer,
  getChildFeedback,
  getCurrentMission,
  getOverlayView,
  getPlanningCity,
  getSelectedPlacementIssues,
  getUnlockedChapterIds,
  operationCount,
  provisionalCost,
  restoreGameSession,
  type GameState,
  type OverlayId,
} from "./controller";

describe("developer game controller", () => {
  it("starts at the real Rivergate campaign's first mission", () => {
    const state = createDeveloperGame("controller-campaign-start");

    expect(state.city).toMatchObject({
      campaignId: RIVERGATE_FOUNDATIONS_CAMPAIGN.id,
      campaignVersion: RIVERGATE_FOUNDATIONS_CAMPAIGN.version,
      budget: RIVERGATE_FOUNDATIONS_CAMPAIGN.initialBudget,
    });
    expect(state.campaign).toMatchObject({
      campaignId: RIVERGATE_FOUNDATIONS_CAMPAIGN.id,
      chapterId: "chapter-1-water",
      missionId: "find-the-water",
      phase: "active",
    });
    expect(state.turnHistory).toEqual([]);
    expect(state.ending).toBeNull();
    expect(getCurrentMission(state)).toMatchObject({
      title: "Find the water",
      objectives: [
        {
          id: "place-river-pump",
          description: "Place one water pump beside the river.",
          completed: false,
        },
      ],
    });
    expect(getChildFeedback(state)).toMatchObject({
      explanation: expect.stringMatching(/pump beside the river/i),
      hint: "Place one water pump beside the river.",
    });
  });

  it("keeps later catalogue chapters locked by the campaign cursor", () => {
    let state = createDeveloperGame("controller-chapter-locks");
    expect(getUnlockedChapterIds(state)).toEqual(["chapter-1-water"]);

    state = gameReducer(state, {
      type: "select",
      buildingId: "solar-array",
    });
    expect(getSelectedPlacementIssues(state)).toContainEqual(
      expect.objectContaining({ code: "CHAPTER_LOCKED" }),
    );
    expect(
      Object.values(getOverlayView(state).cells).some(
        (cell) => cell.label === "OK",
      ),
    ).toBe(false);

    const attempted = gameReducer(state, {
      type: "place",
      coordinate: state.cursor,
    });
    expect(attempted.status).toMatch(/finish the current chapter/i);
    expect(operationCount(attempted)).toBe(0);
  });

  it("advances one mission only after its real objective is completed", () => {
    let state = createDeveloperGame("controller-mission-progress");
    state = selectAndPlaceValid(state, "water-pump");
    const beforeCampaign = state.campaign;
    state = gameReducer(state, { type: "commit" });

    expect(beforeCampaign.missionId).toBe("find-the-water");
    expect(state.campaign).toMatchObject({
      chapterId: "chapter-1-water",
      missionId: "make-water-safe",
      phase: "active",
    });
    expect(state.campaign.completedMissionKeys).toEqual([
      "chapter-1-water::find-the-water",
    ]);
    expect(getCurrentMission(state)?.missionId).toBe("make-water-safe");
  });

  it("preserves exact scheduled-event evidence and never skips an unmet mission", () => {
    let state = createDeveloperGame("controller-event-evidence");
    state = gameReducer(selectAndPlaceValid(state, "road"), {
      type: "commit",
    });
    state = gameReducer(state, {
      type: "remove",
      coordinate: state.city.buildings[0]?.anchor ?? { x: 0, y: 0 },
    });
    state = gameReducer(state, { type: "commit" });
    state = gameReducer(selectAndPlaceValid(state, "road"), {
      type: "commit",
    });

    expect(state.city.turn).toBe(3);
    expect(state.campaign.missionId).toBe("find-the-water");
    expect(state.campaign.completedMissionKeys).toEqual([]);
    expect(state.turnHistory.map((turn) => turn.firedEventIds)).toEqual([
      [],
      [],
      ["chapter-1-river-rain"],
    ]);
    expect(state.turnHistory[2]).toMatchObject({
      turn: 3,
      causes: expect.arrayContaining([
        expect.objectContaining({ code: "event.chapter-1-river-rain" }),
      ]),
    });
    expect(getChildFeedback(state)?.explanation).toMatch(/river rain/i);
  });

  it("creates the constructive hard-hit ending from a verified final storm", () => {
    const initial = createDeveloperGame("controller-hard-hit-ending");
    const city = { ...initial.city, turn: 14 };
    let state: GameState = {
      ...initial,
      city,
      campaign: finalMissionProgress(),
      planning: createPlanningSession(city),
    };
    state = selectAndPlaceValid(state, "road");
    state = gameReducer(state, { type: "commit" });

    expect(state.city.turn).toBe(15);
    expect(state.campaign.phase).toBe("completed");
    expect(state.turnHistory.at(-1)?.firedEventIds).toEqual([
      "chapter-5-river-storm",
    ]);
    expect(state.ending).toMatchObject({
      endingId: "brave-rebuilder",
      stormOutcomeBand: "hard-hit",
    });
    expect(getCurrentMission(state)).toBeNull();
  });

  it("uses one real turn-15 storm to finish a delayed repair mission", () => {
    let state = createDeveloperGame("controller-delayed-storm-ending");
    for (let turn = 1; turn <= 15; turn += 1) {
      state = gameReducer(state, { type: "commit" });
      expect(state.city.turn).toBe(turn);
    }
    expect(state.turnHistory.flatMap((turn) => turn.firedEventIds)).toContain(
      "chapter-5-river-storm",
    );

    state = { ...state, campaign: finalMissionProgress() };
    state = gameReducer(state, { type: "commit" });

    expect(state.city.turn).toBe(16);
    expect(state.campaign.phase).toBe("completed");
    expect(state.ending).toMatchObject({ endingId: "brave-rebuilder" });
    expect(
      state.turnHistory
        .flatMap((turn) => turn.firedEventIds)
        .filter((eventId) => eventId === "chapter-5-river-storm"),
    ).toHaveLength(1);
  });

  it("returns new campaign and history data without mutating prior reducer state", () => {
    let state = createDeveloperGame("controller-immutable-campaign");
    state = selectAndPlaceValid(state, "water-pump");
    const previous = state;
    const previousCampaignJson = JSON.stringify(previous.campaign);
    const previousCityJson = JSON.stringify(previous.city);
    const next = gameReducer(previous, { type: "commit" });

    expect(next).not.toBe(previous);
    expect(next.campaign).not.toBe(previous.campaign);
    expect(next.turnHistory).not.toBe(previous.turnHistory);
    expect(previous.turnHistory).toEqual([]);
    expect(JSON.stringify(previous.campaign)).toBe(previousCampaignJson);
    expect(JSON.stringify(previous.city)).toBe(previousCityJson);
  });

  it("lets time pass without forcing a meaningless building change", () => {
    const state = createDeveloperGame("controller-empty-turn");

    const next = gameReducer(state, { type: "commit" });

    expect(next.city.turn).toBe(1);
    expect(next.city.buildings).toEqual([]);
    expect(next.city.actionLog.at(-1)).toMatchObject({
      turn: 1,
      type: "advance-turn",
    });
    expect(next.turnHistory).toHaveLength(1);
    expect(next.campaign.missionId).toBe("find-the-water");
  });

  it("round-trips committed campaign progress and an undoable plan through a session", () => {
    let state = createDeveloperGame("controller-session-roundtrip");
    state = gameReducer(selectAndPlaceValid(state, "water-pump"), {
      type: "commit",
    });
    state = selectAndPlaceValid(state, "road");

    const restored = restoreGameSession(createGameSessionSave(state, 123));

    expect(restored).toEqual(state);
    expect(getPlanningCity(restored)).toEqual(getPlanningCity(state));
    expect(operationCount(restored)).toBe(1);
    expect(restored.campaign).toEqual(state.campaign);
    expect(restored.turnHistory).toEqual(state.turnHistory);
  });

  it("rejects replay/hash, locked-action, history, campaign, and plan tampering", () => {
    let state = createDeveloperGame("controller-session-corruption");
    state = gameReducer(selectAndPlaceValid(state, "road"), { type: "commit" });
    const save = createGameSessionSave(state, 123);
    const payload = save.payload as Record<string, unknown>;

    expect(() =>
      restoreGameSession({
        ...save,
        payload: { ...payload, finalStateHash: "0000000000000000" },
      }),
    ).toThrow(/hash/i);
    const city = payload.city as GameState["city"];
    const firstAction = city.actionLog[0];
    if (firstAction?.type !== "place-building")
      throw new Error("Expected a saved placement action");
    expect(() =>
      restoreGameSession({
        ...save,
        payload: {
          ...payload,
          city: {
            ...city,
            actionLog: [
              {
                ...firstAction,
                buildingId: "solar-array",
              },
              ...city.actionLog.slice(1),
            ],
          },
        },
      }),
    ).toThrow(/action log/i);
    expect(() =>
      restoreGameSession({
        ...save,
        payload: {
          ...payload,
          turnHistory: [],
        },
      }),
    ).toThrow(/progress/i);
    expect(() =>
      restoreGameSession({
        ...save,
        payload: {
          ...payload,
          campaign: { ...(payload.campaign as object), missionId: "not-real" },
        },
      }),
    ).toThrow(/progress/i);
    expect(() =>
      restoreGameSession({
        ...save,
        payload: {
          ...payload,
          planning: { operations: [], cursor: 1 },
        },
      }),
    ).toThrow(/planning cursor/i);
  });

  it("runs the complete selection, placement, undo, replacement, and commit flow", () => {
    let state = createDeveloperGame("controller-complete-flow");
    state = gameReducer(state, { type: "select", buildingId: "road" });
    expect(state.selectedBuildingId).toBe("road");
    expect(state.overlay).toBe("validity");

    const tile = requiredValidTile(state);
    state = gameReducer(state, { type: "place", coordinate: tile.coordinate });
    expect(operationCount(state)).toBe(1);
    expect(getPlanningCity(state).buildings).toMatchObject([
      { definitionId: "road", anchor: tile.coordinate, rotation: 0 },
    ]);
    expect(provisionalCost(state)).toBe(20);
    expect(state.city.buildings).toHaveLength(0);

    state = gameReducer(state, { type: "undo" });
    expect(operationCount(state)).toBe(0);
    expect(getPlanningCity(state).buildings).toHaveLength(0);
    expect(provisionalCost(state)).toBe(0);

    state = gameReducer(state, { type: "place", coordinate: tile.coordinate });
    state = gameReducer(state, { type: "commit" });
    expect(state.city.turn).toBe(1);
    expect(state.city.buildings).toMatchObject([
      { definitionId: "road", anchor: tile.coordinate, rotation: 0 },
    ]);
    expect(state.city.budget).toBe(10_979);
    expect(operationCount(state)).toBe(0);
    expect(state.planning.baseState).toBe(state.city);
  });

  it("removes a committed building provisionally, supports undo, then commits removal", () => {
    let state = committedRoadGame("controller-removal");
    const building = state.city.buildings[0];
    expect(building).toBeDefined();
    const coordinate = building?.anchor ?? { x: 0, y: 0 };

    state = gameReducer(state, { type: "remove", coordinate });
    expect(state.city.buildings).toHaveLength(1);
    expect(getPlanningCity(state).buildings).toHaveLength(0);
    expect(operationCount(state)).toBe(1);

    state = gameReducer(state, { type: "undo" });
    expect(getPlanningCity(state).buildings).toHaveLength(1);

    state = gameReducer(state, { type: "remove", coordinate });
    state = gameReducer(state, { type: "commit" });
    expect(state.city.turn).toBe(2);
    expect(state.city.buildings).toHaveLength(0);
    expect(operationCount(state)).toBe(0);
  });

  it("rejects invalid terrain without mutating the planning session or city", () => {
    const state = createDeveloperGame("controller-rejection");
    const river = state.city.tiles.find((tile) => tile.terrain === "river");
    expect(river).toBeDefined();
    const beforePlanning = state.planning;
    const beforeCity = getPlanningCity(state);

    const rejected = gameReducer(state, {
      type: "place",
      coordinate: river?.coordinate ?? { x: 0, y: 0 },
    });

    expect(rejected.planning).toBe(beforePlanning);
    expect(getPlanningCity(rejected)).toBe(beforeCity);
    expect(operationCount(rejected)).toBe(0);
    expect(rejected.status).toMatch(/terrain|cannot hold|flood risk/i);
  });

  it("cycles allowed rotations, preserves fixed rotation, and clamps keyboard movement", () => {
    let state = createDeveloperGame("controller-keyboard");
    state = gameReducer(state, { type: "select", buildingId: "road" });
    for (const expected of [90, 180, 270, 0]) {
      state = gameReducer(state, { type: "rotate" });
      expect(state.rotation).toBe(expected);
    }

    state = gameReducer(state, { type: "select", buildingId: "home" });
    state = gameReducer(state, { type: "rotate" });
    expect(state.rotation).toBe(0);
    expect(state.status).toMatch(/does not need rotating/i);

    state = { ...state, cursor: { x: 0, y: 0 } };
    state = gameReducer(state, { type: "move-cursor", dx: -500, dy: -500 });
    expect(state.cursor).toEqual({ x: 0, y: 0 });
    state = gameReducer(state, { type: "move-cursor", dx: 500, dy: 500 });
    expect(state.cursor).toEqual({ x: 15, y: 11 });
    state = gameReducer(state, {
      type: "set-cursor",
      coordinate: { x: 4, y: 7 },
    });
    expect(state.cursor).toEqual({ x: 4, y: 7 });
  });

  it("matches the validity overlay to simulation validation and updates provisionally", () => {
    let state = createDeveloperGame("overlay-validity");
    state = gameReducer(state, { type: "select", buildingId: "road" });
    const overlay = getOverlayView(state);
    const planningView = getPlanningView(state.planning);

    for (const tile of planningView.city.tiles) {
      const validation = validatePlacement(
        { ...planningView.city, budget: planningView.availableBudget },
        {
          instanceId: "test-validity",
          buildingId: "road",
          anchor: tile.coordinate,
          rotation: state.rotation,
        },
        { unlockedChapterIds: ALL_CHAPTERS },
      );
      expect(overlay.cells[tile.id]?.label).toBe(
        validation.valid ? "OK" : "NO",
      );
    }

    const tile = requiredValidTile(state);
    state = gameReducer(state, { type: "place", coordinate: tile.coordinate });
    expect(getOverlayView(state).cells[tile.id]?.label).toBe("NO");
  });

  it("maps flood risk and habitat value from every simulation tile", () => {
    const initial = createDeveloperGame("overlay-terrain-values");
    const flood = overlayFor(initial, "flood");
    const habitat = overlayFor(initial, "habitat");

    expect(Object.keys(flood.cells)).toHaveLength(initial.city.tiles.length);
    expect(Object.keys(habitat.cells)).toHaveLength(initial.city.tiles.length);
    for (const tile of initial.city.tiles) {
      expect(flood.cells[tile.id]?.strength).toBe(tile.floodRisk);
      expect(flood.cells[tile.id]?.label).toBe(
        tile.floodRisk > 0.65 ? "H" : tile.floodRisk > 0.35 ? "M" : "L",
      );
      expect(habitat.cells[tile.id]?.strength).toBe(tile.habitatValue);
      expect(habitat.cells[tile.id]?.label).toBe(
        tile.habitatValue > 0.7 ? "H" : tile.habitatValue > 0.4 ? "M" : "L",
      );
    }
  });

  it("matches water coverage to the engine after a provisional water pump", () => {
    let state = createDeveloperGame("overlay-water");
    expect(Object.keys(overlayFor(state, "water").cells)).toHaveLength(0);

    state = selectAndPlaceValid(state, "water-pump");
    expectOverlayMatchesCoverage(state, "water", "water");
    expect(
      Object.keys(overlayFor(state, "water").cells).length,
    ).toBeGreaterThan(0);
  });

  it("matches electricity coverage to the engine after a provisional solar array", () => {
    let state = withUnlockedThrough(
      createDeveloperGame("overlay-electricity"),
      "chapter-2-power",
    );
    expect(Object.keys(overlayFor(state, "electricity").cells)).toHaveLength(0);

    state = selectAndPlaceValid(state, "solar-array");
    expectOverlayMatchesCoverage(state, "electricity", "electricity");
    expect(
      Object.keys(overlayFor(state, "electricity").cells).length,
    ).toBeGreaterThan(0);
  });

  it("matches transport coverage to the engine after a provisional road", () => {
    let state = createDeveloperGame("overlay-transport");
    expect(Object.keys(overlayFor(state, "transport").cells)).toHaveLength(0);

    state = selectAndPlaceValid(state, "road");
    expectOverlayMatchesCoverage(state, "transport", "transport");
    expect(
      Object.keys(overlayFor(state, "transport").cells).length,
    ).toBeGreaterThan(0);
  });

  it("combines provisional education and healthcare coverage without duplicates", () => {
    let state = withUnlockedThrough(
      withCareUtilityNetwork(createDeveloperGame("overlay-services")),
      "chapter-3-care",
    );
    expect(Object.keys(overlayFor(state, "service").cells)).toHaveLength(0);

    state = selectAndPlaceValid(state, "school");
    state = selectAndPlaceValid(state, "clinic");
    const city = getPlanningCity(state);
    const expected = new Set([
      ...calculateCoverage(city, "education").coveredTileIds,
      ...calculateCoverage(city, "healthcare").coveredTileIds,
    ]);
    const service = overlayFor(state, "service");

    expect(Object.keys(service.cells).sort()).toEqual([...expected].sort());
    expect(
      Object.values(service.cells).every((cell) => cell.label === "S"),
    ).toBe(true);
    expect(city.buildings.map((building) => building.definitionId)).toEqual(
      expect.arrayContaining(["school", "clinic"]),
    );
  });

  it("shows engine-valid build costs and changes an occupied tile provisionally", () => {
    let state = createDeveloperGame("overlay-cost");
    state = gameReducer(state, { type: "select", buildingId: "road" });
    const cost = overlayFor(state, "cost");
    const validity = overlayFor(state, "validity");

    for (const tile of state.city.tiles) {
      expect(cost.cells[tile.id]?.label).toBe(
        validity.cells[tile.id]?.label === "OK" ? "$20" : "—",
      );
    }

    const tile = requiredValidTile(state);
    state = gameReducer(state, { type: "place", coordinate: tile.coordinate });
    expect(provisionalCost(state)).toBe(20);
    expect(overlayFor(state, "cost").cells[tile.id]?.label).toBe("—");
  });
});

function overlayFor(state: GameState, overlay: OverlayId) {
  return getOverlayView(gameReducer(state, { type: "set-overlay", overlay }));
}

function requiredValidTile(state: GameState) {
  const overlay = getOverlayView(state);
  const tile = getPlanningCity(state).tiles.find(
    (candidate) => overlay.cells[candidate.id]?.label === "OK",
  );
  if (tile === undefined) {
    throw new Error(
      `Expected a valid tile for ${state.selectedBuildingId ?? "selection"}`,
    );
  }
  return tile;
}

function selectAndPlaceValid(state: GameState, buildingId: string): GameState {
  const selected = gameReducer(state, { type: "select", buildingId });
  return gameReducer(selected, {
    type: "place",
    coordinate: requiredValidTile(selected).coordinate,
  });
}

function committedRoadGame(seed: string): GameState {
  const planned = selectAndPlaceValid(createDeveloperGame(seed), "road");
  const committed = gameReducer(planned, { type: "commit" });
  expect(committed.city.turn).toBe(1);
  return committed;
}

function withCareUtilityNetwork(state: GameState): GameState {
  const city: CityState = {
    ...state.city,
    tiles: state.city.tiles.map((tile) => ({
      ...tile,
      terrain:
        tile.coordinate.x === 0 && tile.coordinate.y === 4
          ? "river"
          : tile.coordinate.x === 1 && tile.coordinate.y === 4
            ? "floodplain"
            : "meadow",
      floodRisk: tile.coordinate.x === 0 && tile.coordinate.y === 4 ? 1 : 0.1,
      placeable: !(tile.coordinate.x === 0 && tile.coordinate.y === 4),
      occupantId: null,
      connections: { road: false, water: false, electricity: false },
    })),
  };
  let planning = createPlanningSession(city);
  for (const request of [
    { instanceId: "road-1", buildingId: "road", anchor: { x: 3, y: 4 } },
    { instanceId: "road-2", buildingId: "road", anchor: { x: 6, y: 4 } },
    {
      instanceId: "water-pump-1",
      buildingId: "water-pump",
      anchor: { x: 1, y: 4 },
    },
    {
      instanceId: "water-treatment-plant-1",
      buildingId: "water-treatment-plant",
      anchor: { x: 4, y: 4 },
    },
    {
      instanceId: "solar-array-1",
      buildingId: "solar-array",
      anchor: { x: 4, y: 1 },
    },
  ] as const) {
    const placed = placeProvisional(
      planning,
      { ...request, rotation: 0 },
      { unlockedChapterIds: ALL_CHAPTERS },
    );
    if (!placed.accepted)
      throw new Error(
        `Fixture infrastructure placement failed: ${request.buildingId}`,
      );
    planning = placed.session;
  }
  return { ...state, city, planning };
}

function expectOverlayMatchesCoverage(
  state: GameState,
  overlayId: Extract<OverlayId, "water" | "electricity" | "transport">,
  resource: "water" | "electricity" | "transport",
) {
  const city = getPlanningCity(state);
  const expected = calculateCoverage(city, resource).coveredTileIds;
  expect(Object.keys(overlayFor(state, overlayId).cells).sort()).toEqual(
    [...expected].sort(),
  );
}

function withUnlockedThrough(state: GameState, chapterId: string): GameState {
  return {
    ...state,
    campaign: { ...state.campaign, chapterId, phase: "active" },
  };
}

function finalMissionProgress(): CampaignProgressState {
  const ordered = [...RIVERGATE_FOUNDATIONS_CAMPAIGN.chapters]
    .sort(
      (left, right) =>
        left.order - right.order || left.id.localeCompare(right.id),
    )
    .flatMap((chapter) =>
      [...chapter.missions]
        .sort(
          (left, right) =>
            left.order - right.order || left.id.localeCompare(right.id),
        )
        .map((mission) => ({ chapter, mission })),
    );
  const currentIndex = ordered.findIndex(
    ({ chapter, mission }) =>
      chapter.id === "chapter-5-storm" && mission.id === "repair-together",
  );
  const completed = ordered.slice(0, currentIndex);
  return {
    schemaVersion: 1,
    campaignId: RIVERGATE_FOUNDATIONS_CAMPAIGN.id,
    campaignVersion: RIVERGATE_FOUNDATIONS_CAMPAIGN.version,
    chapterId: "chapter-5-storm",
    missionId: "repair-together",
    phase: "active",
    completedMissionKeys: completed.map(({ chapter, mission }) =>
      missionProgressKey(chapter.id, mission.id),
    ),
    completedObjectiveKeys: completed.flatMap(({ chapter, mission }) =>
      mission.objectives
        .filter((objective) => objective.required)
        .map((objective) =>
          objectiveProgressKey(chapter.id, mission.id, objective.id),
        ),
    ),
  };
}
