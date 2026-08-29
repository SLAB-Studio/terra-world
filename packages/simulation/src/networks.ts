import type {
  BuildingDefinition,
  CityState,
  ConnectionType,
  CoverageDefinition,
  PlacedBuilding,
  ResourceKind,
  TileState,
} from "@terra/campaign-schema";

import { BUILDING_CATALOGUE } from "./catalogue";

export type CoverageResource = CoverageDefinition["resource"];

export type NetworkEdge = {
  readonly fromTileId: string;
  readonly toTileId: string;
};

export type NetworkComponent = {
  readonly id: string;
  readonly tileIds: readonly string[];
  readonly buildingInstanceIds: readonly string[];
  readonly sourceBuildingInstanceIds: readonly string[];
  /** Roads are usable locally. Water and electricity require a source. */
  readonly sourceConnected: boolean;
};

export type BuildingNetworkStatus = {
  readonly buildingInstanceId: string;
  readonly componentIds: readonly string[];
  readonly connected: boolean;
  readonly reason:
    "connected" | "no-adjacent-network" | "network-has-no-source";
};

export type NetworkAnalysis = {
  readonly connection: ConnectionType;
  readonly nodeTileIds: readonly string[];
  readonly edges: readonly NetworkEdge[];
  readonly components: readonly NetworkComponent[];
  /** The largest component, with a stable tile-id tie break. */
  readonly primaryComponentId: string | null;
  /** Every topologically separate component outside the primary component. */
  readonly disconnectedComponentIds: readonly string[];
  /** Utility islands without a producer. Roads never have inactive components. */
  readonly inactiveComponentIds: readonly string[];
  readonly buildingStatuses: readonly BuildingNetworkStatus[];
  readonly connectedBuildingIds: readonly string[];
  readonly disconnectedBuildingIds: readonly string[];
};

export type TileCoverage = {
  readonly tileId: string;
  readonly strength: number;
  readonly nearestDistance: number;
  readonly sourceBuildingInstanceIds: readonly string[];
};

export type BuildingCoverage = {
  readonly buildingInstanceId: string;
  readonly covered: boolean;
  readonly strength: number;
  readonly sourceBuildingInstanceIds: readonly string[];
};

export type CoverageAnalysis = {
  readonly resource: CoverageResource;
  readonly tiles: readonly TileCoverage[];
  readonly coveredTileIds: readonly string[];
  readonly buildingCoverage: readonly BuildingCoverage[];
};

export type CityNetworkAnalysis = {
  readonly road: NetworkAnalysis;
  readonly water: NetworkAnalysis;
  readonly electricity: NetworkAnalysis;
  readonly coverage: Readonly<Record<CoverageResource, CoverageAnalysis>>;
};

const CONNECTIONS = ["road", "water", "electricity"] as const;
const COVERAGE_RESOURCES = [
  "water",
  "electricity",
  "education",
  "healthcare",
  "transport",
  "nature",
] as const satisfies readonly CoverageResource[];

/**
 * Rebuilds one transport or utility graph from the supplied city snapshot.
 * No graph state is cached in CityState, so moving or removing infrastructure
 * is reflected by the next analysis without a migration or cleanup step.
 */
export function analyzeNetwork(
  city: CityState,
  connection: ConnectionType,
  catalogue: readonly BuildingDefinition[] = BUILDING_CATALOGUE,
): NetworkAnalysis {
  const definitionById = indexDefinitions(catalogue);
  const buildingByInstanceId = new Map(
    city.buildings.map((building) => [building.instanceId, building]),
  );
  const tileById = new Map(city.tiles.map((tile) => [tile.id, tile]));
  const tileByCoordinate = new Map(
    city.tiles.map((tile) => [coordinateKey(tile), tile]),
  );
  const nodeTiles = city.tiles
    .filter((tile) =>
      isNetworkNode(tile, connection, buildingByInstanceId, definitionById),
    )
    .sort(compareTiles);
  const nodeIds = new Set(nodeTiles.map((tile) => tile.id));
  const edges = buildEdges(nodeTiles, nodeIds, tileByCoordinate);
  const rawComponents = buildComponents(connection, nodeTiles, edges);

  const components = rawComponents.map((component) => {
    const buildingIds = buildingsOnTiles(
      component.tileIds,
      tileById,
      buildingByInstanceId,
    );
    const sourceIds = buildingIds.filter((instanceId) => {
      const building = buildingByInstanceId.get(instanceId);
      const definition =
        building === undefined
          ? undefined
          : definitionById.get(building.definitionId);
      return (
        definition !== undefined && isNetworkSource(definition, connection)
      );
    });
    return {
      ...component,
      buildingInstanceIds: buildingIds,
      sourceBuildingInstanceIds: sourceIds,
      sourceConnected: connection === "road" || sourceIds.length > 0,
    };
  });

  const primary = [...components].sort(
    (left, right) =>
      right.tileIds.length - left.tileIds.length ||
      left.id.localeCompare(right.id),
  )[0];
  const primaryComponentId = primary?.id ?? null;
  const componentByTileId = new Map<string, NetworkComponent>();
  for (const component of components) {
    for (const tileId of component.tileIds)
      componentByTileId.set(tileId, component);
  }

  const statuses = city.buildings
    .filter((building) => {
      const definition = definitionById.get(building.definitionId);
      return (
        definition !== undefined &&
        participatesInNetwork(definition, connection)
      );
    })
    .sort((left, right) => left.instanceId.localeCompare(right.instanceId))
    .map((building) =>
      getBuildingNetworkStatus(
        building,
        connection,
        tileById,
        tileByCoordinate,
        componentByTileId,
      ),
    );

  return {
    connection,
    nodeTileIds: nodeTiles.map((tile) => tile.id),
    edges,
    components,
    primaryComponentId,
    disconnectedComponentIds: components
      .filter((component) => component.id !== primaryComponentId)
      .map((component) => component.id),
    inactiveComponentIds: components
      .filter((component) => !component.sourceConnected)
      .map((component) => component.id),
    buildingStatuses: statuses,
    connectedBuildingIds: statuses
      .filter((status) => status.connected)
      .map((status) => status.buildingInstanceId),
    disconnectedBuildingIds: statuses
      .filter((status) => !status.connected)
      .map((status) => status.buildingInstanceId),
  };
}

/** Calculates geometric service coverage using Manhattan distance on the tile grid. */
export function calculateCoverage(
  city: CityState,
  resource: CoverageResource,
  catalogue: readonly BuildingDefinition[] = BUILDING_CATALOGUE,
): CoverageAnalysis {
  const definitionById = indexDefinitions(catalogue);
  const tileById = new Map(city.tiles.map((tile) => [tile.id, tile]));
  const sources = city.buildings
    .map((building) => ({
      building,
      definition: definitionById.get(building.definitionId),
    }))
    .filter(
      (
        entry,
      ): entry is {
        building: PlacedBuilding;
        definition: BuildingDefinition & { coverage: CoverageDefinition };
      } => entry.definition?.coverage?.resource === resource,
    )
    .sort((left, right) =>
      left.building.instanceId.localeCompare(right.building.instanceId),
    );

  const coveredTiles: TileCoverage[] = [];
  for (const tile of [...city.tiles].sort(compareTiles)) {
    const hits = sources
      .map(({ building, definition }) => {
        const nearestDistance = nearestBuildingDistance(
          building,
          tile,
          tileById,
        );
        return {
          buildingInstanceId: building.instanceId,
          nearestDistance,
          strength: definition.coverage.strength,
          radius: definition.coverage.radius,
        };
      })
      .filter((hit) => hit.nearestDistance <= hit.radius);

    if (hits.length === 0) continue;
    coveredTiles.push({
      tileId: tile.id,
      strength: Math.max(...hits.map((hit) => hit.strength)),
      nearestDistance: Math.min(...hits.map((hit) => hit.nearestDistance)),
      sourceBuildingInstanceIds: hits.map((hit) => hit.buildingInstanceId),
    });
  }

  const coverageByTileId = new Map(
    coveredTiles.map((coverage) => [coverage.tileId, coverage]),
  );
  const buildingCoverage = [...city.buildings]
    .sort((left, right) => left.instanceId.localeCompare(right.instanceId))
    .map((building) => {
      const tileCoverage = building.occupiedTileIds
        .map((tileId) => coverageByTileId.get(tileId))
        .filter((coverage): coverage is TileCoverage => coverage !== undefined);
      const sourceIds = new Set<string>();
      for (const coverage of tileCoverage) {
        for (const sourceId of coverage.sourceBuildingInstanceIds)
          sourceIds.add(sourceId);
      }
      return {
        buildingInstanceId: building.instanceId,
        covered: tileCoverage.length > 0,
        strength:
          tileCoverage.length === 0
            ? 0
            : Math.max(...tileCoverage.map((coverage) => coverage.strength)),
        sourceBuildingInstanceIds: [...sourceIds].sort(),
      };
    });

  return {
    resource,
    tiles: coveredTiles,
    coveredTileIds: coveredTiles.map((coverage) => coverage.tileId),
    buildingCoverage,
  };
}

export function analyzeCityNetworks(
  city: CityState,
  catalogue: readonly BuildingDefinition[] = BUILDING_CATALOGUE,
): CityNetworkAnalysis {
  const networks = Object.fromEntries(
    CONNECTIONS.map((connection) => [
      connection,
      analyzeNetwork(city, connection, catalogue),
    ]),
  ) as Record<ConnectionType, NetworkAnalysis>;
  const coverage = Object.fromEntries(
    COVERAGE_RESOURCES.map((resource) => [
      resource,
      calculateCoverage(city, resource, catalogue),
    ]),
  ) as Record<CoverageResource, CoverageAnalysis>;

  return {
    road: networks.road,
    water: networks.water,
    electricity: networks.electricity,
    coverage,
  };
}

/**
 * Rebuilds persisted utility access from the current provider coverage.
 *
 * Roads are built as individual structures, but water and electricity have no
 * separate build operation. Their tile flags therefore represent the current
 * reach of the placed utility providers. Recalculating both flags together
 * keeps placement checks, turn simulation, undo/redo, and replay on the same
 * deterministic city snapshot.
 */
export function propagateUtilityConnections(
  city: CityState,
  catalogue: readonly BuildingDefinition[] = BUILDING_CATALOGUE,
): CityState {
  const waterTileIds = new Set(
    calculateCoverage(city, "water", catalogue).coveredTileIds,
  );
  const electricityTileIds = new Set(
    calculateCoverage(city, "electricity", catalogue).coveredTileIds,
  );

  const tiles = city.tiles.map((tile) => {
    const water = waterTileIds.has(tile.id);
    const electricity = electricityTileIds.has(tile.id);
    if (
      tile.connections.water === water &&
      tile.connections.electricity === electricity
    ) {
      return tile;
    }
    return {
      ...tile,
      connections: { ...tile.connections, water, electricity },
    };
  });

  return tiles.every((tile, index) => tile === city.tiles[index])
    ? city
    : { ...city, tiles };
}

export function getCoverageAtTile(
  coverage: CoverageAnalysis,
  tileId: string,
): TileCoverage | undefined {
  return coverage.tiles.find((tile) => tile.tileId === tileId);
}

function indexDefinitions(
  catalogue: readonly BuildingDefinition[],
): ReadonlyMap<string, BuildingDefinition> {
  return new Map(catalogue.map((definition) => [definition.id, definition]));
}

function isNetworkNode(
  tile: TileState,
  connection: ConnectionType,
  buildingByInstanceId: ReadonlyMap<string, PlacedBuilding>,
  definitionById: ReadonlyMap<string, BuildingDefinition>,
): boolean {
  if (tile.connections[connection]) return true;
  if (tile.occupantId === null) return false;
  const building = buildingByInstanceId.get(tile.occupantId);
  const definition =
    building === undefined
      ? undefined
      : definitionById.get(building.definitionId);
  return definition !== undefined && isInfrastructure(definition, connection);
}

function isInfrastructure(
  definition: BuildingDefinition,
  connection: ConnectionType,
): boolean {
  if (connection === "road") return definition.id === "road";
  if (connection === "water") {
    return (
      definition.coverage?.resource === "water" ||
      definition.outputs.some(({ resource }) =>
        ["raw-water", "clean-water"].includes(resource),
      )
    );
  }
  return (
    definition.coverage?.resource === "electricity" ||
    definition.outputs.some(({ resource }) =>
      ["electricity", "electricity-storage"].includes(resource),
    )
  );
}

function isNetworkSource(
  definition: BuildingDefinition,
  connection: ConnectionType,
): boolean {
  if (connection === "road") return false;
  const sourceResources: readonly ResourceKind[] =
    connection === "water" ? ["raw-water", "clean-water"] : ["electricity"];
  return definition.outputs.some(({ resource }) =>
    sourceResources.includes(resource),
  );
}

function participatesInNetwork(
  definition: BuildingDefinition,
  connection: ConnectionType,
): boolean {
  if (isInfrastructure(definition, connection)) return true;
  if (
    definition.placementRules.some(
      (rule) =>
        rule.type === "requires-connection" && rule.connection === connection,
    )
  )
    return true;
  const inputResources: readonly ResourceKind[] =
    connection === "water"
      ? ["raw-water", "clean-water"]
      : connection === "electricity"
        ? ["electricity"]
        : [];
  return definition.inputs.some(({ resource }) =>
    inputResources.includes(resource),
  );
}

function buildEdges(
  nodeTiles: readonly TileState[],
  nodeIds: ReadonlySet<string>,
  tileByCoordinate: ReadonlyMap<string, TileState>,
): NetworkEdge[] {
  const edges: NetworkEdge[] = [];
  for (const tile of nodeTiles) {
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ] as const) {
      const neighbour = tileByCoordinate.get(
        `${tile.coordinate.x + dx},${tile.coordinate.y + dy}`,
      );
      if (neighbour !== undefined && nodeIds.has(neighbour.id)) {
        edges.push({ fromTileId: tile.id, toTileId: neighbour.id });
      }
    }
  }
  return edges.sort((left, right) =>
    edgeKey(left).localeCompare(edgeKey(right)),
  );
}

function buildComponents(
  connection: ConnectionType,
  nodeTiles: readonly TileState[],
  edges: readonly NetworkEdge[],
): Array<{
  id: string;
  tileIds: string[];
  buildingInstanceIds: string[];
  sourceBuildingInstanceIds: string[];
  sourceConnected: boolean;
}> {
  const neighbours = new Map<string, string[]>();
  for (const tile of nodeTiles) neighbours.set(tile.id, []);
  for (const edge of edges) {
    neighbours.get(edge.fromTileId)?.push(edge.toTileId);
    neighbours.get(edge.toTileId)?.push(edge.fromTileId);
  }
  for (const adjacent of neighbours.values()) adjacent.sort();

  const visited = new Set<string>();
  const components: Array<{
    id: string;
    tileIds: string[];
    buildingInstanceIds: string[];
    sourceBuildingInstanceIds: string[];
    sourceConnected: boolean;
  }> = [];
  for (const tile of nodeTiles) {
    if (visited.has(tile.id)) continue;
    const queue = [tile.id];
    const tileIds: string[] = [];
    visited.add(tile.id);
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      tileIds.push(current);
      for (const neighbour of neighbours.get(current) ?? []) {
        if (visited.has(neighbour)) continue;
        visited.add(neighbour);
        queue.push(neighbour);
      }
    }
    tileIds.sort();
    components.push({
      id: `${connection}:${tileIds[0]}`,
      tileIds,
      buildingInstanceIds: [],
      sourceBuildingInstanceIds: [],
      sourceConnected: connection === "road",
    });
  }
  return components.sort((left, right) => left.id.localeCompare(right.id));
}

function buildingsOnTiles(
  tileIds: readonly string[],
  tileById: ReadonlyMap<string, TileState>,
  buildingByInstanceId: ReadonlyMap<string, PlacedBuilding>,
): string[] {
  const ids = new Set<string>();
  for (const tileId of tileIds) {
    const occupantId = tileById.get(tileId)?.occupantId;
    if (occupantId !== null && occupantId !== undefined) ids.add(occupantId);
  }
  return [...ids]
    .filter((id) => buildingByInstanceId.has(id))
    .sort((left, right) => left.localeCompare(right));
}

function getBuildingNetworkStatus(
  building: PlacedBuilding,
  connection: ConnectionType,
  tileById: ReadonlyMap<string, TileState>,
  tileByCoordinate: ReadonlyMap<string, TileState>,
  componentByTileId: ReadonlyMap<string, NetworkComponent>,
): BuildingNetworkStatus {
  const componentIds = new Set<string>();
  for (const tileId of building.occupiedTileIds) {
    const tile = tileById.get(tileId);
    if (tile === undefined) continue;
    const candidates = [
      tile,
      ...orthogonalCoordinates(tile).flatMap((coordinate) => {
        const adjacent = tileByCoordinate.get(coordinate);
        return adjacent === undefined ? [] : [adjacent];
      }),
    ];
    for (const candidate of candidates) {
      const component = componentByTileId.get(candidate.id);
      if (component !== undefined) componentIds.add(component.id);
    }
  }
  const sortedComponentIds = [...componentIds].sort();
  if (sortedComponentIds.length === 0) {
    return {
      buildingInstanceId: building.instanceId,
      componentIds: [],
      connected: false,
      reason: "no-adjacent-network",
    };
  }
  const connected =
    connection === "road" ||
    sortedComponentIds.some((componentId) =>
      [...componentByTileId.values()].some(
        (component) =>
          component.id === componentId && component.sourceConnected,
      ),
    );
  return {
    buildingInstanceId: building.instanceId,
    componentIds: sortedComponentIds,
    connected,
    reason: connected ? "connected" : "network-has-no-source",
  };
}

function nearestBuildingDistance(
  building: PlacedBuilding,
  target: TileState,
  tileById: ReadonlyMap<string, TileState>,
): number {
  const distances = building.occupiedTileIds.flatMap((tileId) => {
    const source = tileById.get(tileId);
    return source === undefined
      ? []
      : [
          Math.abs(source.coordinate.x - target.coordinate.x) +
            Math.abs(source.coordinate.y - target.coordinate.y),
        ];
  });
  return distances.length === 0
    ? Number.POSITIVE_INFINITY
    : Math.min(...distances);
}

function orthogonalCoordinates(tile: TileState): string[] {
  return [
    `${tile.coordinate.x - 1},${tile.coordinate.y}`,
    `${tile.coordinate.x + 1},${tile.coordinate.y}`,
    `${tile.coordinate.x},${tile.coordinate.y - 1}`,
    `${tile.coordinate.x},${tile.coordinate.y + 1}`,
  ];
}

function coordinateKey(tile: TileState): string {
  return `${tile.coordinate.x},${tile.coordinate.y}`;
}

function compareTiles(left: TileState, right: TileState): number {
  return (
    left.coordinate.y - right.coordinate.y ||
    left.coordinate.x - right.coordinate.x ||
    left.id.localeCompare(right.id)
  );
}

function edgeKey(edge: NetworkEdge): string {
  return `${edge.fromTileId}:${edge.toTileId}`;
}
