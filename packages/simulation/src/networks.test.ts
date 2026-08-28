import { describe, expect, it } from "vitest";

import type {
  CityState,
  PlacedBuilding,
  TileConnections,
  TileState,
} from "@terra/campaign-schema";

import {
  analyzeCityNetworks,
  analyzeNetwork,
  calculateCoverage,
  getCoverageAtTile,
} from "./networks";

describe("city network graphs", () => {
  it("finds stable road components and connects adjacent buildings", () => {
    let city = makeCity(6, 3);
    city = addBuilding(city, building("road-a", "road", 0, 1));
    city = addBuilding(city, building("road-b", "road", 1, 1));
    city = addBuilding(city, building("road-island", "road", 5, 1));
    city = addBuilding(city, building("home-a", "home", 2, 1));

    const analysis = analyzeNetwork(city, "road");

    expect(analysis.nodeTileIds).toEqual(["tile-0-1", "tile-1-1", "tile-5-1"]);
    expect(analysis.edges).toEqual([
      { fromTileId: "tile-0-1", toTileId: "tile-1-1" },
    ]);
    expect(analysis.components.map((component) => component.tileIds)).toEqual([
      ["tile-0-1", "tile-1-1"],
      ["tile-5-1"],
    ]);
    expect(analysis.primaryComponentId).toBe("road:tile-0-1");
    expect(analysis.disconnectedComponentIds).toEqual(["road:tile-5-1"]);
    expect(analysis.connectedBuildingIds).toContain("home-a");
  });

  it("rebuilds road components after infrastructure is moved or removed", () => {
    const base = addBuilding(
      addBuilding(makeCity(5, 2), building("road-a", "road", 0, 0)),
      building("road-b", "road", 1, 0),
    );
    expect(analyzeNetwork(base, "road").components).toHaveLength(1);

    const moved = moveBuilding(base, "road-b", 4, 0);
    expect(analyzeNetwork(moved, "road").components).toHaveLength(2);

    const removed = removeBuilding(moved, "road-b");
    const removedAnalysis = analyzeNetwork(removed, "road");
    expect(removedAnalysis.components).toHaveLength(1);
    expect(removedAnalysis.nodeTileIds).toEqual(["tile-0-0"]);
    expect(
      base.buildings.find((item) => item.instanceId === "road-b")?.anchor,
    ).toEqual({
      x: 1,
      y: 0,
    });
  });

  it("distinguishes sourced water networks from disconnected pipe islands", () => {
    let city = makeCity(7, 2);
    city = addBuilding(city, building("pump", "water-pump", 0, 0));
    city = setConnections(
      city,
      [
        [1, 0],
        [2, 0],
      ],
      "water",
    );
    city = setConnections(city, [[6, 0]], "water");
    city = addBuilding(
      city,
      building("treatment", "water-treatment-plant", 3, 0),
    );

    const analysis = analyzeNetwork(city, "water");

    expect(analysis.components).toHaveLength(2);
    expect(analysis.components[0]?.sourceBuildingInstanceIds).toEqual([
      "pump",
      "treatment",
    ]);
    expect(analysis.components[0]?.sourceConnected).toBe(true);
    expect(analysis.inactiveComponentIds).toEqual(["water:tile-6-0"]);
    expect(
      analysis.buildingStatuses.find(
        (status) => status.buildingInstanceId === "treatment",
      ),
    ).toMatchObject({ connected: true, reason: "connected" });
  });

  it("marks electric consumers inactive until their wire island has a generator", () => {
    let city = makeCity(7, 2);
    city = setConnections(
      city,
      [
        [4, 0],
        [5, 0],
      ],
      "electricity",
    );
    city = addBuilding(city, building("battery", "battery", 6, 0));

    const withoutSource = analyzeNetwork(city, "electricity");
    expect(withoutSource.inactiveComponentIds).toEqual([
      "electricity:tile-4-0",
    ]);
    expect(withoutSource.disconnectedBuildingIds).toEqual(["battery"]);
    expect(withoutSource.buildingStatuses[0]?.reason).toBe(
      "network-has-no-source",
    );

    city = addBuilding(city, building("solar", "solar-array", 3, 0));
    const withSource = analyzeNetwork(city, "electricity");
    expect(withSource.inactiveComponentIds).toEqual([]);
    expect(withSource.connectedBuildingIds).toEqual(["battery", "solar"]);
  });

  it("returns empty deterministic analyses for a city without networks", () => {
    const analysis = analyzeNetwork(makeCity(2, 2), "road");
    expect(analysis).toMatchObject({
      nodeTileIds: [],
      edges: [],
      components: [],
      primaryComponentId: null,
      disconnectedComponentIds: [],
      inactiveComponentIds: [],
    });
  });
});

describe("service coverage", () => {
  it("uses Manhattan radius and stable source ordering", () => {
    let city = makeCity(7, 3);
    city = addBuilding(city, building("school-z", "school", 1, 1));
    city = addBuilding(city, building("school-a", "school", 5, 1));

    const coverage = calculateCoverage(city, "education");

    expect(getCoverageAtTile(coverage, "tile-1-1")).toMatchObject({
      strength: 1,
      nearestDistance: 0,
      sourceBuildingInstanceIds: ["school-a", "school-z"],
    });
    expect(getCoverageAtTile(coverage, "tile-0-0")?.nearestDistance).toBe(2);
    expect(coverage.coveredTileIds).toHaveLength(21);
  });

  it("recalculates coverage after a provider is moved or removed", () => {
    const base = addBuilding(
      makeCity(11, 1),
      building("clinic", "clinic", 0, 0),
    );
    const original = calculateCoverage(base, "healthcare");
    expect(getCoverageAtTile(original, "tile-0-0")).toBeDefined();
    expect(getCoverageAtTile(original, "tile-10-0")).toBeUndefined();

    const moved = moveBuilding(base, "clinic", 10, 0);
    const movedCoverage = calculateCoverage(moved, "healthcare");
    expect(getCoverageAtTile(movedCoverage, "tile-0-0")).toBeUndefined();
    expect(getCoverageAtTile(movedCoverage, "tile-10-0")).toBeDefined();

    const removedCoverage = calculateCoverage(
      removeBuilding(moved, "clinic"),
      "healthcare",
    );
    expect(removedCoverage.coveredTileIds).toEqual([]);
    expect(removedCoverage.buildingCoverage).toEqual([]);
  });

  it("reports coverage for multi-tile buildings and does not mutate the city", () => {
    let city = makeCity(8, 2);
    city = addBuilding(city, building("park", "community-park", 0, 0));
    city = addBuilding(city, building("school", "school", 3, 0));
    const before = structuredClone(city);

    const all = analyzeCityNetworks(city);

    expect(
      all.coverage.nature.buildingCoverage.find(
        (item) => item.buildingInstanceId === "school",
      ),
    ).toMatchObject({ covered: false, strength: 0 });
    expect(all.coverage.education.coveredTileIds).toContain("tile-7-0");
    expect(city).toEqual(before);
  });
});

function makeCity(width: number, height: number): CityState {
  const tiles: TileState[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      tiles.push({
        id: `tile-${x}-${y}`,
        coordinate: { x, y },
        terrain: "meadow",
        elevation: "middle",
        floodRisk: 0.1,
        habitatValue: 0.4,
        placeable: true,
        occupantId: null,
        connections: { road: false, water: false, electricity: false },
      });
    }
  }
  return {
    schemaVersion: 1,
    cityId: "network-test-city",
    campaignId: "test-campaign",
    campaignVersion: 1,
    seed: "network-seed",
    mapId: "network-map",
    mapHash: "0123456789abcdef",
    turn: 0,
    stage: "seed",
    population: 0,
    budget: 10_000,
    tiles,
    buildings: [],
    indicators: {
      water: 0,
      energy: 0,
      nature: 50,
      community: 0,
      resilience: 0,
    },
    resources: {
      water: { rawSupply: 0, treatedSupply: 0, demand: 0 },
      energy: { generation: 0, stored: 0, storageCapacity: 0, demand: 0 },
      waste: { generated: 0, processed: 0 },
      transport: { capacity: 0, demand: 0 },
      housingCapacity: 0,
      maintenanceDue: 0,
    },
    milestones: [],
    actionLog: [],
  };
}

function building(
  instanceId: string,
  definitionId: string,
  x: number,
  y: number,
): PlacedBuilding {
  return {
    instanceId,
    definitionId,
    anchor: { x, y },
    rotation: 0,
    occupiedTileIds: [`tile-${x}-${y}`],
    placedTurn: 0,
  };
}

function addBuilding(city: CityState, placed: PlacedBuilding): CityState {
  const occupied = new Set(placed.occupiedTileIds);
  return {
    ...city,
    buildings: [...city.buildings, placed],
    tiles: city.tiles.map((tile) =>
      occupied.has(tile.id) ? { ...tile, occupantId: placed.instanceId } : tile,
    ),
  };
}

function moveBuilding(
  city: CityState,
  instanceId: string,
  x: number,
  y: number,
): CityState {
  const existing = city.buildings.find(
    (candidate) => candidate.instanceId === instanceId,
  );
  if (existing === undefined) return city;
  const next = {
    ...existing,
    anchor: { x, y },
    occupiedTileIds: [`tile-${x}-${y}`],
  };
  return addBuilding(removeBuilding(city, instanceId), next);
}

function removeBuilding(city: CityState, instanceId: string): CityState {
  return {
    ...city,
    buildings: city.buildings.filter(
      (building) => building.instanceId !== instanceId,
    ),
    tiles: city.tiles.map((tile) =>
      tile.occupantId === instanceId ? { ...tile, occupantId: null } : tile,
    ),
  };
}

function setConnections(
  city: CityState,
  coordinates: readonly (readonly [number, number])[],
  connection: keyof TileConnections,
): CityState {
  const keys = new Set(coordinates.map(([x, y]) => `${x},${y}`));
  return {
    ...city,
    tiles: city.tiles.map((tile) =>
      keys.has(`${tile.coordinate.x},${tile.coordinate.y}`)
        ? {
            ...tile,
            connections: { ...tile.connections, [connection]: true },
          }
        : tile,
    ),
  };
}
