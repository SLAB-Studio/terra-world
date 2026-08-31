import { describe, expect, it } from "vitest";
import { companionWalkingPath } from "./resident-social-path";
import { createResidentNavigation } from "./resident-navigation";
import { sampleRoadFrame } from "./road";

describe("safe social walking formations", () => {
  it("makes a parallel path on wide ground instead of stacking bodies", () => {
    const navigation = createResidentNavigation([]);
    const route = [
      { x: -55, z: -42 },
      { x: -35, z: -42 },
    ];
    const path = companionWalkingPath(
      route,
      { x: -55, z: -41.05 },
      navigation,
    )!;
    expect(path).toHaveLength(2);
    expect(path[0]!.z).toBeCloseTo(-41.05);
    expect(path[1]!.z).toBeCloseTo(-41.05);
    expect(path[1]!.x).toBeCloseTo(-35);
  });

  it.each([0.283, 0.705])(
    "merges onto the real walk strip at bridge %s without crossing its rails",
    (progress) => {
      const navigation = createResidentNavigation([]);
      const frame = sampleRoadFrame(progress);
      const point = (along: number) => ({
        x: frame.center.x + frame.tangent.x * along + frame.lateral.x * 4.9,
        z: frame.center.z + frame.tangent.z * along + frame.lateral.z * 4.9,
      });
      const route = navigation.findPath(point(-2), point(2))!;
      const path = companionWalkingPath(route, point(-3), navigation)!;
      expect(path).not.toBeNull();
      for (let index = 1; index < path.length; index++)
        expect(
          navigation.segmentIsWalkable(path[index - 1]!, path[index]!),
        ).toBe(true);
      expect(
        Math.hypot(path.at(-1)!.x - point(2).x, path.at(-1)!.z - point(2).z),
      ).toBeGreaterThanOrEqual(0.9);
    },
  );
});
