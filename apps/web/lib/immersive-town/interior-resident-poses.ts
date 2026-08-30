import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { IndoorActivity, IndoorTask } from "./interior-life-plan";

export type IndoorPose = Readonly<{
  activity: IndoorActivity;
  floorY: number;
  height: number;
  seat?: number;
  task?: IndoorTask;
  taskWeight?: number;
  seatWeight?: number;
}>;

/** Aim a joint in its parent's coordinates; no guesses about imported bone axes. */
export function aimIndoorJoint(
  node: TransformNode,
  child: TransformNode,
  direction: Vector3,
) {
  const inverse =
    node.parent?.getWorldMatrix().clone().invert() ?? Matrix.Identity();
  const desired = Vector3.TransformNormal(direction, inverse).normalize();
  const rotation =
    node.rotationQuaternion ?? Quaternion.FromEulerVector(node.rotation);
  const matrix = Matrix.Identity();
  rotation.toRotationMatrix(matrix);
  const current = Vector3.TransformNormal(child.position, matrix).normalize();
  const adjustment = Quaternion.Identity();
  Quaternion.FromUnitVectorsToRef(current, desired, adjustment);
  node.rotationQuaternion = adjustment.multiply(rotation).normalize();
  node.computeWorldMatrix(true);
  child.computeWorldMatrix(true);
}

/** Two-bone reach keeps wrists at a real countertop instead of waving in space. */
function reachIndoorArm(
  upper: TransformNode,
  lower: TransformNode,
  hand: TransformNode,
  target: Vector3,
) {
  upper.computeWorldMatrix(true);
  lower.computeWorldMatrix(true);
  hand.computeWorldMatrix(true);
  const shoulder = upper.getAbsolutePosition().clone();
  const upperLength = Vector3.Distance(shoulder, lower.getAbsolutePosition());
  const lowerLength = Vector3.Distance(
    lower.getAbsolutePosition(),
    hand.getAbsolutePosition(),
  );
  const direction = target.subtract(shoulder).normalize();
  const distance = Math.max(
    Math.abs(upperLength - lowerLength) + 0.001,
    Math.min(
      upperLength + lowerLength - 0.001,
      Vector3.Distance(shoulder, target),
    ),
  );
  const along =
    (upperLength ** 2 + distance ** 2 - lowerLength ** 2) / (2 * distance);
  const bend = Vector3.Down()
    .subtract(direction.scale(Vector3.Dot(Vector3.Down(), direction)))
    .normalize();
  const elbow = shoulder
    .add(direction.scale(along))
    .add(bend.scale(Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2))));
  aimIndoorJoint(upper, lower, elbow.subtract(shoulder));
  aimIndoorJoint(
    lower,
    hand,
    shoulder
      .add(direction.scale(distance))
      .subtract(lower.getAbsolutePosition()),
  );
}

/** Grounded task poses layer over idle, without changing animation clocks or roots. */
export function applyIndoorResidentPose(
  root: TransformNode,
  nodes: ReadonlyMap<string, TransformNode>,
  pose: IndoorPose,
  seconds: number,
  reducedMotion: boolean,
) {
  const taskWeight = Math.max(0, Math.min(1, pose.taskWeight ?? 1));
  const seatWeight =
    pose.seat === undefined
      ? 0
      : Math.max(0, Math.min(1, pose.seatWeight ?? 1));
  root.position.y = pose.floorY;
  if (taskWeight === 0 && seatWeight === 0) return;
  // Preserve the sampled locomotion underneath the task. This avoids snapping
  // seated legs/IK arms onto a walking clip when an actor stands or returns.
  const underlying = new Map<
    TransformNode,
    { rotation: Quaternion; weight: number }
  >();
  for (const side of ["L", "R"] as const) {
    for (const part of [
      "Thigh",
      "Calf",
      "Foot",
      "UpperArm",
      "Forearm",
    ] as const) {
      const node = nodes.get(`Bip01 ${side} ${part}`);
      const weight = ["Thigh", "Calf", "Foot"].includes(part)
        ? seatWeight
        : taskWeight;
      if (node && weight < 1)
        underlying.set(node, {
          rotation:
            node.rotationQuaternion?.clone() ??
            Quaternion.FromEulerVector(node.rotation),
          weight,
        });
    }
  }
  const forward = new Vector3(
    -Math.sin(root.rotation.y),
    0,
    -Math.cos(root.rotation.y),
  );
  const right = new Vector3(
    Math.cos(root.rotation.y),
    0,
    -Math.sin(root.rotation.y),
  );
  const wave = reducedMotion
    ? 0
    : Math.sin(seconds * (pose.activity === "type" ? 3.5 : 1.4)) * 0.045;
  const direction = (f: number, y: number, r = 0) =>
    forward
      .scale(f)
      .add(right.scale(r))
      .add(new Vector3(0, y, 0));
  const aim = (part: string, child: string, dir: Vector3) => {
    const a = nodes.get(part),
      b = nodes.get(child);
    if (a && b) aimIndoorJoint(a, b, dir);
  };
  root.position.y = pose.floorY;
  root.computeWorldMatrix(true);
  for (const side of ["L", "R"] as const) {
    const lateral = side === "L" ? -1 : 1;
    if (pose.seat !== undefined && seatWeight > 0) {
      aim(
        `Bip01 ${side} Thigh`,
        `Bip01 ${side} Calf`,
        direction(1, -0.08, lateral * 0.045),
      );
      aim(`Bip01 ${side} Calf`, `Bip01 ${side} Foot`, direction(0.06, -1));
      aim(`Bip01 ${side} Foot`, `Bip01 ${side} Toe0`, direction(1, 0));
    }
    const working = pose.task !== undefined;
    const reading = pose.activity === "read";
    aim(
      `Bip01 ${side} UpperArm`,
      `Bip01 ${side} Forearm`,
      direction(
        working ? 0.85 : reading ? 0.28 : 0.08,
        working && pose.seat === undefined ? -0.55 : -1,
        lateral * 0.12,
      ),
    );
    aim(
      `Bip01 ${side} Forearm`,
      `Bip01 ${side} Hand`,
      direction(
        working || reading ? 1 : 0.17,
        working
          ? wave + (pose.activity === "cook" ? 0.15 : 0)
          : reading
            ? 0.55
            : -1,
        working ? lateral * (0.1 + wave) : 0,
      ),
    );
  }
  if (pose.seat !== undefined && seatWeight > 0) {
    const hips = [
      nodes.get("Bip01 L Thigh"),
      nodes.get("Bip01 R Thigh"),
    ].filter((n): n is TransformNode => !!n);
    if (hips.length) {
      const hipY =
        hips.reduce((sum, node) => {
          node.computeWorldMatrix(true);
          return sum + node.getAbsolutePosition().y;
        }, 0) / hips.length;
      root.position.y += (pose.seat + 0.09 - hipY) * seatWeight;
      root.computeWorldMatrix(true);
    }
  }
  if (pose.task) {
    for (const side of ["L", "R"] as const) {
      const upper = nodes.get(`Bip01 ${side} UpperArm`),
        lower = nodes.get(`Bip01 ${side} Forearm`),
        hand = nodes.get(`Bip01 ${side} Hand`);
      if (!upper || !lower || !hand) continue;
      const target = Vector3.FromArray(
        side === "L" ? pose.task.left : pose.task.right,
      );
      // Contact stays fixed to the equipment, not the actor's idle body sway.
      if (pose.activity === "cook" && side === "R") {
        target.x += wave;
        target.z += reducedMotion ? 0 : Math.cos(seconds * 1.4) * 0.045;
      } else if (pose.activity === "type") {
        target.y += Math.abs(wave) * 0.12;
      } else if (
        ["repair", "inspect", "eat"].includes(pose.activity) &&
        side === "R"
      ) {
        target.y += Math.abs(wave) * 0.6;
      }
      reachIndoorArm(upper, lower, hand, target);
    }
  }
  for (const [node, base] of underlying) {
    if (node.rotationQuaternion)
      Quaternion.SlerpToRef(
        base.rotation,
        node.rotationQuaternion,
        base.weight,
        node.rotationQuaternion,
      );
    node.computeWorldMatrix(true);
  }
}
