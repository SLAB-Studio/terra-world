import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { TownMaterials } from "./materials";

export type ArchitecturalBox = readonly [
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
];

/** Irregular broadleaf crowns at the existing vertex count, with no alpha cards. */
export function naturalizeCanopy(mesh: Mesh, seed: number) {
  const positions = mesh.getVerticesData("position");
  const indices = mesh.getIndices();
  if (!positions || !indices) return;
  for (let vertex = 0; vertex < positions.length; vertex += 3) {
    const x = positions[vertex] ?? 0;
    const y = positions[vertex + 1] ?? 0;
    const z = positions[vertex + 2] ?? 0;
    const contour =
      1 + Math.sin(x * 2.7 + y * 1.3 + seed) * Math.cos(z * 2.1 - seed) * 0.12;
    positions[vertex] = x * contour;
    positions[vertex + 1] = y * (1 + Math.sin(z * 1.9 + seed) * 0.09);
    positions[vertex + 2] = z * contour;
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  mesh.setVerticesData("position", positions);
  mesh.setVerticesData("normal", normals);
}

/** Bake detail in local space so repeated houses can instance the whole batch. */
export function createArchitecturalBatch(
  name: string,
  boxes: readonly ArchitecturalBox[],
  material: StandardMaterial,
  parent: TransformNode,
  scene: Scene,
): Mesh {
  const parts = boxes.map(([x, y, z, width, height, depth], index) => {
    const mesh = MeshBuilder.CreateBox(
      `${name}-${index}`,
      { width, height, depth },
      scene,
    );
    mesh.position.set(x, y, z);
    mesh.material = material;
    mesh.computeWorldMatrix(true);
    return mesh;
  });
  const merged = Mesh.MergeMeshes(parts, true, true)!;
  merged.name = name;
  merged.parent = parent;
  merged.material = material;
  merged.isPickable = false;
  merged.receiveShadows = true;
  return merged;
}

export function createHouseFacadeDetails(
  scene: Scene,
  root: TransformNode,
  materials: TownMaterials,
  wall: StandardMaterial,
  dimensions: {
    width: number;
    depth: number;
    eaves: number;
    ridge: number;
    windowX: number;
    windowY: number;
    windowWidth: number;
    windowHeight: number;
    doorTop: number;
  },
): Mesh[] {
  const {
    width,
    depth,
    eaves,
    ridge,
    windowX,
    windowY,
    windowWidth,
    windowHeight,
    doorTop,
  } = dimensions;
  const front = -depth / 2 - 0.17;
  const trim: ArchitecturalBox[] = [
    [0, eaves - 0.13, 0, width + 0.16, 0.19, depth + 0.16],
    [-0.85, doorTop / 2 + 0.55, front, 0.14, doorTop - 1.1, 0.16],
    [0.85, doorTop / 2 + 0.55, front, 0.14, doorTop - 1.1, 0.16],
    [0, doorTop, front, 1.85, 0.18, 0.22],
  ];
  for (const x of [-windowX, windowX]) {
    for (const side of [-1, 1]) {
      trim.push([
        x + (side * windowWidth) / 2,
        windowY,
        front,
        0.1,
        windowHeight + 0.16,
        0.16,
      ]);
      trim.push([
        x,
        windowY + (side * windowHeight) / 2,
        front,
        windowWidth + 0.14,
        0.1,
        0.2,
      ]);
    }
    trim.push([x, windowY, front - 0.015, 0.055, windowHeight, 0.14]);
    trim.push([x, windowY + 0.2, front - 0.015, windowWidth, 0.045, 0.14]);
  }
  const roofline: ArchitecturalBox[] = [-1, 1].flatMap((side) => [
    [
      side * (width / 2 + 0.2),
      eaves + 0.02,
      0,
      0.15,
      0.15,
      depth + 0.9,
    ] as const,
    [
      side * (width / 2 + 0.1),
      eaves / 2 + 0.6,
      depth / 2 - 0.3,
      0.1,
      eaves - 1.2,
      0.1,
    ] as const,
  ]);
  const glass: ArchitecturalBox[] = [];
  for (const side of [-1, 1]) {
    for (const z of [-1.5, 1.4]) {
      glass.push([
        side * (width / 2 + 0.04),
        windowY,
        z,
        0.09,
        windowHeight,
        windowWidth,
      ]);
      trim.push([
        side * (width / 2 + 0.09),
        windowY - windowHeight / 2 - 0.05,
        z,
        0.25,
        0.14,
        windowWidth + 0.25,
      ]);
      trim.push([
        side * (width / 2 + 0.09),
        windowY,
        z,
        0.13,
        windowHeight,
        0.06,
      ]);
    }
  }
  // Close the triangular roof ends: a pitched roof should not float over a box.
  const gable = new Mesh(`${root.name}-masonry-gables`, scene);
  const points = [
    -width / 2,
    eaves,
    -depth / 2,
    width / 2,
    eaves,
    -depth / 2,
    0,
    ridge,
    -depth / 2,
    -width / 2,
    eaves,
    depth / 2,
    width / 2,
    eaves,
    depth / 2,
    0,
    ridge,
    depth / 2,
  ];
  const indices = [
    0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4, 0, 1, 4, 0, 4, 3,
  ];
  const normals: number[] = [];
  VertexData.ComputeNormals(points, indices, normals);
  const data = new VertexData();
  data.positions = points;
  data.indices = indices;
  data.normals = normals;
  data.uvs = [0, 0, 1, 0, 0.5, 0.5, 0, 0, 1, 0, 0.5, 0.5];
  data.applyToMesh(gable);
  gable.material = wall;
  gable.parent = root;
  gable.isPickable = false;
  gable.receiveShadows = true;
  return [
    createArchitecturalBatch(
      `${root.name}-stone-window-joinery`,
      trim,
      materials.cream,
      root,
      scene,
    ),
    createArchitecturalBatch(
      `${root.name}-rainwater-gutters`,
      roofline,
      materials.road,
      root,
      scene,
    ),
    createArchitecturalBatch(
      `${root.name}-side-windows`,
      glass,
      materials.window,
      root,
      scene,
    ),
    gable,
  ];
}

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
