import { PointLight } from "@babylonjs/core/Lights/pointLight";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

import { createSegmentBox, makeRoute } from "./geometry";
import type { TownMaterials } from "./materials";
import {
  renderedRoadHeight,
  ROAD_HALF_WIDTH_METERS,
  sampleRoadFrame,
} from "./road";
import { createTownDistricts } from "./town-districts";
import type { TownHouseMetadata } from "./types";

export type TownEnvironment = Readonly<{
  root: TransformNode;
  terrain: Mesh;
  roadMeshes: readonly Mesh[];
  riverMeshes: readonly Mesh[];
  treeCanopies: readonly TransformNode[];
  cloudRoots: readonly TransformNode[];
  lampBulbs: readonly Mesh[];
  houses: readonly TownHouseMetadata[];
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
  let districtHouses: readonly TownHouseMetadata[] = [];

  const terrain = MeshBuilder.CreateBox(
    "terrain-extruded-base",
    { width: 160, height: 3, depth: 145 },
    scene,
  );
  terrain.position.y = -1.5;
  terrain.material = materials.grass;
  terrain.parent = root;
  terrain.isPickable = false;
  terrain.receiveShadows = true;

  const terrainInset = MeshBuilder.CreateBox(
    "terrain-raised-inset",
    { width: 152, height: 0.55, depth: 137 },
    scene,
  );
  terrainInset.position.y = 0.18;
  terrainInset.material = materials.grassDark;
  terrainInset.parent = root;
  terrainInset.isPickable = false;
  terrainInset.receiveShadows = true;

  const playField = MeshBuilder.CreateBox(
    "terrain-play-field",
    { width: 148, height: 0.45, depth: 133 },
    scene,
  );
  playField.position.y = 0.48;
  playField.material = materials.grass;
  playField.parent = root;
  playField.isPickable = false;
  playField.receiveShadows = true;

  const riverPoints = makeRoute((t) => {
    const z = -70 + t * 140;
    const x = 12 + Math.sin(t * Math.PI * 2 - Math.PI / 2) * 3.4;
    return new Vector3(x, 0, z);
  }, 42);
  const waterSegments: Mesh[] = [];
  const bankSegments: Mesh[] = [];

  for (let index = 0; index < riverPoints.length - 1; index += 1) {
    const start = riverPoints[index];
    const end = riverPoints[index + 1];
    if (start === undefined || end === undefined) continue;
    const water = createSegmentBox(
      `river-water-${index}`,
      start,
      end,
      13,
      0.2,
      0.82,
      materials.river,
      root,
      scene,
    );
    waterSegments.push(water);

    const delta = end.subtract(start);
    const normal = new Vector3(-delta.z, 0, delta.x).normalize();
    for (const side of [-1, 1]) {
      const offset = normal.scale(side * 7.05);
      const bank = createSegmentBox(
        `river-bank-${side}-${index}`,
        start.add(offset),
        end.add(offset),
        1.1,
        0.34,
        0.86,
        materials.riverBank,
        root,
        scene,
      );
      bankSegments.push(bank);
    }
  }

  const waterRibbon = Mesh.MergeMeshes(
    waterSegments,
    true,
    true,
    undefined,
    false,
    true,
  );
  const riverBanks = Mesh.MergeMeshes(
    bankSegments,
    true,
    true,
    undefined,
    false,
    true,
  );
  if (waterRibbon !== null) riverMeshes.push(waterRibbon);
  if (riverBanks !== null) riverMeshes.push(riverBanks);

  const roadSamples = 160;
  const roadLeft: Vector3[] = [];
  const roadRight: Vector3[] = [];
  const shoulderLeft: Vector3[] = [];
  const shoulderRight: Vector3[] = [];
  for (let index = 0; index < roadSamples; index += 1) {
    const frame = sampleRoadFrame(index / roadSamples);
    const center = new Vector3(
      frame.center.x,
      renderedRoadHeight(frame.center.y),
      frame.center.z,
    );
    const lateral = new Vector3(frame.lateral.x, 0, frame.lateral.z);
    roadLeft.push(center.add(lateral.scale(ROAD_HALF_WIDTH_METERS)));
    roadRight.push(center.add(lateral.scale(-ROAD_HALF_WIDTH_METERS)));
    shoulderLeft.push(center.add(lateral.scale(ROAD_HALF_WIDTH_METERS + 1.3)));
    shoulderRight.push(
      center.add(lateral.scale(-(ROAD_HALF_WIDTH_METERS + 1.3))),
    );
  }

  const shoulder = MeshBuilder.CreateRibbon(
    "road-continuous-shoulder",
    {
      pathArray: [shoulderLeft, shoulderRight],
      closePath: true,
      sideOrientation: Mesh.DOUBLESIDE,
    },
    scene,
  );
  shoulder.material = materials.bridge;
  shoulder.parent = root;
  shoulder.isPickable = false;
  shoulder.receiveShadows = true;

  const asphalt = MeshBuilder.CreateRibbon(
    "road-continuous-asphalt",
    {
      pathArray: [roadLeft, roadRight],
      closePath: true,
      sideOrientation: Mesh.DOUBLESIDE,
    },
    scene,
  );
  asphalt.position.y = 0.12;
  asphalt.material = materials.road;
  asphalt.parent = root;
  asphalt.isPickable = false;
  asphalt.receiveShadows = true;
  roadMeshes.push(shoulder, asphalt);

  for (let progress = 0; progress < 1; progress += 0.042) {
    const frame = sampleRoadFrame(progress);
    const dash = MeshBuilder.CreateBox(
      `road-centre-mark-${Math.round(progress * 1000)}`,
      { width: 0.22, height: 0.08, depth: 2.8 },
      scene,
    );
    dash.position.set(
      frame.center.x,
      renderedRoadHeight(frame.center.y) + 0.15,
      frame.center.z,
    );
    dash.rotation.y = Math.atan2(frame.tangent.x, frame.tangent.z);
    dash.material = materials.roadLine;
    dash.parent = root;
    dash.isPickable = false;
    roadMeshes.push(dash);
  }

  createBridge(scene, root, 0.283, materials, shadows, roadMeshes, "north");
  createBridge(scene, root, 0.705, materials, shadows, roadMeshes, "south");

  for (const [index, t, side] of [
    [0, 0.11, -1],
    [1, 0.28, 1],
    [2, 0.47, -1],
    [3, 0.72, 1],
    [4, 0.89, -1],
  ] as const) {
    const frame = sampleRoadFrame(t);
    const offset = new Vector3(
      frame.lateral.x * side * 7.25,
      0,
      frame.lateral.z * side * 7.25,
    );
    const lightRoot = new TransformNode(`streetlight-${index}`, scene);
    lightRoot.position.set(
      frame.center.x + offset.x,
      renderedRoadHeight(frame.center.y) - 0.1,
      frame.center.z + offset.z,
    );
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

  const districts = createTownDistricts(scene, materials, shadows);
  districts.root.parent = root;
  treeCanopies.push(...districts.treeCanopies);
  districtHouses = districts.houses;

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
    houses: districtHouses,
    dispose: () => root.dispose(false),
  };
}

function createBridge(
  scene: Scene,
  root: TransformNode,
  progress: number,
  materials: TownMaterials,
  shadows: ShadowGenerator,
  roadMeshes: Mesh[],
  suffix: string,
) {
  const frame = sampleRoadFrame(progress);
  const bridgeRoot = new TransformNode(`rivergate-bridge-${suffix}`, scene);
  bridgeRoot.position.set(
    frame.center.x,
    renderedRoadHeight(frame.center.y) - 0.2,
    frame.center.z,
  );
  bridgeRoot.rotation.y = Math.atan2(frame.tangent.x, frame.tangent.z);
  bridgeRoot.parent = root;

  const deck = MeshBuilder.CreateBox(
    `bridge-extruded-deck-${suffix}`,
    { width: 12.4, height: 0.45, depth: 20 },
    scene,
  );
  deck.position.y = 0.02;
  deck.material = materials.bridge;
  deck.parent = bridgeRoot;
  deck.isPickable = false;
  deck.receiveShadows = true;
  shadows.addShadowCaster(deck);
  roadMeshes.push(deck);

  const bridgeRoad = MeshBuilder.CreateBox(
    `bridge-road-surface-${suffix}`,
    { width: 10.4, height: 0.16, depth: 20.4 },
    scene,
  );
  bridgeRoad.position.y = 0.35;
  bridgeRoad.material = materials.road;
  bridgeRoad.parent = bridgeRoot;
  bridgeRoad.isPickable = false;
  bridgeRoad.receiveShadows = true;
  roadMeshes.push(bridgeRoad);

  for (const side of [-1, 1]) {
    const rail = MeshBuilder.CreateBox(
      `bridge-rail-${suffix}-${side}`,
      { width: 0.34, height: 0.55, depth: 20.5 },
      scene,
    );
    rail.position.set(side * 5.75, 0.88, 0);
    rail.material = materials.white;
    rail.parent = bridgeRoot;
    rail.isPickable = false;
    shadows.addShadowCaster(rail);

    for (const z of [-8, -4, 0, 4, 8]) {
      const post = MeshBuilder.CreateBox(
        `bridge-post-${suffix}-${side}-${z}`,
        { width: 0.34, height: 1.3, depth: 0.34 },
        scene,
      );
      post.position.set(side * 5.75, 0.65, z);
      post.material = materials.white;
      post.parent = bridgeRoot;
      post.isPickable = false;
      shadows.addShadowCaster(post);
    }
  }

  for (const z of [-7.2, -2.4, 2.4, 7.2]) {
    const dash = MeshBuilder.CreateBox(
      `bridge-centre-mark-${suffix}-${z}`,
      { width: 0.2, height: 0.08, depth: 2.8 },
      scene,
    );
    dash.position.set(0, 0.47, z);
    dash.material = materials.roadLine;
    dash.parent = bridgeRoot;
    dash.isPickable = false;
    roadMeshes.push(dash);
  }

  for (const z of [-6, 6]) {
    for (const x of [-3.65, 3.65]) {
      const pier = MeshBuilder.CreateCylinder(
        `bridge-pier-${suffix}-${x}-${z}`,
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
