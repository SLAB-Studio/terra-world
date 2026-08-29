import {
  MeshBuilder,
  type Scene,
  type ShadowGenerator,
  type StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";

import type { TownMaterials } from "./materials";
import type {
  TownCompoundId,
  TownCompoundMetadata,
  TownHouseMetadata,
} from "./types";

export type TownCompounds = Readonly<{
  root: TransformNode;
  compounds: readonly TownCompoundMetadata[];
  houses: readonly TownHouseMetadata[];
  gardenNodes: readonly TransformNode[];
  dispose(): void;
}>;

type HouseStyle = Readonly<{
  wall: StandardMaterial;
  roof: StandardMaterial;
  accent: StandardMaterial;
}>;

type CompoundDefinition = Readonly<{
  id: TownCompoundId;
  displayName: string;
  position: Vector3;
  rotation: number;
  style: HouseStyle;
  houses: readonly Readonly<{
    id: string;
    displayName: string;
    position: Vector3;
    rotation: number;
  }>[];
}>;

export function createTownCompounds(
  scene: Scene,
  materials: TownMaterials,
  shadows: ShadowGenerator,
): TownCompounds {
  const root = new TransformNode("town-compounds", scene);
  const houses: TownHouseMetadata[] = [];
  const compounds: TownCompoundMetadata[] = [];
  const gardenNodes: TransformNode[] = [];

  const definitions: readonly CompoundDefinition[] = [
    {
      id: "sunflower-court",
      displayName: "Sunflower Court",
      position: new Vector3(-38, 0.75, -20),
      rotation: -0.08,
      style: {
        wall: materials.sunflowerWall,
        roof: materials.sunflowerRoof,
        accent: materials.flower,
      },
      houses: [
        {
          id: "sunny",
          displayName: "Ayo's Sunny House",
          position: new Vector3(0, 0, -1.8),
          rotation: 0.04,
        },
      ],
    },
    {
      id: "riverbend-gardens",
      displayName: "Riverbend Gardens",
      position: new Vector3(38, 0.75, -20),
      rotation: 0.08,
      style: {
        wall: materials.riverWall,
        roof: materials.riverRoof,
        accent: materials.river,
      },
      houses: [
        {
          id: "bluebell",
          displayName: "Mina's Bluebell House",
          position: new Vector3(0, 0, -1.8),
          rotation: -0.05,
        },
      ],
    },
    {
      id: "orchard-lane",
      displayName: "Orchard Lane",
      position: new Vector3(-26, 0.75, 26),
      rotation: 0.07,
      style: {
        wall: materials.orchardWall,
        roof: materials.orchardRoof,
        accent: materials.clay,
      },
      houses: [
        {
          id: "mango",
          displayName: "Tomi's Mango House",
          position: new Vector3(0, 0, -1.8),
          rotation: 0.03,
        },
      ],
    },
  ];

  for (const definition of definitions) {
    const compoundRoot = new TransformNode(`compound-${definition.id}`, scene);
    compoundRoot.position.copyFrom(definition.position);
    compoundRoot.rotation.y = definition.rotation;
    compoundRoot.parent = root;

    const yard = MeshBuilder.CreateBox(
      `compound-yard-${definition.id}`,
      { width: 31, height: 0.75, depth: 21 },
      scene,
    );
    yard.position.y = 0.05;
    yard.material = materials.grassDark;
    yard.parent = compoundRoot;
    yard.isPickable = false;
    yard.receiveShadows = true;

    const lawn = MeshBuilder.CreateBox(
      `compound-lawn-${definition.id}`,
      { width: 29.5, height: 0.46, depth: 19.5 },
      scene,
    );
    lawn.position.y = 0.54;
    lawn.material = materials.grass;
    lawn.parent = compoundRoot;
    lawn.isPickable = false;
    lawn.receiveShadows = true;

    const compoundHouses = definition.houses.map((house) =>
      createHouse(
        scene,
        shadows,
        materials,
        compoundRoot,
        definition.id,
        house.id,
        house.displayName,
        house.position,
        house.rotation,
        definition.style,
      ),
    );
    houses.push(...compoundHouses);

    createFence(scene, compoundRoot, materials, shadows, definition.id);
    createCompoundPath(scene, compoundRoot, materials, definition.id);

    if (definition.id === "sunflower-court") {
      gardenNodes.push(
        ...createSunflowerGarden(scene, compoundRoot, materials, shadows),
      );
    } else if (definition.id === "riverbend-gardens") {
      gardenNodes.push(
        ...createRiverbendGarden(scene, compoundRoot, materials, shadows),
      );
    } else {
      gardenNodes.push(
        ...createOrchardGarden(scene, compoundRoot, materials, shadows),
      );
    }

    compounds.push({
      id: definition.id,
      displayName: definition.displayName,
      root: compoundRoot,
      houses: compoundHouses,
    });
  }

  return {
    root,
    compounds,
    houses,
    gardenNodes,
    dispose: () => root.dispose(false),
  };
}

function createHouse(
  scene: Scene,
  shadows: ShadowGenerator,
  materials: TownMaterials,
  parent: TransformNode,
  compoundId: TownCompoundId,
  id: string,
  displayName: string,
  position: Vector3,
  rotation: number,
  style: HouseStyle,
): TownHouseMetadata {
  const root = new TransformNode(`house-${id}`, scene);
  root.position.copyFrom(position);
  root.rotation.y = rotation;
  root.parent = parent;

  const foundation = MeshBuilder.CreateBox(
    `${id}-foundation`,
    { width: 9.2, height: 0.55, depth: 8.2 },
    scene,
  );
  foundation.position.y = 0.98;
  foundation.material = materials.cream;
  foundation.parent = root;

  const walls = MeshBuilder.CreateBox(
    `${id}-walls`,
    { width: 8.2, height: 4.1, depth: 7.2 },
    scene,
  );
  walls.position.y = 3.25;
  walls.material = style.wall;
  walls.parent = root;

  for (const [side, x, angle] of [
    [-1, -2.35, 0.56],
    [1, 2.35, -0.56],
  ] as const) {
    const roof = MeshBuilder.CreateBox(
      `${id}-roof-${side}`,
      { width: 5.7, height: 0.58, depth: 8.5 },
      scene,
    );
    roof.position.set(x, 5.82, 0);
    roof.rotation.z = angle;
    roof.material = style.roof;
    roof.parent = root;
  }

  const door = MeshBuilder.CreateBox(
    `${id}-door`,
    { width: 1.55, height: 2.55, depth: 0.24 },
    scene,
  );
  door.position.set(0, 2.45, -3.72);
  door.material = style.accent;
  door.parent = root;

  for (const side of [-1, 1]) {
    const window = MeshBuilder.CreateBox(
      `${id}-window-${side}`,
      { width: 1.48, height: 1.45, depth: 0.2 },
      scene,
    );
    window.position.set(side * 2.45, 3.45, -3.73);
    window.material = materials.window;
    window.parent = root;

    const sill = MeshBuilder.CreateBox(
      `${id}-window-sill-${side}`,
      { width: 1.82, height: 0.18, depth: 0.4 },
      scene,
    );
    sill.position.set(side * 2.45, 2.67, -3.84);
    sill.material = materials.white;
    sill.parent = root;
  }

  const chimney = MeshBuilder.CreateBox(
    `${id}-chimney`,
    { width: 0.9, height: 2.1, depth: 0.9 },
    scene,
  );
  chimney.position.set(2.15, 6.25, 1.2);
  chimney.material = materials.clay;
  chimney.parent = root;

  const step = MeshBuilder.CreateBox(
    `${id}-front-step`,
    { width: 2.4, height: 0.35, depth: 1.15 },
    scene,
  );
  step.position.set(0, 1.05, -4.1);
  step.material = materials.bridge;
  step.parent = root;

  root.computeWorldMatrix(true);
  const meshes = root.getChildMeshes();
  for (const mesh of meshes) {
    mesh.isPickable = true;
    mesh.receiveShadows = true;
    mesh.metadata = {
      ...(typeof mesh.metadata === "object" && mesh.metadata !== null
        ? mesh.metadata
        : {}),
      kind: "terra-house",
      houseId: id,
      compoundId,
      displayName,
    };
    shadows.addShadowCaster(mesh);
  }
  walls.metadata = {
    ...walls.metadata,
    interactionRole: "house-pick-surface",
  };

  return {
    id,
    compoundId,
    displayName,
    root,
    pickMesh: walls,
    meshes,
    worldPosition: root.getAbsolutePosition().clone(),
  };
}

function createFence(
  scene: Scene,
  parent: TransformNode,
  materials: TownMaterials,
  shadows: ShadowGenerator,
  compoundId: TownCompoundId,
) {
  const fenceRoot = new TransformNode(`fence-${compoundId}`, scene);
  fenceRoot.parent = parent;
  const postPositions: [number, number][] = [];
  for (const x of [-14, -9.3, -4.7, 0, 4.7, 9.3, 14]) {
    postPositions.push([x, -9.4], [x, 9.4]);
  }
  for (const z of [-5.5, 0, 5.5]) {
    postPositions.push([-14.3, z], [14.3, z]);
  }
  postPositions.forEach(([x, z], index) => {
    const post = MeshBuilder.CreateBox(
      `fence-post-${compoundId}-${index}`,
      { width: 0.28, height: 1.45, depth: 0.28 },
      scene,
    );
    post.position.set(x, 1.35, z);
    post.material = materials.white;
    post.parent = fenceRoot;
    post.isPickable = false;
    shadows.addShadowCaster(post);
  });

  for (const [name, x, z, width, depth] of [
    ["back", 0, 9.4, 28.4, 0.18],
    ["front-left", -8.4, -9.4, 11.4, 0.18],
    ["front-right", 8.4, -9.4, 11.4, 0.18],
    ["left", -14.3, 0, 0.18, 18.8],
    ["right", 14.3, 0, 0.18, 18.8],
  ] as const) {
    for (const y of [1.05, 1.72]) {
      const rail = MeshBuilder.CreateBox(
        `fence-rail-${compoundId}-${name}-${y}`,
        { width, height: 0.2, depth },
        scene,
      );
      rail.position.set(x, y, z);
      rail.material = materials.white;
      rail.parent = fenceRoot;
      rail.isPickable = false;
      shadows.addShadowCaster(rail);
    }
  }
}

function createCompoundPath(
  scene: Scene,
  parent: TransformNode,
  materials: TownMaterials,
  compoundId: TownCompoundId,
) {
  const path = MeshBuilder.CreateBox(
    `compound-path-${compoundId}`,
    { width: 3.7, height: 0.22, depth: 12.5 },
    scene,
  );
  path.position.set(0, 0.9, -6.7);
  path.material = materials.bridge;
  path.parent = parent;
  path.isPickable = false;
  path.receiveShadows = true;
}

function createSunflowerGarden(
  scene: Scene,
  parent: TransformNode,
  materials: TownMaterials,
  shadows: ShadowGenerator,
) {
  const nodes: TransformNode[] = [];
  const bed = MeshBuilder.CreateCylinder(
    "sunflower-garden-bed",
    { height: 0.65, diameter: 7.2, tessellation: 20 },
    scene,
  );
  bed.position.set(0, 1.05, 5.2);
  bed.material = materials.soil;
  bed.parent = parent;
  bed.isPickable = false;

  for (const [index, x, z, height] of [
    [0, -2, 4.3, 2.3],
    [1, 0, 3.5, 2.7],
    [2, 2, 4.4, 2.4],
    [3, -1.15, 6, 2.5],
    [4, 1.15, 6.1, 2.2],
  ] as const) {
    const flowerRoot = new TransformNode(`sunflower-${index}`, scene);
    flowerRoot.position.set(x, 1.25, z);
    flowerRoot.parent = parent;
    const stem = MeshBuilder.CreateCylinder(
      `sunflower-stem-${index}`,
      { height, diameter: 0.18, tessellation: 8 },
      scene,
    );
    stem.position.y = height / 2;
    stem.material = materials.hedge;
    stem.parent = flowerRoot;
    const bloom = MeshBuilder.CreateSphere(
      `sunflower-bloom-${index}`,
      { diameter: 0.78, segments: 10 },
      scene,
    );
    bloom.position.y = height;
    bloom.scaling.z = 0.45;
    bloom.material = materials.flower;
    bloom.parent = flowerRoot;
    shadows.addShadowCaster(stem);
    shadows.addShadowCaster(bloom);
    nodes.push(flowerRoot);
  }
  return nodes;
}

function createRiverbendGarden(
  scene: Scene,
  parent: TransformNode,
  materials: TownMaterials,
  shadows: ShadowGenerator,
) {
  const nodes: TransformNode[] = [];
  for (const [bedIndex, x] of [
    [0, -4.1],
    [1, 0],
    [2, 4.1],
  ] as const) {
    const bed = MeshBuilder.CreateBox(
      `riverbend-raised-bed-${bedIndex}`,
      { width: 3.2, height: 0.85, depth: 5.4 },
      scene,
    );
    bed.position.set(x, 1.25, 5.1);
    bed.material = materials.soil;
    bed.parent = parent;
    bed.isPickable = false;
    bed.receiveShadows = true;

    for (const [sproutIndex, z] of [-1.55, -0.5, 0.55, 1.6].entries()) {
      const sprout = new TransformNode(
        `riverbend-sprout-${bedIndex}-${sproutIndex}`,
        scene,
      );
      sprout.position.set(x, 1.82, 5.1 + z);
      sprout.parent = parent;
      const leaves = MeshBuilder.CreateSphere(
        `riverbend-leaves-${bedIndex}-${sproutIndex}`,
        { diameter: 0.9, segments: 8 },
        scene,
      );
      leaves.scaling.set(1, 0.55, 0.65);
      leaves.material =
        sproutIndex % 2 === 0 ? materials.leafLight : materials.leaf;
      leaves.parent = sprout;
      shadows.addShadowCaster(leaves);
      nodes.push(sprout);
    }
  }

  const tank = MeshBuilder.CreateCylinder(
    "riverbend-rain-tank",
    { height: 3.4, diameter: 2.7, tessellation: 16 },
    scene,
  );
  tank.position.set(11, 2.25, 5.9);
  tank.material = materials.riverRoof;
  tank.parent = parent;
  tank.isPickable = false;
  shadows.addShadowCaster(tank);
  return nodes;
}

function createOrchardGarden(
  scene: Scene,
  parent: TransformNode,
  materials: TownMaterials,
  shadows: ShadowGenerator,
) {
  const nodes: TransformNode[] = [];
  for (const [index, x, z] of [
    [0, -5.3, 4.2],
    [1, 0, 5.3],
    [2, 5.3, 4.2],
  ] as const) {
    const tree = new TransformNode(`orchard-fruit-tree-${index}`, scene);
    tree.position.set(x, 1.05, z);
    tree.parent = parent;
    const trunk = MeshBuilder.CreateCylinder(
      `orchard-trunk-${index}`,
      { height: 2.4, diameter: 0.5, tessellation: 9 },
      scene,
    );
    trunk.position.y = 1.2;
    trunk.material = materials.bark;
    trunk.parent = tree;
    const canopy = MeshBuilder.CreateSphere(
      `orchard-canopy-${index}`,
      { diameter: 3.4, segments: 10 },
      scene,
    );
    canopy.position.y = 3.2;
    canopy.scaling.y = 0.76;
    canopy.material = index % 2 === 0 ? materials.leaf : materials.leafLight;
    canopy.parent = tree;
    shadows.addShadowCaster(trunk);
    shadows.addShadowCaster(canopy);

    for (const [fruitIndex, px, py] of [
      [0, -0.75, 2.8],
      [1, 0.72, 3.2],
      [2, 0, 3.85],
    ] as const) {
      const fruit = MeshBuilder.CreateSphere(
        `orchard-fruit-${index}-${fruitIndex}`,
        { diameter: 0.42, segments: 8 },
        scene,
      );
      fruit.position.set(px, py, -1.35);
      fruit.material = materials.clay;
      fruit.parent = tree;
    }
    nodes.push(tree);
  }

  const arch = new TransformNode("orchard-entry-arch", scene);
  arch.position.set(0, 0, -8.7);
  arch.parent = parent;
  for (const x of [-2.25, 2.25]) {
    const post = MeshBuilder.CreateBox(
      `orchard-arch-post-${x}`,
      { width: 0.45, height: 3.4, depth: 0.45 },
      scene,
    );
    post.position.set(x, 2.45, 0);
    post.material = materials.bark;
    post.parent = arch;
    shadows.addShadowCaster(post);
  }
  const beam = MeshBuilder.CreateBox(
    "orchard-arch-beam",
    { width: 5.2, height: 0.5, depth: 0.55 },
    scene,
  );
  beam.position.y = 4.05;
  beam.material = materials.bark;
  beam.parent = arch;
  shadows.addShadowCaster(beam);
  return nodes;
}
