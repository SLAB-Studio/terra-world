import { describe, expect, it } from "vitest";

import {
  RIVERGATE_CHARACTER_PROFILES,
  sampleTownCharacterMotion,
} from "./characters-3d";

describe("Rivergate 3D characters", () => {
  it("keeps the authored population stable and includes the recurring cast", () => {
    expect(RIVERGATE_CHARACTER_PROFILES).toHaveLength(20);
    expect(
      RIVERGATE_CHARACTER_PROFILES.map((profile) => profile.storyRole).filter(
        Boolean,
      ),
    ).toEqual(expect.arrayContaining(["maya", "malik", "nia", "mr-sam"]));
    // Leo is the player's dog, not a second human standing in the town cast.
    expect(
      RIVERGATE_CHARACTER_PROFILES.some(({ id }) => id === "guide-elliot"),
    ).toBe(true);
    expect(
      RIVERGATE_CHARACTER_PROFILES.some(({ storyRole }) => storyRole === "leo"),
    ).toBe(false);
    expect(new Set(RIVERGATE_CHARACTER_PROFILES.map(({ id }) => id)).size).toBe(
      RIVERGATE_CHARACTER_PROFILES.length,
    );
  });

  it("keeps families and couples identifiable without increasing crowd density", () => {
    const grouped = RIVERGATE_CHARACTER_PROFILES.filter((p) => p.socialGroup);
    const ids = new Set(grouped.map((p) => p.socialGroup!.id));
    expect(ids.size).toBe(4);
    for (const id of ids) {
      const members = grouped.filter((p) => p.socialGroup!.id === id);
      expect(members).toHaveLength(2);
      expect(
        members.filter((p) => p.socialGroup!.role === "leader"),
      ).toHaveLength(1);
      expect(
        members.find((p) => p.socialGroup!.role === "leader")!.age,
      ).not.toBe("child");
      expect(members[0]!.model).not.toBe(members[1]!.model);
      expect(
        Math.hypot(
          members[0]!.x - members[1]!.x,
          members[0]!.z - members[1]!.z,
        ),
      ).toBeLessThan(3);
    }
  });

  it("samples a deterministic walking loop without drifting from its radius", () => {
    const first = sampleTownCharacterMotion("walk", 12.5, 0.7, false, 2.2);
    const repeated = sampleTownCharacterMotion("walk", 12.5, 0.7, false, 2.2);

    expect(repeated).toEqual(first);
    expect(Math.hypot(first.offsetX, first.offsetZ)).toBeCloseTo(2.2, 8);
    expect(first.leftArm).toBeCloseTo(-first.rightArm, 8);
    expect(first.leftLeg).toBeCloseTo(-first.rightLeg, 8);
  });

  it("uses still, readable poses when reduced motion is requested", () => {
    const stillWalk = sampleTownCharacterMotion("walk", 99, 4, true, 3);
    const stillWave = sampleTownCharacterMotion("wave", 99, 4, true, 0);

    expect(stillWalk.offsetX).toBe(0);
    expect(stillWalk.offsetY).toBe(0);
    expect(stillWalk.offsetZ).toBe(0);
    expect(stillWalk.yaw).toBe(0);
    expect(stillWave.rightArm).toBeGreaterThan(2);
    expect(stillWave.rightElbow).toBeGreaterThan(0.5);
  });
});
