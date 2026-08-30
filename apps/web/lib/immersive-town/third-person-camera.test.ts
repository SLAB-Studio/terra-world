import { describe, expect, it } from "vitest";
import {
  clipCameraBoom,
  desiredFollowPosition,
  playerCameraTarget,
} from "./third-person-camera";

describe("third-person camera", () => {
  it("follows above and behind the player, not at their eye position", () => {
    const player = { x: 12, y: 1, z: 24 };
    const camera = desiredFollowPosition(player, 0, 0.4);
    expect(camera.z).toBeLessThan(player.z - 6);
    expect(camera.y).toBeGreaterThan(player.y + 4);
    expect(playerCameraTarget(player)).toEqual({ x: 12, y: 2.8, z: 24 });
    const side = desiredFollowPosition(player, Math.PI / 2, 0.4);
    expect(side.x).toBeLessThan(player.x - 6);
  });
  it("shortens the camera boom before a wall or roof and restores an unobstructed view", () => {
    const target = { x: 0, y: 2, z: 0 };
    const desired = { x: 0, y: 5, z: -8 };
    const wall = { minX: -3, maxX: 3, minZ: -6, maxZ: -4, top: 9 };
    const clipped = clipCameraBoom(target, desired, [wall]);
    expect(clipped.z).toBeGreaterThan(-3.8);
    expect(clipped.z).toBeLessThan(-3);
    expect(clipCameraBoom(target, desired, [])).toEqual(desired);
    expect(
      clipCameraBoom(target, desired, [{ ...wall, minZ: -1, maxZ: 1 }]),
    ).toEqual(desired);
    expect(
      clipCameraBoom(target, desired, [{ ...wall, minX: 4, maxX: 8 }]),
    ).toEqual(desired);
    const roof = { minX: -4, maxX: 4, minZ: -9, maxZ: -3, bottom: 3, top: 7 };
    expect(clipCameraBoom(target, desired, [roof]).z).toBeGreaterThan(-3);
  });
});
