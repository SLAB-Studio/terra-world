import {
  Mesh,
  MeshBuilder,
  PointLight,
  type Scene,
  type ShadowGenerator,
  TransformNode,
  Vector3,
} from "@babylonjs/core";

import {
  createSegmentBox,
  makeRoute,
  quadraticPoint,
  routePose,
} from "./geometry";
import type { TownMaterials } from "./materials";

export type TownEnvironment = Readonly<{
  root: TransformNode;
  terrain: Mesh;
  roadMeshes: readonly Mesh[];
  riverMeshes: readonly Mesh[];
  treeCanopies: readonly TransformNode[];
  cloudRoots: readonly TransformNode[];
  lampBulbs: readonly Mesh[];
  dispose(): void;
}>;

export function createTownEnvironment(
  scene: Scene,
  materials: TownMaterials,
  shadows: ShadowGenerator,
): TownEnvironment {
  const root = new TransformNode("town-environment", scene);
  const roadMeshes: Mesh[] = [];
  const riverMeshes: Mesh[] = [];
  const treeCanopies: TransformNode[] = [];
  const cloudRoots: TransformNode[] = [];
  const lampBulbs: Mesh[] = [];

  const terrain = MeshBuilder.CreateBox(
    "terrain-extruded-base",
    { width: 132, height: 3, depth: 92 },
    scene,
  );
  terrain.position.y = -1.5;
  terrain.material = materials.grass;
  terrain.parent = root;
  terrain.isPickable = false;
  terrain.receiveShadows = true;

  const terrainInset = MeshBuilder.CreateBox(
    "terrain-raised-inset",
    { width: 122, height: 0.55, depth: 82 },
    scene,
  );
  terrainInset.position.y = 0.18;
  terrainInset.material = materials.grassDark;
  terrainInset.parent = root;
  terrainInset.isPickable = false;
  terrainInset.receiveShadows = true;

  const playField = MeshBuilder.CreateBox(
    "terrain-play-field",
    { width: 119, height: 0.45, depth: 79 },
    scene,
  );
  playField.position.y = 0.48;
  playField.material = materials.grass;
  playField.parent = root;
  playField.isPickable = false;
  playField.receiveShadows = true;

  const riverPoints = makeRoute((t) => {
    const z = -46 + t * 92;
    const x = 12 + Math.sin(t * Math.PI * 2 - Math.PI / 2) * 3.4;
    return new Vector3(x, 0, z);
  }, 42);

  for (let index = 0; index < riverPoints.length - 1; index += 1) {
    const start = riverPoints[index];
    const end = riverPoints[index + 1];
    if (start === undefined || end === undefined) continue;
    const water = createSegmentBox(
      `river-water-${index}`,
      start,
      end,
      11,
      0.72,
      0.28,
      materials.river,
      root,
      scene,
    );
    riverMeshes.push(water);

    const delta = end.subtract(start);
    const normal = new Vector3(-delta.z, 0, delta.x).normalize();
    for (const side of [-1, 1]) {
      const offset = normal.scale(side * 6.15);
      const bank = createSegmentBox(
        `river-bank-${side}-${index}`,
        start.add(offset),
        end.add(offset),
        1.5,
        0.7,
        0.58,
        materials.riverBank,
        root,
        scene,
      );
      riverMeshes.push(bank);
    }
  }

  const roadPoints = makeRoute(
    (t) =>
      quadraticPoint(
        new Vector3(-66, 0, -5),
        new Vector3(0, 0, 6),
        new Vector3(66, 0, -4),
        t,
      ),
    46,
  );

  for (let index = 0; index < roadPoints.length - 1; index += 1) {
    const start = roadPoints[index];
    const end = roadPoints[index + 1];
    if (start === undefined || end === undefined) continue;
    const shoulder = createSegmentBox(
      `road-shoulder-${index}`,
      start,
      end,
      10.8,
      0.5,
      0.72,
      materials.bridge,
      root,
      scene,
    );
    const asphalt = createSegmentBox(
      `road-asphalt-${index}`,
      start,
      end,
      8.3,
      0.7,
      1.05,
      materials.road,
      root,
      scene,
    );
    roadMeshes.push(shoulder, asphalt);
  }

  for (let t = 0.045; t < 0.97; t += 0.055) {
    const pose = routePose(roadPoints, t);
    const dash = MeshBuilder.CreateBox(
      `road-centre-mark-${Math.round(t * 1000)}`,
      { width: 2.8, height: 0.08, depth: 0.18 },
      scene,
    );
    dash.position.copyFrom(pose.position);
    dash.position.y = 1.44;
    dash.rotation.y = pose.yaw;
    dash.material = materials.roadLine;
    dash.parent = root;
    dash.isPickable = false;
    roadMeshes.push(dash);
  }

  createBridge(scene, root, roadPoints, materials, shadows, roadMeshes);

  for (const [index, t, side] of [
    [0, 0.11, -1],
    [1, 0.28, 1],
    [2, 0.47, -1],
    [3, 0.72, 1],
    [4, 0.89, -1],
  ] as const) {
    const pose = routePose(roadPoints, t);
    const offset = pose.normal.scale(side * 7.25);
    const lightRoot = new TransformNode(`streetlight-${index}`, scene);
    lightRoot.position.copyFrom(pose.position.add(offset));
    lightRoot.parent = root;

    const pole = MeshBuilder.CreateCylinder(
      `streetlight-pole-${index}`,
      { height: 6.2, diameter: 0.34, tessellation: 12 },
      scene,
    );
    pole.position.y = 3.55;
    pole.material = materials.bark;
    pole.parent = lightRoot;
    pole.isPickable = false;
    shadows.addShadowCaster(pole);

    const shade = MeshBuilder.CreateCylinder(
      `streetlight-shade-${index}`,
      {
        height: 0.7,
        diameterTop: 0.65,
        diameterBottom: 1.15,
        tessellation: 16,
      },
      scene,
    );
    shade.position.y = 6.62;
    shade.material = materials.road;
    shade.parent = lightRoot;
    shade.isPickable = false;

    const bulb = MeshBuilder.CreateSphere(
      `streetlight-bulb-${index}`,
      { diameter: 0.56, segments: 12 },
      scene,
    );
    bulb.position.y = 6.35;
    bulb.material = materials.lamp;
    bulb.parent = lightRoot;
    bulb.isPickable = false;
    lampBulbs.push(bulb);

    if (index === 1 || index === 3) {
      const glow = new PointLight(
        `streetlight-glow-${index}`,
        lightRoot.position.add(new Vector3(0, 6.15, 0)),
        scene,
      );
      glow.diffuse = materials.lamp.diffuseColor;
      glow.intensity = 0.18;
      glow.range = 12;
      glow.parent = root;
    }
  }

  const treePositions = [
    [-57, -31, 1.05],
    [-48, 27, 0.9],
    [-39, 35, 1.12],
    [-28, -35, 0.96],
    [-7, -28, 1.08],
    [-5, 30, 0.92],
    [25, -34, 1.03],
    [30, 34, 1.15],
    [47, -27, 0.95],
    [55, 24, 1.1],
    [58, -37, 0.86],
  ] as const;
  treePositions.forEach(([x, z, scale], index) => {
    treeCanopies.push(
      createTree(scene, root, shadows, materials, index, x, z, scale),
    );
  });

  const sky = MeshBuilder.CreateSphere(
    "town-sky-dome",
    { diameter: 260, segments: 20 },
    scene,
  );
  sky.material = materials.sky;
  sky.isPickable = false;
  sky.infiniteDistance = true;
  sky.parent = root;

  for (const [index, x, z, scale] of [
    [0, -48, -32, 1.2],
    [1, 2, 28, 0.85],
    [2, 48, -10, 1.05],
  ] as const) {
    cloudRoots.push(createCloud(scene, root, materials, index, x, z, scale));
  }

  return {
    root,
    terrain,
    roadMeshes,
    riverMeshes,
    treeCanopies,
    cloudRoots,
    lampBulbs,
    dispose: () => root.dispose(false),
  };
}

function createBridge(
  scene: Scene,
  root: TransformNode,
  roadPoints: readonly Vector3[],
  materials: TownMaterials,
  shadows: ShadowGenerator,
  roadMeshes: Mesh[],
) {
  const pose = routePose(roadPoints, 0.59);
  const bridgeRoot = new TransformNode("rivergate-bridge", scene);
  bridgeRoot.position.copyFrom(pose.position);
  bridgeRoot.rotation.y = pose.yaw;
  bridgeRoot.parent = root;

  const deck = MeshBuilder.CreateBox(
    "bridge-extruded-deck",
    { width: 19, height: 1.25, depth: 10.9 },
    scene,
  );
  deck.position.y = 1.15;
  deck.material = materials.bridge;
  deck.parent = bridgeRoot;
  deck.isPickable = false;
  deck.receiveShadows = true;
  shadows.addShadowCaster(deck);
  roadMeshes.push(deck);

  const bridgeRoad = MeshBuilder.CreateBox(
    "bridge-road-surface",
    { width: 19.4, height: 0.3, depth: 8.2 },
    scene,
  );
  bridgeRoad.position.y = 1.91;
  bridgeRoad.material = materials.road;
  bridgeRoad.parent = bridgeRoot;
  bridgeRoad.isPickable = false;
  bridgeRoad.receiveShadows = true;
  roadMeshes.push(bridgeRoad);

  for (const side of [-1, 1]) {
    const rail = MeshBuilder.CreateBox(
      `bridge-rail-${side}`,
      { width: 19.5, height: 0.55, depth: 0.34 },
      scene,
    );
    rail.position.set(0, 2.45, side * 5.05);
    rail.material = materials.white;
    rail.parent = bridgeRoot;
    rail.isPickable = false;
    shadows.addShadowCaster(rail);

    for (const x of [-8, -4, 0, 4, 8]) {
      const post = MeshBuilder.CreateBox(
        `bridge-post-${side}-${x}`,
        { width: 0.34, height: 1.3, depth: 0.34 },
        scene,
      );
      post.position.set(x, 2.1, side * 5.05);
      post.material = materials.white;
      post.parent = bridgeRoot;
      post.isPickable = false;
      shadows.addShadowCaster(post);
    }
  }

  for (const x of [-7.2, -2.4, 2.4, 7.2]) {
    const dash = MeshBuilder.CreateBox(
      `bridge-centre-mark-${x}`,
      { width: 2.8, height: 0.08, depth: 0.2 },
      scene,
    );
    dash.position.set(x, 2.1, 0);
    dash.material = materials.roadLine;
    dash.parent = bridgeRoot;
    dash.isPickable = false;
    roadMeshes.push(dash);
  }

  for (const x of [-6, 6]) {
    for (const z of [-3.65, 3.65]) {
      const pier = MeshBuilder.CreateCylinder(
        `bridge-pier-${x}-${z}`,
        { height: 3.2, diameter: 0.9, tessellation: 12 },
        scene,
      );
      pier.position.set(x, -0.45, z);
      pier.material = materials.bridge;
      pier.parent = bridgeRoot;
      pier.isPickable = false;
    }
  }
}

function createTree(
  scene: Scene,
  parent: TransformNode,
  shadows: ShadowGenerator,
  materials: TownMaterials,
  index: number,
  x: number,
  z: number,
  scale: number,
) {
  const root = new TransformNode(`tree-${index}`, scene);
  root.position.set(x, 0.75, z);
  root.scaling.setAll(scale);
  root.parent = parent;

  const trunk = MeshBuilder.CreateCylinder(
    `tree-trunk-${index}`,
    { height: 4.5, diameterTop: 0.72, diameterBottom: 1.05, tessellation: 10 },
    scene,
  );
  trunk.position.y = 2.25;
  trunk.material = materials.bark;
  trunk.parent = root;
  trunk.isPickable = false;
  shadows.addShadowCaster(trunk);

  const canopy = new TransformNode(`tree-canopy-${index}`, scene);
  canopy.position.y = 5.25;
  canopy.parent = root;
  for (const [lobIndex, position, diameter, material] of [
    [0, new Vector3(-0.85, 0, 0.15), 3.8, materials.leaf],
    [1, new Vector3(0.8, 0.18, 0.2), 3.5, materials.leafLight],
    [2, new Vector3(0, 1.25, -0.25), 3.9, materials.leaf],
  ] as const) {
    const lob = MeshBuilder.CreateSphere(
      `tree-canopy-${index}-${lobIndex}`,
      { diameter, segments: 10 },
      scene,
    );
    lob.position.copyFrom(position);
    lob.scaling.y = 0.82;
    lob.material = material;
    lob.parent = canopy;
    lob.isPickable = false;
    shadows.addShadowCaster(lob);
  }
  return canopy;
}

function createCloud(
  scene: Scene,
  parent: TransformNode,
  materials: TownMaterials,
  index: number,
  x: number,
  z: number,
  scale: number,
) {
  const root = new TransformNode(`cloud-${index}`, scene);
  root.position.set(x, 34 + index * 2, z);
  root.scaling.setAll(scale);
  root.parent = parent;

  for (const [lobIndex, px, py, pz, diameter] of [
    [0, -3.1, 0, 0, 5.8],
    [1, 0, 1.1, 0.25, 7.5],
    [2, 3.4, -0.1, 0, 5.4],
  ] as const) {
    const lob = MeshBuilder.CreateSphere(
      `cloud-${index}-${lobIndex}`,
      { diameter, segments: 10 },
      scene,
    );
    lob.position.set(px, py, pz);
    lob.scaling.y = 0.58;
    lob.material = materials.white;
    lob.visibility = 0.74;
    lob.isPickable = false;
    lob.parent = root;
  }
  return root;
}
