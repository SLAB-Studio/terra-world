import type { ChapterEvidenceId, ChapterState } from "../opening-chapter/story";
import { ROAD_HALF_WIDTH_METERS, sampleRoadFrame } from "./road";
import { EAST_BRIDGE_PROGRESS } from "./bridge-closure";

export type MapPoint = Readonly<{ x: number; z: number }>;
export type MapBounds = Readonly<{
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}>;
export type MissionMapTarget = Readonly<{
  id: string;
  label: string;
  instruction: string;
  position: MapPoint;
  radius: number;
}>;
export type MissionMapBuilding = Readonly<{
  id: string;
  position: MapPoint;
  width: number;
  depth: number;
  /** World yaw in radians. */
  rotation?: number;
}>;
export type MissionMapGeometry = Readonly<{
  bounds: MapBounds;
  road: readonly MapPoint[];
  river: readonly MapPoint[];
  buildings: readonly MissionMapBuilding[];
}>;
export type MissionMapPose = MapPoint & Readonly<{ yaw: number }>;

/** The full authored island in environment.ts, not a cropped mission district. */
export const MISSION_MAP_BOUNDS: MapBounds = {
  minX: -80,
  maxX: 80,
  minZ: -72.5,
  maxZ: 72.5,
};
export const MISSION_MAP_ROAD_WIDTH = ROAD_HALF_WIDTH_METERS * 2;
/** Same water segment width as createTownEnvironment(). */
export const MISSION_MAP_RIVER_WIDTH = 13;
const eastBridgeCenter = sampleRoadFrame(EAST_BRIDGE_PROGRESS).center;
export const EAST_BRIDGE_MAP_POSITION: MapPoint = {
  x: eastBridgeCenter.x,
  z: eastBridgeCenter.z,
};

const EVIDENCE_ORDER: readonly ChapterEvidenceId[] = [
  "bridge",
  "maya",
  "malik",
  "nia",
];
const TARGET_COPY: Record<
  ChapterEvidenceId,
  Readonly<{ label: string; instruction: string }>
> = {
  bridge: {
    label: "East Bridge",
    instruction: "Read the closure notice at East Bridge.",
  },
  maya: {
    label: "Maya · Bakery",
    instruction: "Speak with Maya outside the bakery.",
  },
  malik: {
    label: "Malik · Repair estimate",
    instruction: "Speak with Malik about the bridge repair.",
  },
  nia: {
    label: "Nia · Riverbank",
    instruction: "Speak with Nia by the riverbank.",
  },
};

/** Current authored objective only: never invent an objective or skip a missing point. */
export function deriveChapterMapTarget(
  state: ChapterState,
  points: readonly Readonly<{
    id: ChapterEvidenceId;
    position: MapPoint;
    radius: number;
  }>[],
): MissionMapTarget | null {
  if (state.outcomeObserved) return null;
  const aftermath = state.phase === "aftermath" && state.decision !== null;
  const id = aftermath
    ? "bridge"
    : state.phase === "investigate"
      ? EVIDENCE_ORDER.find((candidate) => !state.evidence.includes(candidate))
      : undefined;
  if (!id) return null;
  const point = points.find((candidate) => candidate.id === id);
  if (
    !point ||
    !finitePoint(point.position) ||
    !Number.isFinite(point.radius) ||
    point.radius < 0
  )
    return null;
  return {
    id,
    ...TARGET_COPY[id],
    instruction: aftermath
      ? "Return to East Bridge to observe the outcome."
      : TARGET_COPY[id].instruction,
    position: { x: point.position.x, z: point.position.z },
    radius: point.radius,
  };
}

/**
 * Construct once from the existing world's measured building footprints. This
 * deliberately accepts plain data: no Babylon objects, second scene or network.
 * Rotation describes the local footprint; leave it out for world-aligned bounds.
 */
export function buildMissionMapGeometry(
  input: Readonly<{
    homes?: readonly MissionMapBuilding[];
    venues?: readonly MissionMapBuilding[];
    bounds?: MapBounds;
  }> = {},
): MissionMapGeometry {
  const bounds = { ...safeBounds(input.bounds ?? MISSION_MAP_BOUNDS) };
  const buildings = [...(input.homes ?? []), ...(input.venues ?? [])]
    .filter(
      (building) =>
        finitePoint(building.position) &&
        Number.isFinite(building.width) &&
        building.width > 0 &&
        Number.isFinite(building.depth) &&
        building.depth > 0 &&
        (building.rotation === undefined || Number.isFinite(building.rotation)),
    )
    .map((building) => ({
      ...building,
      position: { x: building.position.x, z: building.position.z },
    }));
  for (const building of buildings) {
    const yaw = building.rotation ?? 0;
    const cos = Math.abs(Math.cos(yaw));
    const sin = Math.abs(Math.sin(yaw));
    const halfX = (building.width * cos + building.depth * sin) / 2;
    const halfZ = (building.width * sin + building.depth * cos) / 2;
    bounds.minX = Math.min(bounds.minX, building.position.x - halfX);
    bounds.maxX = Math.max(bounds.maxX, building.position.x + halfX);
    bounds.minZ = Math.min(bounds.minZ, building.position.z - halfZ);
    bounds.maxZ = Math.max(bounds.maxZ, building.position.z + halfZ);
  }
  // Closed spline: final sample repeats the first so SVG need not infer closure.
  const road = Array.from({ length: 129 }, (_, index) => {
    const { x, z } = sampleRoadFrame(index / 128).center;
    return { x, z };
  });
  // Same 42 segments and exact equation as the visible river in environment.ts.
  const river = Array.from({ length: 43 }, (_, index) => {
    const t = index / 42;
    return {
      x: 12 + Math.sin(t * Math.PI * 2 - Math.PI / 2) * 3.4,
      z: -70 + t * 140,
    };
  });
  return { bounds: safeBounds(bounds), road, river, buildings };
}

/** North-up, aspect-preserving projection. The default clamps markers to the map. */
export function projectMapPoint(
  point: MapPoint,
  bounds: MapBounds,
  width: number,
  height: number,
  padding = 12,
  clamp = true,
): Readonly<{ x: number; y: number }> {
  const frame = projectionFrame(bounds, width, height, padding);
  const centerX = frame.bounds.minX / 2 + frame.bounds.maxX / 2;
  const centerZ = frame.bounds.minZ / 2 + frame.bounds.maxZ / 2;
  const safePoint = finitePoint(point) ? point : { x: centerX, z: centerZ };
  const x = clamp
    ? constrain(safePoint.x, frame.bounds.minX, frame.bounds.maxX)
    : safePoint.x;
  const z = clamp
    ? constrain(safePoint.z, frame.bounds.minZ, frame.bounds.maxZ)
    : safePoint.z;
  const projected = {
    x: frame.width / 2 + (x - centerX) * frame.scale,
    y: frame.height / 2 - (z - centerZ) * frame.scale,
  };
  return Number.isFinite(projected.x) && Number.isFinite(projected.y)
    ? projected
    : { x: frame.width / 2, y: frame.height / 2 };
}

/** Pixels/SVG units per world metre, shared with building and river rendering. */
export function mapProjectionScale(
  bounds: MapBounds,
  width: number,
  height: number,
  padding = 12,
): number {
  return projectionFrame(bounds, width, height, padding).scale;
}

/** Rotate an initially upward SVG arrow clockwise; yaw 0 faces world +Z. */
export function mapHeadingDegrees(yaw: number): number {
  if (!Number.isFinite(yaw)) return 0;
  const degrees = ((yaw % (Math.PI * 2)) * 180) / Math.PI;
  return ((degrees % 360) + 360) % 360;
}

export function mapCardinalDirection(
  yaw: number,
): "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
  return directions[Math.round(mapHeadingDegrees(yaw) / 45) % 8]!;
}

/** Straight-line distance, not walkable path length. Invalid locations are unknown. */
export function mapDistance(from: MapPoint, to: MapPoint): number | null {
  if (!finitePoint(from) || !finitePoint(to)) return null;
  const distance = Math.hypot(to.x - from.x, to.z - from.z);
  return Number.isFinite(distance) ? distance : null;
}

/** Straight-line world bearing in radians, NOT an obstacle-avoiding route. */
export function mapBearing(from: MapPoint, to: MapPoint): number | null {
  const distance = mapDistance(from, to);
  if (distance === null || distance === 0) return null;
  return Math.atan2(to.x - from.x, to.z - from.z);
}

function finitePoint(point: MapPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.z);
}

function safeBounds(bounds: MapBounds): MapBounds {
  return Object.values(bounds).every(Number.isFinite) &&
    Number.isFinite(bounds.maxX - bounds.minX) &&
    Number.isFinite(bounds.maxZ - bounds.minZ) &&
    bounds.maxX - bounds.minX > 1e-6 &&
    bounds.maxZ - bounds.minZ > 1e-6
    ? bounds
    : MISSION_MAP_BOUNDS;
}

function constrain(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function projectionFrame(
  bounds: MapBounds,
  width: number,
  height: number,
  padding: number,
) {
  const safe = safeBounds(bounds);
  const w = Number.isFinite(width) && width > 0 ? width : 1;
  const h = Number.isFinite(height) && height > 0 ? height : 1;
  const inset = constrain(
    Number.isFinite(padding) ? padding : 12,
    0,
    Math.min(w, h) / 2,
  );
  return {
    bounds: safe,
    width: w,
    height: h,
    scale: Math.min(
      (w - inset * 2) / (safe.maxX - safe.minX),
      (h - inset * 2) / (safe.maxZ - safe.minZ),
    ),
  };
}
