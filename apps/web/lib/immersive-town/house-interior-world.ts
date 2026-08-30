import "@babylonjs/core/Culling/ray";

import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import type { Engine } from "@babylonjs/core/Engines/engine";

import {
  createInteriorWalker,
  type InteriorWalker,
  type InteriorWalkCallbacks,
} from "./interior-walker";
import type { WalkBounds } from "./walking";
import { applyTownSurface } from "./materials";
import { createArchitecturalBatch } from "./geometry";

export type InteriorRoomId =
  "living-room" | "kitchen" | "garden-room" | "utility-room";

export type InteriorUpgradeId = "light" | "water" | "garden" | "recycle";

export const INTERIOR_ROOMS: readonly Readonly<{
  id: InteriorRoomId;
  label: string;
  shortLabel: string;
  upgradeId: InteriorUpgradeId;
  problem: string;
  healthy: string;
}>[] = [
  {
    id: "living-room",
    label: "Living room",
    shortLabel: "Living",
    upgradeId: "light",
    problem: "The lamp has no clean power.",
    healthy: "The room glows with clean sunlight.",
  },
  {
    id: "kitchen",
    label: "Kitchen",
    shortLabel: "Kitchen",
    upgradeId: "water",
    problem: "The tap needs clean running water.",
    healthy: "Clean water reaches the sink.",
  },
  {
    id: "garden-room",
    label: "Garden room",
    shortLabel: "Garden",
    upgradeId: "garden",
    problem: "The planters are empty and dry.",
    healthy: "Healthy plants fill the sunny room.",
  },
  {
    id: "utility-room",
    label: "Utility room",
    shortLabel: "Utility",
    upgradeId: "recycle",
    problem: "Useful materials are mixed together.",
    healthy: "Everything is sorted for recycling.",
  },
] as const;

type RoomRig = Readonly<{
  id: InteriorRoomId;
  upgradeId: InteriorUpgradeId;
  center: Vector3;
  meshes: readonly AbstractMesh[];
  selection: Mesh;
  problem: TransformNode;
  healthy: TransformNode;
}>;

export type HouseInteriorWorld = Readonly<{
  scene: Scene;
  camera: ArcRotateCamera;
  walker: InteriorWalker;
  rooms: readonly RoomRig[];
  getRoomFromMesh(mesh: AbstractMesh | null): InteriorRoomId | null;
  focusRoom(roomId: InteriorRoomId | null, reducedMotion?: boolean): void;
  setInstalled(upgrades: readonly InteriorUpgradeId[]): void;
  dispose(): void;
}>;

const ROOM_CENTERS: Readonly<Record<InteriorRoomId, Vector3>> = {
  "living-room": new Vector3(-4.15, 0, -2.55),
  kitchen: new Vector3(4.15, 0, -2.55),
  "garden-room": new Vector3(-4.15, 0, 2.55),
  "utility-room": new Vector3(4.15, 0, 2.55),
};

export function createHouseInteriorWorld(
  engine: Engine,
  houseId: "sunny" | "bluebell" | "mango",
  initialUpgrades: readonly InteriorUpgradeId[],
  callbacks: InteriorWalkCallbacks = {},
): HouseInteriorWorld {
  const scene = new Scene(engine);
  scene.clearColor = Color4.FromHexString("#8FC3DEFF");
  scene.ambientColor = Color3.FromHexString("#8B7657").scale(0.12);
  scene.imageProcessingConfiguration.contrast = 1.16;
  scene.imageProcessingConfiguration.exposure = 0.82;

  const camera = new ArcRotateCamera(
    `interior-camera-${houseId}`,
    -Math.PI / 2,
    1.02,
    27,
    new Vector3(0, 1.6, 0),
    scene,
  );
  camera.lowerRadiusLimit = 8;
  camera.upperRadiusLimit = 31;
  camera.lowerBetaLimit = 0.72;
  camera.upperBetaLimit = 1.28;
  camera.wheelPrecision = 42;
  camera.panningSensibility = 0;
  const canvas = engine.getRenderingCanvas() ?? null;
  if (canvas !== null) camera.attachControl(canvas, true);

  const ambient = new HemisphericLight(
    `interior-ambient-${houseId}`,
    new Vector3(0.1, 1, -0.2),
    scene,
  );
  ambient.intensity = 0.6;
  ambient.diffuse = Color3.FromHexString("#FFE8B6");
  ambient.groundColor = Color3.FromHexString("#46584A");

  const sun = new DirectionalLight(
    `interior-sun-${houseId}`,
    new Vector3(-0.5, -1, 0.55),
    scene,
  );
  sun.position.set(12, 20, -12);
  sun.intensity = 0.76;
  sun.diffuse = Color3.FromHexString("#FFDCA3");
  sun.specular = Color3.FromHexString("#FFF3D5").scale(0.2);
  const shadows = new ShadowGenerator(512, sun);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
  const shadowMap = shadows.getShadowMap();
  if (shadowMap) shadowMap.refreshRate = 2;
  shadows.bias = 0.001;
  shadows.normalBias = 0.02;

  const palette = createInteriorMaterials(scene, houseId);
  const enclosure = createHouseShell(scene, palette, shadows);

  const roomRigs: RoomRig[] = [
    createLivingRoom(scene, palette, shadows),
    createKitchen(scene, palette, shadows),
    createGardenRoom(scene, palette, shadows),
    createUtilityRoom(scene, palette, shadows),
  ];
  const meshRooms = new Map<number, InteriorRoomId>();
  roomRigs.forEach((room) => {
    room.meshes.forEach((mesh) => meshRooms.set(mesh.uniqueId, room.id));
  });

  const collisionMeshes = scene.meshes.filter(
    (mesh) =>
      /^interior-wall-/.test(mesh.name) ||
      /^(living-sofa|living-table|living-lamp-pole|kitchen-counter|kitchen-island|garden-planter|garden-bench|utility-bin|utility-shelf|utility-sorting-stand)/.test(
        mesh.name,
      ),
  );
  const obstacles = (): WalkBounds[] =>
    collisionMeshes
      .filter((mesh) => mesh.isEnabled())
      .flatMap((mesh) => {
        mesh.computeWorldMatrix(true);
        const { minimumWorld: min, maximumWorld: max } =
          mesh.getBoundingInfo().boundingBox;
        // Overhead lintels and shelves do not block feet.
        return min.y > 2.9
          ? []
          : [{ minX: min.x, maxX: max.x, minZ: min.z, maxZ: max.z }];
      });
  const walker = createInteriorWalker(scene, canvas, obstacles, callbacks);

  function focusRoom(roomId: InteriorRoomId | null) {
    roomRigs.forEach((room) => room.selection.setEnabled(false));
    if (roomId !== null) {
      camera.detachControl();
      enclosure.forEach((mesh) => mesh.setEnabled(true));
      walker.enter(roomId);
      return;
    }
    walker.stop();
    enclosure.forEach((mesh) => mesh.setEnabled(false));
    scene.activeCamera = camera;
    camera.alpha = -Math.PI / 2;
    camera.beta = 1.02;
    camera.radius = 27;
    camera.target.set(0, 1.6, 0);
    if (canvas) camera.attachControl(canvas, true);
  }

  function setInstalled(upgrades: readonly InteriorUpgradeId[]) {
    const installed = new Set(upgrades);
    roomRigs.forEach((room) => {
      const fixed = installed.has(room.upgradeId);
      room.problem.setEnabled(!fixed);
      room.healthy.setEnabled(fixed);
    });
  }

  setInstalled(initialUpgrades);
  focusRoom(null);

  return {
    scene,
    camera,
    rooms: roomRigs,
    walker,
    getRoomFromMesh(mesh) {
      if (mesh === null) return null;
      let current: AbstractMesh | null = mesh;
      while (current !== null) {
        const roomId = meshRooms.get(current.uniqueId);
        if (roomId !== undefined) return roomId;
        current = current.parent instanceof Mesh ? current.parent : null;
      }
      return null;
    },
    focusRoom,
    setInstalled,
    dispose() {
      walker.dispose();
      camera.detachControl();
      scene.dispose();
    },
  };
}

type InteriorMaterials = ReturnType<typeof createInteriorMaterials>;

function createInteriorMaterials(
  scene: Scene,
  houseId: "sunny" | "bluebell" | "mango",
) {
  const accent =
    houseId === "sunny"
      ? "#85745F"
      : houseId === "bluebell"
        ? "#61777B"
        : "#768069";
  const make = (name: string, color: string, emissive = false) => {
    const material = new StandardMaterial(`interior-${houseId}-${name}`, scene);
    material.diffuseColor = Color3.FromHexString(color);
    material.specularColor = Color3.White().scale(0.11);
    material.specularPower = 28;
    if (emissive) material.emissiveColor = material.diffuseColor.scale(0.24);
    return material;
  };
  const selection = make("selection", "#FFD24A", true);
  selection.alpha = 0.42;
  return {
    accent: applyTownSurface(scene, make("accent", accent), "fabric"),
    blue: applyTownSurface(scene, make("blue", "#667E85"), "fabric"),
    clay: make("clay", "#9A745D"),
    counter: applyTownSurface(scene, make("counter", "#C7C4B8"), "stone"),
    dark: make("dark", "#263746"),
    floor: applyTownSurface(scene, make("floor", "#9B846B"), "wood"),
    green: make("green", "#58725A"),
    greenLight: make("green-light", "#80906B"),
    metal: make("metal", "#9EB2B5"),
    paper: make("paper", "#DAD7CA"),
    red: make("red", "#E75F52"),
    selection,
    soil: make("soil", "#805B3E"),
    wall: applyTownSurface(scene, make("wall", "#C6C2B4"), "stone"),
    water: make("water", "#648B96", true),
    wood: applyTownSurface(scene, make("wood", "#806A53"), "wood"),
    yellow: make("yellow", "#FFD24A", true),
  };
}

function createHouseShell(
  scene: Scene,
  materials: InteriorMaterials,
  shadows: ShadowGenerator,
) {
  const floor = box(scene, "interior-floor", [17.4, 0.55, 12.6], [0, 0, 0]);
  floor.material = materials.floor;
  floor.receiveShadows = true;
  const joineryRoot = new TransformNode(
    "interior-architectural-joinery",
    scene,
  );
  createArchitecturalBatch(
    "interior-skirting-and-cornice",
    [
      [-8.05, 0.43, 0, 0.1, 0.27, 11.8],
      [8.05, 0.43, 0, 0.1, 0.27, 11.8],
      [0, 0.43, 5.79, 16.2, 0.27, 0.1],
      [-8.05, 6.22, 0, 0.18, 0.2, 11.8],
      [8.05, 6.22, 0, 0.18, 0.2, 11.8],
      [0, 6.22, 5.79, 16.2, 0.2, 0.18],
    ],
    materials.paper,
    joineryRoot,
    scene,
  );

  for (const [name, size, position] of [
    ["back", [17.4, 6.6, 0.45], [0, 3.2, 6.05]],
    ["left", [0.45, 6.6, 12.2], [-8.48, 3.2, 0]],
    ["right", [0.45, 6.6, 12.2], [8.48, 3.2, 0]],
    ["middle-x-front", [0.28, 4.35, 1.5], [0, 2.45, -5.1]],
    ["middle-x-center", [0.28, 4.35, 4.7], [0, 2.45, 0]],
    ["middle-x-back", [0.28, 4.35, 1.5], [0, 2.45, 5.1]],
    ["middle-x-door-front", [0.28, 1.1, 2], [0, 4.08, -3.35]],
    ["middle-x-door-back", [0.28, 1.1, 2], [0, 4.08, 3.35]],
    ["middle-z-left", [5.85, 4.35, 0.28], [-5.325, 2.45, 0]],
    ["middle-z-left-edge", [0.26, 4.35, 0.28], [-0.27, 2.45, 0]],
    ["middle-z-right", [5.85, 4.35, 0.28], [5.325, 2.45, 0]],
    ["middle-z-right-edge", [0.26, 4.35, 0.28], [0.27, 2.45, 0]],
    ["middle-z-door-left", [2, 1.1, 0.28], [-1.4, 4.08, 0]],
    ["middle-z-door-right", [2, 1.1, 0.28], [1.4, 4.08, 0]],
  ] as const) {
    const wall = box(scene, `interior-wall-${name}`, size, position);
    wall.material = materials.wall;
    wall.receiveShadows = true;
    shadows.addShadowCaster(wall);
  }
  // The cutaway stays open from above; walking reveals a complete enclosed house.
  const front = box(
    scene,
    "interior-wall-front",
    [17.4, 6.6, 0.45],
    [0, 3.2, -6.05],
  );
  front.material = materials.wall;
  const ceiling = box(
    scene,
    "interior-ceiling",
    [17.4, 0.25, 12.6],
    [0, 6.55, 0],
  );
  ceiling.material = materials.paper;
  const entrance = box(
    scene,
    "interior-front-door",
    [2.3, 3.7, 0.12],
    [-1.4, 2.12, -5.79],
  );
  entrance.material = materials.accent;
  const knob = MeshBuilder.CreateSphere(
    "interior-door-handle",
    { diameter: 0.16 },
    scene,
  );
  knob.position.set(-0.65, 1.95, -5.67);
  knob.material = materials.metal;
  for (const side of [-1, 1]) {
    for (const z of [-2.7, 2.7]) {
      const frame = box(
        scene,
        `interior-window-frame-${side}-${z}`,
        [0.12, 2.3, 2.65],
        [side * 8.19, 3.8, z],
      );
      frame.material = materials.wood;
      const glass = box(
        scene,
        `interior-window-glass-${side}-${z}`,
        [0.14, 1.96, 2.31],
        [side * 8.1, 3.8, z],
      );
      glass.material = materials.blue;
      const mullion = box(
        scene,
        `interior-window-mullion-${side}-${z}`,
        [0.16, 2, 0.1],
        [side * 8.02, 3.8, z],
      );
      mullion.material = materials.paper;
    }
  }
  [front, ceiling].forEach((mesh) => {
    mesh.receiveShadows = true;
  });
  return [front, ceiling, entrance, knob];
}

function createLivingRoom(
  scene: Scene,
  materials: InteriorMaterials,
  shadows: ShadowGenerator,
): RoomRig {
  const rig = createRoomBase(scene, "living-room", "light", materials);
  const sofa = box(scene, "living-sofa", [4.5, 1.25, 1.55], [-4.1, 0.95, -4.4]);
  sofa.material = materials.accent;
  register(sofa, rig, shadows);
  for (const x of [-5.65, -2.55]) {
    const arm = box(
      scene,
      `living-sofa-arm-${x}`,
      [0.55, 1.75, 1.8],
      [x, 1.15, -4.4],
    );
    arm.material = materials.accent;
    register(arm, rig, shadows);
  }
  const rug = box(scene, "living-rug", [5.7, 0.12, 3.4], [-4.1, 0.42, -2.1]);
  rug.material = materials.blue;
  register(rug, rig);
  const table = box(
    scene,
    "living-table",
    [2.7, 0.34, 1.7],
    [-4.1, 1.02, -1.7],
  );
  table.material = materials.wood;
  register(table, rig, shadows);
  for (const x of [-5.05, -3.15]) {
    for (const z of [-2.2, -1.2]) {
      const leg = box(
        scene,
        `living-table-leg-${x}-${z}`,
        [0.14, 0.6, 0.14],
        [x, 0.68, z],
      );
      leg.material = materials.wood;
      register(leg, rig);
    }
  }
  for (const x of [-5.1, -4.1, -3.1]) {
    const cushion = box(
      scene,
      `living-sofa-cushion-${x}`,
      [0.93, 0.2, 1.26],
      [x, 1.64, -4.37],
    );
    cushion.material = materials.accent;
    register(cushion, rig);
  }
  const back = box(
    scene,
    "living-sofa-upholstered-back",
    [3.2, 1.05, 0.23],
    [-4.1, 1.73, -5.03],
  );
  back.material = materials.accent;
  register(back, rig);
  const lampPole = MeshBuilder.CreateCylinder(
    "living-lamp-pole",
    { height: 3.2, diameter: 0.2, tessellation: 12 },
    scene,
  );
  lampPole.position.set(-6.8, 1.95, -1.6);
  lampPole.material = materials.metal;
  register(lampPole, rig, shadows);
  const darkBulb = MeshBuilder.CreateSphere(
    "living-dark-bulb",
    { diameter: 0.75, segments: 12 },
    scene,
  );
  darkBulb.position.set(-6.8, 3.65, -1.6);
  darkBulb.material = materials.dark;
  darkBulb.parent = rig.problem;
  register(darkBulb, rig);
  const brightBulb = MeshBuilder.CreateSphere(
    "living-bright-bulb",
    { diameter: 0.82, segments: 12 },
    scene,
  );
  brightBulb.position.set(-6.8, 3.65, -1.6);
  brightBulb.material = materials.yellow;
  brightBulb.parent = rig.healthy;
  register(brightBulb, rig);
  const glow = new PointLight(
    "living-room-glow",
    new Vector3(-5.6, 3.3, -2.2),
    scene,
  );
  glow.diffuse = Color3.FromHexString("#FFD75B");
  glow.intensity = 0.42;
  glow.range = 5.5;
  glow.parent = rig.healthy;
  return finishRoom(rig);
}

function createKitchen(
  scene: Scene,
  materials: InteriorMaterials,
  shadows: ShadowGenerator,
): RoomRig {
  const rig = createRoomBase(scene, "kitchen", "water", materials);
  const counter = box(
    scene,
    "kitchen-counter",
    [6.5, 1.65, 1.25],
    [4.2, 1.12, -5.05],
  );
  counter.material = materials.counter;
  register(counter, rig, shadows);
  const sink = box(scene, "kitchen-sink", [2.1, 0.18, 1.05], [4.2, 2, -5.05]);
  sink.material = materials.metal;
  register(sink, rig);
  const tap = MeshBuilder.CreateTorus(
    "kitchen-tap",
    { diameter: 1.05, thickness: 0.17, tessellation: 20 },
    scene,
  );
  tap.position.set(4.2, 2.55, -5.1);
  tap.rotation.x = Math.PI / 2;
  tap.material = materials.metal;
  register(tap, rig);
  const drySign = box(
    scene,
    "kitchen-dry-tap",
    [1.25, 0.18, 0.18],
    [4.2, 2.35, -4.42],
  );
  drySign.rotation.z = 0.7;
  drySign.material = materials.red;
  drySign.parent = rig.problem;
  register(drySign, rig);
  for (const y of [1.9, 1.55, 1.2]) {
    const drop = MeshBuilder.CreateSphere(
      `kitchen-water-drop-${y}`,
      { diameter: 0.38, segments: 10 },
      scene,
    );
    drop.position.set(4.2, y, -4.45);
    drop.scaling.y = 1.35;
    drop.material = materials.water;
    drop.parent = rig.healthy;
    register(drop, rig);
  }
  const island = box(
    scene,
    "kitchen-island",
    [3.1, 1.25, 2.1],
    [4.25, 1, -1.9],
  );
  island.material = materials.accent;
  register(island, rig, shadows);
  return finishRoom(rig);
}

function createGardenRoom(
  scene: Scene,
  materials: InteriorMaterials,
  shadows: ShadowGenerator,
): RoomRig {
  const rig = createRoomBase(scene, "garden-room", "garden", materials);
  for (const x of [-6.1, -4.1, -2.1]) {
    const planter = box(
      scene,
      `garden-planter-${x}`,
      [1.55, 0.72, 2.5],
      [x, 0.75, 3.1],
    );
    planter.material = materials.wood;
    register(planter, rig, shadows);
    const soil = box(
      scene,
      `garden-soil-${x}`,
      [1.3, 0.15, 2.2],
      [x, 1.17, 3.1],
    );
    soil.material = materials.soil;
    register(soil, rig);
    const emptyMarker = MeshBuilder.CreateTorus(
      `garden-empty-${x}`,
      { diameter: 0.85, thickness: 0.16, tessellation: 16 },
      scene,
    );
    emptyMarker.position.set(x, 1.4, 3.1);
    emptyMarker.rotation.x = Math.PI / 2;
    emptyMarker.material = materials.red;
    emptyMarker.parent = rig.problem;
    register(emptyMarker, rig);
    for (const z of [2.55, 3.55]) {
      const plant = MeshBuilder.CreateSphere(
        `garden-plant-${x}-${z}`,
        { diameter: 1.05, segments: 10 },
        scene,
      );
      plant.position.set(x, 1.85, z);
      plant.scaling.y = 1.35;
      plant.material = x === -4.1 ? materials.greenLight : materials.green;
      plant.parent = rig.healthy;
      register(plant, rig, shadows);
    }
  }
  const bench = box(scene, "garden-bench", [4.2, 0.45, 1.1], [-4.1, 1.1, 5]);
  bench.material = materials.accent;
  register(bench, rig, shadows);
  return finishRoom(rig);
}

function createUtilityRoom(
  scene: Scene,
  materials: InteriorMaterials,
  shadows: ShadowGenerator,
): RoomRig {
  const rig = createRoomBase(scene, "utility-room", "recycle", materials);
  const shelf = box(scene, "utility-shelf", [5.8, 0.45, 1], [4.2, 3.1, 5]);
  shelf.material = materials.wood;
  register(shelf, rig, shadows);
  for (const y of [1.1, 2.1]) {
    const rail = box(scene, `utility-shelf-${y}`, [5.8, 0.28, 1], [4.2, y, 5]);
    rail.material = materials.wood;
    register(rail, rig, shadows);
  }
  for (const [index, x, z] of [
    [0, 2.2, 2.2],
    [1, 3.3, 3.05],
    [2, 5.2, 2.35],
    [3, 6.1, 3.25],
  ] as const) {
    const rubbish = MeshBuilder.CreateCylinder(
      `utility-mixed-${index}`,
      { height: 1.2, diameter: 0.58, tessellation: 10 },
      scene,
    );
    rubbish.position.set(x, 1, z);
    rubbish.rotation.z = index % 2 === 0 ? 0.45 : -0.65;
    rubbish.material = index % 2 === 0 ? materials.red : materials.blue;
    rubbish.parent = rig.problem;
    register(rubbish, rig);
  }
  for (const [index, x, material] of [
    [0, 2.4, materials.blue],
    [1, 4.2, materials.green],
    [2, 6, materials.yellow],
  ] as const) {
    // Visible stands reserve the space before bins appear, preventing a repair
    // from creating a solid obstacle around the player.
    const stand = box(
      scene,
      `utility-sorting-stand-${index}`,
      [1.35, 0.35, 1.35],
      [x, 0.45, 2.9],
    );
    stand.material = materials.wood;
    register(stand, rig, shadows);
    const bin = box(
      scene,
      `utility-bin-${index}`,
      [1.35, 2.15, 1.35],
      [x, 1.35, 2.9],
    );
    bin.material = material;
    bin.parent = rig.healthy;
    register(bin, rig, shadows);
  }
  return finishRoom(rig);
}

type MutableRoomRig = {
  id: InteriorRoomId;
  upgradeId: InteriorUpgradeId;
  center: Vector3;
  meshes: AbstractMesh[];
  selection: Mesh;
  problem: TransformNode;
  healthy: TransformNode;
};

function createRoomBase(
  scene: Scene,
  id: InteriorRoomId,
  upgradeId: InteriorUpgradeId,
  materials: InteriorMaterials,
): MutableRoomRig {
  const center = ROOM_CENTERS[id];
  const hotspot = box(
    scene,
    `room-hotspot-${id}`,
    [7.75, 0.08, 5.45],
    [center.x, 0.34, center.z],
  );
  hotspot.material = materials.paper;
  hotspot.visibility = 0.01;
  hotspot.isPickable = true;
  const selection = box(
    scene,
    `room-selection-${id}`,
    [7.55, 0.12, 5.25],
    [center.x, 0.39, center.z],
  );
  selection.material = materials.selection;
  selection.isPickable = false;
  selection.setEnabled(false);
  return {
    id,
    upgradeId,
    center,
    meshes: [hotspot],
    selection,
    problem: new TransformNode(`room-problem-${id}`, scene),
    healthy: new TransformNode(`room-healthy-${id}`, scene),
  };
}

function finishRoom(rig: MutableRoomRig): RoomRig {
  return rig;
}

function register(
  mesh: AbstractMesh,
  rig: MutableRoomRig,
  shadows?: ShadowGenerator,
) {
  mesh.isPickable = true;
  mesh.receiveShadows = true;
  rig.meshes.push(mesh);
  shadows?.addShadowCaster(mesh);
}

function box(
  scene: Scene,
  name: string,
  [width, height, depth]: readonly [number, number, number],
  [x, y, z]: readonly [number, number, number],
) {
  const mesh = MeshBuilder.CreateBox(name, { width, height, depth }, scene);
  mesh.position.set(x, y, z);
  return mesh;
}
