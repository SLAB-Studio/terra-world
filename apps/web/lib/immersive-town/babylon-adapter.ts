import type { ArcRotateCamera, TransformNode } from "@babylonjs/core";

import { CAMERA_LIMITS, type CameraPose, clampCameraPose } from "./camera";
import type { VehicleTransform } from "./traffic";

/** Applies a pure simulation transform without allocating Babylon vectors. */
export function applyVehicleTransform(
  node: TransformNode,
  transform: VehicleTransform,
): void {
  node.position.copyFromFloats(
    transform.position.x,
    transform.position.y,
    transform.position.z,
  );
  node.rotationQuaternion = null;
  node.rotation.copyFromFloats(0, transform.yawRadians, 0);
}

/**
 * Child-friendly orbit defaults: bounded zoom/tilt, gentle input response and
 * no panning beyond the pure camera helper's town limits.
 */
export function configureKidFriendlyCamera(camera: ArcRotateCamera): void {
  camera.lowerBetaLimit = CAMERA_LIMITS.minimumBeta;
  camera.upperBetaLimit = CAMERA_LIMITS.maximumBeta;
  camera.lowerRadiusLimit = CAMERA_LIMITS.minimumRadius;
  camera.upperRadiusLimit = CAMERA_LIMITS.maximumRadius;
  camera.wheelPrecision = 28;
  camera.pinchPrecision = 24;
  camera.panningSensibility = 900;
  camera.inertia = 0.72;
}

export function applyCameraPose(
  camera: ArcRotateCamera,
  requestedPose: CameraPose,
): void {
  const pose = clampCameraPose(requestedPose);
  camera.alpha = pose.alpha;
  camera.beta = pose.beta;
  camera.radius = pose.radius;
  camera.target.copyFromFloats(pose.target.x, pose.target.y, pose.target.z);
}
