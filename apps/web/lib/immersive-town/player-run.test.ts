import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import "@babylonjs/loaders/glTF/2.0/glTFLoader";
import "@babylonjs/loaders/glTF/glTFFileLoader";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { createPlayerRunClip, type PlayerRunData } from "./player-run";
import { residentClipProgress } from "./resident-models";

describe("the player's authored running animation", () => {
  it("fits the existing near/far skeleton without adding geometry or twitching at the loop", async () => {
    const file = readFileSync(
      new URL("../../public/models/residents/player-run.json", import.meta.url),
    );
    const data = JSON.parse(file.toString()) as PlayerRunData;
    expect(file.length).toBeLessThan(100_000);
    expect(data.model).toBe("man-casual");
    expect(data.distance).toBeGreaterThan(1.5);
    expect(data.duration).toBeGreaterThan(0.5);
    for (const detail of ["near", "far"]) {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      try {
        const bytes = readFileSync(
          new URL(
            `../../public/models/residents/man-casual-${detail}.glb`,
            import.meta.url,
          ),
        );
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
        const nodes = new Map(scene.transformNodes.map((n) => [n.name, n]));
        const count = scene.meshes.length;
        const group = createPlayerRunClip(scene, nodes, data);
        expect(scene.meshes.length).toBe(count);
        expect(group.targetedAnimations).toHaveLength(data.channels.length);
        for (const { animation } of group.targetedAnimations) {
          const a = animation.evaluate(0),
            b = animation.evaluate(data.duration * 30);
          if (animation.targetProperty === "rotationQuaternion") {
            const dot = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w);
            expect(dot).toBeGreaterThan(0.999);
          } else expect(a.subtract(b).length()).toBeLessThan(0.01);
        }
        group.start(true);
        group.pause();
        const feet = [nodes.get("Bip01 L Foot")!, nodes.get("Bip01 R Foot")!];
        const samples = Array.from({ length: 23 }, (_, i) => {
          group.goToFrame((data.duration * 30 * i) / 22);
          scene.transformNodes.forEach((n) => n.computeWorldMatrix(true));
          return feet.map((f) => f.getAbsolutePosition().clone());
        });
        for (let foot = 0; foot < 2; foot++) {
          const values = samples.map((s) => s[foot]!);
          expect(
            Math.max(...values.map((p) => p.z)) -
              Math.min(...values.map((p) => p.z)),
          ).toBeGreaterThan(0.35);
          expect(Math.min(...values.map((p) => p.y))).toBeGreaterThan(-0.01);
          expect(Math.max(...values.map((p) => p.y))).toBeLessThan(0.9);
          for (let i = 1; i < values.length; i++)
            expect(values[i]!.subtract(values[i - 1]!).length()).toBeLessThan(
              0.35,
            );
        }
        group.dispose();
        instance.dispose();
        asset.dispose();
      } finally {
        scene.dispose();
        engine.dispose();
      }
    }
  });
  it("locks run phase to distance, not elapsed wall time", () => {
    expect(residentClipProgress("run", 1, 0.5, 0, 2, 0.7)).toBeCloseTo(0.25);
    expect(residentClipProgress("run", 20, 0.5, 0, 2, 0.7)).toBeCloseTo(0.25);
    expect(residentClipProgress("run", 20, 1, 0, 2, 0.7)).toBeCloseTo(0.5);
  });
});
