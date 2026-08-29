import { networkSnapshotForCity } from "@terra/simulation";
import { describe, expect, it } from "vitest";

import {
  createDeveloperGame,
  gameReducer,
  getOverlayView,
  getPlanningCity,
  operationCount,
  type GameState,
} from "../game/controller";

const PLAYTHROUGH_SEED = "rivergate-phase-two";
const SERVICE_RESERVES = new Set(["tile-12-4", "tile-13-4", "tile-12-6"]);

describe("phase two clean-map ending variants", () => {
  it("earns the Brave Rebuilder ending from an empty map", () => {
    let state = createDeveloperGame(PLAYTHROUGH_SEED);
    expect(state.city.buildings).toEqual([]);

    state = establishRivergate(state);
    state = placeExact(state, "wetland", { x: 6, y: 2 });
    state = commit(state);
    expectPosition(state, 13, "chapter-5-storm", "keep-help-moving");

    state = commit(state);
    expectPosition(state, 14, "chapter-5-storm", "repair-together");

    // The final mission accepts ordinary revisions. Remove the safety systems
    // through the public controller, then let the real scheduled storm record
    // the resulting hard-hit outcome. Nothing in the city or campaign state is
    // patched to force this ending.
    for (const buildingId of [
      "battery",
      "solar-array",
      "wetland",
      "community-park",
      "water-treatment-plant",
      "water-pump",
      "clinic",
      "school",
      "bus-stop",
      "road",
    ] as const) {
      state = removeAll(state, buildingId);
    }
    state = commit(state);
    expectFinalStormAndEnding(state);
  });
});

/** Completes the first twelve authored missions with the known clean-map plan. */
function establishRivergate(initial: GameState): GameState {
  let state = initial;

  for (const coordinate of [
    { x: 2, y: 1 },
    { x: 3, y: 3 },
    { x: 4, y: 7 },
    { x: 12, y: 1 },
    { x: 13, y: 10 },
    { x: 13, y: 3 },
    { x: 14, y: 4 },
    { x: 11, y: 5 },
    { x: 14, y: 5 },
    { x: 11, y: 6 },
    { x: 14, y: 6 },
    { x: 14, y: 7 },
    { x: 13, y: 8 },
  ]) {
    state = placeExact(state, "road", coordinate);
  }
  state = placeExact(state, "water-pump", { x: 6, y: 1 });
  state = commit(state);
  expectPosition(state, 1, "chapter-1-water", "make-water-safe");

  for (const coordinate of [
    { x: 3, y: 1 },
    { x: 4, y: 3 },
    { x: 5, y: 7 },
    { x: 10, y: 1 },
    { x: 11, y: 10 },
  ]) {
    state = placeExact(state, "water-treatment-plant", coordinate);
  }
  state = commit(state);
  expectPosition(state, 2, "chapter-1-water", "welcome-first-homes");

  for (const coordinate of [
    { x: 12, y: 2 },
    { x: 13, y: 7 },
    { x: 12, y: 3 },
    { x: 13, y: 6 },
    { x: 12, y: 5 },
    { x: 12, y: 8 },
  ]) {
    state = placeExact(state, "home", coordinate);
  }
  state = placeExact(state, "community-park", { x: 5, y: 9 });
  state = placeExact(state, "community-park", { x: 6, y: 9 });
  state = commit(state);
  expect(state.turnHistory[2]?.firedEventIds).toEqual(["chapter-1-river-rain"]);
  expectPosition(state, 3, "chapter-2-power", "catch-the-sun");

  for (let count = 0; count < 4; count += 1) {
    state = placeForCoverage(state, "solar-array", "electricity");
  }
  state = removeExact(state, { x: 3, y: 1 });
  state = removeExact(state, { x: 4, y: 3 });
  state = commit(state);
  expectPosition(state, 4, "chapter-2-power", "save-power-for-night");

  state = placeNear(state, "battery", { x: 10, y: 4 });
  state = placeNear(state, "battery", { x: 12, y: 9 });
  state = commit(state);
  expectPosition(state, 5, "chapter-2-power", "protect-the-clinic-plan");

  state = commit(state);
  expectPosition(state, 6, "chapter-3-care", "plan-a-safe-walk");
  state = commit(state);
  expectPosition(state, 7, "chapter-3-care", "open-a-school-for-everyone");

  state = placeExact(state, "school", { x: 12, y: 4 });
  state = commit(state);
  expectPosition(state, 8, "chapter-3-care", "care-for-every-neighbourhood");

  state = placeExact(state, "clinic", { x: 12, y: 6 });
  state = commit(state);
  expect(state.turnHistory[8]?.firedEventIds).toEqual([
    "chapter-4-growth-surge",
  ]);
  expectPosition(state, 9, "chapter-4-growth", "sort-the-growing-pile");

  state = placeExact(state, "recycling-centre", { x: 3, y: 1 });
  state = commit(state);
  expectPosition(state, 10, "chapter-4-growth", "give-everyone-a-way-to-go");

  state = placeNear(state, "bus-stop", { x: 13, y: 9 });
  state = commit(state);
  expectPosition(state, 11, "chapter-4-growth", "make-room-for-rivergate");

  state = commit(state);
  expectPosition(state, 12, "chapter-5-storm", "make-room-for-rain");
  return state;
}

function commit(state: GameState): GameState {
  const next = gameReducer(state, { type: "commit" });
  expect(next.city.turn, next.status).toBe(state.city.turn + 1);
  return next;
}

function placeExact(
  state: GameState,
  buildingId: string,
  coordinate: { readonly x: number; readonly y: number },
): GameState {
  let selected = gameReducer(state, { type: "select", buildingId });
  for (let rotations = 0; rotations < 4; rotations += 1) {
    if (
      getOverlayView(selected).cells[`tile-${coordinate.x}-${coordinate.y}`]
        ?.label === "OK"
    ) {
      const next = gameReducer(selected, { type: "place", coordinate });
      expect(operationCount(next), next.status).toBe(operationCount(state) + 1);
      return next;
    }
    selected = gameReducer(selected, { type: "rotate" });
  }
  throw new Error(
    `No valid ${buildingId} placement at ${coordinate.x},${coordinate.y}`,
  );
}

function placeNear(
  state: GameState,
  buildingId: string,
  target: { readonly x: number; readonly y: number },
): GameState {
  let selected = gameReducer(state, { type: "select", buildingId });
  for (let rotations = 0; rotations < 4; rotations += 1) {
    const overlay = getOverlayView(selected);
    const candidate = selected.city.tiles
      .filter((tile) => overlay.cells[tile.id]?.label === "OK")
      .filter((tile) => !SERVICE_RESERVES.has(tile.id))
      .sort(
        (left, right) =>
          distance(left.coordinate, target) -
            distance(right.coordinate, target) ||
          left.id.localeCompare(right.id),
      )[0];
    if (candidate !== undefined) {
      const next = gameReducer(selected, {
        type: "place",
        coordinate: candidate.coordinate,
      });
      expect(operationCount(next), next.status).toBe(operationCount(state) + 1);
      return next;
    }
    selected = gameReducer(selected, { type: "rotate" });
  }
  throw new Error(
    `No valid ${buildingId} placement near ${target.x},${target.y}`,
  );
}

function placeForCoverage(
  state: GameState,
  buildingId: string,
  resource: "water" | "electricity",
): GameState {
  let selected = gameReducer(state, { type: "select", buildingId });
  let best: GameState | undefined;
  let bestScore = -1;
  for (let rotations = 0; rotations < 4; rotations += 1) {
    const overlay = getOverlayView(selected);
    for (const tile of selected.city.tiles) {
      if (overlay.cells[tile.id]?.label !== "OK") continue;
      const candidate = gameReducer(selected, {
        type: "place",
        coordinate: tile.coordinate,
      });
      const newest = getPlanningCity(candidate).buildings.at(-1);
      if (
        newest?.occupiedTileIds.some((tileId) => SERVICE_RESERVES.has(tileId))
      ) {
        continue;
      }
      const network = networkSnapshotForCity(getPlanningCity(candidate));
      const score =
        resource === "water"
          ? network.waterCoverage
          : network.electricityCoverage;
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    selected = gameReducer(selected, { type: "rotate" });
  }
  if (best === undefined) throw new Error(`No valid ${buildingId} placement`);
  expect(operationCount(best)).toBe(operationCount(state) + 1);
  return best;
}

function removeAll(state: GameState, buildingId: string): GameState {
  for (const building of getPlanningCity(state).buildings.filter(
    (candidate) => candidate.definitionId === buildingId,
  )) {
    const next = gameReducer(state, {
      type: "remove",
      coordinate: building.anchor,
    });
    expect(operationCount(next), next.status).toBe(operationCount(state) + 1);
    state = next;
  }
  return state;
}

function removeExact(
  state: GameState,
  coordinate: { readonly x: number; readonly y: number },
): GameState {
  const next = gameReducer(state, { type: "remove", coordinate });
  expect(operationCount(next), next.status).toBe(operationCount(state) + 1);
  return next;
}

function distance(
  left: { readonly x: number; readonly y: number },
  right: { readonly x: number; readonly y: number },
): number {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

function expectPosition(
  state: GameState,
  turn: number,
  chapterId: string,
  missionId: string,
): void {
  expect(state.city.turn).toBe(turn);
  expect(`${state.campaign.chapterId}/${state.campaign.missionId}`).toBe(
    `${chapterId}/${missionId}`,
  );
}

function expectFinalStormAndEnding(state: GameState): void {
  expect(state.turnHistory.at(-1)?.firedEventIds).toEqual([
    "chapter-5-river-storm",
  ]);
  expect(state.campaign).toMatchObject({ phase: "completed" });
  expect(state.campaign.completedMissionKeys).toHaveLength(15);
  expect(state.ending).toMatchObject({
    endingId: "brave-rebuilder",
    stormOutcomeBand: "hard-hit",
  });
}
