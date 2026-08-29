import { describe, expect, it } from "vitest";

import {
  LANES,
  ROAD_HALF_WIDTH_METERS,
  VEHICLE_HALF_WIDTH_METERS,
  isFiniteVec3,
  isInsideRoad,
  lateralDistanceFromRoadCenter,
  sampleLane,
  sampleRoadFrame,
} from "./road";

describe("immersive town road spline", () => {
  it("is a position- and tangent-continuous closed loop", () => {
    const start = sampleRoadFrame(0);
    const end = sampleRoadFrame(1);

    expect(end.center).toEqual(start.center);
    expect(end.tangent.x).toBeCloseTo(start.tangent.x, 12);
    expect(end.tangent.y).toBeCloseTo(start.tangent.y, 12);
    expect(end.tangent.z).toBeCloseTo(start.tangent.z, 12);
  });

  it("keeps both lane centers and full vehicle widths inside the road", () => {
    for (let index = 0; index < 5_000; index += 1) {
      const progress = index / 5_000;
      for (const laneId of ["clockwise", "counter-clockwise"] as const) {
        const sample = sampleLane(laneId, progress);
        const distance = lateralDistanceFromRoadCenter(
          sample.position,
          progress,
        );

        expect(isFiniteVec3(sample.position)).toBe(true);
        expect(distance).toBeCloseTo(Math.abs(LANES[laneId].offsetMeters), 10);
        expect(
          isInsideRoad(sample.position, progress, VEHICLE_HALF_WIDTH_METERS),
        ).toBe(true);
        expect(distance + VEHICLE_HALF_WIDTH_METERS).toBeLessThan(
          ROAD_HALF_WIDTH_METERS,
        );
      }
    }
  });

  it("orients opposing lanes in opposite travel directions", () => {
    for (let index = 0; index < 100; index += 1) {
      const progress = index / 100;
      const clockwise = sampleLane("clockwise", progress).forward;
      const counterClockwise = sampleLane(
        "counter-clockwise",
        progress,
      ).forward;
      const dot =
        clockwise.x * counterClockwise.x +
        clockwise.y * counterClockwise.y +
        clockwise.z * counterClockwise.z;

      expect(dot).toBeCloseTo(-1, 12);
    }
  });
});
