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

export type InteriorRoomId =
  | "living-room"
  | "kitchen"
  | "garden-room"
  | "utility-room";

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
  const canvas = engine.getRenderingCanvas();
  if (canvas !== null) camera.attachControl(canvas, true);

  const ambient = new HemisphericLight(
    `interior-ambient-${houseId}`,
    new Vector3(0.1, 1, -0.2),
    scene,
  );
  ambient.intensity = 0.46;
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
  const shadows = new ShadowGenerator(1024, sun);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  shadows.bias = 0.001;
  shadows.normalBias = 0.02;

  const palette = createInteriorMaterials(scene, houseId);
  createHouseShell(scene, palette, shadows);

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

  let cameraAnimationObserver: null | ReturnType<
    typeof scene.onBeforeRenderObservable.add
  > = null;
  const cancelCameraAnimation = () => {
    if (cameraAnimationObserver !== null) {
      scene.onBeforeRenderObservable.remove(cameraAnimationObserver);
      cameraAnimationObserver = null;
    }
  };

  function focusRoom(roomId: InteriorRoomId | null, reducedMotion = false) {
    const room = roomId === null
      ? null
      : roomRigs.find((candidate) => candidate.id === roomId) ?? null;
    roomRigs.forEach((candidate) =>
      candidate.selection.setEnabled(candidate.id === roomId),
    );
    const destination = room === null
      ? {
          alpha: -Math.PI / 2,
          beta: 1.02,
          radius: 27,
          target: new Vector3(0, 1.6, 0),
        }
      : {
          alpha: room.center.x < 0 ? -1.42 : -1.72,
          beta: 1.08,
          radius: 10.8,
          target: room.center.add(new Vector3(0, 1.55, 0)),
        };
    cancelCameraAnimation();
    if (reducedMotion) {
      camera.alpha = destination.alpha;
      camera.beta = destination.beta;
      camera.radius = destination.radius;
      camera.target.copyFrom(destination.target);
      return;
    }
    const start = {
      alpha: camera.alpha,
      beta: camera.beta,
      radius: camera.radius,
      target: camera.target.clone(),
    };
    let elapsed = 0;
    cameraAnimationObserver = scene.onBeforeRenderObservable.add(() => {
      elapsed += Math.min(engine.getDeltaTime(), 50);
      const raw = Math.min(1, elapsed / 680);
      const amount = 1 - Math.pow(1 - raw, 4);
      camera.alpha = start.alpha + (destination.alpha - start.alpha) * amount;
      camera.beta = start.beta + (destination.beta - start.beta) * amount;
      camera.radius = start.radius + (destination.radius - start.radius) * amount;
      camera.target.copyFrom(Vector3.Lerp(start.target, destination.target, amount));
      if (raw >= 1) cancelCameraAnimation();
    });
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
  focusRoom(null, true);

  return {
    scene,
    camera,
    rooms: roomRigs,
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
      cancelCameraAnimation();
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
      ? "#F47F70"
      : houseId === "bluebell"
        ? "#62AEF0"
        : "#FFD24A";
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
    accent: make("accent", accent),
    blue: make("blue", "#62AEF0"),
    clay: make("clay", "#C86E55"),
    counter: make("counter", "#D29455"),
    dark: make("dark", "#263746"),
    floor: make("floor", "#C28A4A"),
    green: make("green", "#62A85C"),
    greenLight: make("green-light", "#90CF6B"),
    metal: make("metal", "#9EB2B5"),
    paper: make("paper", "#E5CFA0"),
    red: make("red", "#E75F52"),
    selection,
    soil: make("soil", "#805B3E"),
    wall: make("wall", "#D8C18E"),
    water: make("water", "#3A9ED3", true),
    wood: make("wood", "#7A4D2F"),
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

  for (const [name, size, position] of [
    ["back", [17.4, 6.6, 0.45], [0, 3.2, 6.05]],
    ["left", [0.45, 6.6, 12.2], [-8.48, 3.2, 0]],
    ["right", [0.45, 6.6, 12.2], [8.48, 3.2, 0]],
    ["middle-x", [0.28, 4.35, 11.7], [0, 2.05, 0]],
    ["middle-z-left", [8.1, 4.35, 0.28], [-4.18, 2.05, 0]],
    ["middle-z-right", [8.1, 4.35, 0.28], [4.18, 2.05, 0]],
  ] as const) {
    const wall = box(scene, `interior-wall-${name}`, size, position);
    wall.material = materials.wall;
    wall.receiveShadows = true;
    shadows.addShadowCaster(wall);
  }
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
    const arm = box(scene, `living-sofa-arm-${x}`, [0.55, 1.75, 1.8], [x, 1.15, -4.4]);
    arm.material = materials.accent;
    register(arm, rig, shadows);
  }
  const rug = box(scene, "living-rug", [5.7, 0.12, 3.4], [-4.1, 0.42, -2.1]);
  rug.material = materials.blue;
  register(rug, rig);
  const table = box(scene, "living-table", [2.7, 0.34, 1.7], [-4.1, 1.02, -1.7]);
  table.material = materials.wood;
  register(table, rig, shadows);
  const lampPole = MeshBuilder.CreateCylinder("living-lamp-pole", { height: 3.2, diameter: 0.2, tessellation: 12 }, scene);
  lampPole.position.set(-6.8, 1.95, -1.6);
  lampPole.material = materials.metal;
  register(lampPole, rig, shadows);
  const darkBulb = MeshBuilder.CreateSphere("living-dark-bulb", { diameter: 0.75, segments: 12 }, scene);
  darkBulb.position.set(-6.8, 3.65, -1.6);
  darkBulb.material = materials.dark;
  darkBulb.parent = rig.problem;
  register(darkBulb, rig);
  const brightBulb = MeshBuilder.CreateSphere("living-bright-bulb", { diameter: 0.82, segments: 12 }, scene);
  brightBulb.position.set(-6.8, 3.65, -1.6);
  brightBulb.material = materials.yellow;
  brightBulb.parent = rig.healthy;
  register(brightBulb, rig);
  const glow = new PointLight("living-room-glow", new Vector3(-5.6, 3.3, -2.2), scene);
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
  const counter = box(scene, "kitchen-counter", [6.5, 1.65, 1.25], [4.2, 1.12, -5.05]);
  counter.material = materials.counter;
  register(counter, rig, shadows);
  const sink = box(scene, "kitchen-sink", [2.1, 0.18, 1.05], [4.2, 2, -5.05]);
  sink.material = materials.metal;
  register(sink, rig);
  const tap = MeshBuilder.CreateTorus("kitchen-tap", { diameter: 1.05, thickness: 0.17, tessellation: 20 }, scene);
  tap.position.set(4.2, 2.55, -5.1);
  tap.rotation.x = Math.PI / 2;
  tap.material = materials.metal;
  register(tap, rig);
  const drySign = box(scene, "kitchen-dry-tap", [1.25, 0.18, 0.18], [4.2, 2.35, -4.42]);
  drySign.rotation.z = 0.7;
  drySign.material = materials.red;
  drySign.parent = rig.problem;
  register(drySign, rig);
  for (const y of [1.9, 1.55, 1.2]) {
    const drop = MeshBuilder.CreateSphere(`kitchen-water-drop-${y}`, { diameter: 0.38, segments: 10 }, scene);
    drop.position.set(4.2, y, -4.45);
    drop.scaling.y = 1.35;
    drop.material = materials.water;
    drop.parent = rig.healthy;
    register(drop, rig);
  }
  const island = box(scene, "kitchen-island", [3.1, 1.25, 2.1], [4.25, 1, -1.9]);
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
    const planter = box(scene, `garden-planter-${x}`, [1.55, 0.72, 2.5], [x, 0.75, 3.1]);
    planter.material = materials.wood;
    register(planter, rig, shadows);
    const soil = box(scene, `garden-soil-${x}`, [1.3, 0.15, 2.2], [x, 1.17, 3.1]);
    soil.material = materials.soil;
    register(soil, rig);
    const emptyMarker = MeshBuilder.CreateTorus(`garden-empty-${x}`, { diameter: 0.85, thickness: 0.16, tessellation: 16 }, scene);
    emptyMarker.position.set(x, 1.4, 3.1);
    emptyMarker.rotation.x = Math.PI / 2;
    emptyMarker.material = materials.red;
    emptyMarker.parent = rig.problem;
    register(emptyMarker, rig);
    for (const z of [2.55, 3.55]) {
      const plant = MeshBuilder.CreateSphere(`garden-plant-${x}-${z}`, { diameter: 1.05, segments: 10 }, scene);
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
    const rubbish = MeshBuilder.CreateCylinder(`utility-mixed-${index}`, { height: 1.2, diameter: 0.58, tessellation: 10 }, scene);
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
    const bin = box(scene, `utility-bin-${index}`, [1.35, 2.15, 1.35], [x, 1.35, 2.9]);
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
