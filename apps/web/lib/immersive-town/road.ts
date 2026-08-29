export type Vec3 = Readonly<{ x: number; y: number; z: number }>;

export type LaneId = "clockwise" | "counter-clockwise";
export type TravelDirection = 1 | -1;

export type LaneDefinition = Readonly<{
  id: LaneId;
  direction: TravelDirection;
  offsetMeters: number;
}>;

export type RoadFrame = Readonly<{
  progress: number;
  center: Vec3;
  tangent: Vec3;
  lateral: Vec3;
  up: Vec3;
}>;

export type LaneSample = Readonly<{
  lane: LaneDefinition;
  progress: number;
  position: Vec3;
  forward: Vec3;
  lateral: Vec3;
  yawRadians: number;
}>;

export const ROAD_HALF_WIDTH_METERS = 5.2;
export const LANE_CENTER_OFFSET_METERS = 2.25;
export const VEHICLE_HALF_WIDTH_METERS = 0.9;

export const LANES: Readonly<Record<LaneId, LaneDefinition>> = {
  clockwise: {
    id: "clockwise",
    direction: 1,
    offsetMeters: LANE_CENTER_OFFSET_METERS,
  },
  "counter-clockwise": {
    id: "counter-clockwise",
    direction: -1,
    offsetMeters: -LANE_CENTER_OFFSET_METERS,
  },
};

/**
 * A closed Catmull-Rom loop in Babylon's x/y/z coordinate system. The modest
 * y variation gives the town road real elevation while keeping cars upright.
 */
export const ROAD_CONTROL_POINTS: readonly Vec3[] = [
  { x: -68, y: 0.4, z: -8 },
  { x: -55, y: 1.1, z: -44 },
  { x: -21, y: 2.1, z: -63 },
  { x: 20, y: 2.6, z: -61 },
  { x: 58, y: 1.4, z: -39 },
  { x: 72, y: 0.3, z: -4 },
  { x: 60, y: -0.4, z: 34 },
  { x: 27, y: -0.8, z: 57 },
  { x: -16, y: -0.3, z: 60 },
  { x: -53, y: 0.2, z: 36 },
] as const;

const UP: Vec3 = { x: 0, y: 1, z: 0 };
const FALLBACK_TANGENT: Vec3 = { x: 0, y: 0, z: 1 };
const ARC_LENGTH_TABLE_SIZE = 4_096;

export function wrapProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return ((progress % 1) + 1) % 1;
}

export function sampleRoadFrame(progress: number): RoadFrame {
  const wrapped = wrapProgress(progress);
  const segmentPosition = wrapped * ROAD_CONTROL_POINTS.length;
  const segmentIndex = Math.floor(segmentPosition);
  const t = segmentPosition - segmentIndex;
  const p0 = controlPoint(segmentIndex - 1);
  const p1 = controlPoint(segmentIndex);
  const p2 = controlPoint(segmentIndex + 1);
  const p3 = controlPoint(segmentIndex + 2);
  const center = catmullRomVec3(p0, p1, p2, p3, t);
  const tangent = normalize(
    catmullRomDerivativeVec3(p0, p1, p2, p3, t),
    FALLBACK_TANGENT,
  );
  const lateral = normalize(
    { x: -tangent.z, y: 0, z: tangent.x },
    { x: -1, y: 0, z: 0 },
  );

  return { progress: wrapped, center, tangent, lateral, up: UP };
}

export function sampleLane(laneId: LaneId, progress: number): LaneSample {
  const lane = LANES[laneId];
  const frame = sampleRoadFrame(progress);
  const forward = scale(frame.tangent, lane.direction);
  const position = add(frame.center, scale(frame.lateral, lane.offsetMeters));

  return {
    lane,
    progress: frame.progress,
    position,
    forward,
    lateral: frame.lateral,
    yawRadians: Math.atan2(forward.x, forward.z),
  };
}

export function lateralDistanceFromRoadCenter(
  position: Vec3,
  progress: number,
): number {
  const frame = sampleRoadFrame(progress);
  return Math.abs(dot(subtract(position, frame.center), frame.lateral));
}

export function isInsideRoad(
  position: Vec3,
  progress: number,
  edgeClearanceMeters = 0,
): boolean {
  const clearance = Math.max(0, finiteOr(edgeClearanceMeters, 0));
  return (
    isFiniteVec3(position) &&
    lateralDistanceFromRoadCenter(position, progress) <=
      ROAD_HALF_WIDTH_METERS - clearance + Number.EPSILON
  );
}

export function measureRoadLength(sampleCount = 2048): number {
  const count = Math.max(32, Math.floor(finiteOr(sampleCount, 2048)));
  let length = 0;
  let previous = sampleRoadFrame(0).center;

  for (let index = 1; index <= count; index += 1) {
    const next = sampleRoadFrame(index / count).center;
    length += distance(previous, next);
    previous = next;
  }

  return length;
}

const ROAD_ARC_LENGTHS = buildArcLengthTable();
export const ROAD_LENGTH_METERS =
  ROAD_ARC_LENGTHS[ROAD_ARC_LENGTHS.length - 1] ?? measureRoadLength();

/** Converts spline progress to measured centerline distance from the loop start. */
export function roadDistanceAtProgress(progress: number): number {
  const tablePosition = wrapProgress(progress) * ARC_LENGTH_TABLE_SIZE;
  const beforeIndex = Math.floor(tablePosition);
  const afterIndex = Math.min(beforeIndex + 1, ARC_LENGTH_TABLE_SIZE);
  const amount = tablePosition - beforeIndex;
  const before = ROAD_ARC_LENGTHS[beforeIndex] ?? 0;
  const after = ROAD_ARC_LENGTHS[afterIndex] ?? ROAD_LENGTH_METERS;
  return before + (after - before) * amount;
}

/** Converts wrapped centerline distance back into spline progress. */
export function progressAtRoadDistance(distanceMeters: number): number {
  if (!Number.isFinite(distanceMeters) || ROAD_LENGTH_METERS <= 0) return 0;
  const wrappedDistance =
    ((distanceMeters % ROAD_LENGTH_METERS) + ROAD_LENGTH_METERS) %
    ROAD_LENGTH_METERS;
  let low = 0;
  let high = ARC_LENGTH_TABLE_SIZE;

  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    const middleDistance = ROAD_ARC_LENGTHS[middle] ?? 0;
    if (middleDistance <= wrappedDistance) low = middle;
    else high = middle;
  }

  const before = ROAD_ARC_LENGTHS[low] ?? 0;
  const after = ROAD_ARC_LENGTHS[high] ?? ROAD_LENGTH_METERS;
  const interval = after - before;
  const amount =
    interval > Number.EPSILON ? (wrappedDistance - before) / interval : 0;
  return (low + amount) / ARC_LENGTH_TABLE_SIZE;
}

export function advanceRoadProgress(
  progress: number,
  signedDistanceMeters: number,
): number {
  const distance = roadDistanceAtProgress(progress);
  return progressAtRoadDistance(distance + finiteOr(signedDistanceMeters, 0));
}

/** Arc-length gap from one progress to another in the selected direction. */
export function forwardRoadDistance(
  fromProgress: number,
  toProgress: number,
  direction: TravelDirection,
): number {
  const from = roadDistanceAtProgress(fromProgress);
  const to = roadDistanceAtProgress(toProgress);
  const signedGap = direction === 1 ? to - from : from - to;
  return (
    ((signedGap % ROAD_LENGTH_METERS) + ROAD_LENGTH_METERS) % ROAD_LENGTH_METERS
  );
}

export function isFiniteVec3(value: Vec3): boolean {
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z)
  );
}

function controlPoint(index: number): Vec3 {
  const wrapped =
    ((index % ROAD_CONTROL_POINTS.length) + ROAD_CONTROL_POINTS.length) %
    ROAD_CONTROL_POINTS.length;
  return ROAD_CONTROL_POINTS[wrapped] ?? ROAD_CONTROL_POINTS[0]!;
}

function buildArcLengthTable(): readonly number[] {
  const lengths = [0];
  let total = 0;
  let previous = sampleRoadFrame(0).center;

  for (let index = 1; index <= ARC_LENGTH_TABLE_SIZE; index += 1) {
    const next = sampleRoadFrame(index / ARC_LENGTH_TABLE_SIZE).center;
    total += distance(previous, next);
    lengths.push(total);
    previous = next;
  }

  return lengths;
}

function catmullRomVec3(
  p0: Vec3,
  p1: Vec3,
  p2: Vec3,
  p3: Vec3,
  t: number,
): Vec3 {
  return {
    x: catmullRom(p0.x, p1.x, p2.x, p3.x, t),
    y: catmullRom(p0.y, p1.y, p2.y, p3.y, t),
    z: catmullRom(p0.z, p1.z, p2.z, p3.z, t),
  };
}

function catmullRomDerivativeVec3(
  p0: Vec3,
  p1: Vec3,
  p2: Vec3,
  p3: Vec3,
  t: number,
): Vec3 {
  return {
    x: catmullRomDerivative(p0.x, p1.x, p2.x, p3.x, t),
    y: catmullRomDerivative(p0.y, p1.y, p2.y, p3.y, t),
    z: catmullRomDerivative(p0.z, p1.z, p2.z, p3.z, t),
  };
}

function catmullRom(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number,
): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function catmullRomDerivative(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number,
): number {
  const t2 = t * t;
  return (
    0.5 *
    (-p0 +
      p2 +
      2 * (2 * p0 - 5 * p1 + 4 * p2 - p3) * t +
      3 * (-p0 + 3 * p1 - 3 * p2 + p3) * t2)
  );
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(value: Vec3, factor: number): Vec3 {
  return { x: value.x * factor, y: value.y * factor, z: value.z * factor };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function normalize(value: Vec3, fallback: Vec3): Vec3 {
  const length = Math.hypot(value.x, value.y, value.z);
  if (!Number.isFinite(length) || length <= Number.EPSILON) return fallback;
  return scale(value, 1 / length);
}
