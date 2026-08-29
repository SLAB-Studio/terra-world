import type { Vec3 } from "./road";

export type CameraPresetName = "welcome" | "explore" | "street";

export type CameraPose = Readonly<{
  alpha: number;
  beta: number;
  radius: number;
  target: Vec3;
}>;

export type CameraTargetInput = Readonly<{
  right: number;
  forward: number;
}>;

export const CAMERA_LIMITS = {
  minimumBeta: 0.5,
  maximumBeta: 1.32,
  minimumRadius: 13,
  maximumRadius: 124,
  minimumTargetX: -78,
  maximumTargetX: 78,
  minimumTargetZ: -70,
  maximumTargetZ: 70,
  maximumPanSpeedMetersPerSecond: 24,
} as const;

export const CAMERA_PRESETS: Readonly<Record<CameraPresetName, CameraPose>> = {
  welcome: {
    alpha: -Math.PI / 2.55,
    beta: 0.72,
    radius: 116,
    target: { x: 0, y: 0, z: 9 },
  },
  explore: {
    alpha: -Math.PI / 3.1,
    beta: 0.98,
    radius: 58,
    target: { x: 0, y: 0.5, z: 2 },
  },
  street: {
    alpha: -Math.PI / 2,
    beta: 1.24,
    radius: 22,
    target: { x: -24, y: 1.5, z: 16 },
  },
};

export function cameraPoseForPreset(
  preset: CameraPresetName,
  targetOverride?: Vec3,
): CameraPose {
  const base = CAMERA_PRESETS[preset];
  return clampCameraPose({
    ...base,
    target: targetOverride === undefined ? base.target : targetOverride,
  });
}

export function cameraTargetForWorldPoint(
  point: Vec3,
  heightOffsetMeters = 1.5,
): Vec3 {
  return clampTarget({
    x: point.x,
    y: finiteOr(point.y, 0) + clamp(heightOffsetMeters, 0, 8),
    z: point.z,
  });
}

export function stepCameraTarget(
  target: Vec3,
  input: CameraTargetInput,
  deltaSeconds: number,
): Vec3 {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return clampTarget(target);
  }
  const right = clamp(input.right, -1, 1);
  const forward = clamp(input.forward, -1, 1);
  const inputLength = Math.hypot(right, forward);
  const scale = inputLength > 1 && inputLength > 0 ? 1 / inputLength : 1;
  const travel =
    CAMERA_LIMITS.maximumPanSpeedMetersPerSecond * Math.min(deltaSeconds, 0.1);

  return clampTarget({
    x: target.x + right * scale * travel,
    y: target.y,
    z: target.z + forward * scale * travel,
  });
}

export function interpolateCameraPose(
  from: CameraPose,
  to: CameraPose,
  amount: number,
): CameraPose {
  const t = smoothstep(clamp(amount, 0, 1));
  const alphaDelta = shortestAngle(to.alpha - from.alpha);
  return clampCameraPose({
    alpha: from.alpha + alphaDelta * t,
    beta: lerp(from.beta, to.beta, t),
    radius: lerp(from.radius, to.radius, t),
    target: {
      x: lerp(from.target.x, to.target.x, t),
      y: lerp(from.target.y, to.target.y, t),
      z: lerp(from.target.z, to.target.z, t),
    },
  });
}

export function clampCameraPose(pose: CameraPose): CameraPose {
  return {
    alpha: finiteOr(pose.alpha, CAMERA_PRESETS.welcome.alpha),
    beta: clamp(
      pose.beta,
      CAMERA_LIMITS.minimumBeta,
      CAMERA_LIMITS.maximumBeta,
    ),
    radius: clamp(
      pose.radius,
      CAMERA_LIMITS.minimumRadius,
      CAMERA_LIMITS.maximumRadius,
    ),
    target: clampTarget(pose.target),
  };
}

function clampTarget(target: Vec3): Vec3 {
  return {
    x: clamp(
      target.x,
      CAMERA_LIMITS.minimumTargetX,
      CAMERA_LIMITS.maximumTargetX,
    ),
    y: clamp(target.y, -1, 12),
    z: clamp(
      target.z,
      CAMERA_LIMITS.minimumTargetZ,
      CAMERA_LIMITS.maximumTargetZ,
    ),
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, finiteOr(value, minimum)));
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function smoothstep(amount: number): number {
  return amount * amount * (3 - 2 * amount);
}

function shortestAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
