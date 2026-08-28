import {
  ActionLogSchema,
  CityStateSchema,
  type BuildingDefinition,
  type CityState,
  type TurnAction,
} from "@terra/campaign-schema";

import { BUILDING_CATALOGUE } from "./catalogue";
import { canonicalStringify, deterministicHash } from "./hash";
import { analyzeCityNetworks } from "./networks";
import {
  createPlanningSession,
  materializePlanningState,
  placeProvisional,
  removeProvisional,
  type PlanningSession,
} from "./placement";
import type { ProgressionContext } from "./progression";
import { simulateTurn, type TurnNetworkSnapshot } from "./turn";

export const REPLAY_ERROR_CODES = [
  "INVALID_DOCUMENT",
  "INVALID_INITIAL_STATE",
  "INVALID_ACTION_LOG",
  "INVALID_INITIAL_BOUNDARY",
  "INVALID_SEQUENCE",
  "INVALID_TURN",
  "INCOMPLETE_TURN",
  "UNKNOWN_BUILDING",
  "INVALID_PLACEMENT",
  "INVALID_REMOVAL",
  "ACTION_MISMATCH",
] as const;

export type ReplayErrorCode = (typeof REPLAY_ERROR_CODES)[number];

export class ReplayError extends Error {
  public readonly code: ReplayErrorCode;
  public readonly actionIndex: number | null;

  public constructor(
    code: ReplayErrorCode,
    message: string,
    actionIndex: number | null = null,
  ) {
    super(message);
    this.name = "ReplayError";
    this.code = code;
    this.actionIndex = actionIndex;
  }
}

export type ReplayDocument = {
  readonly initialState: CityState;
  /** Actions after initialState.actionLog, not a duplicate of its history. */
  readonly actionLog: readonly TurnAction[];
};

export type ReplayContext = {
  readonly unlockedChapterIds: readonly string[];
  readonly catalogue?: readonly BuildingDefinition[];
  readonly progression?: ProgressionContext;
};

export type ReplayResult = {
  readonly state: CityState;
  readonly actionLogHash: string;
  readonly finalStateHash: string;
  readonly turnsReplayed: number;
};

/**
 * Replays a strict action suffix using only explicit data. This function has no
 * browser globals, storage calls, clock reads, or ambient randomness.
 */
export function replayCity(
  document: ReplayDocument,
  context: ReplayContext,
): ReplayResult {
  const initialState = parseInitialState(document.initialState);
  const actions = parseActions(document.actionLog);
  validateInitialBoundary(initialState);

  const catalogue = context.catalogue ?? BUILDING_CATALOGUE;
  const knownBuildingIds = new Set(catalogue.map((building) => building.id));
  const unknownInitialBuilding = initialState.buildings.find(
    (building) => !knownBuildingIds.has(building.definitionId),
  );
  if (unknownInitialBuilding !== undefined) {
    throw new ReplayError(
      "UNKNOWN_BUILDING",
      `Unknown building definition: ${unknownInitialBuilding.definitionId}`,
    );
  }
  let state = initialState;
  let actionIndex = 0;
  let expectedSequence = (state.actionLog.at(-1)?.sequence ?? -1) + 1;
  let turnsReplayed = 0;

  while (actionIndex < actions.length) {
    const turn = state.turn + 1;
    let planning = createPlanningSession(state);
    const groupStart = actionIndex;
    let advanced = false;

    while (actionIndex < actions.length) {
      const action = actions[actionIndex];
      if (action === undefined) break;
      assertSequence(action, actionIndex, expectedSequence);
      assertTurn(action, actionIndex, turn);

      if (action.type === "advance-turn") {
        const plannedCity = materializePlanningState(planning);
        const network = networkSnapshotForCity(plannedCity, catalogue);

        const result = simulateTurn({
          city: state,
          planning,
          network,
          catalogue,
          ...(context.progression === undefined
            ? {}
            : { progression: context.progression }),
        });
        const expectedGroup = actions.slice(groupStart, actionIndex + 1);
        const actualGroup = result.state.actionLog.slice(
          state.actionLog.length,
        );
        if (
          canonicalStringify(actualGroup) !== canonicalStringify(expectedGroup)
        ) {
          throw new ReplayError(
            "ACTION_MISMATCH",
            "Replay did not regenerate the exact supplied action group",
            actionIndex,
          );
        }

        state = result.state;
        turnsReplayed += 1;
        advanced = true;
        actionIndex += 1;
        expectedSequence += 1;
        break;
      }

      planning = applyPlanningAction(
        planning,
        action,
        actionIndex,
        context.unlockedChapterIds,
        catalogue,
        knownBuildingIds,
      );
      actionIndex += 1;
      expectedSequence += 1;
    }

    if (!advanced) {
      throw new ReplayError(
        "INCOMPLETE_TURN",
        `Action group for turn ${turn} does not end with advance-turn`,
        actions.length - 1,
      );
    }
  }

  return {
    state,
    actionLogHash: hashActionLog(state.actionLog),
    finalStateHash: hashCityState(state),
    turnsReplayed,
  };
}

/** Derives turn input from the same immutable city graph on every runtime. */
export function networkSnapshotForCity(
  city: CityState,
  catalogue: readonly BuildingDefinition[] = BUILDING_CATALOGUE,
): TurnNetworkSnapshot {
  const parsedCity = parseInitialState(city);
  const analysis = analyzeCityNetworks(parsedCity, catalogue);
  const eligibleTileIds = new Set(
    parsedCity.tiles.filter((tile) => tile.placeable).map((tile) => tile.id),
  );

  return {
    waterCoverage: coverageRatio(
      analysis.coverage.water.tiles,
      eligibleTileIds,
    ),
    electricityCoverage: coverageRatio(
      analysis.coverage.electricity.tiles,
      eligibleTileIds,
    ),
    educationCoverage: coverageRatio(
      analysis.coverage.education.tiles,
      eligibleTileIds,
    ),
    healthcareCoverage: coverageRatio(
      analysis.coverage.healthcare.tiles,
      eligibleTileIds,
    ),
    transportCoverage: coverageRatio(
      analysis.coverage.transport.tiles,
      eligibleTileIds,
    ),
    natureCoverage: coverageRatio(
      analysis.coverage.nature.tiles,
      eligibleTileIds,
    ),
  };
}

/** A transport-safe entrypoint shared by browser workers and Node services. */
export function replayCityFromJson(
  serializedDocument: string,
  context: ReplayContext,
): ReplayResult {
  let value: unknown;
  try {
    value = JSON.parse(serializedDocument);
  } catch {
    throw new ReplayError("INVALID_DOCUMENT", "Replay document is not JSON");
  }
  if (!isRecord(value)) {
    throw new ReplayError(
      "INVALID_DOCUMENT",
      "Replay document must be an object",
    );
  }
  const keys = Object.keys(value).sort();
  if (
    keys.length !== 2 ||
    keys[0] !== "actionLog" ||
    keys[1] !== "initialState"
  ) {
    throw new ReplayError(
      "INVALID_DOCUMENT",
      "Replay document must contain only initialState and actionLog",
    );
  }
  return replayCity(
    {
      initialState: value.initialState as CityState,
      actionLog: value.actionLog as readonly TurnAction[],
    },
    context,
  );
}

export function hashActionLog(actionLog: readonly TurnAction[]): string {
  return deterministicHash(parseActions(actionLog));
}

export function hashCityState(city: CityState): string {
  return deterministicHash(parseInitialState(city));
}

function applyPlanningAction(
  planning: PlanningSession,
  action: Exclude<TurnAction, { type: "advance-turn" }>,
  actionIndex: number,
  unlockedChapterIds: readonly string[],
  catalogue: readonly BuildingDefinition[],
  knownBuildingIds: ReadonlySet<string>,
): PlanningSession {
  if (action.type === "place-building") {
    if (!knownBuildingIds.has(action.buildingId)) {
      throw new ReplayError(
        "UNKNOWN_BUILDING",
        `Unknown building definition: ${action.buildingId}`,
        actionIndex,
      );
    }
    const placed = placeProvisional(
      planning,
      {
        instanceId: action.instanceId,
        buildingId: action.buildingId,
        anchor: action.anchor,
        rotation: action.rotation,
      },
      { unlockedChapterIds, catalogue },
    );
    if (!placed.accepted) {
      throw new ReplayError(
        "INVALID_PLACEMENT",
        `Placement rejected: ${placed.issues.map((issue) => issue.code).join(",")}`,
        actionIndex,
      );
    }
    return placed.session;
  }

  const removed = removeProvisional(planning, action.instanceId);
  if (!removed.accepted) {
    throw new ReplayError(
      "INVALID_REMOVAL",
      `Cannot remove missing building: ${action.instanceId}`,
      actionIndex,
    );
  }
  return removed.session;
}

function parseInitialState(value: CityState): CityState {
  const parsed = CityStateSchema.safeParse(value);
  if (!parsed.success) {
    throw new ReplayError(
      "INVALID_INITIAL_STATE",
      "Invalid initial city state",
    );
  }
  return parsed.data;
}

function parseActions(value: readonly TurnAction[]): TurnAction[] {
  const parsed = ActionLogSchema.safeParse(value);
  if (!parsed.success) {
    throw new ReplayError("INVALID_ACTION_LOG", "Invalid replay action log");
  }
  return parsed.data;
}

function validateInitialBoundary(city: CityState): void {
  const actions = city.actionLog;
  if (actions.length === 0) {
    if (city.turn !== 0) {
      throw new ReplayError(
        "INVALID_INITIAL_BOUNDARY",
        "A city after turn zero must include its prior action log",
      );
    }
    return;
  }

  let expectedTurn = 1;
  for (const [index, action] of actions.entries()) {
    if (action.sequence !== index || action.turn !== expectedTurn) {
      throw new ReplayError(
        "INVALID_INITIAL_BOUNDARY",
        "Initial action history is not a contiguous turn sequence",
        index,
      );
    }
    if (action.type === "advance-turn") expectedTurn += 1;
  }
  const finalAction = actions.at(-1);
  if (
    finalAction?.type !== "advance-turn" ||
    finalAction.turn !== city.turn ||
    expectedTurn !== city.turn + 1
  ) {
    throw new ReplayError(
      "INVALID_INITIAL_BOUNDARY",
      "Initial state must end at a complete recorded turn",
      actions.length - 1,
    );
  }
}

function assertSequence(
  action: TurnAction,
  actionIndex: number,
  expected: number,
): void {
  if (action.sequence !== expected) {
    throw new ReplayError(
      "INVALID_SEQUENCE",
      `Expected sequence ${expected}, received ${action.sequence}`,
      actionIndex,
    );
  }
}

function assertTurn(
  action: TurnAction,
  actionIndex: number,
  expected: number,
): void {
  if (action.turn !== expected) {
    throw new ReplayError(
      "INVALID_TURN",
      `Expected turn ${expected}, received ${action.turn}`,
      actionIndex,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function coverageRatio(
  tiles: readonly { readonly tileId: string; readonly strength: number }[],
  eligibleTileIds: ReadonlySet<string>,
): number {
  if (eligibleTileIds.size === 0) return 0;
  const totalStrength = tiles.reduce(
    (total, tile) =>
      total + (eligibleTileIds.has(tile.tileId) ? tile.strength : 0),
    0,
  );
  return Math.min(1, Math.max(0, totalStrength / eligibleTileIds.size));
}
