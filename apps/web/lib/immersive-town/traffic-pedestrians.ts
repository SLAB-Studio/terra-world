import { advanceRoadProgress, sampleLane } from "./road";
import type { TrafficSimulation, VehicleState } from "./traffic";

export type TrafficPoint = Readonly<{ x: number; z: number }>;
export type TrafficPedestrian = TrafficPoint &
  Readonly<{
    id: string;
    radius?: number;
    /** Only the passenger's reserved vehicle may ignore its own boarding body. */
    ignoreVehicleId?: string;
  }>;
export type TrafficPedestrianHazard = Readonly<{
  vehicleId: string;
  personId: string;
  /** Safe forward centreline travel, including a buffer before body contact. */
  distanceMeters: number;
  vehiclePosition: TrafficPoint;
  personPosition: TrafficPoint;
}>;
export type TrafficVehicleFootprint = Readonly<{
  vehicleId: string;
  center: TrafficPoint;
  forward: TrafficPoint;
  lateral: TrafficPoint;
  halfLength: number;
  halfWidth: number;
}>;

// The imported cars are clamped to 1.8m wide, but their procedural fallback
// bodies are 2.25m. Protect the larger rendered envelope in either LOD state.
export const TRAFFIC_VEHICLE_HALF_WIDTH_METERS = 1.125;
export const TRAFFIC_PEDESTRIAN_STOP_BUFFER_METERS = 0.8;
const SWEEP_STEP = 0.25;
const SWEEP_CURVE_MARGIN = 0.025;
const finitePoint = (point: TrafficPoint) =>
  Number.isFinite(point.x) && Number.isFinite(point.z);
const personRadius = (radius: number | undefined) =>
  radius === undefined || !Number.isFinite(radius)
    ? 0.4
    : Math.max(0, Math.min(3, radius));
const distanceSquared = (a: TrafficPoint, b: TrafficPoint) =>
  (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

/** An optional rendered pose also covers a bridge-closure U-turn animation. */
export function getTrafficVehicleFootprint(
  vehicle: Pick<VehicleState, "id" | "laneId" | "progress" | "lengthMeters">,
  transform?: Readonly<{ position: TrafficPoint; yawRadians: number }>,
): TrafficVehicleFootprint {
  const lane = sampleLane(vehicle.laneId, vehicle.progress);
  const yaw = transform?.yawRadians ?? lane.yawRadians;
  return {
    vehicleId: vehicle.id,
    center: transform
      ? { x: transform.position.x, z: transform.position.z }
      : { x: lane.position.x, z: lane.position.z },
    forward: { x: Math.sin(yaw), z: Math.cos(yaw) },
    lateral: { x: Math.cos(yaw), z: -Math.sin(yaw) },
    halfLength: Math.max(
      0.1,
      Number.isFinite(vehicle.lengthMeters) ? vehicle.lengthMeters / 2 : 2,
    ),
    halfWidth: TRAFFIC_VEHICLE_HALF_WIDTH_METERS,
  };
}

const toLocal = (
  point: TrafficPoint,
  footprint: TrafficVehicleFootprint,
): TrafficPoint => ({
  x:
    (point.x - footprint.center.x) * footprint.lateral.x +
    (point.z - footprint.center.z) * footprint.lateral.z,
  z:
    (point.x - footprint.center.x) * footprint.forward.x +
    (point.z - footprint.center.z) * footprint.forward.z,
});

/** Signed body clearance: negative is overlapping. A controller recovering an
 * existing overlap can allow only increasing clearance, so escape stays possible. */
export function vehicleFootprintPointClearance(
  footprint: TrafficVehicleFootprint,
  point: TrafficPoint,
  radius = 0.4,
): number {
  if (!finitePoint(point)) return -Infinity;
  const local = toLocal(point, footprint);
  const across = Math.abs(local.x) - footprint.halfWidth;
  const along = Math.abs(local.z) - footprint.halfLength;
  return (
    Math.hypot(Math.max(0, across), Math.max(0, along)) +
    Math.min(Math.max(across, along), 0) -
    personRadius(radius)
  );
}

/** Exact circle/capsule versus the oriented vehicle rectangle, not its AABB.
 * from===to is a point/body-radius check; a swept segment prevents foot
 * controllers from tunnelling through a stationary car on a delayed frame. */
export function vehicleFootprintIntersectsCapsule(
  footprint: TrafficVehicleFootprint,
  from: TrafficPoint,
  to: TrafficPoint,
  radius = 0.4,
): boolean {
  if (!finitePoint(from) || !finitePoint(to)) return true;
  const a = toLocal(from, footprint),
    b = toLocal(to, footprint);
  const squaredRadius = personRadius(radius) ** 2;
  if (from.x === to.x && from.z === to.z)
    return (
      Math.max(0, Math.abs(a.x) - footprint.halfWidth) ** 2 +
        Math.max(0, Math.abs(a.z) - footprint.halfLength) ** 2 <=
      squaredRadius + 1e-10
    );
  const corners = [
    { x: -footprint.halfWidth, z: -footprint.halfLength },
    { x: footprint.halfWidth, z: -footprint.halfLength },
    { x: footprint.halfWidth, z: footprint.halfLength },
    { x: -footprint.halfWidth, z: footprint.halfLength },
  ];
  const inside = (p: TrafficPoint) =>
    Math.abs(p.x) <= footprint.halfWidth &&
    Math.abs(p.z) <= footprint.halfLength;
  if (inside(a) || inside(b)) return true;
  return corners.some(
    (corner, index) =>
      segmentDistanceSquared(a, b, corner, corners[(index + 1) % 4]!) <=
      squaredRadius + 1e-10,
  );
}

export function trafficVehicleIntersectsCapsule(
  vehicle: VehicleState,
  from: TrafficPoint,
  to: TrafficPoint,
  radius = 0.4,
) {
  return vehicleFootprintIntersectsCapsule(
    getTrafficVehicleFootprint(vehicle),
    from,
    to,
    radius,
  );
}

/** A short rendered-pose sweep, useful for a paused bridge U-turn. Callers must
 * subdivide curved animations into <=0.05s slices; endpoints of a whole turn
 * cannot describe its semicircular path. The lane driver subdivides by 0.25m. */
export function sweptVehicleFootprintIntersectsCircle(
  from: TrafficVehicleFootprint,
  to: TrafficVehicleFootprint,
  point: TrafficPoint,
  radius = 0.4,
): boolean {
  if (!finitePoint(point)) return true;
  return circleIntersectsPolygon(
    point,
    personRadius(radius) + SWEEP_CURVE_MARGIN,
    convexHull([...cornersOf(from), ...cornersOf(to)]),
  );
}

function cornersOf(footprint: TrafficVehicleFootprint): TrafficPoint[] {
  return [-1, 1].flatMap((along) =>
    [-1, 1].map((across) => ({
      x:
        footprint.center.x +
        footprint.forward.x * footprint.halfLength * along +
        footprint.lateral.x * footprint.halfWidth * across,
      z:
        footprint.center.z +
        footprint.forward.z * footprint.halfLength * along +
        footprint.lateral.z * footprint.halfWidth * across,
    })),
  );
}

/** Nearest actual swept-body hazard per vehicle, reusable for quiet horn cues.
 * No road/lane inference is made from a person's current tangent projection:
 * the future lane poses themselves are swept, including curves and loop wrap. */
export function getTrafficPedestrianHazards(
  simulation: TrafficSimulation,
  pedestrians: readonly TrafficPedestrian[],
): readonly TrafficPedestrianHazard[] {
  if (!pedestrians.length) return [];
  const hazards: TrafficPedestrianHazard[] = [];
  for (const vehicle of simulation.vehicles) {
    const first = getTrafficVehicleFootprint(vehicle);
    const speed = Math.max(
      0,
      Number.isFinite(vehicle.speedMetersPerSecond)
        ? vehicle.speedMetersPerSecond
        : 0,
    );
    // More than the comfortable braking distance even at maximum road speed;
    // the minimum also protects a stopped driver before accelerating again.
    const lookAhead = Math.max(12, (speed * speed) / 5.6 + speed * 0.6 + 3);
    const candidates = pedestrians.filter(
      (person) =>
        person.ignoreVehicleId !== vehicle.id &&
        finitePoint(person) &&
        distanceSquared(person, first.center) <=
          (lookAhead +
            Math.hypot(first.halfLength, first.halfWidth) +
            personRadius(person.radius) +
            4.6) **
            2,
    );
    if (!candidates.length) continue;
    const direction = vehicle.laneId === "clockwise" ? 1 : -1;
    let previous = first;
    let nearest: TrafficPedestrianHazard | null = null;
    const makeHazard = (
      person: TrafficPedestrian,
      travel: number,
    ): TrafficPedestrianHazard => ({
      vehicleId: vehicle.id,
      personId: person.id,
      distanceMeters: Math.max(
        0,
        travel - TRAFFIC_PEDESTRIAN_STOP_BUFFER_METERS,
      ),
      vehiclePosition: first.center,
      personPosition: { x: person.x, z: person.z },
    });
    for (const person of candidates) {
      if (
        vehicleFootprintIntersectsCapsule(
          first,
          person,
          person,
          personRadius(person.radius),
        )
      ) {
        nearest = makeHazard(person, 0);
        break;
      }
    }
    for (
      let travel = SWEEP_STEP;
      !nearest && travel <= lookAhead + SWEEP_STEP;
      travel += SWEEP_STEP
    ) {
      const next = getTrafficVehicleFootprint({
        ...vehicle,
        progress: advanceRoadProgress(vehicle.progress, direction * travel),
      });
      // Convex swept rectangles include translation and turning corners. The
      // tiny margin bounds sub-quarter-metre spline sagitta between samples;
      // the stop is placed BEFORE this interval, never at its far endpoint.
      let hull: TrafficPoint[] | undefined;
      const center = {
        x: (previous.center.x + next.center.x) / 2,
        z: (previous.center.z + next.center.z) / 2,
      };
      const bodyRadius =
        Math.hypot(first.halfLength, first.halfWidth) +
        Math.sqrt(distanceSquared(previous.center, next.center)) / 2;
      for (const person of candidates) {
        const radius = personRadius(person.radius) + SWEEP_CURVE_MARGIN;
        if (distanceSquared(person, center) > (bodyRadius + radius) ** 2)
          continue;
        hull ??= convexHull([...cornersOf(previous), ...cornersOf(next)]);
        if (circleIntersectsPolygon(person, radius, hull)) {
          nearest = makeHazard(person, travel - SWEEP_STEP);
          break;
        }
      }
      previous = next;
    }
    if (nearest) hazards.push(nearest);
  }
  return hazards;
}

const cross = (a: TrafficPoint, b: TrafficPoint, c: TrafficPoint) =>
  (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
function convexHull(points: TrafficPoint[]): TrafficPoint[] {
  points.sort((a, b) => a.x - b.x || a.z - b.z);
  const lower: TrafficPoint[] = [],
    upper: TrafficPoint[] = [];
  for (const p of points) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0)
      lower.pop();
    lower.push(p);
  }
  for (let index = points.length - 1; index >= 0; index--) {
    const p = points[index]!;
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0)
      upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
function circleIntersectsPolygon(
  point: TrafficPoint,
  radius: number,
  polygon: readonly TrafficPoint[],
) {
  let inside = true;
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index]!,
      b = polygon[(index + 1) % polygon.length]!;
    if (cross(a, b, point) < 0) inside = false;
    if (pointSegmentDistanceSquared(point, a, b) <= radius * radius)
      return true;
  }
  return inside;
}
function pointSegmentDistanceSquared(
  point: TrafficPoint,
  a: TrafficPoint,
  b: TrafficPoint,
) {
  const length = distanceSquared(a, b);
  const t =
    length > 0
      ? Math.max(
          0,
          Math.min(
            1,
            ((point.x - a.x) * (b.x - a.x) + (point.z - a.z) * (b.z - a.z)) /
              length,
          ),
        )
      : 0;
  return distanceSquared(point, {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
  });
}
function segmentDistanceSquared(
  a: TrafficPoint,
  b: TrafficPoint,
  c: TrafficPoint,
  d: TrafficPoint,
) {
  const abC = cross(a, b, c),
    abD = cross(a, b, d),
    cdA = cross(c, d, a),
    cdB = cross(c, d, b);
  if (
    ((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) &&
    ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))
  )
    return 0;
  return Math.min(
    pointSegmentDistanceSquared(a, c, d),
    pointSegmentDistanceSquared(b, c, d),
    pointSegmentDistanceSquared(c, a, b),
    pointSegmentDistanceSquared(d, a, b),
  );
}
