import type { InteriorRoomId } from "./house-interior-world";
import type { WalkBounds, WalkInput, WalkPoint, WalkPose } from "./walking";

export const INTERIOR_EYE_HEIGHT = 2.25;
export const INTERIOR_RADIUS = 0.28;
export const INTERIOR_LIMITS = {
  minX: -7.95,
  maxX: 7.95,
  minZ: -5.8,
  maxZ: 5.55,
};
export const ROOM_STARTS: Record<InteriorRoomId, WalkPose> = {
  "living-room": { x: -1.4, z: -3.05, yaw: -Math.PI / 2 },
  kitchen: { x: 1.4, z: -3.35, yaw: Math.PI / 2 },
  "garden-room": { x: -1.4, z: 1.1, yaw: -Math.PI / 4 },
  "utility-room": { x: 1.4, z: 1.1, yaw: Math.PI / 4 },
};
export const ROOM_TASKS: Record<InteriorRoomId, WalkPoint & { label: string }> =
  {
    "living-room": { x: -6.8, z: -1.6, label: "lamp" },
    kitchen: { x: 4.2, z: -5.05, label: "tap" },
    "garden-room": { x: -4.1, z: 2.55, label: "planters" },
    "utility-room": { x: 4.2, z: 2.9, label: "recycling corner" },
  };

export function interiorRoomAt(point: WalkPoint): InteriorRoomId {
  return point.z < 0
    ? point.x < 0
      ? "living-room"
      : "kitchen"
    : point.x < 0
      ? "garden-room"
      : "utility-room";
}

export function canWalkInside(
  point: WalkPoint,
  obstacles: readonly WalkBounds[],
) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return false;
  if (
    point.x < INTERIOR_LIMITS.minX ||
    point.x > INTERIOR_LIMITS.maxX ||
    point.z < INTERIOR_LIMITS.minZ ||
    point.z > INTERIOR_LIMITS.maxZ
  )
    return false;
  return !obstacles.some(
    (b) =>
      point.x > b.minX - INTERIOR_RADIUS &&
      point.x < b.maxX + INTERIOR_RADIUS &&
      point.z > b.minZ - INTERIOR_RADIUS &&
      point.z < b.maxZ + INTERIOR_RADIUS,
  );
}

/** Indoors has no river/road rules. Swept short steps prevent walking through furniture. */
export function stepInterior(
  pose: WalkPose,
  input: WalkInput,
  seconds: number,
  obstacles: readonly WalkBounds[],
): WalkPose {
  const dt = Number.isFinite(seconds)
    ? Math.max(0, Math.min(seconds, 0.05))
    : 0;
  const safe = (n: number) =>
    Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0;
  const yaw = pose.yaw + safe(input.turn) * dt * 1.8;
  const forward = safe(input.forward),
    right = safe(input.right);
  const length = Math.max(1, Math.hypot(forward, right));
  const dx =
    ((Math.sin(yaw) * forward + Math.cos(yaw) * right) / length) * 2.6 * dt;
  const dz =
    ((Math.cos(yaw) * forward - Math.sin(yaw) * right) / length) * 2.6 * dt;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.06));
  let { x, z } = pose;
  for (let i = 0; i < steps; i++) {
    if (canWalkInside({ x: x + dx / steps, z }, obstacles)) x += dx / steps;
    if (canWalkInside({ x, z: z + dz / steps }, obstacles)) z += dz / steps;
  }
  return { x, z, yaw };
}

export function nearbyInteriorTask(point: WalkPoint): InteriorRoomId | null {
  const room = interiorRoomAt(point);
  const targets =
    room === "garden-room"
      ? [-6.1, -4.1, -2.1].map((x) => ({ x, z: 2.55 }))
      : room === "utility-room"
        ? [2.4, 4.2, 6].map((x) => ({ x, z: 2.9 }))
        : [ROOM_TASKS[room]];
  return targets.some(
    (task) => Math.hypot(point.x - task.x, point.z - task.z) < 2.35,
  )
    ? room
    : null;
}
