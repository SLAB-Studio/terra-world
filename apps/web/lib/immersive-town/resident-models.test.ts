import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import "@babylonjs/loaders/glTF/2.0/glTFLoader";
import "@babylonjs/loaders/glTF/glTFFileLoader";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { Scene } from "@babylonjs/core/scene";
import {
  residentAsset,
  residentClipFor,
  residentClipProgress,
  residentDetailFor,
  residentModelFor,
  residentPoseRate,
  residentTalkWeight,
  residentTransitionBlend,
  type ResidentModelId,
} from "./resident-models";
import { RIVERGATE_CHARACTER_PROFILES } from "./characters-3d";

const models: ResidentModelId[] = [
  "man-denim",
  "man-casual",
  "woman-casual",
  "woman-knit",
  "boy",
  "girl",
];
const readModel = (id: ResidentModelId, detail: "near" | "far") =>
  readFileSync(
    new URL(`../../public${residentAsset(id, detail).url}`, import.meta.url),
  );

describe("realistic Rivergate resident assets", () => {
  it("assigns all residents stable, local, age-appropriate appearances", () => {
    for (const profile of RIVERGATE_CHARACTER_PROFILES) {
      const model = residentModelFor(profile);
      expect(residentModelFor({ ...profile })).toBe(model);
      expect(["boy", "girl"].includes(model)).toBe(profile.age === "child");
      expect(residentAsset(model, "far").url).toMatch(
        /^\/models\/residents\/[-a-z]+-far\.glb$/,
      );
    }
  });

  it("bounds shipped geometry and includes textured, skinned meshes and all three clips", () => {
    let totalBytes = 0;
    for (const id of models) {
      const triangles: number[] = [];
      for (const detail of ["near", "far"] as const) {
        const bytes = readModel(id, detail);
        totalBytes += bytes.length;
        expect(bytes.toString("ascii", 0, 4)).toBe("glTF");
        const gltf = JSON.parse(
          bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8"),
        );
        expect(
          gltf.animations.map((a: { name: string }) => a.name).sort(),
        ).toEqual(["idle", "talk", "walk"]);
        // Clip names alone do not prove motion: a failed bone-name retarget can
        // export a valid GLB containing nothing but repeated static poses.
        const binaryOffset = 28 + bytes.readUInt32LE(12);
        for (const clip of gltf.animations) {
          const varying = clip.samplers.filter(
            (sampler: { output: number }) => {
              const accessor = gltf.accessors[sampler.output];
              const view = gltf.bufferViews[accessor.bufferView];
              const components =
                accessor.type === "VEC4" ? 4 : accessor.type === "VEC3" ? 3 : 1;
              const start =
                binaryOffset +
                (view.byteOffset ?? 0) +
                (accessor.byteOffset ?? 0);
              const values = new Float32Array(
                bytes.buffer,
                bytes.byteOffset + start,
                accessor.count * components,
              );
              return values.some(
                (value, index) =>
                  Math.abs(value - values[index % components]!) > 0.0001,
              );
            },
          ).length;
          expect(
            varying,
            `${id}/${detail}/${clip.name} must really animate`,
          ).toBeGreaterThan(8);
        }
        expect(gltf.skins).toHaveLength(1);
        expect(gltf.skins[0].joints.length).toBeLessThanOrEqual(85);
        expect(gltf.images.length).toBeGreaterThanOrEqual(2);
        expect(
          gltf.images.every(
            (image: { uri?: string; bufferView?: number }) =>
              !image.uri && image.bufferView !== undefined,
          ),
        ).toBe(true);
        const count = gltf.meshes
          .flatMap(
            (mesh: { primitives: Array<{ indices: number }> }) =>
              mesh.primitives,
          )
          .reduce(
            (sum: number, primitive: { indices: number }) =>
              sum + gltf.accessors[primitive.indices].count / 3,
            0,
          );
        triangles.push(count);
        expect(count).toBeLessThan(detail === "far" ? 2500 : 9000);
        expect(bytes.length).toBeLessThan(1_600_000);
      }
      expect(triangles[1]).toBeLessThan(triangles[0]! * 0.35);
    }
    expect(totalBytes).toBeLessThan(16_000_000);
  });

  it("loads and clones actual glTF rigs without a browser or external request", async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    try {
      const bytes = readModel("man-denim", "far");
      const container = await LoadAssetContainerAsync(
        new Uint8Array(bytes),
        scene,
        {
          pluginExtension: ".glb",
          pluginOptions: {
            gltf: { skipMaterials: true, animationStartMode: 0 },
          },
        },
      );
      expect(container.animationGroups.every((group) => !group.isPlaying)).toBe(
        true,
      );
      const first = container.instantiateModelsToScene(
        (name) => `one:${name}`,
        false,
        { doNotInstantiate: true },
      );
      const second = container.instantiateModelsToScene(
        (name) => `two:${name}`,
        false,
        { doNotInstantiate: true },
      );
      expect(first.skeletons).toHaveLength(1);
      expect(first.skeletons[0]).not.toBe(second.skeletons[0]);
      expect(first.animationGroups).toHaveLength(3);
      const walk = first.animationGroups.find((group) =>
        group.name.endsWith("walk"),
      )!;
      walk.start(true);
      walk.pause();
      walk.goToFrame((walk.from + walk.to) / 2);
      const pose = walk.targetedAnimations.find(
        ({ animation }) => animation.targetProperty === "rotationQuaternion",
      )!;
      expect(
        pose.target.rotationQuaternion.asArray().every(Number.isFinite),
      ).toBe(true);
      first.dispose();
      second.dispose();
      container.dispose();
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });

  it("ships continuous joint curves, closed loops and restrained breathing in every actual GLB", () => {
    for (const id of models) {
      for (const detail of ["near", "far"] as const) {
        const bytes = readModel(id, detail);
        const jsonLength = bytes.readUInt32LE(12);
        const gltf = JSON.parse(
          bytes.subarray(20, 20 + jsonLength).toString("utf8"),
        );
        const read = (index: number) => {
          const accessor = gltf.accessors[index];
          const view = gltf.bufferViews[accessor.bufferView];
          const components =
            accessor.type === "VEC4" ? 4 : accessor.type === "VEC3" ? 3 : 1;
          return new Float32Array(
            bytes.buffer,
            bytes.byteOffset +
              28 +
              jsonLength +
              (view.byteOffset ?? 0) +
              (accessor.byteOffset ?? 0),
            accessor.count * components,
          );
        };
        for (const clip of gltf.animations) {
          for (const channel of clip.channels) {
            const sampler = clip.samplers[channel.sampler];
            const values = read(sampler.output);
            const times = read(sampler.input);
            const node = gltf.nodes[channel.target.node].name;
            const label = `${id}/${detail}/${clip.name}/${node}`;
            if (channel.target.path === "rotation") {
              const angle = (a: number, b: number) => {
                const left = values.slice(a * 4, a * 4 + 4);
                const right = values.slice(b * 4, b * 4 + 4);
                const dot = left.reduce(
                  (sum, value, i) => sum + value * right[i]!,
                  0,
                );
                return (
                  2 *
                  Math.acos(
                    Math.min(
                      1,
                      Math.abs(dot) /
                        (Math.hypot(...left) * Math.hypot(...right)),
                    ),
                  )
                );
              };
              for (let index = 1; index < times.length; index++) {
                // Real knee flexion may be fast. The broken bake exceeded
                // 170 degrees per 66ms in hands, fingers and even facial bones.
                expect(
                  angle(index - 1, index) / (times[index]! - times[index - 1]!),
                  label,
                ).toBeLessThan(13);
                if (clip.name === "idle")
                  expect(
                    angle(0, index),
                    `${label} breathing range`,
                  ).toBeLessThan(0.2);
              }
              expect(
                angle(0, times.length - 1),
                `${label} loop seam`,
              ).toBeLessThan(0.001);
            } else if (channel.target.path === "translation") {
              const last = values.length - 3;
              expect(
                Math.hypot(
                  values[0]! - values[last]!,
                  values[1]! - values[last + 1]!,
                  values[2]! - values[last + 2]!,
                ),
                `${label} position seam`,
              ).toBeLessThan(0.0001);
            }
          }
        }
      }
    }
  });

  it("uses distance hysteresis and lower pose frequency without deleting distant people", () => {
    expect(residentDetailFor(21, "far", false)).toBe("far");
    expect(residentDetailFor(21, "near", false)).toBe("near");
    expect(residentDetailFor(27, "near", false)).toBe("far");
    expect(residentDetailFor(15, "far", true)).toBe("far");
    expect(residentPoseRate(5)).toBe(30);
    expect(residentPoseRate(50)).toBe(12);
    expect(residentPoseRate(100)).toBe(6);
  });

  it("ties footsteps to travelled metres and settles into idle at route stops", () => {
    expect(residentClipFor("walk", 0, false)).toBe("idle");
    expect(residentClipFor("walk", 1, false)).toBe("walk");
    expect(residentClipFor("idle", 1, false)).toBe("walk");
    expect(residentClipFor("chat", 1, false)).toBe("walk");
    expect(residentClipFor("walk", 0.09, false, "walk")).toBe("walk");
    expect(residentClipFor("walk", 0.09, false, "idle")).toBe("idle");
    expect(residentClipFor("chat", 0, false)).toBe("talk");
    expect(residentClipFor("walk", 1, true)).toBe("idle");
    expect(residentClipProgress("walk", 1, 0.6, 0, 1.2, 1)).toBeCloseTo(0.5);
    expect(residentClipProgress("walk", 999, 0.6, 5, 1.2, 1)).toBeCloseTo(0.5);
  });

  it("layers small conversational gestures above planted legs and eases starts/stops", () => {
    expect(residentTalkWeight("person:near:Bip01 L UpperArm")).toBe(0.24);
    expect(residentTalkWeight("person:near:Bip02 Spine1")).toBe(0.1);
    for (const bone of [
      "Bip01",
      "Bip01 Pelvis",
      "Bip01 L Thigh",
      "Bip01 R Foot",
    ])
      expect(residentTalkWeight(bone)).toBe(0);
    expect(residentTransitionBlend(-1)).toBe(0);
    expect(residentTransitionBlend(0.18)).toBeCloseTo(0.5);
    expect(residentTransitionBlend(1)).toBe(1);
    expect(residentTransitionBlend(0.01)).toBeLessThan(0.01 / 0.36);
  });
});
