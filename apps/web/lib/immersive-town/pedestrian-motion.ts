export type PedestrianPoint = Readonly<{ x: number; y: number; z: number }>;
export type PedestrianRoute = Readonly<{
  id: string;
  points: readonly PedestrianPoint[];
  speed: number;
  drawPath: boolean;
}>;

const promenade = (from: number, to: number) =>
  Array.from({ length: 12 }, (_, i) => {
    const z = from + ((to - from) * i) / 11;
    const t = (z + 70) / 140;
    const riverX = 12 + Math.sin(t * Math.PI * 2 - Math.PI / 2) * 3.4;
    const slope =
      (Math.cos(t * Math.PI * 2 - Math.PI / 2) * 3.4 * Math.PI * 2) / 140;
    const normalLength = Math.hypot(1, slope);
    return {
      x: riverX - 8.35 / normalLength,
      y: 1.075,
      z: z + (8.35 * slope) / normalLength,
    };
  });

/** Routes are also the source of the visible pedestrian paths, never motor lanes. */
export const PEDESTRIAN_ROUTES: Readonly<Record<string, PedestrianRoute>> = {
  "south-walker-kai": {
    id: "sunflower-walk",
    points: [
      { x: -49, y: 0.79, z: -34 },
      { x: -34, y: 0.79, z: -34 },
    ],
    speed: 1.05,
    drawPath: true,
  },
  "south-walker-lina": {
    id: "riverbend-walk",
    points: [
      { x: 26, y: 0.79, z: -36 },
      { x: 43, y: 0.79, z: -36 },
    ],
    speed: 0.95,
    drawPath: true,
  },
  "river-walker-omar": {
    id: "west-river-walk",
    points: promenade(32, 43),
    speed: 1,
    drawPath: false,
  },
  "resident-malik": {
    id: "bridge-approach-walk",
    points: promenade(-19, -7),
    speed: 0.85,
    drawPath: false,
  },
  "north-walker-mei": {
    id: "north-neighbour-walk",
    points: [
      { x: -46, y: 0.79, z: 62.6 },
      { x: -35, y: 0.79, z: 62.6 },
    ],
    speed: 0.9,
    drawPath: true,
  },
};

const PAUSE_SECONDS = 2;
const RAMP_SECONDS = 0.7;
const wrap = (value: number, period: number) =>
  ((value % period) + period) % period;
const smooth = (t: number) => {
  const a = Math.max(0, Math.min(1, t));
  return a * a * (3 - 2 * a);
};

export function samplePedestrianRoute(
  route: PedestrianRoute,
  seconds: number,
  phase = 0,
) {
  const segments = route.points.slice(1).map((to, i) => {
    const from = route.points[i]!;
    return { from, to, length: Math.hypot(to.x - from.x, to.z - from.z) };
  });
  const length = segments.reduce((sum, segment) => sum + segment.length, 0);
  const speed = Math.max(0.1, route.speed);
  const ramp = Math.min(RAMP_SECONDS, length / speed / 2);
  const travelTime = length / speed + ramp;
  const legTime = travelTime + PAUSE_SECONDS;
  const time = Math.max(0, Number.isFinite(seconds) ? seconds : 0) + phase * 3;
  const leg = Math.floor(time / legTime);
  const local = wrap(time, legTime);
  const backwards = leg % 2 === 1;
  const moving = local < travelTime;
  let distance = length;
  let velocity = 0;
  if (local < ramp) {
    velocity = (speed * local) / ramp;
    distance = (speed * local * local) / (2 * ramp);
  } else if (local < travelTime - ramp) {
    velocity = speed;
    distance = speed * (local - ramp / 2);
  } else if (moving) {
    const remaining = travelTime - local;
    velocity = (speed * remaining) / ramp;
    distance = length - (speed * remaining * remaining) / (2 * ramp);
  }
  let remaining = backwards ? length - distance : distance;
  let segment = segments[segments.length - 1]!;
  for (const candidate of segments) {
    segment = candidate;
    if (remaining <= candidate.length) break;
    remaining -= candidate.length;
  }
  const ratio = Math.max(0, Math.min(1, remaining / segment.length));
  const direction = backwards ? -1 : 1;
  const dx = (segment.to.x - segment.from.x) * direction;
  const dz = (segment.to.z - segment.from.z) * direction;
  // Faces and toes on the authored rig point along LOCAL -Z.
  const heading = Math.atan2(-dx, -dz);
  const turn = moving ? 0 : smooth((local - travelTime - 0.25) / 1.5) * Math.PI;
  return {
    x: segment.from.x + (segment.to.x - segment.from.x) * ratio,
    y: segment.from.y + (segment.to.y - segment.from.y) * ratio,
    z: segment.from.z + (segment.to.z - segment.from.z) * ratio,
    yaw: heading + turn,
    speed: velocity,
    travelled: leg * length + distance,
    moving,
  };
}

/** Plant for 60% of the stride, then lift and swing forward; driven by distance. */
export function sampleFootstep(
  distance: number,
  stride: number,
  offset: number,
  strength = 1,
) {
  const phase = wrap(distance / (stride / 0.6) + offset, 1);
  if (phase < 0.6)
    return {
      z: (-stride / 2 + (stride * phase) / 0.6) * strength,
      lift: 0,
      planted: true,
    };
  const swing = (phase - 0.6) / 0.4;
  return {
    z: (stride / 2 - stride * smooth(swing)) * strength,
    lift: Math.sin(Math.PI * swing) * 0.16 * strength,
    planted: false,
  };
}

/** Two-link leg IK. The ankle counter-rotates so the shoe sole stays horizontal. */
export function solvePedestrianLeg(
  upper: number,
  lower: number,
  down: number,
  z: number,
) {
  const length = Math.min(
    upper + lower - 0.00001,
    Math.max(Math.abs(upper - lower) + 0.00001, Math.hypot(down, z)),
  );
  const knee = -Math.acos(
    Math.max(
      -1,
      Math.min(
        1,
        (length * length - upper * upper - lower * lower) / (2 * upper * lower),
      ),
    ),
  );
  const hip =
    Math.atan2(-z, down) -
    Math.atan2(lower * Math.sin(knee), upper + lower * Math.cos(knee));
  return { hip, knee, ankle: -hip - knee };
}
