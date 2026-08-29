import { describe, expect, it } from "vitest";

import {
  MAIN_ROAD_LANE_OFFSET,
  MAIN_ROAD_WIDTH,
  sampleCarLane,
  sampleRoadCenterline,
} from "./town-road";

describe("Rivergate car lanes", () => {
  it("keeps every simulated car inside the rendered main road", () => {
    for (let step = 0; step < 400; step += 1) {
      const progress = step / 400;
      const centre = sampleRoadCenterline(progress);
      for (const lane of [-MAIN_ROAD_LANE_OFFSET, MAIN_ROAD_LANE_OFFSET]) {
        const car = sampleCarLane(progress, lane);
        const distance = Math.hypot(car.x - centre.x, car.y - centre.y);
        expect(distance).toBeLessThan(MAIN_ROAD_WIDTH / 2 - 8);
      }
    }
  });

  it("wraps cars smoothly back to the same road", () => {
    expect(sampleRoadCenterline(0)).toEqual(sampleRoadCenterline(1));
    expect(sampleRoadCenterline(-0.25)).toEqual(sampleRoadCenterline(0.75));
  });
});
