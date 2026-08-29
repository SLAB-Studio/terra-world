import { describe, expect, it } from "vitest";

import { forwardRoadDistance, isInsideRoad, sampleLane } from "./road";
import {
  MIN_BUMPER_GAP_METERS,
  VEHICLE_ROAD_EDGE_CLEARANCE_METERS,
  createTrafficSimulation,
  getVehicleTransforms,
  isFiniteVehicleTransform,
  stepTraffic,
  type TrafficSimulation,
  type VehicleState,
} from "./traffic";

describe("immersive town traffic", () => {
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
