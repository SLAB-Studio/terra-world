import {
  SCHEMA_VERSION,
  CityStateSchema,
  type CityState,
  type ElevationBand,
  type TerrainType,
  type TileState,
  type WorldMap,
  WorldMapSchema,
} from "@terra/campaign-schema";

import { deterministicHash } from "./hash";

export type RiverValleyOptions = {
  readonly id?: string;
  readonly width?: number;
  readonly height?: number;
};

const DEFAULT_WIDTH = 16;
const DEFAULT_HEIGHT = 12;

export function createRiverValleyWorld(
  seed: string,
  options: RiverValleyOptions = {},
): WorldMap {
  if (seed.trim().length === 0) {
    throw new Error("World seed cannot be empty");
  }

  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  if (!Number.isInteger(width) || width < 5 || width > 128) {
    throw new RangeError("World width must be an integer between 5 and 128");
  }
  if (!Number.isInteger(height) || height < 5 || height > 128) {
    throw new RangeError("World height must be an integer between 5 and 128");
  }

  const random = createSeededRandom(seed);
  const riverCenters = createRiverCenters(width, height, random);
  const tiles: TileState[] = [];

  for (let y = 0; y < height; y += 1) {
    const riverCenter = riverCenters[y];
    if (riverCenter === undefined) {
      throw new Error(`Missing generated river centre for row ${y}`);
    }

    for (let x = 0; x < width; x += 1) {
      const distanceFromRiver = Math.abs(x - riverCenter);
      const terrain = chooseTerrain(
        x,
        y,
        width,
        height,
        distanceFromRiver,
        random,
      );
      const elevation = chooseElevation(distanceFromRiver, width, terrain);
      const floodRisk = round3(
        calculateFloodRisk(distanceFromRiver, terrain, random),
      );
      const habitatValue = round3(calculateHabitatValue(terrain, random));
      const placeable = terrain !== "river" && terrain !== "rock";

      tiles.push({
        id: tileId(x, y),
        coordinate: { x, y },
        terrain,
        elevation,
        floodRisk,
        habitatValue,
        placeable,
        occupantId: null,
        connections: { road: false, water: false, electricity: false },
      });
    }
  }

  const mapWithoutHash = {
    schemaVersion: SCHEMA_VERSION,
    id: options.id ?? "river-valley",
    seed,
    width,
    height,
    tiles,
  };

  return WorldMapSchema.parse({
    ...mapWithoutHash,
    mapHash: deterministicHash(mapWithoutHash),
  });
}

export function computeWorldMapHash(map: WorldMap): string {
  return deterministicHash({
    schemaVersion: map.schemaVersion,
    id: map.id,
    seed: map.seed,
    width: map.width,
    height: map.height,
    tiles: map.tiles,
  });
}

export function createInitialCityState(
  world: WorldMap,
  input: {
    readonly cityId: string;
    readonly campaignId: string;
    readonly campaignVersion: number;
    readonly budget: number;
  },
): CityState {
  return CityStateSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    cityId: input.cityId,
    campaignId: input.campaignId,
    campaignVersion: input.campaignVersion,
    seed: world.seed,
    mapId: world.id,
    mapHash: world.mapHash,
    turn: 0,
    stage: "seed",
    population: 0,
    budget: input.budget,
    tiles: world.tiles.map((tile) => ({
      ...tile,
      coordinate: { ...tile.coordinate },
      connections: { ...tile.connections },
    })),
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
  });
}

export function tileId(x: number, y: number): string {
  return `tile-${x}-${y}`;
}

function hashSeed(seed: string): number {
  let value = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function createSeededRandom(seed: string): () => number {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function createRiverCenters(
  width: number,
  height: number,
  random: () => number,
): number[] {
  const minimum = Math.max(1, Math.floor(width * 0.25));
  const maximum = Math.min(width - 2, Math.ceil(width * 0.75));
  let center = Math.floor(width / 2);
  const centers: number[] = [];

  for (let y = 0; y < height; y += 1) {
    const movement = random() < 0.3 ? -1 : random() > 0.7 ? 1 : 0;
    center = Math.max(minimum, Math.min(maximum, center + movement));
    centers.push(center);
  }
  return centers;
}

function chooseTerrain(
  x: number,
  y: number,
  width: number,
  height: number,
  riverDistance: number,
  random: () => number,
): TerrainType {
  if (riverDistance === 0) return "river";
  if (riverDistance === 1 && random() < 0.22) return "wetland";
  if (riverDistance <= 2) return "floodplain";

  const edgeDistance = Math.min(x, width - 1 - x, y, height - 1 - y);
  if (edgeDistance === 0 && random() < 0.5) return "rock";
  if (riverDistance >= Math.max(4, Math.floor(width * 0.36))) return "hillside";
  if (random() < 0.19) return "forest";
  return "meadow";
}

function chooseElevation(
  riverDistance: number,
  width: number,
  terrain: TerrainType,
): ElevationBand {
  if (terrain === "river" || terrain === "wetland" || riverDistance <= 2)
    return "low";
  if (
    terrain === "hillside" ||
    terrain === "rock" ||
    riverDistance >= Math.floor(width * 0.4)
  )
    return "high";
  return "middle";
}

function calculateFloodRisk(
  riverDistance: number,
  terrain: TerrainType,
  random: () => number,
): number {
  if (terrain === "river") return 1;
  if (terrain === "wetland") return 0.82 + random() * 0.12;
  if (riverDistance === 1) return 0.72 + random() * 0.16;
  if (riverDistance === 2) return 0.48 + random() * 0.16;
  return Math.max(0.02, 0.29 - riverDistance * 0.035 + random() * 0.06);
}

function calculateHabitatValue(
  terrain: TerrainType,
  random: () => number,
): number {
  const baseByTerrain: Record<TerrainType, number> = {
    river: 0.86,
    floodplain: 0.59,
    meadow: 0.42,
    forest: 0.79,
    wetland: 0.94,
    hillside: 0.5,
    rock: 0.18,
  };
  return Math.min(1, baseByTerrain[terrain] + random() * 0.06);
}

function round3(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
