import { describe, expect, it } from "vitest";
import {
  createBridgeTrafficClosure,
  EAST_BRIDGE_PROGRESS,
  EAST_BRIDGE_WALK_BOUNDS,
  SAFE_BRIDGE_PROGRESS,
  isOnClosedBridge,
} from "./bridge-closure";
import {
  advanceRoadProgress,
  forwardRoadDistance,
  sampleRoadFrame,
} from "./road";
import {
  createTrafficSimulation,
  stepTraffic,
  isFiniteVehicleTransform,
} from "./traffic";
import { createResidentNavigation } from "./resident-navigation";
import { canWalkAt, insideWalkBounds, stepWalk } from "./walking";
import { createResidentLife, RESIDENT_RIDE_STOPS } from "./resident-life";

describe("East Bridge physical closure", () => {
  it("holds both driving directions outside the deck, preserves the fleet, and uses the real remaining crossing", () => {
    const closure = createBridgeTrafficClosure();
    let traffic = closure.prepare(createTrafficSimulation());
    const ids = traffic.vehicles.map((v) => v.id);
    const safeCrossings = new Set<string>();
    const changedLanes = new Set<string>();
    for (let step = 0; step < 9_000; step++) {
      const before = traffic;
      traffic = closure.route(
        stepTraffic(traffic, 0.05, { stops: closure.stops }),
      );
      for (const vehicle of traffic.vehicles) {
        expect(
          isOnClosedBridge(vehicle.progress, vehicle.lengthMeters / 2),
          `${vehicle.id} crossed closed bridge at ${step}`,
        ).toBe(false);
        if (
          Math.min(
            forwardRoadDistance(vehicle.progress, SAFE_BRIDGE_PROGRESS, 1),
            forwardRoadDistance(vehicle.progress, SAFE_BRIDGE_PROGRESS, -1),
          ) < 3
        )
          safeCrossings.add(vehicle.id);
        if (
          before.vehicles.find((v) => v.id === vehicle.id)!.laneId !==
          vehicle.laneId
        )
          changedLanes.add(vehicle.id);
      }
      for (const transform of closure.transforms(traffic)) {
        expect(isFiniteVehicleTransform(transform)).toBe(true);
        // The rendered turn itself must never enter the closed deck either.
        expect(
          insideWalkBounds(transform.position, EAST_BRIDGE_WALK_BOUNDS),
        ).toBe(false);
      }
    }
    expect(traffic.vehicles.map((v) => v.id)).toEqual(ids);
    expect(safeCrossings.size).toBe(ids.length);
    expect(changedLanes.size).toBe(ids.length);
  }, 30_000);

  it("does not turn a vehicle while a passenger uses its doorway", () => {
    const closure = createBridgeTrafficClosure();
    const stop = closure.stops.find((s) => s.laneId === "clockwise")!;
    const traffic = createTrafficSimulation([
      {
        id: "bus",
        laneId: "clockwise",
        startProgress: advanceRoadProgress(stop.progress, -3),
        lengthMeters: 6,
        cruiseSpeedMetersPerSecond: 8,
      },
    ]);
    expect(closure.route(traffic, ["bus"]).vehicles[0]!.laneId).toBe(
      "clockwise",
    );
    expect(closure.route(traffic).vehicles[0]!.laneId).toBe(
      "counter-clockwise",
    );
  });

  it("keeps a diverted passenger's drop-off on the vehicle's new curb", () => {
    const life = createResidentLife(
      [{ id: "passenger", point: { x: -50, z: -45 }, yaw: 0 }],
      [{ id: "home", kind: "home", point: { x: -50, z: -45 } }],
      createResidentNavigation([]),
    );
    const traffic = createTrafficSimulation([
      {
        id: "sunny-bus",
        laneId: "clockwise",
        startProgress: 0.14,
        lengthMeters: 6,
        cruiseSpeedMetersPerSecond: 8,
      },
    ]);
    life.setTraffic(traffic);
    const state = life.states[0]!;
    const pickup = RESIDENT_RIDE_STOPS.find((s) => s.laneId === "clockwise")!;
    const dropoff = RESIDENT_RIDE_STOPS.find(
      (s) => s.laneId === "clockwise" && s.progress !== pickup.progress,
    )!;
    state.mode = "riding";
    state.ride = { vehicleId: "sunny-bus", pickup, dropoff };
    life.setTraffic({
      ...traffic,
      vehicles: traffic.vehicles.map((v) => ({
        ...v,
        laneId: "counter-clockwise",
      })),
    });
    expect(state.ride.dropoff.laneId).toBe("counter-clockwise");
    expect(state.ride.dropoff.progress).toBe(dropoff.progress);
    expect(
      life.trafficStops.find((stop) => stop.vehicleId === "sunny-bus")?.laneId,
    ).toBe("counter-clockwise");
    life.dispose();
  });

  it("reopens without erasing traffic history, and rejects endpoint and diagonal pedestrian entry", () => {
    const closure = createBridgeTrafficClosure();
    const traffic = closure.prepare(createTrafficSimulation());
    closure.setClosed(false);
    expect(closure.stops).toHaveLength(0);
    expect(closure.prepare(traffic)).toBe(traffic);
    expect(closure.route(traffic)).toBe(traffic);
    let obstacles = [EAST_BRIDGE_WALK_BOUNDS];
    const nav = createResidentNavigation([], {
      dynamicObstacles: () => obstacles,
    });
    const center = sampleRoadFrame(EAST_BRIDGE_PROGRESS).center;
    expect(nav.isWalkable(center)).toBe(false);
    expect(
      nav.segmentIsWalkable(
        { x: center.x - 20, z: center.z - 9 },
        { x: center.x + 20, z: center.z + 9 },
      ),
    ).toBe(false);
    let walker = {
      x: EAST_BRIDGE_WALK_BOUNDS.minX - 0.5,
      z: center.z,
      yaw: Math.PI / 2,
    };
    for (let i = 0; i < 60; i++)
      walker = stepWalk(
        walker,
        { forward: 1, right: 0, turn: 0 },
        0.05,
        obstacles,
      );
    expect(walker.x).toBeLessThan(EAST_BRIDGE_WALK_BOUNDS.minX);
    obstacles = [];
    nav.invalidateGeometry();
    expect(canWalkAt(center, obstacles)).toBe(true);
    closure.dispose();
  });
});
