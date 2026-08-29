export type RoadPoint = Readonly<{ x: number; y: number }>;

export const MAIN_ROAD_WIDTH = 86;
export const MAIN_ROAD_LANE_OFFSET = 19;

export const MAIN_ROAD_CONTROL_POINTS: readonly RoadPoint[] = [
  { x: -120, y: 468 },
  { x: 80, y: 451 },
  { x: 280, y: 432 },
  { x: 480, y: 414 },
  { x: 680, y: 397 },
  { x: 880, y: 387 },
  { x: 1080, y: 391 },
  { x: 1280, y: 405 },
  { x: 1480, y: 424 },
  { x: 1680, y: 441 },
  { x: 1920, y: 454 },
] as const;

export function sampleRoadCenterline(progress: number): RoadPoint {
  const bounded = wrapProgress(progress);
  const segments = MAIN_ROAD_CONTROL_POINTS.length - 1;
  const position = bounded * segments;
  const index = Math.min(Math.floor(position), segments - 1);
  const t = position - index;
  const p0 = MAIN_ROAD_CONTROL_POINTS[Math.max(0, index - 1)];
  const p1 = MAIN_ROAD_CONTROL_POINTS[index];
  const p2 = MAIN_ROAD_CONTROL_POINTS[Math.min(index + 1, segments)];
  const p3 = MAIN_ROAD_CONTROL_POINTS[Math.min(index + 2, segments)];

  if (
    p0 === undefined ||
    p1 === undefined ||
    p2 === undefined ||
    p3 === undefined
  )
    return { x: 0, y: 0 };

  return {
    x: catmullRom(p0.x, p1.x, p2.x, p3.x, t),
    y: catmullRom(p0.y, p1.y, p2.y, p3.y, t),
  };
}

export function sampleCarLane(
  progress: number,
  laneOffset: number,
): Readonly<RoadPoint & { angle: number }> {
  const point = sampleRoadCenterline(progress);
  const before = sampleRoadCenterline(progress - 0.001);
  const after = sampleRoadCenterline(progress + 0.001);
  const angle = Math.atan2(after.y - before.y, after.x - before.x);
  return {
    x: point.x - Math.sin(angle) * laneOffset,
    y: point.y + Math.cos(angle) * laneOffset,
    angle,
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

function wrapProgress(progress: number): number {
  return ((progress % 1) + 1) % 1;
}
