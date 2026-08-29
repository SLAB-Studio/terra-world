import type {
  BuildingDefinition,
  CityState,
  ConnectionType,
  Coordinate,
  PlacedBuilding,
  Rotation,
  TileState,
} from "@terra/campaign-schema";

import { BUILDING_CATALOGUE } from "./catalogue";
import { propagateUtilityConnections } from "./networks";

export const PLACEMENT_REASON_CODES = [
  "UNKNOWN_BUILDING",
  "INVALID_ROTATION",
  "PLACEMENT_ID_CONFLICT",
  "OUT_OF_BOUNDS",
  "TILE_NOT_FOUND",
  "TILE_NOT_PLACEABLE",
  "OCCUPIED",
  "TERRAIN_NOT_ALLOWED",
  "FLOOD_RISK_TOO_HIGH",
  "MISSING_ADJACENCY",
  "MISSING_CONNECTION",
  "INSUFFICIENT_BUDGET",
  "CHAPTER_LOCKED",
  "MISSING_BUILDING_PREREQUISITE",
] as const;

export type PlacementReasonCode = (typeof PLACEMENT_REASON_CODES)[number];

export type PlacementIssue = {
  readonly code: PlacementReasonCode;
  readonly messageKey: string;
  readonly tileIds: readonly string[];
};

export type PlacementRequest = {
  readonly instanceId: string;
  readonly buildingId: string;
  readonly anchor: Coordinate;
  readonly rotation: Rotation;
};

export type PlacementContext = {
  readonly unlockedChapterIds: readonly string[];
  readonly catalogue?: readonly BuildingDefinition[];
};

export type PlacementValidation =
  | {
      readonly valid: true;
      readonly issues: readonly [];
      readonly occupiedTileIds: readonly string[];
    }
  | {
      readonly valid: false;
      readonly issues: readonly PlacementIssue[];
      readonly occupiedTileIds: readonly string[];
    };

export function validatePlacement(
  city: CityState,
  request: PlacementRequest,
  context: PlacementContext,
): PlacementValidation {
  const catalogue = context.catalogue ?? BUILDING_CATALOGUE;
  const definition = catalogue.find(
    (candidate) => candidate.id === request.buildingId,
  );
  if (definition === undefined) {
    return invalid([issue("UNKNOWN_BUILDING")], []);
  }

  const issues: PlacementIssue[] = [];
  if (!definition.allowedRotations.includes(request.rotation)) {
    return invalid([issue("INVALID_ROTATION")], []);
  }
  if (
    city.buildings.some(
      (building) => building.instanceId === request.instanceId,
    )
  ) {
    issues.push(issue("PLACEMENT_ID_CONFLICT"));
  }
  if (city.budget < definition.constructionCost) {
    issues.push(issue("INSUFFICIENT_BUDGET"));
  }

  for (const prerequisite of definition.prerequisites) {
    if (prerequisite.type === "chapter-unlocked") {
      if (!context.unlockedChapterIds.includes(prerequisite.chapterId)) {
        issues.push(issue("CHAPTER_LOCKED"));
      }
    } else {
      const count = city.buildings.filter(
        (building) => building.definitionId === prerequisite.buildingId,
      ).length;
      if (count < prerequisite.minimum) {
        issues.push(issue("MISSING_BUILDING_PREREQUISITE"));
      }
    }
  }

  const coordinateIndex = new Map(
    city.tiles.map((tile) => [coordinateKey(tile.coordinate), tile]),
  );
  const idIndex = new Map(city.tiles.map((tile) => [tile.id, tile]));
  const bounds = getBounds(city.tiles);
  const footprintCoordinates = transformFootprint(
    definition,
    request.anchor,
    request.rotation,
  );
  const footprintTiles: TileState[] = [];

  for (const coordinate of footprintCoordinates) {
    const tile = coordinateIndex.get(coordinateKey(coordinate));
    if (tile === undefined) {
      const outside =
        coordinate.x < bounds.minimumX ||
        coordinate.x > bounds.maximumX ||
        coordinate.y < bounds.minimumY ||
        coordinate.y > bounds.maximumY;
      issues.push(issue(outside ? "OUT_OF_BOUNDS" : "TILE_NOT_FOUND"));
      continue;
    }
    footprintTiles.push(tile);

    if (!tile.placeable) issues.push(issue("TILE_NOT_PLACEABLE", [tile.id]));
    if (tile.occupantId !== null) issues.push(issue("OCCUPIED", [tile.id]));
  }

  for (const rule of definition.placementRules) {
    switch (rule.type) {
      case "terrain-allowed":
        for (const tile of footprintTiles) {
          if (!rule.terrains.includes(tile.terrain)) {
            issues.push(issue("TERRAIN_NOT_ALLOWED", [tile.id]));
          }
        }
        break;
      case "max-flood-risk":
        for (const tile of footprintTiles) {
          if (tile.floodRisk > rule.maximum) {
            issues.push(issue("FLOOD_RISK_TOO_HIGH", [tile.id]));
          }
        }
        break;
      case "requires-adjacent-terrain": {
        const adjacentTiles = getAdjacentTiles(
          footprintCoordinates,
          coordinateIndex,
        );
        const count = adjacentTiles.filter(
          (tile) => tile.terrain === rule.terrain,
        ).length;
        if (count < rule.minimum) issues.push(issue("MISSING_ADJACENCY"));
        break;
      }
      case "requires-adjacent-building": {
        const adjacentTiles = getAdjacentTiles(
          footprintCoordinates,
          coordinateIndex,
        );
        const adjacentDefinitionIds = adjacentTiles
          .map((tile) => tile.occupantId)
          .filter((occupantId): occupantId is string => occupantId !== null)
          .map(
            (occupantId) =>
              city.buildings.find(
                (building) => building.instanceId === occupantId,
              )?.definitionId,
          );
        const count = adjacentDefinitionIds.filter(
          (buildingId) =>
            buildingId !== undefined && rule.buildingIds.includes(buildingId),
        ).length;
        if (count < rule.minimum) issues.push(issue("MISSING_ADJACENCY"));
        break;
      }
      case "requires-connection": {
        const hasConnection = footprintTiles.some(
          (tile) => tile.connections[rule.connection],
        );
        const hasAdjacentRoad =
          rule.connection === "road" &&
          hasAdjacentBuilding(
            "road",
            footprintCoordinates,
            coordinateIndex,
            city,
          );
        if (!hasConnection && !hasAdjacentRoad)
          issues.push(issue("MISSING_CONNECTION"));
        break;
      }
    }
  }

  const occupiedTileIds = footprintTiles.map(
    (tile) => idIndex.get(tile.id)?.id ?? tile.id,
  );
  const uniqueIssues = deduplicateIssues(issues);
  return uniqueIssues.length === 0
    ? { valid: true, issues: [], occupiedTileIds }
    : invalid(uniqueIssues, occupiedTileIds);
}

export type PlanningOperation =
  | { readonly type: "place"; readonly building: PlacedBuilding }
  | { readonly type: "remove"; readonly instanceId: string };

export type PlanningSession = {
  readonly baseState: CityState;
  readonly operations: readonly PlanningOperation[];
  readonly cursor: number;
};

export type PlanningView = {
  readonly city: CityState;
  readonly availableBudget: number;
};

export type ProvisionalPlacementResult =
  | {
      readonly accepted: true;
      readonly session: PlanningSession;
      readonly building: PlacedBuilding;
    }
  | {
      readonly accepted: false;
      readonly session: PlanningSession;
      readonly issues: readonly PlacementIssue[];
    };

export type ProvisionalRemovalResult =
  | {
      readonly accepted: true;
      readonly session: PlanningSession;
      readonly removed: PlacedBuilding;
    }
  | {
      readonly accepted: false;
      readonly session: PlanningSession;
      readonly reason: "BUILDING_NOT_FOUND";
    };

export function createPlanningSession(baseState: CityState): PlanningSession {
  return { baseState, operations: [], cursor: 0 };
}

export function getPlanningView(
  session: PlanningSession,
  catalogue: readonly BuildingDefinition[] = BUILDING_CATALOGUE,
): PlanningView {
  const city = materializePlanningState(session, catalogue);
  const originalIds = new Set(
    session.baseState.buildings.map((building) => building.instanceId),
  );
  const provisionalCost = city.buildings
    .filter((building) => !originalIds.has(building.instanceId))
    .reduce(
      (total, building) =>
        total +
        (catalogue.find((definition) => definition.id === building.definitionId)
          ?.constructionCost ?? 0),
      0,
    );

  return {
    city,
    availableBudget: Math.max(0, session.baseState.budget - provisionalCost),
  };
}

export function placeProvisional(
  session: PlanningSession,
  request: PlacementRequest,
  context: PlacementContext,
): ProvisionalPlacementResult {
  const catalogue = context.catalogue ?? BUILDING_CATALOGUE;
  const view = getPlanningView(session, catalogue);
  const validation = validatePlacement(
    { ...view.city, budget: view.availableBudget },
    request,
    { ...context, catalogue },
  );

  if (!validation.valid) {
    return { accepted: false, session, issues: validation.issues };
  }

  const building: PlacedBuilding = {
    instanceId: request.instanceId,
    definitionId: request.buildingId,
    anchor: request.anchor,
    rotation: request.rotation,
    occupiedTileIds: [...validation.occupiedTileIds],
    placedTurn: session.baseState.turn + 1,
  };
  return {
    accepted: true,
    building,
    session: appendOperation(session, { type: "place", building }),
  };
}

export function removeProvisional(
  session: PlanningSession,
  instanceId: string,
): ProvisionalRemovalResult {
  const city = materializePlanningState(session);
  const building = city.buildings.find(
    (candidate) => candidate.instanceId === instanceId,
  );
  if (building === undefined) {
    return { accepted: false, session, reason: "BUILDING_NOT_FOUND" };
  }
  return {
    accepted: true,
    removed: building,
    session: appendOperation(session, { type: "remove", instanceId }),
  };
}

export function undoProvisional(session: PlanningSession): PlanningSession {
  if (session.cursor === 0) return session;
  return { ...session, cursor: session.cursor - 1 };
}

export function redoProvisional(session: PlanningSession): PlanningSession {
  if (session.cursor === session.operations.length) return session;
  return { ...session, cursor: session.cursor + 1 };
}

export function materializePlanningState(
  session: PlanningSession,
  catalogue: readonly BuildingDefinition[] = BUILDING_CATALOGUE,
): CityState {
  const city = session.operations
    .slice(0, session.cursor)
    .reduce<CityState>(
      (city, operation) => applyPlanningOperation(city, operation),
      session.baseState,
    );
  return propagateUtilityConnections(city, catalogue);
}

export function transformFootprint(
  definition: BuildingDefinition,
  anchor: Coordinate,
  rotation: Rotation,
): Coordinate[] {
  return definition.footprint.map((offset) => {
    const rotated = rotate(offset.dx, offset.dy, rotation);
    return { x: anchor.x + rotated.x, y: anchor.y + rotated.y };
  });
}

function applyPlanningOperation(
  city: CityState,
  operation: PlanningOperation,
): CityState {
  if (operation.type === "place") {
    const occupied = new Set(operation.building.occupiedTileIds);
    return {
      ...city,
      buildings: [...city.buildings, operation.building],
      tiles: city.tiles.map((tile) =>
        occupied.has(tile.id)
          ? { ...tile, occupantId: operation.building.instanceId }
          : tile,
      ),
    };
  }

  const removed = city.buildings.find(
    (building) => building.instanceId === operation.instanceId,
  );
  if (removed === undefined) return city;
  const vacated = new Set(removed.occupiedTileIds);
  return {
    ...city,
    buildings: city.buildings.filter(
      (building) => building.instanceId !== operation.instanceId,
    ),
    tiles: city.tiles.map((tile) =>
      vacated.has(tile.id) && tile.occupantId === operation.instanceId
        ? { ...tile, occupantId: null }
        : tile,
    ),
  };
}

function appendOperation(
  session: PlanningSession,
  operation: PlanningOperation,
): PlanningSession {
  const retainedOperations = session.operations.slice(0, session.cursor);
  return {
    ...session,
    operations: [...retainedOperations, operation],
    cursor: retainedOperations.length + 1,
  };
}

function rotate(dx: number, dy: number, rotation: Rotation): Coordinate {
  switch (rotation) {
    case 0:
      return { x: dx, y: dy };
    case 90:
      return { x: -dy, y: dx };
    case 180:
      return { x: -dx, y: -dy };
    case 270:
      return { x: dy, y: -dx };
  }
}

function getAdjacentTiles(
  footprint: readonly Coordinate[],
  tileIndex: ReadonlyMap<string, TileState>,
): TileState[] {
  const footprintKeys = new Set(footprint.map(coordinateKey));
  const adjacent = new Map<string, TileState>();
  for (const coordinate of footprint) {
    for (const candidate of [
      { x: coordinate.x - 1, y: coordinate.y },
      { x: coordinate.x + 1, y: coordinate.y },
      { x: coordinate.x, y: coordinate.y - 1 },
      { x: coordinate.x, y: coordinate.y + 1 },
    ]) {
      const key = coordinateKey(candidate);
      const tile = tileIndex.get(key);
      if (!footprintKeys.has(key) && tile !== undefined)
        adjacent.set(tile.id, tile);
    }
  }
  return [...adjacent.values()];
}

function hasAdjacentBuilding(
  definitionId: string,
  footprint: readonly Coordinate[],
  tileIndex: ReadonlyMap<string, TileState>,
  city: CityState,
): boolean {
  const buildingById = new Map(
    city.buildings.map((building) => [building.instanceId, building]),
  );
  return getAdjacentTiles(footprint, tileIndex).some((tile) => {
    if (tile.occupantId === null) return false;
    return buildingById.get(tile.occupantId)?.definitionId === definitionId;
  });
}

function getBounds(tiles: readonly TileState[]): {
  minimumX: number;
  maximumX: number;
  minimumY: number;
  maximumY: number;
} {
  return tiles.reduce(
    (bounds, tile) => ({
      minimumX: Math.min(bounds.minimumX, tile.coordinate.x),
      maximumX: Math.max(bounds.maximumX, tile.coordinate.x),
      minimumY: Math.min(bounds.minimumY, tile.coordinate.y),
      maximumY: Math.max(bounds.maximumY, tile.coordinate.y),
    }),
    {
      minimumX: Infinity,
      maximumX: -Infinity,
      minimumY: Infinity,
      maximumY: -Infinity,
    },
  );
}

function coordinateKey(coordinate: Coordinate): string {
  return `${coordinate.x},${coordinate.y}`;
}

function issue(
  code: PlacementReasonCode,
  tileIds: readonly string[] = [],
): PlacementIssue {
  return {
    code,
    messageKey: `placement.${code.toLowerCase().replaceAll("_", "-")}`,
    tileIds,
  };
}

function invalid(
  issues: readonly PlacementIssue[],
  occupiedTileIds: readonly string[],
): PlacementValidation {
  return { valid: false, issues, occupiedTileIds };
}

function deduplicateIssues(
  issues: readonly PlacementIssue[],
): PlacementIssue[] {
  const unique = new Map<string, PlacementIssue>();
  for (const current of issues) {
    unique.set(`${current.code}:${current.tileIds.join(",")}`, current);
  }
  return [...unique.values()];
}

export function isConnected(
  tile: TileState,
  connection: ConnectionType,
): boolean {
  return tile.connections[connection];
}
