import { describe, expect, it } from "vitest";

import {
  advanceRoadProgress,
  forwardRoadDistance,
  isInsideRoad,
  sampleLane,
} from "./road";
import {
  MIN_BUMPER_GAP_METERS,
  VEHICLE_ROAD_EDGE_CLEARANCE_METERS,
  createTrafficSimulation,
  getVehicleTransforms,
  isFiniteVehicleTransform,
  stepTraffic,
  type TrafficSimulation,
  type TrafficStop,
  type VehicleState,
} from "./traffic";
import {
  getTrafficPedestrianHazards,
  trafficVehicleIntersectsCapsule,
  type TrafficPedestrian,
} from "./traffic-pedestrians";

describe("immersive town traffic", () => {
  it.each(["clockwise", "counter-clockwise"] as const)(
    "brakes the %s lane early for a live person and never tunnels through them on delayed frames",
    (laneId) => {
      const direction = laneId === "clockwise" ? 1 : -1;
      for (const progress of [0.001, 0.44, 0.705, 0.999]) {
        const person: TrafficPedestrian = {
          id: "player",
          ...sampleLane(laneId, progress).position,
          radius: 0.4,
        };
        let traffic = createTrafficSimulation([
          {
            id: "car",
            laneId,
            startProgress: advanceRoadProgress(progress, -direction * 20),
            cruiseSpeedMetersPerSecond: 13,
            lengthMeters: 4,
          },
        ]);
        traffic = {
          ...traffic,
          vehicles: traffic.vehicles.map((car) => ({
            ...car,
            speedMetersPerSecond: 13,
          })),
        };
        let previous = traffic.vehicles[0]!;
        let previousGap = 20;
        for (let tick = 0; tick < 30; tick++) {
          traffic = stepTraffic(traffic, tick < 4 ? 0.1 : 2, {
            pedestrians: [person],
          });
          const car = traffic.vehicles[0]!;
          expect(
            trafficVehicleIntersectsCapsule(car, person, person, person.radius),
            `${laneId}:${progress}:${tick}`,
          ).toBe(false);
          const moved = forwardRoadDistance(
            previous.progress,
            car.progress,
            direction,
          );
          const gap = forwardRoadDistance(car.progress, progress, direction);
          expect(gap).toBeLessThanOrEqual(previousGap + 1e-7);
          expect(gap).toBeGreaterThan(1.5);
          previousGap = gap;
          expect(moved).toBeLessThan(21);
          previous = car;
          if (tick === 0) expect(car.speedMetersPerSecond).toBeLessThan(13);
        }
        expect(traffic.vehicles[0]!.speedMetersPerSecond).toBe(0);
        const stopped = traffic.vehicles[0]!.progress;
        traffic = stepTraffic(traffic, 1, { pedestrians: [] });
        expect(
          forwardRoadDistance(
            stopped,
            traffic.vehicles[0]!.progress,
            direction,
          ),
        ).toBeGreaterThan(0.5);
      }
    },
  );

  it("stops a queue behind a crossing person/dog, preserves bumper gaps, and resumes after both leave", () => {
    const progress = 0.4;
    const people: TrafficPedestrian[] = [
      { id: "person", ...sampleLane("clockwise", progress).position },
      {
        id: "dog",
        ...sampleLane("counter-clockwise", progress).position,
        radius: 0.25,
      },
    ];
    let traffic = createTrafficSimulation([
      {
        id: "front",
        laneId: "clockwise",
        startProgress: advanceRoadProgress(progress, -12),
        cruiseSpeedMetersPerSecond: 11,
        lengthMeters: 4,
      },
      {
        id: "queue",
        laneId: "clockwise",
        startProgress: advanceRoadProgress(progress, -25),
        cruiseSpeedMetersPerSecond: 13,
        lengthMeters: 4,
      },
      {
        id: "oncoming",
        laneId: "counter-clockwise",
        startProgress: advanceRoadProgress(progress, 15),
        cruiseSpeedMetersPerSecond: 11,
        lengthMeters: 4,
      },
    ]);
    for (let tick = 0; tick < 250; tick++) {
      traffic = stepTraffic(traffic, 0.1, { pedestrians: people });
      expect(smallestBumperGap(traffic, "clockwise")).toBeGreaterThanOrEqual(
        MIN_BUMPER_GAP_METERS - 1e-7,
      );
      for (const car of traffic.vehicles)
        for (const person of people)
          expect(
            trafficVehicleIntersectsCapsule(car, person, person, person.radius),
          ).toBe(false);
    }
    expect(
      traffic.vehicles.every((car) => car.speedMetersPerSecond < 0.01),
    ).toBe(true);
    traffic = stepTraffic(traffic, 2);
    expect(traffic.vehicles.every((car) => car.speedMetersPerSecond > 0)).toBe(
      true,
    );
  });

  it("responds to a newly crossing person and to only the matching boarding exclusion", () => {
    let traffic = createTrafficSimulation([
      {
        id: "car",
        laneId: "clockwise",
        startProgress: 0.45,
        cruiseSpeedMetersPerSecond: 13,
        lengthMeters: 4,
      },
    ]);
    traffic = stepTraffic(traffic, 2);
    const car = traffic.vehicles[0]!;
    const ahead = sampleLane(car.laneId, advanceRoadProgress(car.progress, 5));
    const person = {
      id: "crossing",
      x: ahead.position.x,
      z: ahead.position.z,
      radius: 0.4,
    };
    const stopped = stepTraffic(traffic, 2, { pedestrians: [person] });
    expect(stopped.vehicles[0]!.speedMetersPerSecond).toBe(0);
    expect(
      trafficVehicleIntersectsCapsule(stopped.vehicles[0]!, person, person),
    ).toBe(false);
    expect(
      stepTraffic(traffic, 2, {
        pedestrians: [{ ...person, ignoreVehicleId: "different-car" }],
      }),
    ).toEqual(stopped);
    expect(
      stepTraffic(traffic, 2, {
        pedestrians: [{ ...person, ignoreVehicleId: "car" }],
      }),
    ).toEqual(stepTraffic(traffic, 2));
    expect(getTrafficPedestrianHazards(stopped, [person])).toHaveLength(1);
    expect(
      stepTraffic(stopped, 2, { pedestrians: [person], reducedMotion: true }),
    ).toBe(stopped);
  });

  it.each(["clockwise", "counter-clockwise"] as const)(
    "stops the %s lane before a crossing without wraparound overshoot, then resumes",
    (laneId) => {
      const direction = laneId === "clockwise" ? 1 : -1;
      const progress = laneId === "clockwise" ? 0.001 : 0.999;
      const stops: readonly TrafficStop[] = [
        { id: "crossing", laneId, progress },
      ];
      let traffic = createTrafficSimulation([
        {
          id: "crossing-car",
          laneId,
          startProgress: advanceRoadProgress(progress, -direction * 18),
          cruiseSpeedMetersPerSecond: 13,
          lengthMeters: 4,
        },
      ]);
      let previousGap = 18;
      for (let i = 0; i < 400; i++) {
        traffic = stepTraffic(traffic, 0.05, { stops });
        const vehicle = traffic.vehicles[0]!;
        const gap = forwardRoadDistance(vehicle.progress, progress, direction);
        expect(gap).toBeGreaterThanOrEqual(2 - 1e-7);
        expect(gap).toBeLessThanOrEqual(previousGap + 1e-7);
        previousGap = gap;
      }
      expect(previousGap).toBeCloseTo(2, 5);
      expect(traffic.vehicles[0]!.speedMetersPerSecond).toBe(0);
      const held = traffic.vehicles[0]!.progress;
      traffic = stepTraffic(traffic, 2, { stops });
      expect(traffic.vehicles[0]!.progress).toBe(held);
      traffic = stepTraffic(traffic, 1);
      expect(
        forwardRoadDistance(held, traffic.vehicles[0]!.progress, direction),
      ).toBeGreaterThan(0.5);
    },
  );

  it.each(["clockwise", "counter-clockwise"] as const)(
    "holds a reserved %s vehicle at its exact center stop even with a delayed high-speed frame",
    (laneId) => {
      const direction = laneId === "clockwise" ? 1 : -1;
      const progress = 0.4;
      let traffic = createTrafficSimulation([
        {
          id: "reserved",
          laneId,
          startProgress: advanceRoadProgress(progress, -direction * 1),
          cruiseSpeedMetersPerSecond: 13,
          lengthMeters: 4,
        },
      ]);
      traffic = {
        ...traffic,
        vehicles: traffic.vehicles.map((vehicle) => ({
          ...vehicle,
          speedMetersPerSecond: 13,
        })),
      };
      const stops: readonly TrafficStop[] = [
        { id: "pickup", vehicleId: "reserved", laneId, progress, center: true },
      ];
      traffic = stepTraffic(traffic, 10, { stops });
      expect(
        separationOnRoad(traffic.vehicles[0]!.progress, progress),
      ).toBeLessThan(0.0251);
      expect(traffic.vehicles[0]!.speedMetersPerSecond).toBe(0);
      const held = traffic.vehicles[0]!.progress;
      traffic = stepTraffic(traffic, 2, { stops });
      expect(traffic.vehicles[0]!.progress).toBe(held);
    },
  );

  it("does not apply a reservation to another vehicle or lane and ignores malformed stop positions", () => {
    const traffic = createTrafficSimulation([
      {
        id: "first",
        laneId: "clockwise",
        startProgress: 0.2,
        cruiseSpeedMetersPerSecond: 8,
        lengthMeters: 4,
      },
      {
        id: "second",
        laneId: "counter-clockwise",
        startProgress: 0.2,
        cruiseSpeedMetersPerSecond: 8,
        lengthMeters: 4,
      },
    ]);
    const irrelevant: readonly TrafficStop[] = [
      {
        id: "not-ours",
        vehicleId: "absent",
        laneId: "clockwise",
        progress: 0.2,
        center: true,
      },
      { id: "invalid", laneId: "counter-clockwise", progress: NaN },
    ];
    expect(stepTraffic(traffic, 1, { stops: irrelevant })).toEqual(
      stepTraffic(traffic, 1),
    );
  });
  it("produces deterministic finite transforms constrained to their lanes", () => {
    let first = createTrafficSimulation();
    let second = createTrafficSimulation();

    for (let tick = 0; tick < 3_600; tick += 1) {
      first = stepTraffic(first, 1 / 60);
      second = stepTraffic(second, 1 / 60);

      if (tick % 30 === 0) {
        expect(second).toEqual(first);
        for (const transform of getVehicleTransforms(first)) {
          const expected = sampleLane(transform.laneId, transform.progress);
          expect(isFiniteVehicleTransform(transform)).toBe(true);
          expect(transform.position).toEqual(expected.position);
          expect(
            isInsideRoad(
              transform.position,
              transform.progress,
              VEHICLE_ROAD_EDGE_CLEARANCE_METERS,
            ),
          ).toBe(true);
        }
      }
    }
  });

  it("maintains a safe bumper gap even when a faster car catches traffic", () => {
    let simulation = createTrafficSimulation([
      {
        id: "leader",
        laneId: "clockwise",
        startProgress: 0.2,
        cruiseSpeedMetersPerSecond: 5,
        lengthMeters: 4,
      },
      {
        id: "follower",
        laneId: "clockwise",
        startProgress: 0.12,
        cruiseSpeedMetersPerSecond: 13,
        lengthMeters: 4,
      },
      {
        id: "oncoming",
        laneId: "counter-clockwise",
        startProgress: 0.2,
        cruiseSpeedMetersPerSecond: 8,
        lengthMeters: 4,
      },
    ]);

    for (let tick = 0; tick < 12_000; tick += 1) {
      simulation = stepTraffic(simulation, 1 / 60);
      if (tick % 10 === 0) {
        expect(
          smallestBumperGap(simulation, "clockwise"),
        ).toBeGreaterThanOrEqual(MIN_BUMPER_GAP_METERS - 1e-7);
      }
    }
  });

  it("moves opposing lanes in opposite directions and fully pauses reduced motion", () => {
    const initial = createTrafficSimulation();
    const moving = stepTraffic(initial, 1);
    const paused = stepTraffic(moving, 30, { reducedMotion: true });
    const initialById = new Map(
      initial.vehicles.map((vehicle) => [vehicle.id, vehicle]),
    );

    expect(paused).toBe(moving);
    for (const vehicle of moving.vehicles) {
      const before = initialById.get(vehicle.id);
      expect(before).toBeDefined();
      if (vehicle.laneId === "clockwise") {
        expect(vehicle.progress).toBeGreaterThan(before!.progress);
      } else {
        expect(vehicle.progress).toBeLessThan(before!.progress);
      }
    }
  });
});

function separationOnRoad(a: number, b: number) {
  return Math.min(forwardRoadDistance(a, b, 1), forwardRoadDistance(a, b, -1));
}

function smallestBumperGap(
  simulation: TrafficSimulation,
  laneId: VehicleState["laneId"],
): number {
  const lane = simulation.vehicles.filter(
    (vehicle) => vehicle.laneId === laneId,
  );
  let minimum = Number.POSITIVE_INFINITY;

  for (const vehicle of lane) {
    const direction = sampleLane(laneId, vehicle.progress).lane.direction;
    for (const candidate of lane) {
      if (candidate.id === vehicle.id) continue;
      const bumperGap =
        forwardRoadDistance(vehicle.progress, candidate.progress, direction) -
        (vehicle.lengthMeters + candidate.lengthMeters) / 2;
      minimum = Math.min(minimum, bumperGap);
    }
  }

  return minimum;
}
