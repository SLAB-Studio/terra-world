import { describe, expect, it } from "vitest";

import { sampleRoadFrame } from "./road";
import {
  WALK_ENTRY_DISTANCE,
  WALK_LIMITS,
  WALK_SPEED,
  canWalkAt,
  nearbyWalkDoor,
  stepWalk,
} from "./walking";

describe("street-level walking", () => {
  const start = { x: -35, z: -32, yaw: 0 };
  it("moves relative to the view and normalizes diagonal speed", () => {
    const next = stepWalk(start, { forward: 1, right: 1, turn: 0 }, 0.05, []);
    expect(Math.hypot(next.x - start.x, next.z - start.z)).toBeCloseTo(
      WALK_SPEED * 0.05,
    );
    const rotated = stepWalk(
      { ...start, yaw: Math.PI / 2 },
      { forward: 1, right: 0, turn: 0 },
      0.05,
      [],
    );
    expect(rotated.x).toBeGreaterThan(start.x);
    expect(rotated.z).toBeCloseTo(start.z);
  });
  it("caps delayed frames and ignores invalid or negative elapsed time", () => {
    const input = { forward: 1, right: 0, turn: 0 };
    expect(stepWalk(start, input, 10, []).z - start.z).toBeCloseTo(
      WALK_SPEED * 0.05,
    );
    expect(stepWalk(start, input, -1, [])).toEqual(start);
    expect(stepWalk(start, input, NaN, [])).toEqual(start);
  });
  it("blocks walls with body clearance while allowing movement along them", () => {
    const wall = { minX: -35.5, maxX: -32, minZ: -31.5, maxZ: -27 };
    let next = start;
    for (let i = 0; i < 100; i += 1)
      next = stepWalk(next, { forward: 1, right: 0, turn: 0 }, 0.05, [wall]);
    expect(next.z).toBeLessThanOrEqual(-31.9);
    expect(canWalkAt(next, [wall])).toBe(true);
    const slide = stepWalk(next, { forward: 1, right: -1, turn: 0 }, 0.05, [
      wall,
    ]);
    expect(slide.x).toBeLessThan(next.x);
  });
  it("keeps feet on land and allows both actual road bridges", () => {
    expect(canWalkAt({ x: 12, z: -30 }, [])).toBe(false);
    expect(canWalkAt({ x: WALK_LIMITS.maxX + 1, z: 0 }, [])).toBe(false);
    expect(canWalkAt({ x: NaN, z: 0 }, [])).toBe(false);
    for (const progress of [0.283, 0.705])
      expect(canWalkAt(sampleRoadFrame(progress).center, [])).toBe(true);
  });
  it("only offers house entry at a nearby doorway", () => {
    const doors = [
      { id: "first", x: -36, z: -32 },
      { id: "far", x: -50, z: -32 },
    ];
    expect(nearbyWalkDoor(start, doors)?.id).toBe("first");
    expect(
      nearbyWalkDoor({ x: -36, z: -32 - WALK_ENTRY_DISTANCE - 0.1 }, doors),
    ).toBeNull();
  });
});
