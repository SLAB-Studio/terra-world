import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

import type { TownAnimationController, TownAnimationListener } from "./types";

type EnvironmentalAnimationTargets = Readonly<{
  ambientActors: readonly TransformNode[];
  treeCanopies: readonly TransformNode[];
  gardenNodes: readonly TransformNode[];
  cloudRoots: readonly TransformNode[];
  lampBulbs: readonly Mesh[];
  riverMaterial: StandardMaterial;
  playgroundSpinners: readonly TransformNode[];
}>;

export function createTownAnimationController(
  scene: Scene,
  targets: EnvironmentalAnimationTargets,
  startsReduced: boolean,
): TownAnimationController {
  let elapsedSeconds = 0;
  let paused = false;
  let reducedMotion = startsReduced;
  let disposed = false;
  const listeners = new Set<TownAnimationListener>();
  const riverBase = targets.riverMaterial.emissiveColor.clone();
  const cloudStarts = targets.cloudRoots.map((cloud) => cloud.position.x);
  const actorStarts = targets.ambientActors.map((actor) => actor.position.y);

  const restoreRestPose = () => {
    targets.treeCanopies.forEach((canopy) => {
      canopy.rotation.z = 0;
      canopy.rotation.x = 0;
    });
    targets.gardenNodes.forEach((node) => {
      node.rotation.z = 0;
    });
    targets.lampBulbs.forEach((bulb) => bulb.scaling.setAll(1));
    targets.ambientActors.forEach((actor, index) => {
      actor.position.y = actorStarts[index] ?? actor.position.y;
      actor.rotation.z = 0;
    });
    targets.playgroundSpinners.forEach((spinner) => {
      spinner.rotation.y = 0;
    });
    targets.riverMaterial.emissiveColor.copyFrom(riverBase);
  };

  const observer = scene.onBeforeRenderObservable.add(() => {
    if (disposed || paused) return;
    const deltaSeconds = Math.min(scene.getEngine().getDeltaTime(), 50) / 1000;

    if (!reducedMotion) {
      elapsedSeconds += deltaSeconds;
      targets.treeCanopies.forEach((canopy, index) => {
        const phase = index * 0.67;
        canopy.rotation.z = Math.sin(elapsedSeconds * 0.72 + phase) * 0.025;
        canopy.rotation.x = Math.cos(elapsedSeconds * 0.48 + phase) * 0.012;
      });
      targets.gardenNodes.forEach((node, index) => {
        node.rotation.z = Math.sin(elapsedSeconds * 0.9 + index * 0.8) * 0.018;
      });
      targets.cloudRoots.forEach((cloud, index) => {
        cloud.position.x += deltaSeconds * (0.65 + index * 0.13);
        if (cloud.position.x > 76) cloud.position.x = -76;
      });
      targets.lampBulbs.forEach((bulb, index) => {
        const pulse = 1 + Math.sin(elapsedSeconds * 1.2 + index) * 0.035;
        bulb.scaling.setAll(pulse);
      });
      targets.ambientActors.forEach((actor, index) => {
        const startY = actorStarts[index] ?? actor.position.y;
        actor.position.y =
          startY + Math.max(0, Math.sin(elapsedSeconds * 2.2 + index)) * 0.08;
        actor.rotation.z = Math.sin(elapsedSeconds * 1.1 + index * 0.8) * 0.025;
      });
      targets.playgroundSpinners.forEach((spinner, index) => {
        spinner.rotation.y = elapsedSeconds * (0.22 + index * 0.04);
      });
      const riverGlow = 1 + Math.sin(elapsedSeconds * 0.58) * 0.22;
      targets.riverMaterial.emissiveColor.copyFrom(
        new Color3(
          riverBase.r * riverGlow,
          riverBase.g * riverGlow,
          riverBase.b * riverGlow,
        ),
      );
    }

    const frame = { deltaSeconds, elapsedSeconds, reducedMotion } as const;
    listeners.forEach((listener) => listener(frame));
  });

  if (startsReduced) restoreRestPose();

  return {
    get paused() {
      return paused;
    },
    get reducedMotion() {
      return reducedMotion;
    },
    setPaused(nextPaused) {
      paused = nextPaused;
    },
    setReducedMotion(nextReducedMotion) {
      reducedMotion = nextReducedMotion;
      if (reducedMotion) {
        targets.cloudRoots.forEach((cloud, index) => {
          cloud.position.x = cloudStarts[index] ?? cloud.position.x;
        });
        restoreRestPose();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      scene.onBeforeRenderObservable.remove(observer);
      restoreRestPose();
    },
  };
}
