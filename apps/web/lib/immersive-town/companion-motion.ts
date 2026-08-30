import type { WalkPoint, WalkPose } from "./walking";

export type CompanionState = {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  travelled: number;
  trail: WalkPoint[];
};
export const LEO_HEEL_DISTANCE = 0.95;
const distance = (a: WalkPoint, b: WalkPoint) =>
  Math.hypot(a.x - b.x, a.z - b.z);
export const angleDifference = (a: number, b: number) =>
  Math.atan2(Math.sin(b - a), Math.cos(b - a));
export function turnTowards(yaw: number, target: number, dt: number) {
  return (
    yaw + Math.max(-4.8 * dt, Math.min(4.8 * dt, angleDifference(yaw, target)))
  );
}
export function heelPoint(player: WalkPose): WalkPoint {
  return {
    x:
      player.x +
      Math.cos(player.yaw) * LEO_HEEL_DISTANCE -
      Math.sin(player.yaw) * 0.15,
    z:
      player.z -
      Math.sin(player.yaw) * LEO_HEEL_DISTANCE -
      Math.cos(player.yaw) * 0.15,
  };
}
/** A swept path, not an endpoint test: never cut diagonally through furniture. */
export function clearCompanionPath(
  a: WalkPoint,
  b: WalkPoint,
  canStand: (p: WalkPoint) => boolean,
) {
  const steps = Math.max(1, Math.ceil(distance(a, b) / 0.12));
  for (let i = 1; i <= steps; i++)
    if (
      !canStand({
        x: a.x + ((b.x - a.x) * i) / steps,
        z: a.z + ((b.z - a.z) * i) / steps,
      })
    )
      return false;
  return true;
}
export function createCompanionState(
  player: WalkPose,
  canStand: (p: WalkPoint) => boolean,
): CompanionState {
  const heel = heelPoint(player);
  const candidates = [
    heel,
    {
      x: player.x - Math.sin(player.yaw) * 0.9,
      z: player.z - Math.cos(player.yaw) * 0.9,
    },
    player,
  ];
  const spawn =
    candidates.find(
      (p) => canStand(p) && clearCompanionPath(player, p, canStand),
    ) ?? player;
  return {
    ...spawn,
    yaw: player.yaw,
    speed: 0,
    travelled: 0,
    trail: [{ x: player.x, z: player.z }],
  };
}
/** Short, bounded breadcrumb routing shares the player's proven route through doors.
 * Heel position is preferred whenever it is visible; there is no circular patrol,
 * per-frame path search, random offset, or catch-up teleport.
 */
export function stepCompanion(
  state: CompanionState,
  player: WalkPose,
  seconds: number,
  canStand: (p: WalkPoint) => boolean,
  leaderSpeed = 1.8,
) {
  const dt = Number.isFinite(seconds)
    ? Math.max(0, Math.min(0.05, seconds))
    : 0;
  if (!dt) return;
  const last = state.trail[state.trail.length - 1];
  if (!last || distance(last, player) > 0.22) {
    state.trail.push({ x: player.x, z: player.z });
    if (state.trail.length > 160) state.trail.shift();
  }
  const heel = heelPoint(player);
  let target: WalkPoint | undefined;
  if (canStand(heel) && clearCompanionPath(state, heel, canStand))
    target = heel;
  else {
    // Prefer the newest visible breadcrumb, remaining behind the player's body.
    for (let i = state.trail.length - 1; i >= 0; i--) {
      const p = state.trail[i]!;
      if (distance(p, player) < 0.72 || distance(p, state) < 0.08) continue;
      if (clearCompanionPath(state, p, canStand)) {
        target = p;
        break;
      }
    }
  }
  if (!target) {
    state.speed = 0;
    return;
  }
  const separation = distance(state, player);
  const clearance = (p: WalkPoint) =>
    canStand(p) && distance(p, player) >= Math.min(0.52, separation) - 0.001;
  if (!clearCompanionPath(state, target, clearance)) {
    // A 180-degree turn changes sides: go around the player, never through them.
    const from = Math.atan2(state.x - player.x, state.z - player.z);
    const to = Math.atan2(target.x - player.x, target.z - player.z);
    const angle =
      from + Math.max(-0.65, Math.min(0.65, angleDifference(from, to)));
    const radius = Math.max(0.82, separation);
    const around = {
      x: player.x + Math.sin(angle) * radius,
      z: player.z + Math.cos(angle) * radius,
    };
    if (clearCompanionPath(state, around, clearance)) target = around;
    else {
      state.speed = 0;
      return;
    }
  }
  const gap = distance(state, target);
  if (gap < 0.018) {
    state.speed = 0;
    state.yaw = turnTowards(state.yaw, player.yaw, dt);
    return;
  }
  const heading = Math.atan2(target.x - state.x, target.z - state.z);
  const yaw = turnTowards(state.yaw, heading, dt);
  // Turn before travelling, rather than walking sideways/backwards around corners.
  const facing = Math.max(0, Math.cos(angleDifference(yaw, heading)));
  const pace = Number.isFinite(leaderSpeed) ? Math.max(0, leaderSpeed) : 1.8;
  const catchUpSpeed = Math.max(3.1, Math.min(5.2, pace + 1.5));
  const desired = Math.min(catchUpSpeed, gap * 10) * facing;
  state.speed += Math.max(-18 * dt, Math.min(12 * dt, desired - state.speed));
  const amount = Math.min(gap, state.speed * dt);
  const next = {
    x: state.x + ((target.x - state.x) / gap) * amount,
    z: state.z + ((target.z - state.z) / gap) * amount,
  };
  // Separation is swept as well: a turn must not take Leo through the player.
  if (clearCompanionPath(state, next, clearance)) {
    state.travelled += distance(state, next);
    state.x = next.x;
    state.z = next.z;
  } else state.speed = 0;
  state.yaw = yaw;
}
