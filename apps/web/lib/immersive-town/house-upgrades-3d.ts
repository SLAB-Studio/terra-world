import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

import type { TownHouseMetadata } from "./types";

export type PlayableHouseId = "sunny" | "bluebell" | "mango";
export type PlayableUpgradeId =
  | "light"
  | "water"
  | "garden"
  | "recycle"
  | "rain-tank"
  | "compost"
  | "shade-tree"
  | "bike-rack"
  | "insulation"
  | "bird-home"
  | "first-aid"
  | "repair-kit";

const CORE_UPGRADES: readonly PlayableUpgradeId[] = [
  "light",
  "water",
  "garden",
  "recycle",
];

export type HouseUpgradeVisuals = Readonly<{
  sync(
    houses: Readonly<Record<PlayableHouseId, readonly PlayableUpgradeId[]>>,
    selectedHouseId: PlayableHouseId | null,
  ): void;
  setReducedMotion(reducedMotion: boolean): void;
  dispose(): void;
}>;

type HouseRig = Readonly<{
  upgrades: Readonly<Record<PlayableUpgradeId, TransformNode>>;
  selection: TransformNode;
  light: PointLight;
  resident: TransformNode;
  residentArm: Mesh;
  residentBaseY: number;
  windows: readonly Mesh[];
  darkWindowMaterial: StandardMaterial;
  litWindowMaterial: StandardMaterial;
}>;

export function createHouseUpgradeVisuals(
  scene: Scene,
  houses: readonly TownHouseMetadata[],
): HouseUpgradeVisuals {
  const rigs = new Map<PlayableHouseId, HouseRig>();
  let reducedMotion = false;
  let elapsedSeconds = 0;
  houses.forEach((house) => {
    if (!isPlayableHouseId(house.id)) return;
    rigs.set(house.id, createHouseRig(scene, house));
  });

  const animationObserver = scene.onBeforeRenderObservable.add(() => {
    if (!reducedMotion) {
      elapsedSeconds += Math.min(scene.getEngine().getDeltaTime() / 1000, 0.05);
    }
    rigs.forEach((rig, houseId) => {
      const phase = houseId === "sunny" ? 0 : houseId === "bluebell" ? 2 : 4;
      rig.resident.position.y = reducedMotion
        ? rig.residentBaseY
        : rig.residentBaseY + Math.sin(elapsedSeconds * 2.2 + phase) * 0.12;
      rig.residentArm.rotation.z = reducedMotion
        ? -0.35
        : -0.35 + Math.sin(elapsedSeconds * 3.4 + phase) * 0.42;
    });
  });

  return {
    sync(state, selectedHouseId) {
      rigs.forEach((rig, houseId) => {
        const installed = new Set(state[houseId]);
        for (const [upgradeId, node] of Object.entries(rig.upgrades) as [
          PlayableUpgradeId,
          TransformNode,
        ][]) {
          node.setEnabled(installed.has(upgradeId));
        }
        rig.light.setEnabled(installed.has("light"));
        rig.windows.forEach((window) => {
          window.material = installed.has("light")
            ? rig.litWindowMaterial
            : rig.darkWindowMaterial;
        });
        rig.resident.setEnabled(
          CORE_UPGRADES.some((upgrade) => !installed.has(upgrade)),
        );
        rig.selection.setEnabled(selectedHouseId === houseId);
      });
    },
    setReducedMotion(value) {
      reducedMotion = value;
    },
    dispose() {
      if (animationObserver !== null)
        scene.onBeforeRenderObservable.remove(animationObserver);
      rigs.forEach((rig) => {
        Object.values(rig.upgrades).forEach((node) => node.dispose(false));
        rig.selection.dispose(false);
        rig.resident.dispose(false);
        rig.light.dispose();
        rig.darkWindowMaterial.dispose();
        rig.litWindowMaterial.dispose();
      });
      rigs.clear();
    },
  };
}

function createHouseRig(scene: Scene, house: TownHouseMetadata): HouseRig {
  const darkWindowMaterial = makeMaterial(
    scene,
    `${house.id}-window-dark`,
    "#314A5C",
  );
  const litWindowMaterial = makeMaterial(
    scene,
    `${house.id}-window-lit`,
    "#FFD36A",
    true,
  );
  const windows = house.meshes.filter(
    (mesh): mesh is Mesh =>
      mesh instanceof Mesh && mesh.name.startsWith(`${house.id}-window-`),
  );
  const solar = new TransformNode(`${house.id}-solar-upgrade`, scene);
  solar.parent = house.root;
  for (const x of [-1.45, 1.45]) {
    const panel = MeshBuilder.CreateBox(
      `${house.id}-solar-panel-${x}`,
      { width: 2.35, height: 0.18, depth: 2.7 },
      scene,
    );
    panel.position.set(x, 6.34, -0.1);
    panel.rotation.z = x < 0 ? 0.56 : -0.56;
    panel.material = makeMaterial(scene, `${house.id}-solar`, "#245E86", true);
    panel.parent = solar;
    panel.isPickable = false;
  }

  const water = new TransformNode(`${house.id}-water-upgrade`, scene);
  water.parent = house.root;
  const tank = MeshBuilder.CreateCylinder(
    `${house.id}-water-tank`,
    { height: 2.6, diameter: 1.9, tessellation: 18 },
    scene,
  );
  tank.position.set(-5.2, 2, 1.8);
  tank.material = makeMaterial(scene, `${house.id}-water`, "#4EA6C8");
  tank.parent = water;
  tank.isPickable = false;

  const garden = new TransformNode(`${house.id}-garden-upgrade`, scene);
  garden.parent = house.root;
  const soil = MeshBuilder.CreateBox(
    `${house.id}-garden-bed`,
    { width: 4.5, height: 0.45, depth: 2.6 },
    scene,
  );
  soil.position.set(4.9, 1.02, 1.8);
  soil.material = makeMaterial(scene, `${house.id}-soil`, "#805B3E");
  soil.parent = garden;
  soil.isPickable = false;
  for (const [index, x, z] of [
    [0, 3.7, 1.35],
    [1, 4.9, 2.1],
    [2, 6, 1.45],
  ] as const) {
    const plant = MeshBuilder.CreateSphere(
      `${house.id}-garden-plant-${index}`,
      { diameter: 1.05, segments: 9 },
      scene,
    );
    plant.position.set(x, 1.72, z);
    plant.scaling.y = 1.25;
    plant.material = makeMaterial(
      scene,
      `${house.id}-plant-${index}`,
      index % 2 === 0 ? "#4F965B" : "#79BC62",
    );
    plant.parent = garden;
    plant.isPickable = false;
  }

  const recycle = new TransformNode(`${house.id}-recycle-upgrade`, scene);
  recycle.parent = house.root;
  const bin = MeshBuilder.CreateBox(
    `${house.id}-recycle-bin`,
    { width: 1.4, height: 2.1, depth: 1.35 },
    scene,
  );
  bin.position.set(-3.9, 1.75, -3.7);
  bin.material = makeMaterial(scene, `${house.id}-recycle`, "#3A8B69");
  bin.parent = recycle;
  bin.isPickable = false;
  const lid = MeshBuilder.CreateBox(
    `${house.id}-recycle-lid`,
    { width: 1.6, height: 0.22, depth: 1.52 },
    scene,
  );
  lid.position.set(-3.9, 2.88, -3.7);
  lid.material = bin.material;
  lid.parent = recycle;
  lid.isPickable = false;

  const rainTank = createRainTank(scene, house);
  const compost = createCompostBox(scene, house);
  const shadeTree = createShadeTree(scene, house);
  const bikeRack = createBikeRack(scene, house);
  const insulation = createCozyWalls(scene, house);
  const birdHome = createBirdHome(scene, house);
  const firstAid = createSafetyKit(scene, house);
  const repairKit = createRepairKit(scene, house);

  const selection = new TransformNode(`${house.id}-selection`, scene);
  selection.parent = house.root;
  const ring = MeshBuilder.CreateTorus(
    `${house.id}-selection-ring`,
    { diameter: 13, thickness: 0.22, tessellation: 48 },
    scene,
  );
  ring.position.y = 0.92;
  ring.material = makeMaterial(
    scene,
    `${house.id}-selection-glow`,
    "#FFD24A",
    true,
  );
  ring.parent = selection;
  ring.isPickable = false;

  const pointLight = new PointLight(
    `${house.id}-warm-window-light`,
    house.worldPosition.add(new Vector3(0, 4.2, -2.5)),
    scene,
  );
  pointLight.diffuse = Color3.FromHexString("#FFD75B");
  pointLight.intensity = 0.72;
  pointLight.range = 13;

  const { root: resident, arm: residentArm } = createResident(scene, house);

  return {
    upgrades: {
      light: solar,
      water,
      garden,
      recycle,
      "rain-tank": rainTank,
      compost,
      "shade-tree": shadeTree,
      "bike-rack": bikeRack,
      insulation,
      "bird-home": birdHome,
      "first-aid": firstAid,
      "repair-kit": repairKit,
    },
    selection,
    light: pointLight,
    resident,
    residentArm,
    residentBaseY: resident.position.y,
    windows,
    darkWindowMaterial,
    litWindowMaterial,
  };
}

function createRainTank(scene: Scene, house: TownHouseMetadata) {
  const root = new TransformNode(`${house.id}-rain-tank-upgrade`, scene);
  root.parent = house.root;
  const blue = makeMaterial(scene, `${house.id}-rain-tank-blue`, "#3D91C9");
  const barrel = MeshBuilder.CreateCylinder(
    `${house.id}-rain-barrel`,
    { height: 2.1, diameter: 1.55, tessellation: 20 },
    scene,
  );
  barrel.position.set(-5.3, 1.72, -1.1);
  barrel.material = blue;
  barrel.parent = root;
  barrel.isPickable = false;
  const pipe = MeshBuilder.CreateCylinder(
    `${house.id}-rain-pipe`,
    { height: 4.2, diameter: 0.22, tessellation: 10 },
    scene,
  );
  pipe.position.set(-5.3, 3.1, -1.1);
  pipe.material = makeMaterial(scene, `${house.id}-rain-pipe-mat`, "#E8EFF0");
  pipe.parent = root;
  pipe.isPickable = false;
  return root;
}

function createCompostBox(scene: Scene, house: TownHouseMetadata) {
  const root = new TransformNode(`${house.id}-compost-upgrade`, scene);
  root.parent = house.root;
  const box = MeshBuilder.CreateBox(
    `${house.id}-compost-box`,
    { width: 1.8, height: 1.45, depth: 1.6 },
    scene,
  );
  box.position.set(2.3, 1.42, 4.2);
  box.material = makeMaterial(scene, `${house.id}-compost-brown`, "#79553A");
  box.parent = root;
  box.isPickable = false;
  const lid = MeshBuilder.CreateBox(
    `${house.id}-compost-lid`,
    { width: 2, height: 0.22, depth: 1.8 },
    scene,
  );
  lid.position.set(2.3, 2.28, 4.2);
  lid.material = makeMaterial(scene, `${house.id}-compost-green`, "#6AAE58");
  lid.parent = root;
  lid.isPickable = false;
  return root;
}

function createShadeTree(scene: Scene, house: TownHouseMetadata) {
  const root = new TransformNode(`${house.id}-shade-tree-upgrade`, scene);
  root.parent = house.root;
  const trunk = MeshBuilder.CreateCylinder(
    `${house.id}-shade-tree-trunk`,
    { height: 4.2, diameterTop: 0.65, diameterBottom: 0.95, tessellation: 12 },
    scene,
  );
  trunk.position.set(-6.2, 2.85, 4.1);
  trunk.material = makeMaterial(scene, `${house.id}-tree-trunk-mat`, "#70472D");
  trunk.parent = root;
  trunk.isPickable = false;
  const leaves = makeMaterial(scene, `${house.id}-tree-leaves`, "#4D9B52");
  for (const [index, x, y, z, size] of [
    [0, -6.2, 5.5, 4.1, 2.9],
    [1, -7.2, 5.15, 4.2, 2.25],
    [2, -5.25, 5.2, 4.25, 2.2],
  ] as const) {
    const crown = MeshBuilder.CreateSphere(
      `${house.id}-shade-crown-${index}`,
      { diameter: size, segments: 12 },
      scene,
    );
    crown.position.set(x, y, z);
    crown.material = leaves;
    crown.parent = root;
    crown.isPickable = false;
  }
  return root;
}

function createBikeRack(scene: Scene, house: TownHouseMetadata) {
  const root = new TransformNode(`${house.id}-bike-rack-upgrade`, scene);
  root.parent = house.root;
  const metal = makeMaterial(
    scene,
    `${house.id}-bike-rack-metal`,
    "#D7E1E2",
    true,
  );
  for (const [index, x] of [-1.2, 0, 1.2].entries()) {
    const hoop = MeshBuilder.CreateTorus(
      `${house.id}-bike-rack-hoop-${index}`,
      { diameter: 1.4, thickness: 0.16, tessellation: 24 },
      scene,
    );
    hoop.position.set(3.5 + x, 1.55, -4.7);
    hoop.rotation.x = Math.PI / 2;
    hoop.scaling.y = 1.25;
    hoop.material = metal;
    hoop.parent = root;
    hoop.isPickable = false;
  }
  return root;
}

function createCozyWalls(scene: Scene, house: TownHouseMetadata) {
  const root = new TransformNode(`${house.id}-insulation-upgrade`, scene);
  root.parent = house.root;
  const trim = makeMaterial(
    scene,
    `${house.id}-cozy-wall-mat`,
    "#F3A84B",
    true,
  );
  for (const x of [-2.35, 2.35]) {
    const panel = MeshBuilder.CreateBox(
      `${house.id}-cozy-wall-panel-${x}`,
      { width: 1.4, height: 2.65, depth: 0.18 },
      scene,
    );
    panel.position.set(x, 3.25, -3.08);
    panel.material = trim;
    panel.parent = root;
    panel.isPickable = false;
  }
  return root;
}

function createBirdHome(scene: Scene, house: TownHouseMetadata) {
  const root = new TransformNode(`${house.id}-bird-home-upgrade`, scene);
  root.parent = house.root;
  const wood = makeMaterial(scene, `${house.id}-bird-home-wood`, "#F0A454");
  const post = MeshBuilder.CreateCylinder(
    `${house.id}-bird-home-post`,
    { height: 3.4, diameter: 0.2, tessellation: 10 },
    scene,
  );
  post.position.set(6.15, 2.55, 4.1);
  post.material = wood;
  post.parent = root;
  post.isPickable = false;
  const home = MeshBuilder.CreateBox(
    `${house.id}-bird-home-box`,
    { size: 1.15 },
    scene,
  );
  home.position.set(6.15, 4.2, 4.1);
  home.material = wood;
  home.parent = root;
  home.isPickable = false;
  const opening = MeshBuilder.CreateDisc(
    `${house.id}-bird-home-opening`,
    { radius: 0.22, tessellation: 20 },
    scene,
  );
  opening.position.set(6.15, 4.28, 3.51);
  opening.rotation.x = Math.PI / 2;
  opening.material = makeMaterial(
    scene,
    `${house.id}-bird-opening-mat`,
    "#2B190F",
  );
  opening.parent = root;
  opening.isPickable = false;
  return root;
}

function createSafetyKit(scene: Scene, house: TownHouseMetadata) {
  const root = new TransformNode(`${house.id}-first-aid-upgrade`, scene);
  root.parent = house.root;
  const white = makeMaterial(scene, `${house.id}-safety-white`, "#FFF8E8");
  const red = makeMaterial(scene, `${house.id}-safety-red`, "#E94F45", true);
  const caseMesh = MeshBuilder.CreateBox(
    `${house.id}-safety-case`,
    { width: 1.45, height: 1.1, depth: 0.35 },
    scene,
  );
  caseMesh.position.set(-1.15, 2.05, -3.38);
  caseMesh.material = white;
  caseMesh.parent = root;
  caseMesh.isPickable = false;
  for (const [width, height] of [
    [0.72, 0.18],
    [0.18, 0.72],
  ] as const) {
    const cross = MeshBuilder.CreateBox(
      `${house.id}-safety-cross-${width}`,
      { width, height, depth: 0.12 },
      scene,
    );
    cross.position.set(-1.15, 2.05, -3.61);
    cross.material = red;
    cross.parent = root;
    cross.isPickable = false;
  }
  return root;
}

function createRepairKit(scene: Scene, house: TownHouseMetadata) {
  const root = new TransformNode(`${house.id}-repair-kit-upgrade`, scene);
  root.parent = house.root;
  const red = makeMaterial(scene, `${house.id}-toolbox-red`, "#D95A45");
  const box = MeshBuilder.CreateBox(
    `${house.id}-repair-toolbox`,
    { width: 1.7, height: 0.9, depth: 0.9 },
    scene,
  );
  box.position.set(1.4, 1.35, -4.3);
  box.material = red;
  box.parent = root;
  box.isPickable = false;
  const handle = MeshBuilder.CreateTorus(
    `${house.id}-repair-handle`,
    { diameter: 0.8, thickness: 0.14, tessellation: 20 },
    scene,
  );
  handle.position.set(1.4, 2.05, -4.3);
  handle.rotation.x = Math.PI / 2;
  handle.scaling.y = 0.7;
  handle.material = makeMaterial(
    scene,
    `${house.id}-toolbox-handle`,
    "#2B190F",
  );
  handle.parent = root;
  handle.isPickable = false;
  return root;
}

function createResident(scene: Scene, house: TownHouseMetadata) {
  const resident = new TransformNode(`${house.id}-resident`, scene);
  resident.parent = house.root;
  resident.position.set(5.1, 0.9, -4.9);

  const skin = makeMaterial(scene, `${house.id}-resident-skin`, "#9D6547");
  const shirt = makeMaterial(
    scene,
    `${house.id}-resident-shirt`,
    house.id === "sunny"
      ? "#F47F70"
      : house.id === "bluebell"
        ? "#8A78D6"
        : "#62AEF0",
  );

  const body = MeshBuilder.CreateCylinder(
    `${house.id}-resident-body`,
    { height: 1.7, diameterTop: 0.75, diameterBottom: 1.05, tessellation: 12 },
    scene,
  );
  body.position.y = 1.25;
  body.material = shirt;
  body.parent = resident;
  body.isPickable = false;

  const head = MeshBuilder.CreateSphere(
    `${house.id}-resident-head`,
    { diameter: 1.05, segments: 12 },
    scene,
  );
  head.position.y = 2.55;
  head.material = skin;
  head.parent = resident;
  head.isPickable = false;

  const arm = MeshBuilder.CreateCylinder(
    `${house.id}-resident-wave-arm`,
    { height: 1.25, diameter: 0.28, tessellation: 10 },
    scene,
  );
  arm.position.set(-0.62, 1.65, 0);
  arm.rotation.z = -0.35;
  arm.material = skin;
  arm.parent = resident;
  arm.isPickable = false;

  const bubbleTexture = new DynamicTexture(
    `${house.id}-help-bubble-texture`,
    { width: 512, height: 256 },
    scene,
    true,
  );
  bubbleTexture.hasAlpha = true;
  const context =
    bubbleTexture.getContext() as unknown as CanvasRenderingContext2D;
  context.clearRect(0, 0, 512, 256);
  context.fillStyle = "#FFF9E8";
  context.strokeStyle = "#2B190F";
  context.lineWidth = 18;
  context.beginPath();
  context.roundRect(18, 18, 476, 188, 42);
  context.fill();
  context.stroke();
  context.fillStyle = "#2B190F";
  context.font = "bold 72px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("Help!", 256, 112);
  bubbleTexture.update();

  const bubbleMaterial = new StandardMaterial(
    `${house.id}-help-bubble-material`,
    scene,
  );
  bubbleMaterial.diffuseTexture = bubbleTexture;
  bubbleMaterial.opacityTexture = bubbleTexture;
  bubbleMaterial.emissiveColor = Color3.White().scale(0.7);
  bubbleMaterial.backFaceCulling = false;

  const bubble = MeshBuilder.CreatePlane(
    `${house.id}-help-bubble`,
    { width: 3.6, height: 1.8 },
    scene,
  );
  bubble.position.set(0.4, 4.25, 0);
  bubble.billboardMode = Mesh.BILLBOARDMODE_ALL;
  bubble.material = bubbleMaterial;
  bubble.parent = resident;
  bubble.isPickable = false;

  return { root: resident, arm };
}

function makeMaterial(
  scene: Scene,
  name: string,
  color: string,
  emissive = false,
): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = Color3.FromHexString(color);
  material.specularColor = Color3.White().scale(0.18);
  if (emissive) material.emissiveColor = material.diffuseColor.scale(0.34);
  return material;
}

function isPlayableHouseId(value: string): value is PlayableHouseId {
  return value === "sunny" || value === "bluebell" || value === "mango";
}
