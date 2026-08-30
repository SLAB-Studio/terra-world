import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";

/** Traffic must keep its pickup stop reserved until the closing interval ends. */
export const BOARDING_DOOR_SECONDS = 0.65;
export const BOARDING_DOOR_ANGLE = Math.PI * 0.38;
export const BOARDING_STOPPED_SPEED = 0.02;

export type BoardingDoor = Readonly<{
  node: TransformNode;
  closed: Quaternion;
  direction: number;
}>;

/** Only authored hinges may move; never add a second panel over closed bodywork. */
export function findBoardingDoor(
  model: TransformNode,
  vehicle: TransformNode,
): BoardingDoor | null {
  const node = model
    .getDescendants(false)
    .find(
      (candidate) =>
        candidate instanceof TransformNode &&
        /:BoardingDoorLeft$/.test(candidate.name),
    ) as TransformNode | undefined;
  if (!node || !node.parent || !(node.parent instanceof TransformNode))
    return null;
  const parent = node.parent;
  const bounds = node.getHierarchyBoundingVectors(true);
  const center = bounds.min.add(bounds.max).scaleInPlace(0.5);
  const parentWorld = parent.computeWorldMatrix(true);
  const parentCenter = Vector3.TransformCoordinates(
    center,
    parentWorld.clone().invert(),
  );
  const positiveTurn = Vector3.TransformNormal(
    Vector3.Cross(Vector3.Up(), parentCenter.subtract(node.position)),
    parentWorld,
  );
  const curbDirection = Vector3.TransformNormal(
    // Both lanes use their outer, local -X curb in Rivergate's lane layout.
    Vector3.Left(),
    vehicle.computeWorldMatrix(true),
  );
  const closed =
    node.rotationQuaternion?.clone() ??
    Quaternion.FromEulerVector(node.rotation);
  node.rotationQuaternion = closed.clone();
  return {
    node,
    closed,
    direction: Vector3.Dot(positiveTurn, curbDirection) >= 0 ? 1 : -1,
  };
}

export function nextBoardingDoorProgress(
  current: number,
  requested: boolean,
  speedMetersPerSecond: number,
  deltaSeconds: number,
): number {
  // Fail closed if an external traffic update departs before the reserved pause.
  if (
    !Number.isFinite(speedMetersPerSecond) ||
    Math.abs(speedMetersPerSecond) > BOARDING_STOPPED_SPEED
  )
    return 0;
  const delta = Number.isFinite(deltaSeconds)
    ? Math.max(0, Math.min(0.2, deltaSeconds))
    : 0;
  const progress = Number.isFinite(current)
    ? Math.max(0, Math.min(1, current))
    : 0;
  return requested
    ? Math.min(1, progress + delta / BOARDING_DOOR_SECONDS)
    : Math.max(0, progress - delta / BOARDING_DOOR_SECONDS);
}

const turn = new Quaternion();

export function applyBoardingDoor(
  door: BoardingDoor | null,
  progress: number,
): void {
  if (!door || door.node.isDisposed()) return;
  const eased = progress * progress * (3 - 2 * progress);
  Quaternion.RotationYawPitchRollToRef(
    eased * BOARDING_DOOR_ANGLE * door.direction,
    0,
    0,
    turn,
  );
  door.closed.multiplyToRef(turn, door.node.rotationQuaternion!);
}
