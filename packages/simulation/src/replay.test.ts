import { describe, expect, it } from "vitest";

import type { CityState, TurnAction } from "@terra/campaign-schema";

import { makeTestCity } from "./test-fixtures";
import {
  createPlanningSession,
  materializePlanningState,
  placeProvisional,
  removeProvisional,
  validatePlacement,
  type PlacementRequest,
} from "./placement";
import {
  ReplayError,
  networkSnapshotForCity,
  replayCity,
  replayCityFromJson,
  type ReplayContext,
} from "./replay";
import { simulateTurn } from "./turn";

const UNLOCKED_CHAPTERS = [
  "chapter-1-water",
  "chapter-2-power",
  "chapter-3-care",
  "chapter-4-resilience",
] as const;

const CONTEXT: ReplayContext = {
  unlockedChapterIds: UNLOCKED_CHAPTERS,
};

describe("deterministic city replay", () => {
  it("recreates the same golden state and hashes repeatedly and after JSON transport", () => {
    const initialState = makeTestCity();
    const recordedState = recordTwoTurns(initialState);
    const document = {
      initialState,
      actionLog: recordedState.actionLog,
    };

    const first = replayCity(document, CONTEXT);
    const second = replayCity(document, CONTEXT);
    const transported = replayCityFromJson(JSON.stringify(document), CONTEXT);

    expect(first.state).toEqual(recordedState);
    expect(second).toEqual(first);
    expect(transported).toEqual(first);
    expect(first.turnsReplayed).toBe(2);
    expect(first.actionLogHash).toMatch(/^[a-f0-9]{16}$/);
    expect(first.finalStateHash).toMatch(/^[a-f0-9]{16}$/);
    expect(first).toMatchObject({
      actionLogHash: "71d608a231f6f7ae",
      finalStateHash: "9707d2058fa632cd",
    });
  });

  it("rejects action-id tampering even when the action remains structurally valid", () => {
    const initialState = makeTestCity();
    const actions = recordTwoTurns(initialState).actionLog.map((action) => ({
      ...action,
    }));
    const first = actions[0];
    if (first === undefined) throw new Error("Missing fixture action");
    actions[0] = { ...first, actionId: "action-tampered" };

    expectReplayError(
      () => replayCity({ initialState, actionLog: actions }, CONTEXT),
      "ACTION_MISMATCH",
    );
  });

  it("rejects reordered sequences and incorrect turn grouping", () => {
    const initialState = makeTestCity();
    const actions = recordTwoTurns(initialState).actionLog;
    const reordered = [actions[1], actions[0], ...actions.slice(2)].filter(
      (action): action is TurnAction => action !== undefined,
    );
    expectReplayError(
      () => replayCity({ initialState, actionLog: reordered }, CONTEXT),
      "INVALID_ACTION_LOG",
    );

    const wrongTurn = actions.map((action, index) =>
      index === 2 ? { ...action, turn: 1 } : action,
    );
    expectReplayError(
      () => replayCity({ initialState, actionLog: wrongTurn }, CONTEXT),
      "INVALID_TURN",
    );
  });

  it("fails closed on unknown buildings, invalid placement, and incomplete turns", () => {
    const initialState = makeTestCity();
    const actions = recordTwoTurns(initialState).actionLog;
    const first = actions[0];
    if (first?.type !== "place-building") {
      throw new Error("Expected a placement fixture action");
    }

    expectReplayError(
      () =>
        replayCity(
          {
            initialState,
            actionLog: [
              { ...first, buildingId: "unknown-building" },
              ...actions.slice(1),
            ],
          },
          CONTEXT,
        ),
      "UNKNOWN_BUILDING",
    );
    expectReplayError(
      () =>
        replayCity(
          {
            initialState,
            actionLog: [
              { ...first, anchor: { x: 999, y: 999 } },
              ...actions.slice(1),
            ],
          },
          CONTEXT,
        ),
      "INVALID_PLACEMENT",
    );
    expectReplayError(
      () =>
        replayCity({ initialState, actionLog: actions.slice(0, 1) }, CONTEXT),
      "INCOMPLETE_TURN",
    );
  });

  it("keeps the JSON boundary strict and free of child profile fields", () => {
    const initialState = makeTestCity();
    const actionLog = recordTwoTurns(initialState).actionLog;

    expectReplayError(
      () =>
        replayCityFromJson(
          JSON.stringify({ initialState, actionLog, childName: "not-allowed" }),
          CONTEXT,
        ),
      "INVALID_DOCUMENT",
    );
    expectReplayError(
      () => replayCityFromJson("not json", CONTEXT),
      "INVALID_DOCUMENT",
    );
  });
});

function recordTwoTurns(initialState: CityState): CityState {
  const request = findValidRoadPlacement(initialState);
  const placed = placeProvisional(
    createPlanningSession(initialState),
    request,
    {
      unlockedChapterIds: UNLOCKED_CHAPTERS,
    },
  );
  if (!placed.accepted) throw new Error("Could not place fixture road");
  const afterFirstTurn = simulateTurn({
    city: initialState,
    planning: placed.session,
    network: networkSnapshotForCity(materializePlanningState(placed.session)),
  }).state;

  const removed = removeProvisional(
    createPlanningSession(afterFirstTurn),
    request.instanceId,
  );
  if (!removed.accepted) throw new Error("Could not remove fixture road");
  return simulateTurn({
    city: afterFirstTurn,
    planning: removed.session,
    network: networkSnapshotForCity(materializePlanningState(removed.session)),
  }).state;
}

function findValidRoadPlacement(city: CityState): PlacementRequest {
  for (const tile of city.tiles) {
    const request: PlacementRequest = {
      instanceId: "replay-road-1",
      buildingId: "road",
      anchor: tile.coordinate,
      rotation: 0,
    };
    if (
      validatePlacement(city, request, {
        unlockedChapterIds: UNLOCKED_CHAPTERS,
      }).valid
    ) {
      return request;
    }
  }
  throw new Error("Fixture map has no valid road tile");
}

function expectReplayError(
  action: () => unknown,
  code: ReplayError["code"],
): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(ReplayError);
    expect((error as ReplayError).code).toBe(code);
    return;
  }
  throw new Error(`Expected replay error ${code}`);
}
