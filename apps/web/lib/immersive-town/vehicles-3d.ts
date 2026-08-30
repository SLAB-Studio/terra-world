import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  canLoadCityModels,
  instantiateCityModel,
  disposeCityModel,
  type CityModelInstance,
} from "./city-models";

import { applyVehicleTransform } from "./babylon-adapter";
import { renderedRoadHeight } from "./road";
import type { VehicleTransform } from "./traffic";
import { softenLightPool } from "./light-pool";
import {
  applyBoardingDoor,
  findBoardingDoor,
  nextBoardingDoorProgress,
  type BoardingDoor,
} from "./vehicle-doors";

type VehicleRig = {
  root: TransformNode;
  wheels: readonly Mesh[];
  model: CityModelInstance | null;
  modelWheels: TransformNode[];
  detail: "far" | "near";
  pending: boolean;
  failedNear: boolean;
  distance: number;
  lastTime: number;
  disposed: boolean;
  length: number;
  door: BoardingDoor | null;
  doorProgress: number;
};

export type VehicleFleet = Readonly<{
  setNight(night: boolean): void;
  /** Snapshot of stopped pickups/dropoffs; call before sync on each frame. */
  setBoardingDoors(vehicleIds: readonly string[]): void;
  sync(transforms: readonly VehicleTransform[], elapsedSeconds: number): void;
  dispose(): void;
}>;

const VEHICLE_COLOURS = [
  "#D5D5CF",
  "#73453E",
  "#65736C",
  "#385C72",
  "#B2A28B",
  "#373C43",
] as const;

export function createVehicleFleet(
  scene: Scene,
  vehicleIds: readonly string[],
): VehicleFleet {
  const rigs = new Map<string, VehicleRig>();
  let boardingVehicleIds = new Set<string>();
  const load = async (rig: VehicleRig, id: string, detail: "near" | "far") => {
    if (rig.disposed || rig.pending || (detail === "near" && rig.failedNear))
      return;
    rig.pending = true;
    try {
      const kind = id.includes("bus") ? "shuttlebus" : "crossover";
      const model = await instantiateCityModel(
        scene,
        kind,
        detail,
        `${id}-${detail}`,
      );
      if (rig.disposed || rig.root.isDisposed()) {
        disposeCityModel(model);
        return;
      }
      // Blender +Y exports as glTF -Z. Face the rig's +Z travel direction.
      model.root.rotation.y = Math.PI;
      const bounds = model.root.getHierarchyBoundingVectors(true);
      const size = bounds.max.subtract(bounds.min);
      model.root.scaling.set(
        Math.min(1, 1.8 / size.x),
        1,
        Math.min(1, rig.length / size.z),
      );
      model.root.position.y = -bounds.min.y;
      model.root.parent = rig.root;
      model.meshes.forEach((mesh) => {
        const suffix = mesh.material?.name;
        if (suffix === "vehicle-paint")
          mesh.material = scene.getMaterialByName(`${id}-paint`);
        if (suffix === "vehicle-headlamp")
          mesh.material = scene.getMaterialByName(`${id}-lamps`);
        if (suffix === "vehicle-taillamp")
          mesh.material = scene.getMaterialByName(`${id}-rear-lamps`);
      });
      const previous = rig.model;
      rig.model = model;
      rig.detail = detail;
      rig.modelWheels = model.root
        .getDescendants(false)
        .filter(
          (node) =>
            node instanceof TransformNode &&
            /:Wheel(Front|Rear)[LR]$/.test(node.name),
        ) as TransformNode[];
      rig.door = findBoardingDoor(model.root, rig.root);
      applyBoardingDoor(rig.door, rig.doorProgress);
      if (previous) disposeCityModel(previous);
      else
        rig.root
          .getChildMeshes()
          .filter(
            (mesh) =>
              !model.meshes.includes(mesh) && !/headlight-road/.test(mesh.name),
          )
          .forEach((mesh) => mesh.dispose(false, false));
      rig.root.metadata = {
        ...rig.root.metadata,
        cityModel: kind,
        modelDetail: detail,
        boardingDoorSupported: rig.door !== null,
      };
    } catch {
      if (detail === "near") rig.failedNear = true;
    } finally {
      rig.pending = false;
    }
  };
  vehicleIds.forEach((id, index) => {
    rigs.set(
      id,
      createVehicleRig(
        scene,
        id,
        VEHICLE_COLOURS[index % VEHICLE_COLOURS.length] ?? "#FFD24A",
        id.includes("bus"),
      ),
    );
    if (canLoadCityModels(scene)) void load(rigs.get(id)!, id, "far");
  });

  return {
    setBoardingDoors(ids) {
      boardingVehicleIds = new Set(ids);
    },
    setNight(night) {
      vehicleIds.forEach((id) => {
        const lamps = scene.getMaterialByName(
          `${id}-lamps`,
        ) as StandardMaterial | null;
        const rear = scene.getMaterialByName(
          `${id}-rear-lamps`,
        ) as StandardMaterial | null;
        if (lamps)
          lamps.emissiveColor = Color3.FromHexString("#FFF1AD").scale(
            night ? 1.4 : 0.15,
          );
        if (rear)
          rear.emissiveColor = Color3.FromHexString("#EF493C").scale(
            night ? 0.9 : 0.1,
          );
        scene
          .getTransformNodeByName(`${id}-headlight-pools`)
          ?.setEnabled(night);
      });
    },
    sync(transforms, elapsedSeconds) {
      transforms.forEach((transform) => {
        const rig = rigs.get(transform.id);
        if (rig === undefined) return;
        applyVehicleTransform(rig.root, transform);
        rig.root.position.y = renderedRoadHeight(transform.position.y) + 0.13;
        const delta = Math.max(0, Math.min(0.2, elapsedSeconds - rig.lastTime));
        rig.lastTime = elapsedSeconds;
        rig.doorProgress = nextBoardingDoorProgress(
          rig.doorProgress,
          boardingVehicleIds.has(transform.id),
          transform.speedMetersPerSecond,
          delta,
        );
        applyBoardingDoor(rig.door, rig.doorProgress);
        rig.root.metadata ??= {};
        rig.root.metadata.boardingDoorOpen =
          rig.door !== null ? rig.doorProgress : 0;
        rig.distance += delta * transform.speedMetersPerSecond;
        const wheelTurn = rig.distance / 0.36;
        const wheels = rig.model ? rig.modelWheels : rig.wheels;
        wheels.forEach((wheel) => {
          wheel.rotationQuaternion = null;
          wheel.rotation.x = wheelTurn;
        });
        // Preserve the active doorway while a passenger crosses it.
        if (rig.model && rig.doorProgress === 0 && scene.activeCamera) {
          const distance = Vector3.Distance(
            scene.activeCamera.globalPosition,
            rig.root.position,
          );
          const limit = scene.shadowsEnabled
            ? rig.detail === "near"
              ? 36
              : 26
            : rig.detail === "near"
              ? 18
              : 12;
          const desired = distance < limit ? "near" : "far";
          if (desired !== rig.detail) void load(rig, transform.id, desired);
        }
      });
    },
    dispose() {
      rigs.forEach((rig) => {
        rig.disposed = true;
        if (rig.model) disposeCityModel(rig.model);
        rig.root.dispose(false);
      });
      rigs.clear();
    },
  };
}

function createVehicleRig(
  scene: Scene,
  id: string,
  colour: string,
  bus: boolean,
): VehicleRig {
  const root = new TransformNode(`traffic-${id}`, scene);
  const bodyMaterial = material(scene, `${id}-paint`, colour, 0.22);
  const windowMaterial = material(scene, `${id}-glass`, "#BFEFFF", 0.48);
  const tyreMaterial = material(scene, `${id}-tyres`, "#29262D", 0.04);
  const lampMaterial = material(scene, `${id}-lamps`, "#FFF1A8", 0.6);
  lampMaterial.emissiveColor = Color3.FromHexString("#FFD75B").scale(0.55);
  const rearMaterial = material(scene, `${id}-rear-lamps`, "#C63D37", 0.2);

  const length = bus
    ? 5.6
    : id === "berry-car"
      ? 3.8
      : id === "sky-car"
        ? 3.9
        : id === "peach-car"
          ? 4
          : 4.1;
  const body = MeshBuilder.CreateBox(
    `${id}-body`,
    { width: 2.25, height: 0.9, depth: length },
    scene,
  );
  body.position.y = 0.72;
  body.material = bodyMaterial;
  body.parent = root;
  body.isPickable = false;

  const cabin = MeshBuilder.CreateBox(
    `${id}-cabin`,
    {
      width: bus ? 2.06 : 1.85,
      height: bus ? 1.45 : 0.86,
      depth: bus ? 4.3 : 2.15,
    },
    scene,
  );
  cabin.position.set(0, bus ? 1.72 : 1.54, bus ? 0 : -0.18);
  cabin.material = bus ? bodyMaterial : windowMaterial;
  cabin.parent = root;
  cabin.isPickable = false;

  if (bus) {
    for (const z of [-1.35, 0, 1.35]) {
      const window = MeshBuilder.CreateBox(
        `${id}-window-${z}`,
        { width: 2.12, height: 0.67, depth: 0.62 },
        scene,
      );
      window.position.set(0, 1.85, z);
      window.material = windowMaterial;
      window.parent = root;
      window.isPickable = false;
    }
  }

  const wheels: Mesh[] = [];
  const wheelZ = bus ? 2.05 : 1.35;
  for (const x of [-1.12, 1.12]) {
    for (const z of [-wheelZ, wheelZ]) {
      const wheel = MeshBuilder.CreateCylinder(
        `${id}-wheel-${x}-${z}`,
        { height: 0.32, diameter: 0.78, tessellation: 16 },
        scene,
      );
      wheel.position.set(x, 0.34, z);
      wheel.rotation.z = Math.PI / 2;
      wheel.material = tyreMaterial;
      wheel.parent = root;
      wheel.isPickable = false;
      wheels.push(wheel);
    }
  }

  for (const x of [-0.72, 0.72]) {
    const lamp = MeshBuilder.CreateSphere(
      `${id}-headlight-${x}`,
      { diameter: 0.28, segments: 8 },
      scene,
    );
    lamp.position.set(x, 0.82, length / 2 + 0.04);
    lamp.material = lampMaterial;
    lamp.parent = root;
    lamp.isPickable = false;
    const rear = MeshBuilder.CreateBox(
      `${id}-tail-light-${x}`,
      { width: 0.38, height: 0.22, depth: 0.08 },
      scene,
    );
    rear.position.set(x, 0.82, -length / 2 - 0.04);
    rear.material = rearMaterial;
    rear.parent = root;
    rear.isPickable = false;
  }

  const pools = new TransformNode(`${id}-headlight-pools`, scene);
  pools.parent = root;
  const poolMaterial = material(scene, `${id}-headlight-pool`, "#FFE9AC", 0);
  poolMaterial.disableLighting = true;
  poolMaterial.emissiveColor = Color3.FromHexString("#FFE9AC");
  poolMaterial.alpha = 0.3;
  poolMaterial.disableDepthWrite = true;
  for (const side of [-1, 1]) {
    const pool = MeshBuilder.CreateDisc(
      `${id}-headlight-road-${side}`,
      { radius: 1, tessellation: 20 },
      scene,
    );
    softenLightPool(pool);
    pool.rotation.x = Math.PI / 2;
    pool.scaling.set(0.85, 2.8, 1);
    pool.position.set(side * 0.7, 0.035, length / 2 + 2.5);
    pool.material = poolMaterial;
    pool.parent = pools;
    pool.isPickable = false;
  }
  pools.setEnabled(false);

  return {
    root,
    wheels,
    model: null,
    modelWheels: [],
    detail: "far",
    pending: false,
    failedNear: false,
    distance: 0,
    lastTime: 0,
    disposed: false,
    length,
    door: null,
    doorProgress: 0,
  };
}

function material(
  scene: Scene,
  name: string,
  hex: string,
  specular: number,
): StandardMaterial {
  const value = new StandardMaterial(name, scene);
  value.diffuseColor = Color3.FromHexString(hex);
  value.specularColor = Color3.White().scale(specular);
  value.specularPower = 48;
  return value;
}
