import { describe, expect, it } from "vitest";
import { advanceRoadProgress, sampleLane, sampleRoadFrame } from "./road";
import { createTrafficSimulation, type VehicleState } from "./traffic";
import {
  getTrafficPedestrianHazards,
  getTrafficVehicleFootprint,
  sweptVehicleFootprintIntersectsCircle,
  trafficVehicleIntersectsCapsule,
  vehicleFootprintIntersectsCapsule,
  vehicleFootprintPointClearance,
} from "./traffic-pedestrians";

const vehicle = (
  laneId: VehicleState["laneId"],
  progress: number,
  lengthMeters = 4,
): VehicleState => ({
  id: "car",
  laneId,
  progress,
  lengthMeters,
  speedMetersPerSecond: 13,
  cruiseSpeedMetersPerSecond: 13,
});

describe("live pedestrian vehicle geometry", () => {
  it.each(["clockwise", "counter-clockwise"] as const)(
    "sweeps the actual %s lane through curves and loop wrap",
    (laneId) => {
      const direction = laneId === "clockwise" ? 1 : -1;
      for (const progress of [
        0.001, 0.09, 0.28, 0.43, 0.48, 0.69, 0.91, 0.999,
      ]) {
        const car = vehicle(
          laneId,
          advanceRoadProgress(progress, -direction * 15),
          5.8,
        );
        const person = {
          id: "person",
          ...sampleLane(laneId, progress).position,
        };
        const hazards = getTrafficPedestrianHazards(
          { elapsedSeconds: 0, vehicles: [car] },
          [person],
        );
        expect(hazards, `${laneId}:${progress}`).toHaveLength(1);
        expect(hazards[0]!.personId).toBe("person");
        expect(hazards[0]!.distanceMeters).toBeGreaterThan(5);
        expect(hazards[0]!.distanceMeters).toBeLessThan(15);
      }
    },
  );

  it("does not confuse the other lane, sidewalks or people behind with a forward blocker", () => {
    const car = vehicle("clockwise", 0.2);
    const frame = sampleRoadFrame(0.2);
    const people = [
      { id: "other-lane", ...sampleLane("counter-clockwise", 0.2).position },
      {
        id: "behind",
        ...sampleLane("clockwise", advanceRoadProgress(0.2, -10)).position,
      },
      {
        id: "sidewalk",
        x: frame.center.x + frame.lateral.x * 5.4,
        z: frame.center.z + frame.lateral.z * 5.4,
      },
    ];
    expect(
      getTrafficPedestrianHazards(
        { elapsedSeconds: 0, vehicles: [car] },
        people,
      ),
    ).toEqual([]);
  });

  it("returns only the nearest blocker and applies a boarding exclusion only to that vehicle", () => {
    const cars = [
      vehicle("clockwise", 0.2),
      {
        ...vehicle("clockwise", advanceRoadProgress(0.2, -12)),
        id: "following",
      },
    ];
    const near = {
      id: "boarder",
      ...sampleLane("clockwise", advanceRoadProgress(0.2, 6)).position,
      ignoreVehicleId: "car",
    };
    const far = {
      id: "dog",
      ...sampleLane("clockwise", advanceRoadProgress(0.2, 10)).position,
      radius: 0.25,
    };
    const hazards = getTrafficPedestrianHazards(
      { elapsedSeconds: 0, vehicles: cars },
      [far, near],
    );
    expect(
      hazards.map((hazard) => [hazard.vehicleId, hazard.personId]),
    ).toEqual([
      ["car", "dog"],
      ["following", "boarder"],
    ]);
  });

  it("uses the rotated body and exact circle corners for point and swept player checks", () => {
    const car = vehicle("clockwise", 0.2);
    const body = getTrafficVehicleFootprint(car, {
      position: { x: 10, z: 20 },
      yawRadians: Math.PI / 4,
    });
    const point = (across: number, along: number) => ({
      x: body.center.x + body.lateral.x * across + body.forward.x * along,
      z: body.center.z + body.lateral.z * across + body.forward.z * along,
    });
    expect(
      vehicleFootprintIntersectsCapsule(body, point(0, 0), point(0, 0)),
    ).toBe(true);
    expect(
      vehicleFootprintIntersectsCapsule(body, point(-4, 0), point(4, 0)),
    ).toBe(true);
    const nearSide = point(body.halfWidth + 0.39, 0);
    const clearSide = point(body.halfWidth + 0.41, 0);
    expect(vehicleFootprintIntersectsCapsule(body, nearSide, nearSide)).toBe(
      true,
    );
    expect(vehicleFootprintIntersectsCapsule(body, clearSide, clearSide)).toBe(
      false,
    );
    const outsideCorner = point(body.halfWidth + 0.31, body.halfLength + 0.31);
    expect(
      vehicleFootprintIntersectsCapsule(body, outsideCorner, outsideCorner),
    ).toBe(false);
    expect(vehicleFootprintPointClearance(body, point(0, 0))).toBeLessThan(0);
    expect(vehicleFootprintPointClearance(body, point(0.2, 0))).toBeGreaterThan(
      vehicleFootprintPointClearance(body, point(0, 0)),
    );
    expect(vehicleFootprintPointClearance(body, clearSide)).toBeGreaterThan(0);
    const center = sampleLane(car.laneId, car.progress).position;
    expect(trafficVehicleIntersectsCapsule(car, center, center)).toBe(true);
  });

  it("accepts tiny dog radii without missing a turning vehicle's swept corner", () => {
    const car = vehicle("clockwise", 0.44, 5.8);
    const future = getTrafficVehicleFootprint({
      ...car,
      progress: advanceRoadProgress(car.progress, 7.125),
    });
    const dog = {
      id: "small-dog",
      radius: 0.08,
      x:
        future.center.x +
        future.forward.x * future.halfLength +
        future.lateral.x * (future.halfWidth - 0.01),
      z:
        future.center.z +
        future.forward.z * future.halfLength +
        future.lateral.z * (future.halfWidth - 0.01),
    };
    expect(
      trafficVehicleIntersectsCapsule(
        { ...car, progress: advanceRoadProgress(car.progress, 7.125) },
        dog,
        dog,
        dog.radius,
      ),
    ).toBe(true);
    const hazard = getTrafficPedestrianHazards(
      { elapsedSeconds: 0, vehicles: [car] },
      [dog],
    )[0];
    expect(hazard).toBeDefined();
    expect(hazard!.distanceMeters).toBeLessThan(7.125);
  });

  it("does not miss small bodies on either swept corner across the curved loop", () => {
    for (const laneId of ["clockwise", "counter-clockwise"] as const) {
      const direction = laneId === "clockwise" ? 1 : -1;
      for (const progress of [
        0.005, 0.08, 0.17, 0.28, 0.39, 0.44, 0.47, 0.56, 0.67, 0.79, 0.89,
        0.995,
      ]) {
        const car = vehicle(laneId, progress, 5.8);
        for (const travel of [0.125, 7.125, 17.125]) {
          const future = getTrafficVehicleFootprint({
            ...car,
            progress: advanceRoadProgress(progress, direction * travel),
          });
          for (const side of [-1, 1]) {
            const person = {
              id: "small-body",
              radius: 0.05,
              x:
                future.center.x +
                future.forward.x * future.halfLength +
                future.lateral.x * side * (future.halfWidth - 0.01),
              z:
                future.center.z +
                future.forward.z * future.halfLength +
                future.lateral.z * side * (future.halfWidth - 0.01),
            };
            const hazards = getTrafficPedestrianHazards(
              { elapsedSeconds: 0, vehicles: [car] },
              [person],
            );
            expect(
              hazards,
              `${laneId}:${progress}:${travel}:${side}`,
            ).toHaveLength(1);
            expect(hazards[0]!.distanceMeters).toBeLessThan(travel);
          }
        }
      }
    }
  });

  it("checks an off-lane rendered turn sweep instead of the unchanged lane centre", () => {
    const car = vehicle("clockwise", 0.2);
    const from = getTrafficVehicleFootprint(car, {
      position: { x: 10, z: 10 },
      yawRadians: 0,
    });
    const to = getTrafficVehicleFootprint(car, {
      position: { x: 10.12, z: 10.03 },
      yawRadians: 0.05,
    });
    const point = { x: 11.3, z: 11.9 };
    expect(vehicleFootprintIntersectsCapsule(from, point, point, 0.05)).toBe(
      false,
    );
    expect(sweptVehicleFootprintIntersectsCircle(from, to, point, 0.05)).toBe(
      true,
    );
    expect(
      sweptVehicleFootprintIntersectsCircle(from, to, { x: 15, z: 15 }, 0.4),
    ).toBe(false);
  });

  it("ignores malformed hazard coordinates and reports an existing body overlap immediately", () => {
    const traffic = createTrafficSimulation([
      {
        id: "car",
        laneId: "clockwise",
        startProgress: 0.2,
        cruiseSpeedMetersPerSecond: 8,
        lengthMeters: 4,
      },
    ]);
    const center = sampleLane("clockwise", 0.2).position;
    expect(
      getTrafficPedestrianHazards(traffic, [{ id: "bad", x: NaN, z: 0 }]),
    ).toEqual([]);
    expect(
      getTrafficPedestrianHazards(traffic, [{ id: "inside", ...center }])[0]!
        .distanceMeters,
    ).toBe(0);
  });
});
