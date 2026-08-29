import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  PointLight,
  type Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";

import type { TownHouseMetadata } from "./types";

export type PlayableHouseId = "sunny" | "bluebell" | "mango";
export type PlayableUpgradeId = "light" | "water" | "garden" | "recycle";

export type HouseUpgradeVisuals = Readonly<{
  sync(
    houses: Readonly<Record<PlayableHouseId, readonly PlayableUpgradeId[]>>,
    selectedHouseId: PlayableHouseId | null,
  ): void;
  dispose(): void;
}>;

type HouseRig = Readonly<{
  upgrades: Readonly<Record<PlayableUpgradeId, TransformNode>>;
  selection: TransformNode;
  light: PointLight;
  resident: TransformNode;
  windows: readonly Mesh[];
  darkWindowMaterial: StandardMaterial;
  litWindowMaterial: StandardMaterial;
}>;

export function createHouseUpgradeVisuals(
  scene: Scene,
  houses: readonly TownHouseMetadata[],
): HouseUpgradeVisuals {
  const rigs = new Map<PlayableHouseId, HouseRig>();
  houses.forEach((house) => {
    if (!isPlayableHouseId(house.id)) return;
    rigs.set(house.id, createHouseRig(scene, house));
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
        rig.resident.setEnabled(installed.size < 4);
        rig.selection.setEnabled(selectedHouseId === houseId);
      });
    },
    dispose() {
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

  const resident = createResident(scene, house);

  return {
    upgrades: { light: solar, water, garden, recycle },
    selection,
    light: pointLight,
    resident,
    windows,
    darkWindowMaterial,
    litWindowMaterial,
  };
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

  return resident;
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
