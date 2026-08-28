import type { CityState, Coordinate, Rotation } from "@terra/campaign-schema";
import {
  BUILDING_CATALOGUE,
  analyzeCityNetworks,
  calculateCoverage,
  createInitialCityState,
  createPlanningSession,
  createRiverValleyWorld,
  getBuildingDefinition,
  getPlanningView,
  materializePlanningState,
  placeProvisional,
  removeProvisional,
  networkSnapshotForCity,
  simulateTurn,
  undoProvisional,
  validatePlacement,
  type PlacementIssue,
  type PlanningSession,
} from "@terra/simulation";

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
  readonly planning: PlanningSession;
  readonly selectedBuildingId: string | null;
  readonly rotation: Rotation;
  readonly cursor: Coordinate;
  readonly overlay: OverlayId;
  readonly status: string;
};

export type GameAction =
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
    cityId: "rivergate-developer-city",
    campaignId: "rivergate-v1",
    campaignVersion: 1,
    budget: 8_000,
  });
  return {
    city,
    planning: createPlanningSession(city),
    selectedBuildingId: "road",
    rotation: 0,
    cursor: { x: 8, y: 6 },
    overlay: "validity",
    status: "Road selected. Choose a clear tile to begin planning.",
  };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
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
        { unlockedChapterIds: ALL_CHAPTERS },
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
    { unlockedChapterIds: ALL_CHAPTERS },
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
    { unlockedChapterIds: ALL_CHAPTERS },
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
  if (state.planning.cursor === 0) {
    return {
      ...state,
      status: "Plan at least one change before running the city.",
    };
  }
  try {
    const planningCity = materializePlanningState(state.planning);
    const result = simulateTurn({
      city: state.city,
      planning: state.planning,
      network: networkSnapshotForCity(planningCity),
    });
    return {
      ...state,
      city: result.state,
      planning: createPlanningSession(result.state),
      status: `Turn ${result.state.turn} complete. Rivergate has $${result.state.budget.toLocaleString()} remaining.`,
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
  };
  return issue === undefined
    ? "That placement does not work yet."
    : (copy[issue.code] ?? "That placement does not work yet.");
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
