import { describe, expect, it } from "vitest";
import {
  BOARDING_DOOR_SECONDS,
  nextBoardingDoorProgress,
} from "./vehicle-doors";

describe("boarding door safety", () => {
  it("opens and closes over the same bounded, deliberate interval", () => {
    let progress = 0;
    for (let index = 0; index < 7; index++) {
      progress = nextBoardingDoorProgress(
        progress,
        true,
        0,
        BOARDING_DOOR_SECONDS / 7,
      );
    }
    expect(progress).toBeCloseTo(1);
    const partial = nextBoardingDoorProgress(progress, false, 0, 0.1);
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(1);
    for (let index = 0; index < 7; index++) {
      progress = nextBoardingDoorProgress(
        progress,
        false,
        0,
        BOARDING_DOOR_SECONDS / 7,
      );
    }
    expect(progress).toBeCloseTo(0);
  });

  it.each([0.03, -0.03, 7, Number.NaN, Infinity])(
    "fails closed at unsafe speed %s",
    (speed) => {
      expect(nextBoardingDoorProgress(1, true, speed, 0.1)).toBe(0);
    },
  );

  it("ignores invalid time and caps long frame gaps", () => {
    expect(nextBoardingDoorProgress(0.5, true, 0, Number.NaN)).toBe(0.5);
    expect(nextBoardingDoorProgress(0.5, true, 0, -1)).toBe(0.5);
    expect(nextBoardingDoorProgress(0, true, 0, 20)).toBeCloseTo(
      0.2 / BOARDING_DOOR_SECONDS,
    );
  });
});
