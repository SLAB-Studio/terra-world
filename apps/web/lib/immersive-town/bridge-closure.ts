import {
  advanceRoadProgress,
  forwardRoadDistance,
  LANE_CENTER_OFFSET_METERS,
  sampleLane,
  sampleRoadFrame,
  type LaneId,
} from "./road";
import {
  getVehicleTransforms,
  type TrafficSimulation,
  type TrafficStop,
  type VehicleTransform,
} from "./traffic";
import type { WalkBounds } from "./walking";

/** The existing north bridge is East Bridge in the opening scenario. */
export const EAST_BRIDGE_PROGRESS = 0.283;
export const SAFE_BRIDGE_PROGRESS = 0.705;
/** Controlled crossings connect the northern pavements to the safe south route. */
export const CHAPTER_DETOUR_CROSSINGS = Object.freeze([
  Object.freeze({ id: "chapter-west-detour-crossing", progress: 0.1 }),
  Object.freeze({ id: "chapter-east-detour-crossing", progress: 0.4 }),
  Object.freeze({ id: "chapter-south-approach-crossing", progress: 0.77 }),
]);
export const EAST_BRIDGE_HALF_LENGTH = 13;
const TURN_STOP_DISTANCE = 21;
const TURN_SECONDS = 3;
const frame = sampleRoadFrame(EAST_BRIDGE_PROGRESS);
const corners = [-1, 1].flatMap((along) =>
  [-1, 1].map((across) => ({
    x:
      frame.center.x +
      frame.tangent.x * along * EAST_BRIDGE_HALF_LENGTH +
      frame.lateral.x * across * 6.8,
    z:
      frame.center.z +
      frame.tangent.z * along * EAST_BRIDGE_HALF_LENGTH +
      frame.lateral.z * across * 6.8,
  })),
);

/** Conservative deck footprint: includes both pavements and rail margins. */
export const EAST_BRIDGE_WALK_BOUNDS: WalkBounds = Object.freeze({
  minX: Math.min(...corners.map((p) => p.x)),
  maxX: Math.max(...corners.map((p) => p.x)),
  minZ: Math.min(...corners.map((p) => p.z)),
  maxZ: Math.max(...corners.map((p) => p.z)),
});

export function isOnClosedBridge(progress: number, extraMeters = 0): boolean {
  return (
    Math.min(
      forwardRoadDistance(progress, EAST_BRIDGE_PROGRESS, 1),
      forwardRoadDistance(progress, EAST_BRIDGE_PROGRESS, -1),
    ) <
    EAST_BRIDGE_HALF_LENGTH + extraMeters
  );
}

type Turn = { id: string; fromLane: LaneId; progress: number; start: number };
const opposite = (lane: LaneId): LaneId =>
  lane === "clockwise" ? "counter-clockwise" : "clockwise";
const directionOf = (lane: LaneId) => (lane === "clockwise" ? 1 : -1);

/**
 * The road is a single ring, not a second invented road. Close one crossing and
 * turn vehicles at its two approaches; their remaining journey uses the real
 * south bridge. A stopped three-second semicircle animates each lane change.
 */
export function createBridgeTrafficClosure() {
  let closed = true;
  const turns = new Map<string, Turn>();
  const stopLines: readonly TrafficStop[] = (
    ["clockwise", "counter-clockwise"] as const
  ).map((laneId) => ({
    id: `east-bridge-${laneId}`,
    laneId,
    progress: advanceRoadProgress(
      EAST_BRIDGE_PROGRESS,
      -directionOf(laneId) * TURN_STOP_DISTANCE,
    ),
  }));
  return {
    setClosed(next: boolean) {
      closed = next;
    },
    get closed() {
      return closed;
    },
    get stops(): readonly TrafficStop[] {
      return [
        ...(closed ? stopLines : []),
        ...Array.from(turns.values(), (turn) => ({
          id: `east-turn-${turn.id}`,
          vehicleId: turn.id,
          laneId: opposite(turn.fromLane),
          progress: turn.progress,
          center: true,
        })),
      ];
    },
    /** Initial placement only, before the first render. Preserve every vehicle. */
    prepare(simulation: TrafficSimulation): TrafficSimulation {
      if (!closed) return simulation;
      const placed = simulation.vehicles.filter(
        (v) =>
          !isOnClosedBridge(
            v.progress,
            TURN_STOP_DISTANCE - EAST_BRIDGE_HALF_LENGTH + v.lengthMeters,
          ),
      );
      const vehicles = simulation.vehicles.map((vehicle) => {
        if (placed.includes(vehicle)) return vehicle;
        const direction = directionOf(vehicle.laneId);
        let progress = advanceRoadProgress(
          EAST_BRIDGE_PROGRESS,
          -direction * (TURN_STOP_DISTANCE + vehicle.lengthMeters + 8),
        );
        for (let n = 0; n < 100; n++) {
          if (
            !placed.some(
              (other) =>
                other.laneId === vehicle.laneId &&
                Math.min(
                  forwardRoadDistance(progress, other.progress, 1),
                  forwardRoadDistance(progress, other.progress, -1),
                ) <
                  (vehicle.lengthMeters + other.lengthMeters) / 2 + 7,
            )
          )
            break;
          progress = advanceRoadProgress(progress, -direction * 10);
        }
        const moved = { ...vehicle, progress, speedMetersPerSecond: 0 };
        placed.push(moved);
        return moved;
      });
      return { ...simulation, vehicles };
    },
    route(
      simulation: TrafficSimulation,
      reservedVehicleIds: readonly string[] = [],
    ): TrafficSimulation {
      for (const [id, turn] of turns)
        if (simulation.elapsedSeconds - turn.start >= TURN_SECONDS)
          turns.delete(id);
      if (!closed) return simulation;
      const vehicles = [...simulation.vehicles];
      for (let index = 0; index < vehicles.length; index++) {
        const vehicle = vehicles[index]!;
        if (
          turns.has(vehicle.id) ||
          reservedVehicleIds.includes(vehicle.id) ||
          vehicle.speedMetersPerSecond > 0.08
        )
          continue;
        const direction = directionOf(vehicle.laneId);
        const stop = stopLines.find((line) => line.laneId === vehicle.laneId)!;
        const gap = forwardRoadDistance(
          vehicle.progress,
          stop.progress,
          direction,
        );
        if (Math.abs(gap - vehicle.lengthMeters / 2) > 0.15) continue;
        const newLane = opposite(vehicle.laneId);
        // Reserve enough clear pavement for the complete turn, including a
        // moving opposing vehicle's next three seconds. Never turn into it.
        if (
          vehicles.some(
            (other) =>
              other.id !== vehicle.id &&
              other.laneId === newLane &&
              Math.min(
                forwardRoadDistance(vehicle.progress, other.progress, 1),
                forwardRoadDistance(vehicle.progress, other.progress, -1),
              ) < 35,
          )
        )
          continue;
        turns.set(vehicle.id, {
          id: vehicle.id,
          fromLane: vehicle.laneId,
          progress: vehicle.progress,
          start: simulation.elapsedSeconds,
        });
        vehicles[index] = {
          ...vehicle,
          laneId: newLane,
          speedMetersPerSecond: 0,
        };
      }
      return { ...simulation, vehicles };
    },
    transforms(simulation: TrafficSimulation): readonly VehicleTransform[] {
      return getVehicleTransforms(simulation).map((transform) => {
        const turn = turns.get(transform.id);
        if (!turn) return transform;
        const amount = Math.max(
          0,
          Math.min(1, (simulation.elapsedSeconds - turn.start) / TURN_SECONDS),
        );
        const angle = amount * Math.PI;
        const road = sampleRoadFrame(turn.progress);
        const lane = sampleLane(turn.fromLane, turn.progress);
        const sign = directionOf(turn.fromLane);
        const across = sign * LANE_CENTER_OFFSET_METERS * Math.cos(angle);
        const along = sign * LANE_CENTER_OFFSET_METERS * Math.sin(angle);
        const yawRadians = lane.yawRadians + angle;
        return {
          ...transform,
          position: {
            x: road.center.x + road.lateral.x * across + road.tangent.x * along,
            y: road.center.y,
            z: road.center.z + road.lateral.z * across + road.tangent.z * along,
          },
          yawRadians,
          rotationQuaternion: {
            x: 0,
            y: Math.sin(yawRadians / 2),
            z: 0,
            w: Math.cos(yawRadians / 2),
          },
          speedMetersPerSecond:
            (Math.PI * LANE_CENTER_OFFSET_METERS) / TURN_SECONDS,
        };
      });
    },
    dispose() {
      turns.clear();
      closed = false;
    },
  };
}
