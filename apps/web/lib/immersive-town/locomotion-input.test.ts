import { describe, expect, it } from "vitest";
import { pacedInput, shiftHeld } from "./locomotion-input";
import { stepWalk, canWalkAt } from "./walking";

describe("player running pace", () => {
  it.each([false, true])(
    "does not boost diagonals or stacked inputs (indoors: %s)",
    (indoors) => {
      for (const running of [false, true]) {
        const straight = pacedInput(
          { forward: 1, right: 0, turn: 0 },
          running,
          indoors,
        );
        const diagonal = pacedInput(
          { forward: 1, right: 1, turn: 0 },
          running,
          indoors,
        );
        const stacked = pacedInput(
          { forward: 2, right: 0, turn: 0 },
          running,
          indoors,
        );
        expect(Math.hypot(diagonal.forward, diagonal.right)).toBeCloseTo(
          straight.forward,
        );
        expect(stacked.forward).toBe(straight.forward);
      }
    },
  );
  it("doubles street speed but never turning speed, and stays behind walls", () => {
    const pose = { x: -40, z: 0, yaw: 0 };
    const input = { forward: 1, right: 0, turn: 0 };
    const walk = stepWalk(pose, pacedInput(input, false), 0.05, []);
    const run = stepWalk(pose, pacedInput(input, true), 0.05, []);
    expect(run.z).toBeCloseTo(walk.z * 2);
    expect(run.z).toBeCloseTo(3.6 * 0.05);
    expect(pacedInput({ ...input, turn: 1 }, true).turn).toBe(1);
    const wall = [{ minX: -45, maxX: -35, minZ: 1, maxZ: 1.08 }];
    let p = pose;
    for (let i = 0; i < 90; i++)
      p = stepWalk(p, pacedInput(input, true), 0.05, wall);
    expect(p.z).toBeLessThan(0.61);
    expect(canWalkAt(p, wall)).toBe(true);
    expect(
      pacedInput({ forward: NaN, right: Infinity, turn: NaN }, true),
    ).toEqual({ forward: 0, right: 0, turn: 0 });
  });
  it("accepts either Shift and waits for both to be released", () => {
    const keys = new Set<string>(["ShiftLeft", "ShiftRight"]);
    expect(shiftHeld(keys)).toBe(true);
    keys.delete("ShiftLeft");
    expect(shiftHeld(keys)).toBe(true);
    keys.delete("ShiftRight");
    expect(shiftHeld(keys)).toBe(false);
  });
});
