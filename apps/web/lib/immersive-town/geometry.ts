import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

export function quadraticPoint(
  start: Vector3,
  control: Vector3,
  end: Vector3,
  t: number,
): Vector3 {
  const oneMinusT = 1 - t;
  return start
    .scale(oneMinusT * oneMinusT)
    .add(control.scale(2 * oneMinusT * t))
    .add(end.scale(t * t));
}

export function createSegmentBox(
  name: string,
  start: Vector3,
  end: Vector3,
  width: number,
  height: number,
  y: number,
  material: StandardMaterial,
  parent: TransformNode,
  scene: Scene,
): Mesh {
  const delta = end.subtract(start);
  const length = Math.hypot(delta.x, delta.z);
  const mesh = MeshBuilder.CreateBox(
    name,
    { width: length + 0.18, height, depth: width },
    scene,
  );
  mesh.position.set((start.x + end.x) / 2, y, (start.z + end.z) / 2);
  mesh.rotation.y = -Math.atan2(delta.z, delta.x);
  mesh.material = material;
  mesh.parent = parent;
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  return mesh;
}

export function routePose(points: readonly Vector3[], t: number) {
  const clamped = Math.max(0, Math.min(0.999_999, t));
  const scaled = clamped * (points.length - 1);
  const index = Math.floor(scaled);
  const fraction = scaled - index;
  const start = points[index] ?? Vector3.Zero();
  const end = points[index + 1] ?? start;
  const position = Vector3.Lerp(start, end, fraction);
  const delta = end.subtract(start);
  const yaw = -Math.atan2(delta.z, delta.x);
  const normal = new Vector3(-delta.z, 0, delta.x).normalize();
  return { normal, position, yaw };
}

export function makeRoute(
  sample: (t: number) => Vector3,
  segments: number,
): Vector3[] {
  return Array.from({ length: segments + 1 }, (_, index) =>
    sample(index / segments),
  );
}
