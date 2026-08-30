import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

import { applyVehicleTransform } from "./babylon-adapter";
import { renderedRoadHeight } from "./road";
import type { VehicleTransform } from "./traffic";
import { softenLightPool } from "./light-pool";

type VehicleRig = Readonly<{
  root: TransformNode;
  wheels: readonly Mesh[];
}>;

export type VehicleFleet = Readonly<{
  setNight(night: boolean): void;
  sync(transforms: readonly VehicleTransform[], elapsedSeconds: number): void;
  dispose(): void;
}>;

const VEHICLE_COLOURS = [
  "#FFD24A",
  "#F47F70",
  "#6FD0A2",
  "#62AEF0",
  "#FF9F68",
  "#A985D8",
] as const;

export function createVehicleFleet(
  scene: Scene,
  vehicleIds: readonly string[],
): VehicleFleet {
  const rigs = new Map<string, VehicleRig>();
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
  });

  return {
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
        rig.root.position.y = renderedRoadHeight(transform.position.y) + 0.03;
        const wheelTurn =
          elapsedSeconds * Math.max(1.4, transform.speedMetersPerSecond) * 1.35;
        rig.wheels.forEach((wheel) => {
          wheel.rotation.x = wheelTurn;
        });
      });
    },
    dispose() {
      rigs.forEach((rig) => rig.root.dispose(false));
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

  const length = bus ? 5.8 : 4.1;
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

  return { root, wheels };
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
