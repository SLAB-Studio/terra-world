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
  type TrafficSimulation,
} from "./traffic";
import {
  getTrafficVehicleFootprint,
  vehicleFootprintIntersectsCapsule,
} from "./traffic-pedestrians";
import { createResidentNavigation } from "./resident-navigation";
import { canWalkAt, insideWalkBounds, stepWalk } from "./walking";
import { createResidentLife, RESIDENT_RIDE_STOPS } from "./resident-life";

describe("East Bridge physical closure", () => {
  const atTurn = (laneId: "clockwise" | "counter-clockwise") => {
    const closure = createBridgeTrafficClosure();
    const stop = closure.stops.find((line) => line.laneId === laneId)!;
    const traffic = createTrafficSimulation([
      {
        id: "turning-car",
        laneId,
        startProgress: advanceRoadProgress(
          stop.progress,
          laneId === "clockwise" ? -2 : 2,
        ),
        lengthMeters: 4,
        cruiseSpeedMetersPerSecond: 8,
      },
    ]);
    return { closure, traffic };
  };

  it.each(["clockwise", "counter-clockwise"] as const)(
    "checks the complete planned %s U-turn before admitting it",
    (laneId) => {
      const probe = atTurn(laneId);
      let probeTraffic = probe.closure.route(probe.traffic);
      probeTraffic = probe.closure.route({
        ...probeTraffic,
        elapsedSeconds: 1.5,
      });
      const midpoint = probe.closure.transforms(probeTraffic)[0]!.position;
      const person = {
        id: "waiting-npc",
        x: midpoint.x,
        z: midpoint.z,
        radius: 0.4,
      };
      const { closure, traffic } = atTurn(laneId);
      const initial = getTrafficVehicleFootprint(traffic.vehicles[0]!);
      expect(
        vehicleFootprintIntersectsCapsule(
          initial,
          person,
          person,
          person.radius,
        ),
      ).toBe(false);
      const held = closure.route(traffic, [], [person]);
      expect(held.vehicles[0]!.laneId).toBe(laneId);
      expect(closure.pedestrianHazards).toEqual([
        {
          vehicleId: "turning-car",
          personId: "waiting-npc",
          distanceMeters: 0,
          vehiclePosition: initial.center,
          personPosition: { x: person.x, z: person.z },
        },
      ]);
      expect(
        closure.stops.some((stop) => stop.vehicleId === "turning-car"),
      ).toBe(false);
      const clear = closure.route({ ...held, elapsedSeconds: 20 }, [], []);
      expect(closure.pedestrianHazards).toEqual([]);
      expect(clear.vehicles[0]!.laneId).not.toBe(laneId);
      expect(closure.transforms(clear)[0]!.position).toEqual(
        closure.transforms(traffic)[0]!.position,
      );
      closure.dispose();
      probe.closure.dispose();
    },
  );

  it.each([
    { laneId: "clockwise" as const, id: "player-rivergate", radius: 0.4 },
    { laneId: "counter-clockwise" as const, id: "leo-dog", radius: 0.32 },
  ])(
    "holds a rendered turn for late-arriving $id, including a delayed frame",
    ({ laneId, id, radius }) => {
      const probe = atTurn(laneId);
      let probeTraffic = probe.closure.route(probe.traffic);
      probeTraffic = probe.closure.route({
        ...probeTraffic,
        elapsedSeconds: 1.5,
      });
      const target = probe.closure.transforms(probeTraffic)[0]!.position;
      const person = {
        id,
        x: target.x,
        z: target.z,
        radius,
        ignoreVehicleId: "turning-car",
      };
      const { closure, traffic: initial } = atTurn(laneId);
      let traffic: TrafficSimulation = closure.route(initial);
      const start = closure.transforms(traffic)[0]!;
      // The person arrives after admission. A single three-second update must
      // still test the arc, stop before contact and retain the turn reservation.
      traffic = closure.route({ ...traffic, elapsedSeconds: 3 }, [], [person]);
      const held = closure.transforms(traffic)[0]!;
      expect(closure.pedestrianHazards).toEqual([
        {
          vehicleId: "turning-car",
          personId: id,
          distanceMeters: 0,
          vehiclePosition: { x: held.position.x, z: held.position.z },
          personPosition: { x: person.x, z: person.z },
        },
      ]);
      expect(held.speedMetersPerSecond).toBe(0);
      expect(Math.abs(held.yawRadians - start.yawRadians)).toBeLessThan(
        Math.PI / 2,
      );
      expect(
        vehicleFootprintIntersectsCapsule(
          getTrafficVehicleFootprint(traffic.vehicles[0]!, held),
          person,
          person,
          radius,
        ),
      ).toBe(false);
      expect(
        closure.stops.some((stop) => stop.vehicleId === "turning-car"),
      ).toBe(true);
      traffic = closure.route({ ...traffic, elapsedSeconds: 63 }, [], [person]);
      expect(closure.transforms(traffic)[0]!).toEqual(held);
      // Removing the person advances only the next slice, not sixty held seconds.
      traffic = closure.route({ ...traffic, elapsedSeconds: 63.05 });
      expect(closure.pedestrianHazards).toEqual([]);
      const resumed = closure.transforms(traffic)[0]!;
      expect(resumed.yawRadians - held.yawRadians).toBeCloseTo(
        (Math.PI * 0.05) / 3,
        8,
      );
      expect(resumed.speedMetersPerSecond).toBeGreaterThan(0);
      traffic = closure.route({ ...traffic, elapsedSeconds: 67 });
      expect(
        closure.stops.some((stop) => stop.vehicleId === "turning-car"),
      ).toBe(false);
      expect(isFiniteVehicleTransform(closure.transforms(traffic)[0]!)).toBe(
        true,
      );
      closure.dispose();
      probe.closure.dispose();
    },
  );

  it("keeps an underway turn paused for a boarding reservation and finishes after reopening", () => {
    const { closure, traffic: initial } = atTurn("clockwise");
    let traffic = closure.route(initial);
    traffic = closure.route({ ...traffic, elapsedSeconds: 0.5 });
    const pose = closure.transforms(traffic)[0]!;
    closure.setClosed(false);
    traffic = closure.route({ ...traffic, elapsedSeconds: 15 }, [
      "turning-car",
    ]);
    expect(closure.transforms(traffic)[0]!.position).toEqual(pose.position);
    expect(closure.transforms(traffic)[0]!.speedMetersPerSecond).toBe(0);
    expect(closure.stops).toHaveLength(1);
    traffic = closure.route({ ...traffic, elapsedSeconds: 15.05 });
    expect(
      closure.transforms(traffic)[0]!.yawRadians - pose.yawRadians,
    ).toBeCloseTo((Math.PI * 0.05) / 3, 8);
    traffic = closure.route({ ...traffic, elapsedSeconds: 18 });
    expect(closure.stops).toHaveLength(0);
    closure.dispose();
  });

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
