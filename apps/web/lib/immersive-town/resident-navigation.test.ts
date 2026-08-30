import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { describe, expect, it } from "vitest";

import { createImmersiveTownWorld } from "./create-town-world";
import { createTownWalker } from "./town-walker";

import { sampleRoadFrame } from "./road";
import {
  createResidentNavigation,
  RESIDENT_CROSSINGS,
} from "./resident-navigation";
import { canWalkAt, type WalkBounds, type WalkPoint } from "./walking";

const westBounds = { minX: -60, maxX: -20, minZ: -60, maxZ: -25 };

function assertSafePath(
  navigation: ReturnType<typeof createResidentNavigation>,
  path: readonly WalkPoint[] | null,
  obstacles: readonly WalkBounds[] = [],
) {
  expect(path).not.toBeNull();
  for (let i = 1; i < path!.length; i++) {
    const from = path![i - 1]!;
    const to = path![i]!;
    expect(navigation.segmentIsWalkable(from, to)).toBe(true);
    const steps = Math.ceil(Math.hypot(from.x - to.x, from.z - to.z) / 0.1);
    for (let step = 0; step <= steps; step++) {
      const point = {
        x: from.x + ((to.x - from.x) * step) / steps,
        z: from.z + ((to.z - from.z) * step) / steps,
      };
      expect(
        navigation.isWalkable(point),
        JSON.stringify({ from, to, point }),
      ).toBe(true);
      expect(canWalkAt(point, obstacles)).toBe(true);
    }
  }
}

describe("shared resident town navigation", () => {
  it("routes to actual town doorway approaches with the rendered house and tree obstacles", () => {
    const engine = new NullEngine();
    const world = createImmersiveTownWorld(engine, {
      attachCameraControls: false,
      quality: "low",
      reducedMotion: true,
    });
    const walker = createTownWalker(world, null, {
      isBlocked: () => false,
      onNearbyHouse: () => undefined,
      onEnterHouse: () => undefined,
    });
    try {
      const navigation = createResidentNavigation(walker.obstacles);
      const start = { x: -38, z: -30 };
      const reachable: string[] = [];
      for (const door of [...walker.doors, ...walker.venueDoors]) {
        const point = navigation.closestWalkablePoint(door.approach);
        const path = point === null ? null : navigation.findPath(start, point);
        if (path === null) {
          // Some existing player approaches land in a road lane or isolated
          // pocket. A nearby doorway candidate is a destination choice, not a
          // teleport; require an entire safe route to it before accepting it.
          let alternative: WalkPoint | null = null;
          for (const radius of [1, 2, 3, 4, 4.7]) {
            for (let i = 0; i < 32; i++) {
              const candidate = {
                x: door.x + Math.sin((i * Math.PI) / 16) * radius,
                z: door.z + Math.cos((i * Math.PI) / 16) * radius,
              };
              if (navigation.findPath(start, candidate) !== null) {
                alternative = candidate;
                break;
              }
            }
            if (alternative !== null) break;
          }
          expect(
            alternative,
            `${door.id} must have a reachable doorway`,
          ).not.toBeNull();
          expect(
            Math.hypot(alternative!.x - door.x, alternative!.z - door.z),
          ).toBeLessThanOrEqual(4.700001);
          reachable.push(door.id);
        } else {
          reachable.push(door.id);
          for (let i = 1; i < path.length; i++)
            expect(navigation.segmentIsWalkable(path[i - 1]!, path[i]!)).toBe(
              true,
            );
        }
      }
      expect(reachable.length).toBe(
        walker.doors.length + walker.venueDoors.length,
      );
      for (const door of walker.doors) expect(reachable).toContain(door.id);
    } finally {
      walker.dispose();
      world.dispose();
      engine.dispose();
    }
  });

  it("retains exact endpoints and deterministically takes a swept-safe wall detour", () => {
    const obstacles = [{ minX: -43, maxX: -41, minZ: -55, maxZ: -34 }];
    const navigation = createResidentNavigation(obstacles, {
      bounds: westBounds,
    });
    const from = { x: -53.2, z: -45.6 };
    const to = { x: -29.7, z: -44.2 };
    const path = navigation.findPath(from, to);
    assertSafePath(navigation, path, obstacles);
    expect(path![0]).toEqual(from);
    expect(path!.at(-1)).toEqual(to);
    expect(path!.length).toBeGreaterThan(2);
    expect(navigation.findPath(from, to)).toBe(path);
    expect(Object.isFrozen(path)).toBe(true);
    expect(path!.every(Object.isFrozen)).toBe(true);
    navigation.clearCache();
    expect(navigation.findPath(from, to)).toEqual(path);
  });

  it("never tunnels through thin walls or diagonally cuts an inflated corner", () => {
    const wall = { minX: -40.013, maxX: -40.012, minZ: -60, maxZ: -25 };
    const navigation = createResidentNavigation([wall], { bounds: westBounds });
    expect(
      navigation.findPath({ x: -50, z: -44 }, { x: -30, z: -44 }),
    ).toBeNull();
    expect(
      navigation.segmentIsWalkable({ x: -40.42, z: -44 }, { x: -39.6, z: -44 }),
    ).toBe(false);
    const corner = createResidentNavigation([
      { minX: -40, maxX: -36, minZ: -44, maxZ: -40 },
    ]);
    expect(
      corner.segmentIsWalkable({ x: -40.7, z: -44 }, { x: -40, z: -44.7 }),
    ).toBe(false);
    const town = createResidentNavigation([]);
    expect(
      town.segmentIsWalkable(
        { x: -30, z: -30 },
        { x: 5.52042805129498, z: -3.804410596544454 },
      ),
    ).toBe(false); // A straight bridge rail corner lies between sample steps.
    expect(
      town.segmentIsWalkable(
        { x: 14, z: 5.25 },
        { x: 15.783764542888452, z: 6.84360410037039 },
      ),
    ).toBe(false); // A diagonal exit must remain inside the marked crossing.
  });

  it("rejects gaps narrower than the body and uses an actual wide opening", () => {
    const wall = (gap: number) => [
      { minX: -43, maxX: -41, minZ: -60, maxZ: -43 - gap / 2 },
      { minX: -43, maxX: -41, minZ: -43 + gap / 2, maxZ: -25 },
    ];
    const from = { x: -53, z: -48 };
    const to = { x: -29, z: -46 };
    const narrow = createResidentNavigation(wall(0.7), { bounds: westBounds });
    expect(narrow.findPath(from, to)).toBeNull();
    const wide = createResidentNavigation(wall(4), { bounds: westBounds });
    assertSafePath(wide, wide.findPath(from, to), wall(4));
  });

  it("connects both riverbanks on the real bridges without crossing unmarked car lanes", () => {
    const navigation = createResidentNavigation([]);
    for (const [from, to] of [
      [
        { x: -30, z: -30 },
        { x: 40, z: -30 },
      ],
      [
        { x: -30, z: 40 },
        { x: 40, z: 40 },
      ],
      [
        { x: -30, z: -30 },
        { x: -30, z: 30 },
      ],
      [
        { x: -30, z: -30 },
        { x: -30, z: 68 },
      ],
    ] as const)
      assertSafePath(navigation, navigation.findPath(from, to));
    expect(navigation.isWalkable({ x: 12, z: -30 })).toBe(false);
    expect(navigation.isWalkable(sampleRoadFrame(0.1).center)).toBe(false);
    for (const crossing of RESIDENT_CROSSINGS) {
      const center = sampleRoadFrame(crossing.progress).center;
      expect(navigation.crossingAt(center)).toEqual(crossing);
      expect(navigation.isWalkable(center)).toBe(true);
    }
  });

  it("keeps snapping local and explicit and refuses invalid endpoints", () => {
    const navigation = createResidentNavigation([
      { minX: -43, maxX: -41, minZ: -55, maxZ: -34 },
    ]);
    const blocked = { x: -43, z: -45 };
    const safe = navigation.closestWalkablePoint(blocked)!;
    expect(navigation.isWalkable(safe)).toBe(true);
    expect(
      Math.hypot(safe.x - blocked.x, safe.z - blocked.z),
    ).toBeLessThanOrEqual(2);
    expect(navigation.findPath(blocked, { x: -50, z: -45 })).toBeNull();
    expect(
      navigation.closestWalkablePoint({ x: 1_000, z: 1_000 }, 100),
    ).toBeNull();
    expect(navigation.closestWalkablePoint({ x: NaN, z: -45 })).toBeNull();
    expect(navigation.findPath({ x: Infinity, z: -45 }, safe)).toBeNull();
    expect(navigation.crossingAt({ x: NaN, z: NaN })).toBeNull();
  });

  it("bounds path-search work, preserves cache endpoint precision, and snapshots obstacles", () => {
    const wall = { minX: -43, maxX: -41, minZ: -55, maxZ: -34 };
    const navigation = createResidentNavigation([wall], {
      bounds: westBounds,
      maxSearchNodes: 1,
    });
    expect(
      navigation.findPath({ x: -53, z: -45 }, { x: -29, z: -45 }),
    ).toBeNull();
    wall.minX = -60;
    expect(navigation.isWalkable({ x: -55, z: -45 })).toBe(true);
    const cached = createResidentNavigation([], { cacheSize: 1 });
    const from = { x: -54, z: -42 };
    const first = cached.findPath(from, { x: -51.001, z: -42 });
    const second = cached.findPath(from, { x: -51.002, z: -42 });
    expect(first!.at(-1)!.x).toBe(-51.001);
    expect(second!.at(-1)!.x).toBe(-51.002);
    expect(cached.findPath(from, { x: -51.001, z: -42 })).not.toBe(first);
  });

  it("uses optional ground constraints and fails closed for malformed geometry", () => {
    const navigation = createResidentNavigation([], {
      bounds: westBounds,
      groundHeight: ({ x }) => (x < -42 ? 0 : 2),
    });
    expect(
      navigation.findPath({ x: -53, z: -45 }, { x: -29, z: -45 }),
    ).toBeNull();
    expect(
      createResidentNavigation([], { groundHeight: () => NaN }).isWalkable({
        x: -50,
        z: -45,
      }),
    ).toBe(false);
    expect(
      createResidentNavigation([
        { minX: NaN, maxX: 0, minZ: 0, maxZ: 1 },
      ]).isWalkable({ x: -50, z: -45 }),
    ).toBe(false);
    expect(
      createResidentNavigation([], {
        bounds: { ...westBounds, minX: NaN },
      }).findPath({ x: -50, z: -45 }, { x: -49, z: -45 }),
    ).toBeNull();
  });
});
