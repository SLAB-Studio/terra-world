import { describe, expect, it } from "vitest";
import {
  calculateCoverage,
  createPlanningSession,
  getPlanningView,
  validatePlacement,
} from "@terra/simulation";

import {
  ALL_CHAPTERS,
  createDeveloperGame,
  gameReducer,
  getOverlayView,
  getPlanningCity,
  operationCount,
  provisionalCost,
  type GameState,
  type OverlayId,
} from "./controller";

describe("developer game controller", () => {
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
    expect(state.city.budget).toBe(7_979);
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
    let state = createDeveloperGame("overlay-electricity");
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
    let state = withConnectedTiles(createDeveloperGame("overlay-services"));
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
    expect(city.buildings.map((building) => building.definitionId)).toEqual([
      "school",
      "clinic",
    ]);
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

function withConnectedTiles(state: GameState): GameState {
  const city = {
    ...state.city,
    tiles: state.city.tiles.map((tile) => ({
      ...tile,
      connections: { road: true, water: true, electricity: true },
    })),
  };
  return { ...state, city, planning: createPlanningSession(city) };
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
