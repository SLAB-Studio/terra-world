import { describe, expect, it } from "vitest";
import {
  canWalkInside,
  interiorRoomAt,
  nearbyInteriorTask,
  stepInterior,
} from "./interior-navigation";

describe("indoor navigation", () => {
  it("moves at a comfortable speed without diagonal acceleration or long-frame jumps", () => {
    const pose = { x: 1.4, z: 1, yaw: 0 };
    const straight = stepInterior(
      pose,
      { forward: 1, right: 0, turn: 0 },
      0.05,
      [],
    );
    const diagonal = stepInterior(
      pose,
      { forward: 1, right: 1, turn: 0 },
      0.05,
      [],
    );
    expect(Math.hypot(diagonal.x - pose.x, diagonal.z - pose.z)).toBeCloseTo(
      straight.z - pose.z,
    );
    expect(straight.z - pose.z).toBeCloseTo(0.13);
    expect(
      stepInterior(pose, { forward: 1, right: 0, turn: 0 }, 10, []),
    ).toEqual(straight);
    expect(
      stepInterior(pose, { forward: NaN, right: 0, turn: Infinity }, NaN, []),
    ).toEqual(pose);
  });
  it("keeps the walker inside and slides along furniture without tunnelling", () => {
    const furniture = [{ minX: 2, maxX: 4, minZ: 1, maxZ: 3 }];
    expect(canWalkInside({ x: 8.2, z: 1 }, [])).toBe(false);
    expect(canWalkInside({ x: NaN, z: 1 }, [])).toBe(false);
    let pose = { x: 1.6, z: 1.5, yaw: 0 };
    for (let i = 0; i < 15; i++)
      pose = stepInterior(
        pose,
        { forward: 1, right: 1, turn: 0 },
        0.05,
        furniture,
      );
    expect(pose.x).toBeLessThan(1.72);
    expect(pose.z).toBeGreaterThan(2);
  });
  it("only offers the task in the same room and within reach", () => {
    expect(interiorRoomAt({ x: -2, z: -3 })).toBe("living-room");
    expect(nearbyInteriorTask({ x: -6.1, z: -2.8 })).toBe("living-room");
    expect(nearbyInteriorTask({ x: 4.2, z: -3.7 })).toBe("kitchen");
    expect(nearbyInteriorTask({ x: 1.4, z: -3.7 })).toBe(null);
    expect(nearbyInteriorTask({ x: -6.8, z: 0.1 })).toBe(null);
  });
});
