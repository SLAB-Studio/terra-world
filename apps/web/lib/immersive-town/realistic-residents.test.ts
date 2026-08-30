import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@babylonjs/loaders/glTF/2.0/glTFLoader";
import "@babylonjs/loaders/glTF/glTFFileLoader";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import {
  createTownCharacter,
  applyTownCharacterMotion,
  RIVERGATE_CHARACTER_PROFILES,
} from "./characters-3d";
import { hasRealisticResident } from "./realistic-residents";
import {
  residentAsset,
  type ResidentDetail,
  type ResidentModelId,
} from "./resident-models";
import { PEDESTRIAN_ROUTES, samplePedestrianRoute } from "./pedestrian-motion";

const loader = vi.hoisted(() => vi.fn());
vi.mock("./resident-assets", () => ({ loadResidentAsset: loader }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  loader.mockReset();
});

function testWorld(profileId = "south-walker-kai") {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const parent = new TransformNode("population", scene);
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.spyOn(engine, "getRenderingCanvas").mockReturnValue(
    {} as HTMLCanvasElement,
  );
  const profile = RIVERGATE_CHARACTER_PROFILES.find(
    ({ id }) => id === profileId,
  )!;
  return { engine, scene, parent, profile };
}

describe("realistic resident lifecycle", () => {
  it.each(["south-walker-kai", "resident-malik"])(
    "swaps complete models, preserves anatomical facing and grounding: %s",
    async (profileId) => {
      const { engine, scene, parent, profile } = testWorld(profileId);
      const containers: AssetContainer[] = [];
      loader.mockImplementation(
        async (target: Scene, id: ResidentModelId, detail: ResidentDetail) => {
          const bytes = readFileSync(
            new URL(
              `../../public${residentAsset(id, detail).url}`,
              import.meta.url,
            ),
          );
          const container = await LoadAssetContainerAsync(
            new Uint8Array(bytes),
            target,
            {
              pluginExtension: ".glb",
              pluginOptions: {
                gltf: { skipMaterials: true, animationStartMode: 0 },
              },
            },
          );
          containers.push(container);
          return container;
        },
      );
      try {
        const rig = createTownCharacter(scene, parent, null, profile);
        const oldMeshes = rig.root.getChildMeshes();
        expect(oldMeshes.length).toBeGreaterThan(10);
        expect(rig.root.metadata.modelState).toBe("loading");
        await vi.waitFor(() => expect(hasRealisticResident(rig)).toBe(true));
        expect(oldMeshes.every((mesh) => mesh.isDisposed())).toBe(true);
        expect(
          rig.root
            .getChildMeshes()
            .filter((mesh) => mesh.getTotalVertices() > 0).length,
        ).toBeLessThanOrEqual(3);
        expect(scene.animationGroups.every((group) => !group.isPlaying)).toBe(
          true,
        );
        expect(
          rig.root.getChildMeshes().every((mesh) => !mesh.isPickable),
        ).toBe(true);
        for (const time of [1, 3, 6, 12]) {
          applyTownCharacterMotion(rig, time, false);
          const place = samplePedestrianRoute(
            PEDESTRIAN_ROUTES[profile.id]!,
            time,
            profile.phase,
          );
          expect(
            Vector3.Distance(
              rig.root.position,
              new Vector3(place.x, place.y, place.z),
            ),
          ).toBeLessThan(0.0001);
          expect(rig.root.rotation.y).toBe(place.yaw);
          if (place.speed > 0.1) {
            const nodes = rig.root.getChildTransformNodes();
            const toes = ["L", "R"].map((side) => {
              const foot = nodes.find((node) =>
                node.name.endsWith(` ${side} Foot`),
              )!;
              const toe = nodes.find((node) =>
                node.name.endsWith(` ${side} Toe0`),
              )!;
              foot.computeWorldMatrix(true);
              toe.computeWorldMatrix(true);
              return toe
                .getAbsolutePosition()
                .subtract(foot.getAbsolutePosition());
            });
            const forward = toes[0]!.add(toes[1]!);
            // The ankle-to-toe vector points down as well as forward. Compare
            // its pavement-plane heading, not the foot's vertical pitch.
            forward.y = 0;
            forward.normalize();
            const direction = new Vector3(
              -Math.sin(place.yaw),
              0,
              -Math.cos(place.yaw),
            );
            expect(
              Vector3.Dot(forward, direction),
              "anatomical toes face the travel direction",
            ).toBeGreaterThan(0.7);
          }
          const vertices = rig.root
            .getChildMeshes()
            .filter((mesh) => mesh.getTotalVertices() > 0)
            .flatMap((mesh) => {
              mesh.computeWorldMatrix(true);
              mesh.skeleton?.prepare();
              const data = mesh.getPositionData(true)!;
              const heights: number[] = [];
              for (let i = 0; i < data.length; i += 3)
                heights.push(
                  Vector3.TransformCoordinates(
                    Vector3.FromArray(data, i),
                    mesh.getWorldMatrix(),
                  ).y,
                );
              return heights;
            });
          expect(Math.min(...vertices)).toBeGreaterThan(place.y - 0.12);
          expect(Math.min(...vertices)).toBeLessThan(place.y + 0.12);
          expect(Math.max(...vertices) - place.y).toBeGreaterThan(
            profile.age === "child" ? 1.2 : 1.4,
          );
          expect(Math.max(...vertices) - place.y).toBeLessThan(2.15);
        }
        applyTownCharacterMotion(rig, 12, true);
        const skeleton = scene.skeletons.find((item) =>
          item.name.startsWith(profile.id),
        )!;
        skeleton.prepare(true);
        let recomputes = 0;
        const observer = skeleton.onBeforeComputeObservable.add(() => {
          recomputes++;
        });
        for (let frame = 0; frame < 60; frame++) {
          applyTownCharacterMotion(rig, 12, true);
          skeleton.prepare(true);
        }
        expect(
          recomputes,
          "stationary/reduced-motion people reuse bone matrices",
        ).toBe(0);
        skeleton.onBeforeComputeObservable.remove(observer);
        rig.root.dispose();
        expect(
          scene.animationGroups.filter((group) =>
            group.name.startsWith(profile.id),
          ),
        ).toHaveLength(0);
        expect(hasRealisticResident(rig)).toBe(false);
      } finally {
        containers.forEach((container) => container.dispose());
        scene.dispose();
        engine.dispose();
      }
    },
  );

  it("keeps the current people playable when a model request fails", async () => {
    const { engine, scene, parent, profile } = testWorld();
    loader.mockRejectedValue(new Error("offline"));
    try {
      const rig = createTownCharacter(scene, parent, null, profile);
      await vi.waitFor(() =>
        expect(rig.root.metadata.modelState).toBe("fallback"),
      );
      expect(hasRealisticResident(rig)).toBe(false);
      expect(rig.root.getChildMeshes().length).toBeGreaterThan(10);
      expect(() => applyTownCharacterMotion(rig, 4, false)).not.toThrow();
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });

  it("does not resurrect a resident when its model finishes after disposal", async () => {
    const { engine, scene, parent, profile } = testWorld();
    let resolve!: (container: AssetContainer) => void;
    loader.mockReturnValue(
      new Promise<AssetContainer>((done) => {
        resolve = done;
      }),
    );
    const container = new AssetContainer(scene);
    const instantiate = vi.spyOn(container, "instantiateModelsToScene");
    try {
      const rig = createTownCharacter(scene, parent, null, profile);
      await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce());
      rig.root.dispose();
      resolve(container);
      await Promise.resolve();
      await Promise.resolve();
      expect(instantiate).not.toHaveBeenCalled();
      expect(hasRealisticResident(rig)).toBe(false);
    } finally {
      container.dispose();
      scene.dispose();
      engine.dispose();
    }
  });
});
