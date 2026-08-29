import type {
  CauseEffect,
  CityState,
  Coordinate,
  Rotation,
  TurnAction,
} from "@terra/campaign-schema";
import {
  CityStateSchema,
  CoordinateSchema,
  PlacedBuildingSchema,
  RotationSchema,
} from "@terra/campaign-schema";
import {
  BUILDING_CATALOGUE,
  RIVERGATE_EN_MESSAGES,
  RIVERGATE_FOUNDATIONS_CAMPAIGN,
  advanceRivergateCampaignState,
  analyzeCityNetworks,
  calculateCoverage,
  createCampaignState,
  createInitialCityState,
  createPlanningSession,
  createRiverValleyWorld,
  createRivergateEnding,
  getBuildingDefinition,
  getCurrentMissionView,
  getPlanningView,
  materializePlanningState,
  networkSnapshotForCity,
  placeProvisional,
  removeProvisional,
  renderRivergateCause,
  hashActionLog,
  hashCityState,
  simulateTurn,
  undoProvisional,
  validatePlacement,
  type CampaignProgressState,
  type CurrentMissionView,
  type PlacementIssue,
  type PlanningSession,
  type RivergateEnding,
} from "@terra/simulation";

import type { CampaignSessionSave } from "../offline";

import { buildingName } from "./catalogue";

export const OVERLAY_IDS = [
  "validity",
  "flood",
  "water",
  "electricity",
  "transport",
  "service",
  "habitat",
  "cost",
] as const;

export type OverlayId = (typeof OVERLAY_IDS)[number];

export type OverlayCell = {
  readonly strength: number;
  readonly label: string;
  readonly tone: "good" | "warn" | "bad" | "info" | "quiet";
  readonly pattern: "solid" | "lines" | "dots" | "cross";
};

export type OverlayView = {
  readonly id: OverlayId;
  readonly name: string;
  readonly description: string;
  readonly cells: Readonly<Record<string, OverlayCell>>;
};

export type GameState = {
  readonly city: CityState;
  readonly campaign: CampaignProgressState;
  readonly turnHistory: readonly CompletedTurnRecord[];
  readonly ending: RivergateEnding | null;
  readonly planning: PlanningSession;
  readonly selectedBuildingId: string | null;
  readonly rotation: Rotation;
  readonly cursor: Coordinate;
  readonly overlay: OverlayId;
  readonly status: string;
};

export type CompletedTurnRecord = {
  readonly turn: number;
  readonly firedEventIds: readonly string[];
  readonly earnedMilestoneIds: readonly string[];
  readonly causes: readonly CauseEffect[];
};

export const GAME_SESSION_SCHEMA_VERSION = 1 as const;

type SerializedPlanning = Readonly<{
  operations: readonly unknown[];
  cursor: number;
}>;

export type GameSessionPayload = Readonly<{
  city: CityState;
  campaign: CampaignProgressState;
  turnHistory: readonly CompletedTurnRecord[];
  ending: RivergateEnding | null;
  planning: SerializedPlanning;
  selectedBuildingId: string | null;
  rotation: Rotation;
  cursor: Coordinate;
  overlay: OverlayId;
  status: string;
  actionLogHash: string;
  finalStateHash: string;
}>;

export type MissionCard = {
  readonly chapterId: string;
  readonly missionId: string;
  readonly title: string;
  readonly briefing: string;
  readonly objectives: readonly {
    readonly id: string;
    readonly description: string;
    readonly required: boolean;
    readonly completed: boolean;
  }[];
  readonly requiredComplete: boolean;
};

export type ChildFeedback = {
  readonly explanation: string;
  readonly question: string;
  readonly hint: string;
};

export type GameAction =
  | { readonly type: "restore"; readonly state: GameState }
  | { readonly type: "select"; readonly buildingId: string }
  | { readonly type: "rotate" }
  | { readonly type: "set-cursor"; readonly coordinate: Coordinate }
  | { readonly type: "move-cursor"; readonly dx: number; readonly dy: number }
  | { readonly type: "place"; readonly coordinate: Coordinate }
  | { readonly type: "remove"; readonly coordinate: Coordinate }
  | { readonly type: "undo" }
  | { readonly type: "commit" }
  | { readonly type: "set-overlay"; readonly overlay: OverlayId }
  | { readonly type: "clear-selection" };

export const ALL_CHAPTERS = [
  "chapter-1-water",
  "chapter-2-power",
  "chapter-3-care",
  "chapter-4-growth",
  "chapter-5-storm",
] as const;

const OVERLAY_NAMES: Readonly<Record<OverlayId, string>> = {
  validity: "Build check",
  flood: "Flood risk",
  water: "Water reach",
  electricity: "Electricity reach",
  transport: "Transport reach",
  service: "Service reach",
  habitat: "Habitat value",
  cost: "Build cost",
};

export function createDeveloperGame(seed = "rivergate-phase-two"): GameState {
  const world = createRiverValleyWorld(seed, { width: 16, height: 12 });
  const city = createInitialCityState(world, {
    cityId: "rivergate-city",
    campaignId: RIVERGATE_FOUNDATIONS_CAMPAIGN.id,
    campaignVersion: RIVERGATE_FOUNDATIONS_CAMPAIGN.version,
    budget: RIVERGATE_FOUNDATIONS_CAMPAIGN.initialBudget,
  });
  return {
    city,
    campaign: createCampaignState(RIVERGATE_FOUNDATIONS_CAMPAIGN, city),
    turnHistory: [],
    ending: null,
    planning: createPlanningSession(city),
    selectedBuildingId: "water-pump",
    rotation: 0,
    cursor: { x: 8, y: 6 },
    overlay: "validity",
    status: "Water pump selected. Find a safe tile beside the river.",
  };
}

/**
 * Produces the sole durable campaign-session shape. It includes an uncommitted
 * planning session so closing the browser never silently discards undoable
 * work.
 */
export function createGameSessionSave(
  state: GameState,
  savedAt = Date.now(),
): CampaignSessionSave {
  const payload: GameSessionPayload = {
    city: state.city,
    campaign: state.campaign,
    turnHistory: state.turnHistory,
    ending: state.ending,
    planning: {
      operations: state.planning.operations,
      cursor: state.planning.cursor,
    },
    selectedBuildingId: state.selectedBuildingId,
    rotation: state.rotation,
    cursor: state.cursor,
    overlay: state.overlay,
    status: state.status,
    actionLogHash: hashActionLog(state.city.actionLog),
    finalStateHash: hashCityState(state.city),
  };
  // JSON transport strips accidental prototypes and makes every browser store
  // receive the exact same bytes-shaped value. GameState is reducer-owned;
  // full replay validation belongs to the untrusted restore boundary.
  const copy = JSON.parse(JSON.stringify(payload)) as GameSessionPayload;
  return {
    cityId: state.city.cityId,
    savedAt,
    schemaVersion: GAME_SESSION_SCHEMA_VERSION,
    campaignId: state.city.campaignId,
    campaignVersion: state.city.campaignVersion,
    payload: copy,
  };
}

/**
 * Restores only a fully verified session. Callers should discard the persisted
 * record and start a fresh game if this throws.
 */
export function restoreGameSession(save: CampaignSessionSave): GameState {
  if (
    save.schemaVersion !== GAME_SESSION_SCHEMA_VERSION ||
    !isRecord(save.payload)
  ) {
    throw new TypeError("Campaign session schema is unsupported");
  }
  const payload = validateGameSessionPayload(save.payload);
  if (
    save.cityId !== payload.city.cityId ||
    save.campaignId !== payload.city.campaignId ||
    save.campaignVersion !== payload.city.campaignVersion
  ) {
    throw new TypeError("Campaign session envelope does not match its city");
  }
  return {
    city: payload.city,
    campaign: payload.campaign,
    turnHistory: payload.turnHistory,
    ending: payload.ending,
    planning: {
      baseState: payload.city,
      operations: payload.planning.operations as PlanningSession["operations"],
      cursor: payload.planning.cursor,
    },
    selectedBuildingId: payload.selectedBuildingId,
    rotation: payload.rotation,
    cursor: payload.cursor,
    overlay: payload.overlay,
    status: payload.status,
  };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "restore":
      return action.state;
    case "select": {
      const definition = getBuildingDefinition(action.buildingId);
      return definition === undefined
        ? { ...state, status: "That catalogue item is unavailable." }
        : {
            ...state,
            selectedBuildingId: definition.id,
            rotation: definition.allowedRotations[0] ?? 0,
            overlay: "validity",
            status: `${buildingName(definition.id)} selected. Choose a tile on the map.`,
          };
    }
    case "rotate": {
      if (state.selectedBuildingId === null) return state;
      const definition = getBuildingDefinition(state.selectedBuildingId);
      if (definition === undefined || definition.allowedRotations.length < 2) {
        return { ...state, status: "This item does not need rotating." };
      }
      const index = definition.allowedRotations.indexOf(state.rotation);
      const rotation =
        definition.allowedRotations[
          (index + 1) % definition.allowedRotations.length
        ] ?? 0;
      return { ...state, rotation, status: `Rotated to ${rotation} degrees.` };
    }
    case "move-cursor": {
      const maximumX = Math.max(
        ...state.city.tiles.map((tile) => tile.coordinate.x),
      );
      const maximumY = Math.max(
        ...state.city.tiles.map((tile) => tile.coordinate.y),
      );
      return {
        ...state,
        cursor: {
          x: clamp(state.cursor.x + action.dx, 0, maximumX),
          y: clamp(state.cursor.y + action.dy, 0, maximumY),
        },
      };
    }
    case "set-cursor":
      return { ...state, cursor: action.coordinate };
    case "place":
      return placeAt(state, action.coordinate);
    case "remove":
      return removeAt(state, action.coordinate);
    case "undo": {
      if (state.planning.cursor === 0) {
        return {
          ...state,
          status: "There are no provisional changes to undo.",
        };
      }
      return {
        ...state,
        planning: undoProvisional(state.planning),
        status: "Last provisional change undone.",
      };
    }
    case "commit":
      return commitTurn(state);
    case "set-overlay":
      return {
        ...state,
        overlay: action.overlay,
        status: `${OVERLAY_NAMES[action.overlay]} overlay shown.`,
      };
    case "clear-selection":
      return {
        ...state,
        selectedBuildingId: null,
        status: "Build selection cleared. Drag the map to explore Rivergate.",
      };
  }
}

export function getPlanningCity(state: GameState): CityState {
  return materializePlanningState(state.planning);
}

function validateGameSessionPayload(value: unknown): GameSessionPayload {
  if (!isRecord(value))
    throw new TypeError("Campaign session payload is invalid");
  const city = CityStateSchema.safeParse(value.city);
  if (!city.success) throw new TypeError("Campaign session city is invalid");
  const replayed = replayCampaignHistory(city.data);
  if (
    JSON.stringify(replayed.city) !== JSON.stringify(city.data) ||
    value.actionLogHash !== hashActionLog(replayed.city.actionLog) ||
    value.finalStateHash !== hashCityState(replayed.city)
  ) {
    throw new TypeError("Campaign session replay hashes do not match");
  }
  if (
    JSON.stringify(value.campaign) !== JSON.stringify(replayed.campaign) ||
    JSON.stringify(value.turnHistory) !==
      JSON.stringify(replayed.turnHistory) ||
    JSON.stringify(value.ending) !== JSON.stringify(replayed.ending)
  ) {
    throw new TypeError("Campaign session progress is invalid");
  }

  const planning = parsePlanning(value.planning, city.data, replayed.campaign);
  const selectedBuildingId =
    value.selectedBuildingId === null
      ? null
      : typeof value.selectedBuildingId === "string" &&
          getBuildingDefinition(value.selectedBuildingId) !== undefined
        ? value.selectedBuildingId
        : invalidSessionField("selected building");
  const rotation = RotationSchema.safeParse(value.rotation);
  const cursor = CoordinateSchema.safeParse(value.cursor);
  if (!rotation.success || !cursor.success)
    throw new TypeError("Campaign session cursor is invalid");
  const maximumX = Math.max(
    ...city.data.tiles.map((tile) => tile.coordinate.x),
  );
  const maximumY = Math.max(
    ...city.data.tiles.map((tile) => tile.coordinate.y),
  );
  if (cursor.data.x > maximumX || cursor.data.y > maximumY)
    throw new TypeError("Campaign session cursor is outside its map");
  if (!OVERLAY_IDS.includes(value.overlay as OverlayId))
    throw new TypeError("Campaign session overlay is invalid");
  if (typeof value.status !== "string" || value.status.length > 1_000)
    throw new TypeError("Campaign session status is invalid");

  return {
    city: city.data,
    campaign: replayed.campaign,
    turnHistory: replayed.turnHistory,
    ending: replayed.ending,
    planning,
    selectedBuildingId,
    rotation: rotation.data,
    cursor: cursor.data,
    overlay: value.overlay as OverlayId,
    status: value.status,
    actionLogHash: value.actionLogHash as string,
    finalStateHash: value.finalStateHash as string,
  };
}

type ReplayedCampaignHistory = Readonly<{
  city: CityState;
  campaign: CampaignProgressState;
  turnHistory: readonly CompletedTurnRecord[];
  ending: RivergateEnding | null;
}>;

/** Replays every committed turn under the chapter lock active at that moment. */
function replayCampaignHistory(savedCity: CityState): ReplayedCampaignHistory {
  let city = createDeveloperGame(savedCity.seed).city;
  let campaign = createCampaignState(RIVERGATE_FOUNDATIONS_CAMPAIGN, city);
  const history: CompletedTurnRecord[] = [];
  const actions = savedCity.actionLog;
  let actionIndex = 0;

  try {
    for (let turn = 1; turn <= savedCity.turn; turn += 1) {
      if (campaign.phase === "completed")
        throw new Error("actions continue after the campaign ending");
      let planning = createPlanningSession(city);
      const groupStart = actionIndex;
      while (true) {
        const action = actions[actionIndex];
        if (
          action === undefined ||
          action.sequence !== actionIndex ||
          action.turn !== turn
        ) {
          throw new Error("action sequence is not a complete turn history");
        }
        if (action.type === "advance-turn") {
          const planningCity = materializePlanningState(planning);
          const result = simulateTurn({
            city,
            planning,
            network: networkSnapshotForCity(planningCity),
            progression: {
              events: RIVERGATE_FOUNDATIONS_CAMPAIGN.events,
              milestones: RIVERGATE_FOUNDATIONS_CAMPAIGN.milestones,
            },
          });
          const expectedActions = actions.slice(groupStart, actionIndex + 1);
          const actualActions = result.state.actionLog.slice(
            city.actionLog.length,
          );
          if (JSON.stringify(actualActions) !== JSON.stringify(expectedActions))
            throw new Error("turn actions do not reproduce their city state");
          const turnRecord: CompletedTurnRecord = {
            turn: result.state.turn,
            firedEventIds: [...result.firedEventIds],
            earnedMilestoneIds: [...result.earnedMilestoneIds],
            causes: [...result.causes],
          };
          const evidence = {
            turn: result.state.turn,
            firedEventIds: [...result.firedEventIds],
            eventHistory: eventHistoryFor([...history, turnRecord]),
          };
          const nextCampaign = advanceRivergateCampaignState(
            RIVERGATE_FOUNDATIONS_CAMPAIGN,
            result.state,
            campaign,
            evidence,
          );
          if (!nextCampaign.ok) throw new Error("campaign progress is invalid");
          history.push(turnRecord);
          city = result.state;
          campaign = nextCampaign.state;
          actionIndex += 1;
          break;
        }
        planning = replayPlanningAction(planning, action, campaign);
        actionIndex += 1;
      }
    }
    if (actionIndex !== actions.length)
      throw new Error("action history has trailing actions");
  } catch {
    throw new TypeError("Campaign session action log cannot be replayed");
  }

  const ending =
    campaign.phase === "completed"
      ? createRivergateEnding({
          city,
          evidence: {
            turn: city.turn,
            firedEventIds: history.at(-1)?.firedEventIds ?? [],
            eventHistory: eventHistoryFor(history),
          },
          causes: history.flatMap((record) => record.causes),
        })
      : null;
  return { city, campaign, turnHistory: history, ending };
}

function replayPlanningAction(
  planning: PlanningSession,
  action: Exclude<TurnAction, { type: "advance-turn" }>,
  campaign: CampaignProgressState,
): PlanningSession {
  if (action.type === "place-building") {
    const result = placeProvisional(
      planning,
      {
        instanceId: action.instanceId,
        buildingId: action.buildingId,
        anchor: action.anchor,
        rotation: action.rotation,
      },
      { unlockedChapterIds: unlockedChaptersFor(campaign) },
    );
    if (!result.accepted) throw new Error("action is locked or invalid");
    return result.session;
  }
  const result = removeProvisional(planning, action.instanceId);
  if (!result.accepted) throw new Error("action removes a missing building");
  return result.session;
}

function parsePlanning(
  value: unknown,
  city: CityState,
  campaign: CampaignProgressState,
): SerializedPlanning {
  if (!isRecord(value) || !Array.isArray(value.operations))
    throw new TypeError("Campaign session planning state is invalid");
  if (
    !Number.isInteger(value.cursor) ||
    (value.cursor as number) < 0 ||
    (value.cursor as number) > value.operations.length
  ) {
    throw new TypeError("Campaign session planning cursor is invalid");
  }
  let verified = createPlanningSession(city);
  const operations = value.operations.map((operation) => {
    if (!isRecord(operation))
      throw new TypeError("Campaign session operation is invalid");
    if (operation.type === "place") {
      const building = PlacedBuildingSchema.safeParse(operation.building);
      if (!building.success || building.data.placedTurn !== city.turn + 1)
        throw new TypeError("Campaign session placement is invalid");
      const placed = placeProvisional(
        verified,
        {
          instanceId: building.data.instanceId,
          buildingId: building.data.definitionId,
          anchor: building.data.anchor,
          rotation: building.data.rotation,
        },
        { unlockedChapterIds: unlockedChaptersFor(campaign) },
      );
      if (
        !placed.accepted ||
        JSON.stringify(placed.building) !== JSON.stringify(building.data)
      ) {
        throw new TypeError("Campaign session placement is invalid");
      }
      verified = placed.session;
      return { type: "place" as const, building: building.data };
    }
    if (
      operation.type === "remove" &&
      typeof operation.instanceId === "string"
    ) {
      const removed = removeProvisional(verified, operation.instanceId);
      if (!removed.accepted)
        throw new TypeError("Campaign session removal is invalid");
      verified = removed.session;
      return { type: "remove" as const, instanceId: operation.instanceId };
    }
    throw new TypeError("Campaign session operation is invalid");
  });
  const session: PlanningSession = {
    baseState: city,
    operations,
    cursor: value.cursor as number,
  };
  if (!CityStateSchema.safeParse(materializePlanningState(session)).success)
    throw new TypeError("Campaign session plan cannot be materialized");
  return { operations, cursor: session.cursor };
}

function unlockedChaptersFor(
  campaign: CampaignProgressState,
): readonly string[] {
  const chapters = [...RIVERGATE_FOUNDATIONS_CAMPAIGN.chapters].sort(
    (left, right) =>
      left.order - right.order || left.id.localeCompare(right.id),
  );
  if (campaign.phase === "completed")
    return chapters.map((chapter) => chapter.id);
  const currentIndex = chapters.findIndex(
    (chapter) => chapter.id === campaign.chapterId,
  );
  const unlockedCount =
    campaign.phase === "active" ? currentIndex + 1 : currentIndex;
  return chapters
    .slice(0, Math.max(0, unlockedCount))
    .map((chapter) => chapter.id);
}

function invalidSessionField(label: string): never {
  throw new TypeError(`Campaign session ${label} is invalid`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Chapters available to placement validation at the current campaign cursor. */
export function getUnlockedChapterIds(state: GameState): readonly string[] {
  const chapters = [...RIVERGATE_FOUNDATIONS_CAMPAIGN.chapters].sort(
    (left, right) =>
      left.order - right.order || left.id.localeCompare(right.id),
  );
  if (state.campaign.phase === "completed") {
    return chapters.map((chapter) => chapter.id);
  }
  const currentIndex = chapters.findIndex(
    (chapter) => chapter.id === state.campaign.chapterId,
  );
  const unlockedCount =
    state.campaign.phase === "active" ? currentIndex + 1 : currentIndex;
  return chapters
    .slice(0, Math.max(0, unlockedCount))
    .map((chapter) => chapter.id);
}

/** Localized, UI-ready mission content without exposing simulation internals. */
export function getCurrentMission(state: GameState): MissionCard | null {
  if (state.campaign.phase === "completed") return null;
  const view = getCurrentMissionView(
    RIVERGATE_FOUNDATIONS_CAMPAIGN,
    state.city,
    state.campaign,
  );
  return view === null ? null : missionCard(view);
}

/** A child-safe explanation, reflection question, and next-step hint. */
export function getChildFeedback(state: GameState): ChildFeedback | null {
  const latestCause = state.turnHistory.at(-1)?.causes.at(-1);
  if (latestCause !== undefined) {
    const rendered = renderRivergateCause(latestCause, RIVERGATE_EN_MESSAGES);
    if (rendered.ok) {
      return {
        explanation: rendered.value.explanation,
        question: rendered.value.question,
        hint: rendered.value.hint,
      };
    }
  }

  const mission = getCurrentMission(state);
  if (mission === null) return null;
  const nextObjective = mission.objectives.find(
    (objective) => objective.required && !objective.completed,
  );
  return {
    explanation: mission.briefing,
    question: "What will you change in Rivergate to help this mission?",
    hint: nextObjective?.description ?? "Run the city to see what changes.",
  };
}

export function getOverlayView(state: GameState): OverlayView {
  const view = getPlanningView(state.planning);
  const city = view.city;
  const cells: Record<string, OverlayCell> = {};

  if (state.overlay === "validity" || state.overlay === "cost") {
    if (state.selectedBuildingId === null) {
      return {
        id: state.overlay,
        name: OVERLAY_NAMES[state.overlay],
        description: "Select a catalogue item to preview placement and cost.",
        cells,
      };
    }
    const definition = getBuildingDefinition(state.selectedBuildingId);
    for (const tile of city.tiles) {
      const validation = validatePlacement(
        { ...city, budget: view.availableBudget },
        {
          instanceId: "overlay-preview",
          buildingId: state.selectedBuildingId,
          anchor: tile.coordinate,
          rotation: state.rotation,
        },
        { unlockedChapterIds: getUnlockedChapterIds(state) },
      );
      if (state.overlay === "validity") {
        cells[tile.id] = validation.valid
          ? { strength: 1, label: "OK", tone: "good", pattern: "solid" }
          : { strength: 1, label: "NO", tone: "bad", pattern: "cross" };
      } else {
        cells[tile.id] = validation.valid
          ? {
              strength: 0.8,
              label: `$${definition?.constructionCost ?? 0}`,
              tone: "warn",
              pattern: "lines",
            }
          : { strength: 0.25, label: "—", tone: "quiet", pattern: "cross" };
      }
    }
    return {
      id: state.overlay,
      name: OVERLAY_NAMES[state.overlay],
      description:
        state.overlay === "validity"
          ? "OK tiles pass every current simulation placement rule; NO tiles do not."
          : `${buildingName(state.selectedBuildingId)} costs $${definition?.constructionCost ?? 0} to build.`,
      cells,
    };
  }

  if (state.overlay === "flood" || state.overlay === "habitat") {
    for (const tile of city.tiles) {
      const strength =
        state.overlay === "flood" ? tile.floodRisk : tile.habitatValue;
      cells[tile.id] = {
        strength,
        label:
          state.overlay === "flood"
            ? floodLabel(strength)
            : habitatLabel(strength),
        tone:
          state.overlay === "flood"
            ? strength > 0.65
              ? "bad"
              : strength > 0.35
                ? "warn"
                : "good"
            : strength > 0.7
              ? "good"
              : strength > 0.4
                ? "info"
                : "quiet",
        pattern: state.overlay === "flood" ? "lines" : "dots",
      };
    }
    return {
      id: state.overlay,
      name: OVERLAY_NAMES[state.overlay],
      description:
        state.overlay === "flood"
          ? "H is high flood risk, M is medium, and L is low."
          : "H marks high-value habitat, M medium, and L lower-value habitat.",
      cells,
    };
  }

  const analyses = analyzeCityNetworks(city);
  const coverageSets =
    state.overlay === "service"
      ? [analyses.coverage.education, analyses.coverage.healthcare]
      : [
          calculateCoverage(
            city,
            state.overlay === "water"
              ? "water"
              : state.overlay === "electricity"
                ? "electricity"
                : "transport",
          ),
        ];
  for (const analysis of coverageSets) {
    for (const tile of analysis.tiles) {
      const previous = cells[tile.tileId];
      const strength = Math.max(previous?.strength ?? 0, tile.strength);
      cells[tile.tileId] = {
        strength,
        label:
          state.overlay === "service"
            ? "S"
            : state.overlay === "water"
              ? "W"
              : state.overlay === "electricity"
                ? "E"
                : "T",
        tone: "info",
        pattern:
          state.overlay === "electricity"
            ? "cross"
            : state.overlay === "transport"
              ? "lines"
              : "dots",
      };
    }
  }
  return {
    id: state.overlay,
    name: OVERLAY_NAMES[state.overlay],
    description:
      cells && Object.keys(cells).length > 0
        ? "Patterned tiles are currently reached by the provisional city network."
        : "No tiles are reached yet. Place the matching infrastructure to build coverage.",
    cells,
  };
}

export function getSelectedPlacementIssues(
  state: GameState,
  coordinate: Coordinate = state.cursor,
): readonly PlacementIssue[] {
  if (state.selectedBuildingId === null) return [];
  const view = getPlanningView(state.planning);
  const validation = validatePlacement(
    { ...view.city, budget: view.availableBudget },
    {
      instanceId: "keyboard-preview",
      buildingId: state.selectedBuildingId,
      anchor: coordinate,
      rotation: state.rotation,
    },
    { unlockedChapterIds: getUnlockedChapterIds(state) },
  );
  return validation.valid ? [] : validation.issues;
}

export function getCursorSummary(state: GameState): string {
  const city = materializePlanningState(state.planning);
  const tile = city.tiles.find(
    (candidate) =>
      candidate.coordinate.x === state.cursor.x &&
      candidate.coordinate.y === state.cursor.y,
  );
  if (tile === undefined) return "The tile cursor is outside Rivergate.";

  const location = `Tile ${state.cursor.x + 1}, ${state.cursor.y + 1}. ${capitalize(
    tile.terrain,
  )} terrain.`;
  const occupant =
    tile.occupantId === null
      ? "Clear."
      : `${buildingName(
          city.buildings.find(
            (building) => building.instanceId === tile.occupantId,
          )?.definitionId ?? "building",
        )} is here.`;
  if (state.selectedBuildingId === null)
    return `${location} ${occupant} No building selected.`;

  const issues = getSelectedPlacementIssues(state);
  return issues.length === 0
    ? `${location} ${occupant} ${buildingName(
        state.selectedBuildingId,
      )} can be placed here.`
    : `${location} ${occupant} ${buildingName(
        state.selectedBuildingId,
      )} cannot be placed here: ${explainIssue(issues[0])}`;
}

function placeAt(state: GameState, coordinate: Coordinate): GameState {
  if (state.selectedBuildingId === null) {
    return {
      ...state,
      cursor: coordinate,
      status: "Choose an item from the catalogue first.",
    };
  }
  const instanceId = `${state.selectedBuildingId}-${state.city.turn + 1}-${state.planning.cursor + 1}`;
  const result = placeProvisional(
    state.planning,
    {
      instanceId,
      buildingId: state.selectedBuildingId,
      anchor: coordinate,
      rotation: state.rotation,
    },
    { unlockedChapterIds: getUnlockedChapterIds(state) },
  );
  if (!result.accepted) {
    return {
      ...state,
      cursor: coordinate,
      status: explainIssue(result.issues[0]),
    };
  }
  return {
    ...state,
    planning: result.session,
    cursor: coordinate,
    status: `${buildingName(state.selectedBuildingId)} placed provisionally. Run the city when the plan is ready.`,
  };
}

function removeAt(state: GameState, coordinate: Coordinate): GameState {
  const city = materializePlanningState(state.planning);
  const tile = city.tiles.find(
    (candidate) =>
      candidate.coordinate.x === coordinate.x &&
      candidate.coordinate.y === coordinate.y,
  );
  if (tile?.occupantId === null || tile?.occupantId === undefined) {
    return {
      ...state,
      cursor: coordinate,
      status: "There is no building on that tile to remove.",
    };
  }
  const result = removeProvisional(state.planning, tile.occupantId);
  return result.accepted
    ? {
        ...state,
        planning: result.session,
        cursor: coordinate,
        status: `${buildingName(result.removed.definitionId)} marked for removal.`,
      }
    : { ...state, status: "That building could not be removed." };
}

function commitTurn(state: GameState): GameState {
  if (state.campaign.phase === "completed") {
    return {
      ...state,
      status: "Rivergate's story is complete. Your finished city is safe.",
    };
  }
  try {
    const planningCity = materializePlanningState(state.planning);
    const result = simulateTurn({
      city: state.city,
      planning: state.planning,
      network: networkSnapshotForCity(planningCity),
      progression: {
        events: RIVERGATE_FOUNDATIONS_CAMPAIGN.events,
        milestones: RIVERGATE_FOUNDATIONS_CAMPAIGN.milestones,
      },
    });
    const turnRecord: CompletedTurnRecord = {
      turn: result.state.turn,
      firedEventIds: [...result.firedEventIds],
      earnedMilestoneIds: [...result.earnedMilestoneIds],
      causes: [...result.causes],
    };
    const turnHistory = [...state.turnHistory, turnRecord];
    const evidence = {
      turn: result.state.turn,
      firedEventIds: turnRecord.firedEventIds,
      eventHistory: eventHistoryFor(turnHistory),
    };
    const campaignResult = advanceRivergateCampaignState(
      RIVERGATE_FOUNDATIONS_CAMPAIGN,
      result.state,
      state.campaign,
      evidence,
    );
    if (!campaignResult.ok) {
      return {
        ...state,
        status:
          "Rivergate kept your plan, but the mission could not update. Try running the city again.",
      };
    }
    const completed = campaignResult.state.phase === "completed";
    const ending = completed
      ? createRivergateEnding({
          city: result.state,
          evidence,
          causes: turnHistory.flatMap((turn) => turn.causes),
        })
      : state.ending;
    return {
      ...state,
      city: result.state,
      campaign: campaignResult.state,
      turnHistory,
      ending,
      planning: createPlanningSession(result.state),
      status: completed
        ? "Rivergate's story is complete. See what kind of city you built!"
        : campaignStatus(result.state, campaignResult.transition),
    };
  } catch (error) {
    return {
      ...state,
      status: `The turn could not run. ${error instanceof Error ? error.message : "Review the plan and try again."}`,
    };
  }
}

function explainIssue(issue: PlacementIssue | undefined): string {
  const copy: Readonly<Record<string, string>> = {
    OUT_OF_BOUNDS: "Part of this item would sit outside Rivergate.",
    TILE_NOT_PLACEABLE: "This terrain cannot hold a building.",
    OCCUPIED: "Another building already uses that tile.",
    TERRAIN_NOT_ALLOWED: "This item needs a different kind of land.",
    FLOOD_RISK_TOO_HIGH: "Flood risk is too high for this item.",
    MISSING_ADJACENCY: "This item needs the required neighbour nearby.",
    MISSING_CONNECTION: "Connect this item to the required city network first.",
    INSUFFICIENT_BUDGET: "Rivergate does not have enough budget for this item.",
    MISSING_BUILDING_PREREQUISITE:
      "Build the required supporting infrastructure first.",
    CHAPTER_LOCKED: "Finish the current chapter before using this building.",
  };
  return issue === undefined
    ? "That placement does not work yet."
    : (copy[issue.code] ?? "That placement does not work yet.");
}

function missionCard(view: CurrentMissionView): MissionCard {
  return {
    chapterId: view.chapter.id,
    missionId: view.mission.id,
    title: localize(view.mission.titleKey),
    briefing: localize(view.mission.briefingKey),
    objectives: view.objectives.map(({ objective, completed }) => ({
      id: objective.id,
      description: localize(objective.descriptionKey),
      required: objective.required,
      completed,
    })),
    requiredComplete: view.requiredComplete,
  };
}

function localize(key: string): string {
  return RIVERGATE_EN_MESSAGES[key] ?? key;
}

function campaignStatus(
  city: CityState,
  transition: { readonly type: string },
): string {
  switch (transition.type) {
    case "mission-advanced":
      return `Mission complete! Rivergate has $${city.budget.toLocaleString()} remaining.`;
    case "chapter-advanced":
      return `Chapter complete! A new part of Rivergate is ready to build.`;
    case "chapter-unlocked":
      return "A new Rivergate chapter is ready. Choose your next building.";
    default:
      return `Turn ${city.turn} complete. Keep improving the current mission.`;
  }
}

function eventHistoryFor(
  turnHistory: readonly CompletedTurnRecord[],
): readonly {
  readonly turn: number;
  readonly firedEventIds: readonly string[];
}[] {
  return turnHistory.map((turn) => ({
    turn: turn.turn,
    firedEventIds: [...turn.firedEventIds],
  }));
}

function floodLabel(value: number): string {
  return value > 0.65 ? "H" : value > 0.35 ? "M" : "L";
}

function habitatLabel(value: number): string {
  return value > 0.7 ? "H" : value > 0.4 ? "M" : "L";
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function provisionalCost(state: GameState): number {
  const view = getPlanningView(state.planning);
  return state.city.budget - view.availableBudget;
}

export function operationCount(state: GameState): number {
  return state.planning.cursor;
}

export { BUILDING_CATALOGUE };
