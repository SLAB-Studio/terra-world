import {
  RIVERGATE_FOUNDATIONS_CAMPAIGN,
  hashActionLog,
  hashCityState,
  networkSnapshotForCity,
  replayCity,
} from "@terra/simulation";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import {
  ALL_CHAPTERS,
  createDeveloperGame,
  createGameSessionSave,
  gameReducer,
  getOverlayView,
  getPlanningCity,
  operationCount,
  restoreGameSession,
  type GameState,
} from "../game/controller";
import { createOfflinePersistence } from "../offline";

const PLAYTHROUGH_SEED = "rivergate-phase-two";
const SERVICE_RESERVES = new Set(["tile-12-4", "tile-13-4", "tile-12-6"]);

describe("phase two clean-profile campaign validation", () => {
  it("finishes all 15 missions, reloads the full session, and replays the exact ending", async () => {
    let state = createDeveloperGame(PLAYTHROUGH_SEED);
    const initialCity = structuredClone(state.city);

    // Turn 1 — Find the water. Routes are deliberately sparse and leave the
    // school/clinic footprints untouched for Chapter 3.
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

    // Turn 2 — Make water safe. Five spread-out sources reach enough of the
    // map to survive the authored turn-3 rain penalty.
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

    // Turn 3 — Welcome the first homes. The north/south split is balanced and
    // every home remains within four tiles of the reserved care services.
    for (const coordinate of [
      { x: 12, y: 2 },
      { x: 12, y: 3 },
      { x: 12, y: 5 },
      { x: 13, y: 6 },
      { x: 13, y: 7 },
      { x: 12, y: 8 },
    ]) {
      state = placeExact(state, "home", coordinate);
    }
    state = placeExact(state, "community-park", { x: 5, y: 9 });
    state = placeExact(state, "community-park", { x: 6, y: 9 });
    state = commit(state);
    expect(state.turnHistory[2]?.firedEventIds).toEqual([
      "chapter-1-river-rain",
    ]);
    expectPosition(state, 3, "chapter-2-power", "catch-the-sun");

    // Turn 4 — Catch the sun. The coverage solver uses only public previews
    // and rejects candidates that would consume a reserved service footprint.
    for (let count = 0; count < 4; count += 1) {
      state = placeForCoverage(
        state,
        "solar-array",
        "electricity",
        SERVICE_RESERVES,
      );
    }
    // Two distant water plants are no longer needed after the rain chapter;
    // removing them keeps maintenance affordable without fabricating a refund.
    state = removeExact(state, { x: 3, y: 1 });
    state = removeExact(state, { x: 4, y: 3 });
    state = commit(state);
    expectPosition(state, 4, "chapter-2-power", "save-power-for-night");

    // Turn 5 — Save power for night.
    state = placeNear(state, "battery", { x: 10, y: 4 });
    state = placeNear(state, "battery", { x: 12, y: 9 });
    state = commit(state);
    expectPosition(state, 5, "chapter-2-power", "protect-the-clinic-plan");

    // Turn 6 — Protect the clinic plan. Empty planning is a real production
    // action: it advances time so batteries charge without filler buildings.
    state = commit(state);
    expectPosition(state, 6, "chapter-3-care", "plan-a-safe-walk");

    // Turn 7 — Plan a safe walk. Existing safe roads already satisfy the task.
    state = commit(state);
    expectPosition(state, 7, "chapter-3-care", "open-a-school-for-everyone");

    // Turn 8 — Open a school for everyone. This exact two-tile footprint was
    // preserved from turn 1 and now has road, water, and electricity access.
    state = placeExact(state, "school", { x: 12, y: 4 });
    state = commit(state);
    expectPosition(state, 8, "chapter-3-care", "care-for-every-neighbourhood");

    // Save, close and reopen the whole live campaign—not just its city map.
    const indexedDB = new IDBFactory();
    const databaseName = "terra-world-phase-two-playthrough";
    const persistence = await createOfflinePersistence({
      indexedDB,
      databaseName,
    });
    expect(persistence.kind).toBe("indexeddb");
    await persistence.saveProfile({
      profileId: "phase-two-clean-profile",
      createdAt: 1,
      updatedAt: 1,
    });
    const beforeClose = state;
    await persistence.saveCampaignSession(createGameSessionSave(state, 2));
    persistence.close();
    const reopenedPersistence = await createOfflinePersistence({
      indexedDB,
      databaseName,
    });
    const midCampaignSave = await reopenedPersistence.getCampaignSession(
      state.city.cityId,
    );
    expect(midCampaignSave).not.toBeNull();
    state = restoreGameSession(midCampaignSave!);
    expect(state).toEqual(beforeClose);
    expectPosition(state, 8, "chapter-3-care", "care-for-every-neighbourhood");

    // Turn 9 — Care for every neighbourhood. The exact growth event must fire
    // while the care director verifies both halves of Rivergate.
    state = placeExact(state, "clinic", { x: 12, y: 6 });
    state = commit(state);
    expect(state.turnHistory[8]?.firedEventIds).toEqual([
      "chapter-4-growth-surge",
    ]);
    expectPosition(state, 9, "chapter-4-growth", "sort-the-growing-pile");

    // Turn 10 — Sort the growing pile. Reuse a vacated, road-connected meadow
    // footprint rather than consuming the care neighbourhood.
    state = placeExact(state, "recycling-centre", { x: 3, y: 1 });
    state = commit(state);
    expectPosition(state, 10, "chapter-4-growth", "give-everyone-a-way-to-go");

    // Turn 11 — Give everyone a way to go.
    state = placeNear(state, "bus-stop", { x: 13, y: 9 });
    state = commit(state);
    expectPosition(state, 11, "chapter-4-growth", "make-room-for-rivergate");

    // Turn 12 — Make room for Rivergate. Population, waste, transport, air,
    // and upkeep are checked together by the real chapter director.
    state = commit(state);
    expectPosition(state, 12, "chapter-5-storm", "make-room-for-rain");

    // Turn 13 — Make room for rain.
    state = placeExact(state, "wetland", { x: 6, y: 2 });
    state = commit(state);
    expectPosition(state, 13, "chapter-5-storm", "keep-help-moving");

    // Turn 14 — Keep help moving.
    state = commit(state);
    expectPosition(state, 14, "chapter-5-storm", "repair-together");

    // Turn 15 — Repair together. The storm event is exact evidence for the
    // campaign completion and the ending classifier.
    state = commit(state);
    expect(state.turnHistory[14]?.firedEventIds).toEqual([
      "chapter-5-river-storm",
    ]);
    expect(state.campaign).toMatchObject({
      phase: "completed",
      completedMissionKeys: expect.arrayContaining([
        "chapter-5-storm::repair-together",
      ]),
    });
    expect(state.campaign.completedMissionKeys).toHaveLength(15);
    expect(state.ending).toMatchObject({
      schemaVersion: 1,
      endingId: "steady-shaper",
      stormOutcomeBand: "recovering",
    });

    // Persist and restore the completed ending, then independently regenerate
    // the exact city and canonical hashes from the empty-map action log.
    await reopenedPersistence.saveCampaignSession(
      createGameSessionSave(state, 3),
    );
    const completedSave = await reopenedPersistence.getCampaignSession(
      state.city.cityId,
    );
    const restored = restoreGameSession(completedSave!);
    expect(restored).toEqual(state);

    const replay = replayCity(
      { initialState: initialCity, actionLog: restored.city.actionLog },
      {
        unlockedChapterIds: ALL_CHAPTERS,
        progression: {
          events: RIVERGATE_FOUNDATIONS_CAMPAIGN.events,
          milestones: RIVERGATE_FOUNDATIONS_CAMPAIGN.milestones,
        },
      },
    );
    expect(replay.turnsReplayed).toBe(15);
    expect(replay.state).toEqual(restored.city);
    expect(replay.actionLogHash).toBe(hashActionLog(state.city.actionLog));
    expect(replay.finalStateHash).toBe(hashCityState(state.city));
    reopenedPersistence.close();
  }, 15_000);
});

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

function removeExact(
  state: GameState,
  coordinate: { readonly x: number; readonly y: number },
): GameState {
  const next = gameReducer(state, { type: "remove", coordinate });
  expect(operationCount(next), next.status).toBe(operationCount(state) + 1);
  return next;
}

function placeForCoverage(
  state: GameState,
  buildingId: string,
  resource: "water" | "electricity",
  reservedTileIds: ReadonlySet<string> = new Set(),
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
        newest?.occupiedTileIds.some((tileId) => reservedTileIds.has(tileId))
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
