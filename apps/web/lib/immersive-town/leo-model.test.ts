import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import "@babylonjs/loaders/glTF/2.0/glTFLoader";
import "@babylonjs/loaders/glTF/glTFFileLoader";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
const bytes = readFileSync(
  new URL("../../public/models/leo/leo.glb", import.meta.url),
);
describe("LEO skinned dog asset", () => {
  it("is a compact self-contained textured quadruped, with only appropriate locomotion clips", () => {
    const j = JSON.parse(
      bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString(),
    );
    expect(bytes.length).toBeLessThan(1_100_000);
    expect(j.animations.map((a: { name: string }) => a.name).sort()).toEqual([
      "idle",
      "trot",
      "walk",
    ]);
    expect(j.skins).toHaveLength(1);
    expect(j.images).toHaveLength(2);
    expect(j.images.every((i: { uri?: string }) => !i.uri)).toBe(true);
    const tris = j.meshes
      .flatMap((m: { primitives: { indices: number }[] }) => m.primitives)
      .reduce(
        (n: number, p: { indices: number }) =>
          n + j.accessors[p.indices].count / 3,
        0,
      );
    expect(tris).toBeLessThan(12_000);
  });
  it.each(["walk", "trot"])(
    "actually moves all four paws, closes its %s loop and leaves the root in place",
    async (clip) => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      try {
        const asset = await LoadAssetContainerAsync(
          new Uint8Array(bytes),
          scene,
          {
            pluginExtension: ".glb",
            pluginOptions: {
              gltf: { skipMaterials: true, animationStartMode: 0 },
            },
          },
        );
        const instance = asset.instantiateModelsToScene((n) => n, false, {
          doNotInstantiate: true,
        });
        const walk = instance.animationGroups.find((g) => g.name === clip)!;
        walk.start(true);
        walk.pause();
        const feet = [
          "L_hand_jnt.108",
          "R_hand_jnt.118",
          "L_foot_jnt.27",
          "R_foot_jnt.17",
        ].map((name) => scene.getTransformNodeByName(name)!);
        const samples = Array.from({ length: 31 }, (_, i) => {
          walk.goToFrame(walk.from + ((walk.to - walk.from) * i) / 30);
          scene.transformNodes.forEach((n) => n.computeWorldMatrix(true));
          return feet.map((f) => f.getAbsolutePosition().clone());
        });
        for (let foot = 0; foot < 4; foot++) {
          const values = samples.map((s) => s[foot]!);
          expect(
            Math.max(...values.map((p) => p.z)) -
              Math.min(...values.map((p) => p.z)),
          ).toBeGreaterThan(0.2);
          expect(values[0]!.subtract(values[30]!).length()).toBeLessThan(0.025);
          expect(Math.min(...values.map((p) => p.y))).toBeGreaterThan(-0.01);
          // Trotting has a deliberately higher swing; these are wrist/ankle
          // joints, not the bottom of the paw.
          expect(Math.max(...values.map((p) => p.y))).toBeLessThan(
            clip === "trot" ? 0.21 : 0.17,
          );
        }
        instance.dispose();
        asset.dispose();
      } finally {
        scene.dispose();
        engine.dispose();
      }
    },
  );
});
