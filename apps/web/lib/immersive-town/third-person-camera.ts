import type { Vec3 } from "./road";
import type { WalkBounds } from "./walking";

export type CameraObstacle = WalkBounds &
  Readonly<{ top: number; bottom?: number }>;
export const PLAYER_WALK_SPEED = 2.8;
export const FOLLOW_DISTANCE = 8.5;

export function playerCameraTarget(player: Vec3): Vec3 {
  return { x: player.x, y: player.y + 1.8, z: player.z };
}

export function desiredFollowPosition(
  player: Vec3,
  yaw: number,
  pitch: number,
): Vec3 {
  const distance = FOLLOW_DISTANCE * Math.cos(pitch);
  return {
    x: player.x - Math.sin(yaw) * distance,
    y: player.y + 1.8 + FOLLOW_DISTANCE * Math.sin(pitch),
    z: player.z - Math.cos(yaw) * distance,
  };
}

/** Shorten the camera boom before walls/roofs instead of passing through them. */
export function clipCameraBoom(
  target: Vec3,
  desired: Vec3,
  obstacles: readonly CameraObstacle[],
): Vec3 {
  const delta = {
    x: desired.x - target.x,
    y: desired.y - target.y,
    z: desired.z - target.z,
  };
  const length = Math.hypot(delta.x, delta.y, delta.z);
  let fraction = 1;
  for (const box of obstacles) {
    let near = 0,
      far = 1;
    for (const [axis, min, max] of [
      ["x", box.minX - 0.2, box.maxX + 0.2],
      ["y", (box.bottom ?? 0) - 0.2, box.top + 0.2],
      ["z", box.minZ - 0.2, box.maxZ + 0.2],
    ] as const) {
      if (Math.abs(delta[axis]) < 0.000001) {
        if (target[axis] < min || target[axis] > max) {
          near = 2;
          break;
        }
      } else {
        const a = (min - target[axis]) / delta[axis];
        const b = (max - target[axis]) / delta[axis];
        near = Math.max(near, Math.min(a, b));
        far = Math.min(far, Math.max(a, b));
      }
    }
    // An overhang may enclose the look target; never collapse to a zero-length
    // view. Exit that volume and clip against other obstacles instead.
    if (near > 0.00001 && near <= far && near < fraction && far >= 0)
      fraction = Math.max(0, near - 0.15 / Math.max(length, 0.001));
  }
  return {
    x: target.x + delta.x * fraction,
    y: target.y + delta.y * fraction,
    z: target.z + delta.z * fraction,
  };
}
