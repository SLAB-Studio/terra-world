import { describe, expect, it } from "vitest";

import type {
  BuildingDefinition,
  CityState,
  PlacedBuilding,
  TerrainType,
  TileState,
} from "@terra/campaign-schema";

import { BUILDING_CATALOGUE } from "./catalogue";
import {
  createPlanningSession,
  getPlanningView,
  materializePlanningState,
  placeProvisional,
  redoProvisional,
  removeProvisional,
  transformFootprint,
  undoProvisional,
  validatePlacement,
  type PlacementReasonCode,
} from "./placement";

const ALL_CHAPTERS = [
  "chapter-1-water",
  "chapter-2-power",
  "chapter-3-care",
  "chapter-4-growth",
  "chapter-5-storm",
];

describe("placement validation", () => {
  it.each(BUILDING_CATALOGUE)(
    "validly places $id without mutating the city",
    (definition) => {
      const city = cityForBuilding(definition);
      const before = structuredClone(city);
      const result = validatePlacement(
        city,
        {
          instanceId: `${definition.id}-new`,
          buildingId: definition.id,
          anchor: { x: 2, y: 2 },
          rotation: 0,
        },
        { unlockedChapterIds: ALL_CHAPTERS },
      );

      expect(
        result,
        result.valid ? undefined : JSON.stringify(result.issues),
      ).toMatchObject({ valid: true });
      expect(result.occupiedTileIds).toHaveLength(definition.footprint.length);
      expect(city).toEqual(before);
    },
  );

  it.each([
    {
      name: "unknown building",
      code: "UNKNOWN_BUILDING" as const,
      city: () => makeCity(),
      request: {
        instanceId: "new",
        buildingId: "unknown",
        anchor: { x: 2, y: 2 },
        rotation: 0 as const,
      },
      chapters: ALL_CHAPTERS,
    },
    {
      name: "invalid rotation",
      code: "INVALID_ROTATION" as const,
      city: () => makeCity(),
      request: {
        instanceId: "new",
        buildingId: "home",
        anchor: { x: 2, y: 2 },
        rotation: 90 as const,
      },
      chapters: ALL_CHAPTERS,
    },
    {
      name: "duplicate instance id",
      code: "PLACEMENT_ID_CONFLICT" as const,
      city: () =>
        addBuilding(
          makeCity(),
          placed("new", "road", "tile-0-0", { x: 0, y: 0 }),
        ),
      request: {
        instanceId: "new",
        buildingId: "community-park",
        anchor: { x: 2, y: 2 },
        rotation: 0 as const,
      },
      chapters: ALL_CHAPTERS,
    },
    {
      name: "map bounds",
      code: "OUT_OF_BOUNDS" as const,
      city: () => makeCity(),
      request: {
        instanceId: "new",
        buildingId: "community-park",
        anchor: { x: 5, y: 5 },
        rotation: 0 as const,
      },
      chapters: ALL_CHAPTERS,
    },
    {
      name: "missing tile in map",
      code: "TILE_NOT_FOUND" as const,
      city: () => ({
        ...makeCity(),
        tiles: makeCity().tiles.filter((tile) => tile.id !== "tile-2-2"),
      }),
      request: {
        instanceId: "new",
        buildingId: "community-park",
        anchor: { x: 2, y: 2 },
        rotation: 0 as const,
      },
      chapters: ALL_CHAPTERS,
    },
    {
      name: "non-placeable tile",
      code: "TILE_NOT_PLACEABLE" as const,
      city: () => patchTile(makeCity(), 2, 2, { placeable: false }),
      request: {
        instanceId: "new",
        buildingId: "community-park",
        anchor: { x: 2, y: 2 },
        rotation: 0 as const,
      },
      chapters: ALL_CHAPTERS,
    },
    {
      name: "occupied tile",
      code: "OCCUPIED" as const,
      city: () =>
        addBuilding(
          makeCity(),
          placed("road-existing", "road", "tile-2-2", { x: 2, y: 2 }),
        ),
      request: {
        instanceId: "new",
        buildingId: "community-park",
        anchor: { x: 2, y: 2 },
        rotation: 0 as const,
      },
      chapters: ALL_CHAPTERS,
    },
    {
      name: "terrain rule",
      code: "TERRAIN_NOT_ALLOWED" as const,
      city: () =>
        patchTile(makeCity(), 2, 2, { terrain: "rock", placeable: true }),
      request: {
        instanceId: "new",
        buildingId: "community-park",
        anchor: { x: 2, y: 2 },
        rotation: 0 as const,
      },
      chapters: ALL_CHAPTERS,
    },
    {
      name: "flood rule",
      code: "FLOOD_RISK_TOO_HIGH" as const,
      city: () => patchTile(makeCity(), 2, 2, { floodRisk: 0.9 }),
      request: {
        instanceId: "new",
        buildingId: "community-park",
        anchor: { x: 2, y: 2 },
        rotation: 0 as const,
      },
      chapters: ALL_CHAPTERS,
    },
    {
      name: "adjacency rule",
      code: "MISSING_ADJACENCY" as const,
      city: () =>
        patchTile(makeCity(), 2, 2, { terrain: "floodplain", floodRisk: 0.4 }),
      request: {
        instanceId: "new",
        buildingId: "water-pump",
        anchor: { x: 2, y: 2 },
        rotation: 0 as const,
      },
      chapters: ALL_CHAPTERS,
    },
    {
      name: "connection rule",
      code: "MISSING_CONNECTION" as const,
      city: () => makeCity(),
      request: {
        instanceId: "new",
        buildingId: "home",
        anchor: { x: 2, y: 2 },
        rotation: 0 as const,
      },
      chapters: ALL_CHAPTERS,
    },
    {
      name: "budget",
      code: "INSUFFICIENT_BUDGET" as const,
      city: () => ({ ...makeCity(), budget: 0 }),
      request: {
        instanceId: "new",
        buildingId: "community-park",
        anchor: { x: 2, y: 2 },
        rotation: 0 as const,
      },
      chapters: ALL_CHAPTERS,
    },
    {
      name: "chapter lock",
      code: "CHAPTER_LOCKED" as const,
      city: () => makeCity(),
      request: {
        instanceId: "new",
        buildingId: "community-park",
        anchor: { x: 2, y: 2 },
        rotation: 0 as const,
      },
      chapters: [],
    },
    {
      name: "building prerequisite",
      code: "MISSING_BUILDING_PREREQUISITE" as const,
      city: () =>
        patchTile(makeCity(), 2, 2, {
          terrain: "hillside",
          connections: { road: true, water: false, electricity: false },
        }),
      request: {
        instanceId: "new",
        buildingId: "battery",
        anchor: { x: 2, y: 2 },
        rotation: 0 as const,
      },
      chapters: ALL_CHAPTERS,
    },
  ])(
    "returns $code for $name",
    ({ city: createCity, request, chapters, code }) => {
      const result = validatePlacement(createCity(), request, {
        unlockedChapterIds: chapters,
      });
      expect(result.valid).toBe(false);
      if (!result.valid)
        expect(result.issues.map((issue) => issue.code)).toContain(
          code satisfies PlacementReasonCode,
        );
    },
  );
});

describe("immutable provisional planning", () => {
  it("supports placement, removal, undo, and redo without changing the committed state", () => {
    const base = makeCity();
    const before = structuredClone(base);
    let session = createPlanningSession(base);

    const placement = placeProvisional(
      session,
      {
        instanceId: "park-1",
        buildingId: "community-park",
        anchor: { x: 2, y: 2 },
        rotation: 0,
      },
      { unlockedChapterIds: ALL_CHAPTERS },
    );
    expect(placement.accepted).toBe(true);
    if (!placement.accepted) return;
    session = placement.session;
    expect(
      materializePlanningState(session).buildings.map(
        (building) => building.instanceId,
      ),
    ).toEqual(["park-1"]);

    const removal = removeProvisional(session, "park-1");
    expect(removal.accepted).toBe(true);
    if (!removal.accepted) return;
    session = removal.session;
    expect(materializePlanningState(session).buildings).toEqual([]);

    session = undoProvisional(session);
    expect(materializePlanningState(session).buildings).toHaveLength(1);
    session = undoProvisional(session);
    expect(materializePlanningState(session).buildings).toHaveLength(0);
    session = redoProvisional(session);
    expect(materializePlanningState(session).buildings).toHaveLength(1);
    expect(base).toEqual(before);
  });

  it("reserves construction cost across multiple provisional placements", () => {
    const base = { ...makeCity(), budget: 150 };
    const first = placeProvisional(
      createPlanningSession(base),
      {
        instanceId: "park-1",
        buildingId: "community-park",
        anchor: { x: 2, y: 2 },
        rotation: 0,
      },
      { unlockedChapterIds: ALL_CHAPTERS },
    );
    expect(first.accepted).toBe(true);
    if (!first.accepted) return;
    expect(getPlanningView(first.session).availableBudget).toBe(40);

    const second = placeProvisional(
      first.session,
      {
        instanceId: "park-2",
        buildingId: "community-park",
        anchor: { x: 3, y: 3 },
        rotation: 0,
      },
      { unlockedChapterIds: ALL_CHAPTERS },
    );
    expect(second.accepted).toBe(false);
    if (!second.accepted) {
      expect(second.issues.map((issue) => issue.code)).toContain(
        "INSUFFICIENT_BUDGET",
      );
    }
    expect(base.budget).toBe(150);
  });
});

function cityForBuilding(definition: BuildingDefinition): CityState {
  let city = makeCity();
  const targetTerrain: TerrainType =
    definition.id === "water-pump" || definition.id === "wetland"
      ? "floodplain"
      : ["solar-array", "battery", "recycling-centre"].includes(definition.id)
        ? "hillside"
        : "meadow";

  for (const coordinate of transformFootprint(definition, { x: 2, y: 2 }, 0)) {
    city = patchTile(city, coordinate.x, coordinate.y, {
      terrain: targetTerrain,
      floodRisk: 0.1,
      placeable: true,
      connections: { road: true, water: true, electricity: true },
    });
  }

  if (
    definition.placementRules.some(
      (rule) => rule.type === "requires-adjacent-terrain",
    )
  ) {
    city = patchTile(city, 1, 2, {
      terrain: "river",
      placeable: false,
      floodRisk: 1,
    });
  }
  if (
    definition.placementRules.some(
      (rule) => rule.type === "requires-adjacent-building",
    )
  ) {
    city = addBuilding(
      city,
      placed("road-neighbour", "road", "tile-2-1", { x: 2, y: 1 }),
    );
  }
  for (const prerequisite of definition.prerequisites) {
    if (prerequisite.type === "building-present") {
      city = addBuilding(
        city,
        placed(
          `${prerequisite.buildingId}-existing`,
          prerequisite.buildingId,
          "tile-0-0",
          { x: 0, y: 0 },
        ),
      );
    }
  }
  return city;
}

function makeCity(): CityState {
  const tiles: TileState[] = [];
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 5; x += 1) {
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
    cityId: "test-city",
    campaignId: "test-campaign",
    campaignVersion: 1,
    seed: "test-seed",
    mapId: "test-map",
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

function patchTile(
  city: CityState,
  x: number,
  y: number,
  patch: Partial<TileState>,
): CityState {
  return {
    ...city,
    tiles: city.tiles.map((tile) =>
      tile.coordinate.x === x && tile.coordinate.y === y
        ? { ...tile, ...patch }
        : tile,
    ),
  };
}

function addBuilding(city: CityState, building: PlacedBuilding): CityState {
  const occupied = new Set(building.occupiedTileIds);
  return {
    ...city,
    buildings: [...city.buildings, building],
    tiles: city.tiles.map((tile) =>
      occupied.has(tile.id)
        ? { ...tile, occupantId: building.instanceId }
        : tile,
    ),
  };
}

function placed(
  instanceId: string,
  definitionId: string,
  tileId: string,
  anchor: { x: number; y: number },
): PlacedBuilding {
  return {
    instanceId,
    definitionId,
    anchor,
    rotation: 0,
    occupiedTileIds: [tileId],
    placedTurn: 0,
  };
}
