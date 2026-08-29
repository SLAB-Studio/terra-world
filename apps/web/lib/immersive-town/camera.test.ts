import { describe, expect, it } from "vitest";

import {
  CAMERA_LIMITS,
  cameraPoseForPreset,
  cameraTargetForWorldPoint,
  clampCameraPose,
  interpolateCameraPose,
  stepCameraTarget,
} from "./camera";

describe("immersive town kid-friendly camera helpers", () => {
  it("keeps every preset inside safe orbit limits", () => {
    for (const preset of ["welcome", "explore", "street"] as const) {
      const pose = cameraPoseForPreset(preset);
      expect(pose.beta).toBeGreaterThanOrEqual(CAMERA_LIMITS.minimumBeta);
      expect(pose.beta).toBeLessThanOrEqual(CAMERA_LIMITS.maximumBeta);
      expect(pose.radius).toBeGreaterThanOrEqual(CAMERA_LIMITS.minimumRadius);
      expect(pose.radius).toBeLessThanOrEqual(CAMERA_LIMITS.maximumRadius);
    }
  });

  it("sanitizes non-finite input and clamps targets to the town", () => {
    const target = cameraTargetForWorldPoint(
      { x: Number.POSITIVE_INFINITY, y: Number.NaN, z: -1_000 },
      Number.NaN,
    );
    const pose = clampCameraPose({
      alpha: Number.NaN,
      beta: Number.NEGATIVE_INFINITY,
      radius: Number.POSITIVE_INFINITY,
      target,
    });

    expect(Object.values(pose.target).every(Number.isFinite)).toBe(true);
    expect([pose.alpha, pose.beta, pose.radius].every(Number.isFinite)).toBe(
      true,
    );
    expect(pose.target.z).toBe(CAMERA_LIMITS.minimumTargetZ);
  });

  it("normalizes diagonal pan input and caps large frame delays", () => {
    const origin = { x: 0, y: 0, z: 0 };
    const diagonal = stepCameraTarget(origin, { right: 1, forward: 1 }, 10);
    const travelled = Math.hypot(diagonal.x, diagonal.z);

    expect(travelled).toBeCloseTo(
      CAMERA_LIMITS.maximumPanSpeedMetersPerSecond * 0.1,
      12,
    );
  });

  it("interpolates between presets without leaving safe bounds", () => {
    const from = cameraPoseForPreset("welcome");
    const to = cameraPoseForPreset("street");

    for (let index = 0; index <= 100; index += 1) {
      const pose = interpolateCameraPose(from, to, index / 100);
      expect(pose.beta).toBeGreaterThanOrEqual(CAMERA_LIMITS.minimumBeta);
      expect(pose.beta).toBeLessThanOrEqual(CAMERA_LIMITS.maximumBeta);
      expect(pose.radius).toBeGreaterThanOrEqual(CAMERA_LIMITS.minimumRadius);
      expect(pose.radius).toBeLessThanOrEqual(CAMERA_LIMITS.maximumRadius);
    }
  });
});
