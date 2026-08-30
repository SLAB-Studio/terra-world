import { renderedRoadHeight, sampleRoadFrame } from "./road";

export type WalkPoint = Readonly<{ x: number; z: number }>;
export type WalkBounds = Readonly<{
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}>;
export type WalkInput = Readonly<{
  forward: number;
  right: number;
  turn: number;
}>;
export type WalkPose = WalkPoint & Readonly<{ yaw: number }>;
export type WalkDoor = WalkPoint & Readonly<{ id: string }>;

export const WALK_SPEED = 6;
export const WALK_EYE_HEIGHT = 1.85;
export const WALK_BODY_RADIUS = 0.4;
export const WALK_ENTRY_DISTANCE = 4.8;
export const WALK_LIMITS: WalkBounds = {
  minX: -77,
  maxX: 77,
  minZ: -70,
  maxZ: 71,
};

// The walker uses the exact same road spline as the rendered bridges and cars.
const roadSamples = Array.from({ length: 480 }, (_, index) =>
  sampleRoadFrame(index / 480),
);

export function walkingRoadHeight(point: WalkPoint): number | null {
  let nearestDistance = Infinity;
  let height: number | null = null;
  for (const frame of roadSamples) {
    const distance = Math.hypot(
      point.x - frame.center.x,
      point.z - frame.center.z,
    );
    if (distance < nearestDistance && distance <= 5.7) {
      nearestDistance = distance;
      height = renderedRoadHeight(frame.center.y) + 0.25;
    }
  }
  return height;
}

export function insideWalkBounds(
  point: WalkPoint,
  bounds: WalkBounds,
): boolean {
  return (
    point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.z >= bounds.minZ &&
    point.z <= bounds.maxZ
  );
}

export function canWalkAt(
  point: WalkPoint,
  obstacles: readonly WalkBounds[],
): boolean {
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.z) ||
    !insideWalkBounds(point, WALK_LIMITS)
  )
    return false;
  const riverCenter =
    12 + Math.sin(((point.z + 70) / 140) * Math.PI * 2 - Math.PI / 2) * 3.4;
  if (Math.abs(point.x - riverCenter) < 7 && walkingRoadHeight(point) === null)
    return false;
  return !obstacles.some((box) =>
    insideWalkBounds(point, {
      minX: box.minX - WALK_BODY_RADIUS,
      maxX: box.maxX + WALK_BODY_RADIUS,
      minZ: box.minZ - WALK_BODY_RADIUS,
      maxZ: box.maxZ + WALK_BODY_RADIUS,
    }),
  );
}

/** Small swept steps prevent tunnelling; independent axes let feet slide along walls. */
export function stepWalk(
  pose: WalkPose,
  input: WalkInput,
  elapsedSeconds: number,
  obstacles: readonly WalkBounds[],
): WalkPose {
  const dt = Number.isFinite(elapsedSeconds)
    ? Math.max(0, Math.min(0.05, elapsedSeconds))
    : 0;
  const safe = (value: number) =>
    Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
  const yaw = pose.yaw + safe(input.turn) * dt * 1.8;
  const forward = safe(input.forward);
  const right = safe(input.right);
  const length = Math.max(1, Math.hypot(forward, right));
  const dx =
    ((Math.sin(yaw) * forward + Math.cos(yaw) * right) / length) *
    WALK_SPEED *
    dt;
  const dz =
    ((Math.cos(yaw) * forward - Math.sin(yaw) * right) / length) *
    WALK_SPEED *
    dt;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1));
  let { x, z } = pose;
  for (let index = 0; index < steps; index += 1) {
    if (canWalkAt({ x: x + dx / steps, z }, obstacles)) x += dx / steps;
    if (canWalkAt({ x, z: z + dz / steps }, obstacles)) z += dz / steps;
  }
  return { x, z, yaw };
}

export function nearbyWalkDoor(
  point: WalkPoint,
  doors: readonly WalkDoor[],
): WalkDoor | null {
  let nearest: WalkDoor | null = null;
  let distance = WALK_ENTRY_DISTANCE;
  for (const door of doors) {
    const next = Math.hypot(door.x - point.x, door.z - point.z);
    if (next < distance) {
      nearest = door;
      distance = next;
    }
  }
  return nearest;
}
