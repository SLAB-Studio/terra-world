import {
  type LaneId,
  ROAD_LENGTH_METERS,
  VEHICLE_HALF_WIDTH_METERS,
  advanceRoadProgress,
  forwardRoadDistance,
  isFiniteVec3,
  sampleLane,
  wrapProgress,
} from "./road";

export type QuaternionLike = Readonly<{
  x: number;
  y: number;
  z: number;
  w: number;
}>;

export type VehicleDefinition = Readonly<{
  id: string;
  laneId: LaneId;
  startProgress: number;
  cruiseSpeedMetersPerSecond: number;
  lengthMeters: number;
}>;

export type VehicleState = Readonly<{
  id: string;
  laneId: LaneId;
  progress: number;
  speedMetersPerSecond: number;
  cruiseSpeedMetersPerSecond: number;
  lengthMeters: number;
}>;

export type VehicleTransform = Readonly<{
  id: string;
  laneId: LaneId;
  progress: number;
  position: Readonly<{ x: number; y: number; z: number }>;
  rotationQuaternion: QuaternionLike;
  yawRadians: number;
  speedMetersPerSecond: number;
}>;

export type TrafficSimulation = Readonly<{
  elapsedSeconds: number;
  vehicles: readonly VehicleState[];
}>;

export type TrafficStepOptions = Readonly<{
  reducedMotion?: boolean;
  stops?: readonly TrafficStop[];
}>;

/** A temporary stop line or a reserved vehicle's exact curbside stopping point. */
export type TrafficStop = Readonly<{
  id: string;
  laneId: LaneId;
  progress: number;
  vehicleId?: string;
  center?: boolean;
}>;

export const MIN_BUMPER_GAP_METERS = 5;
export const COMFORTABLE_TIME_HEADWAY_SECONDS = 1.7;
export const MAX_ACCELERATION_METERS_PER_SECOND_SQUARED = 1.8;
export const MAX_BRAKING_METERS_PER_SECOND_SQUARED = 4.5;
export const MAX_SIMULATION_STEP_SECONDS = 0.1;

export const DEFAULT_VEHICLES: readonly VehicleDefinition[] = [
  {
    id: "sunny-bus",
    laneId: "clockwise",
    startProgress: 0.04,
    cruiseSpeedMetersPerSecond: 8.2,
    lengthMeters: 5.8,
  },
  {
    id: "berry-car",
    laneId: "clockwise",
    startProgress: 0.36,
    cruiseSpeedMetersPerSecond: 9.4,
    lengthMeters: 3.8,
  },
  {
    id: "mint-van",
    laneId: "clockwise",
    startProgress: 0.7,
    cruiseSpeedMetersPerSecond: 8.8,
    lengthMeters: 4.6,
  },
  {
    id: "sky-car",
    laneId: "counter-clockwise",
    startProgress: 0.17,
    cruiseSpeedMetersPerSecond: 9.1,
    lengthMeters: 3.9,
  },
  {
    id: "peach-car",
    laneId: "counter-clockwise",
    startProgress: 0.51,
    cruiseSpeedMetersPerSecond: 8.6,
    lengthMeters: 4,
  },
  {
    id: "lilac-bus",
    laneId: "counter-clockwise",
    startProgress: 0.84,
    cruiseSpeedMetersPerSecond: 7.9,
    lengthMeters: 5.6,
  },
  ...Array.from({ length: 12 }, (_, index): VehicleDefinition => ({
    id:
      index === 0 || index === 7 ? `metro-bus-${index}` : `metro-car-${index}`,
    laneId: index < 6 ? "clockwise" : "counter-clockwise",
    startProgress: [
      0.14, 0.24, 0.46, 0.57, 0.81, 0.92, 0.06, 0.28, 0.39, 0.62, 0.73, 0.95,
    ][index]!,
    cruiseSpeedMetersPerSecond: 7.4 + (index % 4) * 0.35,
    lengthMeters: index === 0 || index === 7 ? 5.8 : 4.1,
  })),
] as const;

export function createTrafficSimulation(
  definitions: readonly VehicleDefinition[] = DEFAULT_VEHICLES,
): TrafficSimulation {
  const seenIds = new Set<string>();
  const vehicles = definitions.map((definition) => {
    if (seenIds.has(definition.id)) {
      throw new Error(`Duplicate traffic vehicle id: ${definition.id}`);
    }
    seenIds.add(definition.id);

    return {
      id: definition.id,
      laneId: definition.laneId,
      progress: wrapProgress(definition.startProgress),
      speedMetersPerSecond: 0,
      cruiseSpeedMetersPerSecond: clamp(
        definition.cruiseSpeedMetersPerSecond,
        1,
        13,
      ),
      lengthMeters: clamp(definition.lengthMeters, 2, 12),
    };
  });

  return { elapsedSeconds: 0, vehicles };
}

/**
 * Advances traffic with fixed-size deterministic substeps. Reduced motion is a
 * true pause: callers receive the same immutable simulation object unchanged.
 */
export function stepTraffic(
  simulation: TrafficSimulation,
  deltaSeconds: number,
  options: TrafficStepOptions = {},
): TrafficSimulation {
  if (
    options.reducedMotion === true ||
    !Number.isFinite(deltaSeconds) ||
    deltaSeconds <= 0
  ) {
    return simulation;
  }

  let remaining = Math.min(deltaSeconds, 2);
  let next = simulation;
  while (remaining > 0) {
    const stepSeconds = Math.min(remaining, MAX_SIMULATION_STEP_SECONDS);
    next = stepOnce(next, stepSeconds, options.stops ?? []);
    remaining -= stepSeconds;
  }
  return next;
}

export function getVehicleTransforms(
  simulation: TrafficSimulation,
): readonly VehicleTransform[] {
  return simulation.vehicles.map((vehicle) => {
    const laneSample = sampleLane(vehicle.laneId, vehicle.progress);
    const halfYaw = laneSample.yawRadians / 2;
    return {
      id: vehicle.id,
      laneId: vehicle.laneId,
      progress: vehicle.progress,
      position: laneSample.position,
      rotationQuaternion: {
        x: 0,
        y: Math.sin(halfYaw),
        z: 0,
        w: Math.cos(halfYaw),
      },
      yawRadians: laneSample.yawRadians,
      speedMetersPerSecond: vehicle.speedMetersPerSecond,
    };
  });
}

export function isFiniteVehicleTransform(transform: VehicleTransform): boolean {
  const rotation = transform.rotationQuaternion;
  return (
    isFiniteVec3(transform.position) &&
    Number.isFinite(transform.progress) &&
    Number.isFinite(transform.yawRadians) &&
    Number.isFinite(transform.speedMetersPerSecond) &&
    Number.isFinite(rotation.x) &&
    Number.isFinite(rotation.y) &&
    Number.isFinite(rotation.z) &&
    Number.isFinite(rotation.w)
  );
}

function stepOnce(
  simulation: TrafficSimulation,
  deltaSeconds: number,
  stops: readonly TrafficStop[],
): TrafficSimulation {
  const vehicles = simulation.vehicles.map((vehicle) => {
    const gap = bumperGapAhead(vehicle, simulation.vehicles);
    const spacingLimitedSpeed = Math.max(
      0,
      (gap - MIN_BUMPER_GAP_METERS) / COMFORTABLE_TIME_HEADWAY_SECONDS,
    );
    const direction = sampleLane(vehicle.laneId, vehicle.progress).lane
      .direction;
    let stopDistance = Infinity;
    for (const stop of stops) {
      if (
        stop.laneId !== vehicle.laneId ||
        (stop.vehicleId && stop.vehicleId !== vehicle.id) ||
        !Number.isFinite(stop.progress)
      )
        continue;
      const centreGap = forwardRoadDistance(
        vehicle.progress,
        stop.progress,
        direction,
      );
      // A vehicle already at its stop must not see the wrapped full road length.
      const gap =
        centreGap < 0.025 || ROAD_LENGTH_METERS - centreGap < 0.025
          ? 0
          : centreGap;
      stopDistance = Math.min(
        stopDistance,
        Math.max(0, gap - (stop.center ? 0 : vehicle.lengthMeters / 2)),
      );
    }
    const targetSpeed = Math.min(
      vehicle.cruiseSpeedMetersPerSecond,
      spacingLimitedSpeed,
      Math.sqrt(2 * MAX_BRAKING_METERS_PER_SECOND_SQUARED * stopDistance),
    );
    const acceleration =
      targetSpeed >= vehicle.speedMetersPerSecond
        ? MAX_ACCELERATION_METERS_PER_SECOND_SQUARED
        : MAX_BRAKING_METERS_PER_SECOND_SQUARED;
    const speed = moveToward(
      vehicle.speedMetersPerSecond,
      targetSpeed,
      acceleration * deltaSeconds,
    );
    const maximumTravel = Math.min(
      stopDistance,
      Math.max(0, gap - MIN_BUMPER_GAP_METERS),
    );
    const travelMeters = Math.min(speed * deltaSeconds, maximumTravel);

    return {
      ...vehicle,
      progress: advanceRoadProgress(vehicle.progress, direction * travelMeters),
      speedMetersPerSecond: deltaSeconds > 0 ? travelMeters / deltaSeconds : 0,
    };
  });

  return {
    elapsedSeconds: simulation.elapsedSeconds + deltaSeconds,
    vehicles,
  };
}

function bumperGapAhead(
  vehicle: VehicleState,
  allVehicles: readonly VehicleState[],
): number {
  const direction = sampleLane(vehicle.laneId, vehicle.progress).lane.direction;
  let nearestGap = Number.POSITIVE_INFINITY;

  for (const candidate of allVehicles) {
    if (candidate.id === vehicle.id || candidate.laneId !== vehicle.laneId) {
      continue;
    }
    const centerGap = forwardRoadDistance(
      vehicle.progress,
      candidate.progress,
      direction,
    );
    const bumperGap =
      centerGap - (vehicle.lengthMeters + candidate.lengthMeters) / 2;
    nearestGap = Math.min(nearestGap, bumperGap);
  }

  return Number.isFinite(nearestGap)
    ? Math.max(0, nearestGap)
    : ROAD_LENGTH_METERS;
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

function moveToward(
  current: number,
  target: number,
  maximumDelta: number,
): number {
  if (current < target) return Math.min(target, current + maximumDelta);
  return Math.max(target, current - maximumDelta);
}

export const VEHICLE_ROAD_EDGE_CLEARANCE_METERS = VEHICLE_HALF_WIDTH_METERS;
