import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { createTownCharacter, poseWalkingCharacter } from "./characters-3d";
import type { ImmersiveTownWorld } from "./types";

/** A locally controlled builder, deliberately separate from ambient NPC routines. */
export function createPlayerAvatar(world: ImmersiveTownWorld) {
  const root = new TransformNode("rivergate-player", world.scene);
  root.metadata = { kind: "controlled-player" };
  const shadowGenerator = world.scene
    .getLightByName("rivergate-sun")
    ?.getShadowGenerator();
  const shadows =
    shadowGenerator instanceof ShadowGenerator ? shadowGenerator : null;
  const rig = createTownCharacter(world.scene, root, shadows, {
    id: "player-builder",
    age: "adult",
    activity: "idle",
    hair: "coils",
    skin: "#A46B48",
    hairColor: "#30211B",
    shirt: "#32959C",
    bottoms: "#2E4865",
    shoes: "#EFE4CA",
    x: 0,
    z: 0,
    rotation: Math.PI,
    phase: 0,
  });
  rig.root.position.setAll(0);
  const bagMaterial = new StandardMaterial(
    "player-backpack-yellow",
    world.scene,
  );
  bagMaterial.diffuseColor = Color3.FromHexString("#F4BC42");
  bagMaterial.emissiveColor = Color3.FromHexString("#F4BC42").scale(0.12);
  bagMaterial.specularColor = Color3.White().scale(0.06);
  const strapMaterial = new StandardMaterial(
    "player-backpack-straps",
    world.scene,
  );
  strapMaterial.diffuseColor = Color3.FromHexString("#3A4D59");
  strapMaterial.specularColor = Color3.Black();
  const bag = MeshBuilder.CreateSphere(
    "player-backpack",
    { diameter: 1, segments: 16 },
    world.scene,
  );
  bag.scaling.set(0.72, 0.85, 0.46);
  bag.position.set(0, 0.71, 0.34);
  bag.material = bagMaterial;
  bag.parent = rig.torso;
  const pocket = MeshBuilder.CreateBox(
    "player-backpack-pocket",
    { width: 0.42, height: 0.3, depth: 0.12 },
    world.scene,
  );
  pocket.position.set(0, 0.52, 0.58);
  pocket.material = bagMaterial;
  pocket.parent = rig.torso;
  for (const side of [-1, 1]) {
    const strap = MeshBuilder.CreateBox(
      `player-backpack-strap-${side}`,
      { width: 0.075, height: 0.8, depth: 0.04 },
      world.scene,
    );
    strap.position.set(side * 0.23, 0.75, -0.25);
    strap.material = strapMaterial;
    strap.parent = rig.torso;
  }
  const meshes = root.getChildMeshes();
  meshes.forEach((mesh) => {
    mesh.isPickable = false;
    shadows?.addShadowCaster(mesh);
  });
  let distance = 0;
  let heading = Math.PI;
  let strength = 0;
  root.setEnabled(false);
  const stop = () => {
    strength = 0;
    poseWalkingCharacter(rig, distance, 0);
  };
  stop();
  return {
    root,
    rig,
    get travelled() {
      return distance;
    },
    update(
      dx: number,
      dz: number,
      dt: number,
      idleHeading: number,
      reduced: boolean,
      turning = false,
    ) {
      const travel = Math.hypot(dx, dz);
      distance += travel;
      const walking = travel > 0.00001;
      const desiredHeading = walking
        ? Math.atan2(-dx, -dz)
        : turning
          ? idleHeading + Math.PI
          : heading;
      const turn = Math.atan2(
        Math.sin(desiredHeading - heading),
        Math.cos(desiredHeading - heading),
      );
      heading += turn * (reduced ? 1 : 1 - Math.exp(-18 * dt));
      rig.root.rotation.y = heading;
      // Grounded footfalls follow displacement, never a looping animation timer.
      strength = walking ? Math.min(1, travel / Math.max(dt, 0.001) / 0.8) : 0;
      poseWalkingCharacter(rig, distance, reduced ? strength * 0.4 : strength);
    },
    face(yaw: number) {
      heading = yaw + Math.PI;
      rig.root.rotation.y = heading;
    },
    stop,
    dispose() {
      meshes.forEach((mesh) => shadows?.removeShadowCaster(mesh));
      root.dispose(false);
      bagMaterial.dispose();
      strapMaterial.dispose();
    },
  };
}
