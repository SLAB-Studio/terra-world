import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@babylonjs/loaders/glTF/2.0/glTFLoader";
import "@babylonjs/loaders/glTF/glTFFileLoader";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { createVehicleFleet } from "./vehicles-3d";
import { instantiateCityModel, upgradeCityTrees } from "./city-models";
import {
  createTrafficSimulation,
  getVehicleTransforms,
  stepTraffic,
} from "./traffic";
import { renderedRoadHeight } from "./road";
import manifest from "../../public/models/city/manifest.json";
const loader = vi.hoisted(() => vi.fn());
vi.mock("./resident-assets", () => ({ loadLocalSceneAsset: loader }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  loader.mockReset();
});
const bytes = (url: string) =>
  new Uint8Array(readFileSync(new URL(`../../public${url}`, import.meta.url)));
function setup() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.spyOn(engine, "getRenderingCanvas").mockReturnValue(
    {} as HTMLCanvasElement,
  );
  loader.mockImplementation((target: Scene, url: string) =>
    LoadAssetContainerAsync(bytes(url), target, {
      pluginExtension: ".glb",
      pluginOptions: {
        gltf: {
          skipMaterials: /broadleaf|fir/.test(url),
          animationStartMode: 0,
        },
      },
    }),
  );
  return { engine, scene };
}
describe("game-ready city models", () => {
  it("ships bounded self-contained models with true lower-detail geometry", () => {
    expect(manifest).toHaveLength(8);
    let total = 0;
    for (const entry of manifest) {
      const b = Buffer.from(bytes(`/models/city/${entry.id}.glb`));
      total += b.length;
      const j = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
      expect(j.buffers.every((buffer: { uri?: string }) => !buffer.uri)).toBe(
        true,
      );
      expect(
        (j.images ?? []).every((image: { uri?: string }) => !image.uri),
      ).toBe(true);
      expect(j.animations ?? []).toHaveLength(0);
      expect(j.skins ?? []).toHaveLength(0);
      expect(b.length).toBe(entry.bytes);
      const tris = j.meshes
        .flatMap((m: { primitives: { indices: number }[] }) => m.primitives)
        .reduce(
          (n: number, p: { indices: number }) =>
            n + j.accessors[p.indices].count / 3,
          0,
        );
      expect(tris).toBeLessThanOrEqual(entry.triangles + 4);
      expect(tris).toBeLessThanOrEqual(entry.id.endsWith("far") ? 8000 : 16000);
    }
    expect(total).toBeLessThan(7_000_000);
  });
  it.each(["berry-car", "sunny-bus"])(
    "replaces %s completely, keeps its size on the road and rolls all four wheels only when moving",
    async (id) => {
      const { scene, engine } = setup();
      const fleet = createVehicleFleet(scene, [id]);
      try {
        const root = scene.getTransformNodeByName(`traffic-${id}`)!;
        const old = scene.getMeshByName(`${id}-body`)!;
        await vi.waitFor(() =>
          expect(root.metadata?.cityModel).toBe(
            id.includes("bus") ? "shuttlebus" : "crossover",
          ),
        );
        expect(old.isDisposed()).toBe(true);
        const wheels = root
          .getDescendants(false)
          .filter((n) =>
            /:Wheel(Front|Rear)[LR]$/.test(n.name),
          ) as TransformNode[];
        expect(wheels).toHaveLength(4);
        expect(root.getChildMeshes().every((mesh) => !mesh.isPickable)).toBe(
          true,
        );
        let traffic = createTrafficSimulation();
        fleet.sync(getVehicleTransforms(traffic), 0);
        const before = wheels.map((w) => w.rotationQuaternion!.clone());
        fleet.sync(getVehicleTransforms(traffic), 1);
        expect(wheels.map((w) => w.rotationQuaternion)).toEqual(before);
        traffic = stepTraffic(traffic, 0.1);
        fleet.sync(getVehicleTransforms(traffic), 1.1);
        expect(
          wheels.every(
            (w, index) =>
              !w.rotationQuaternion!.equalsWithEpsilon(before[index]!),
          ),
        ).toBe(true);
        const model = scene.getTransformNodeByName(`${id}-far-model`)!;
        // Measure local dimensions before the traffic root's rotation.
        root.rotationQuaternion = null;
        root.rotation.setAll(0);
        root.position.setAll(0);
        const box = model.getHierarchyBoundingVectors(true);
        expect(box.max.x - box.min.x).toBeLessThanOrEqual(1.81);
        expect(box.max.z - box.min.z).toBeLessThanOrEqual(
          id.includes("bus") ? 5.61 : 3.81,
        );
        expect(box.min.y).toBeGreaterThan(-0.05);
        expect(box.min.y).toBeLessThan(0.08);
        // Headlamp geometry, not a label, must face the travel direction (+Z).
        const lamps = model
          .getChildMeshes()
          .filter((m) => m.material?.name === `${id}-lamps`);
        expect(lamps.length).toBeGreaterThan(0);
        lamps.forEach((m) => {
          m.computeWorldMatrix(true);
          expect(m.getBoundingInfo().boundingBox.centerWorld.z).toBeGreaterThan(
            1,
          );
        });
        const transform = getVehicleTransforms(traffic).find(
          (t) => t.id === id,
        )!;
        fleet.sync([transform], 1.1);
        expect(root.position.y).toBeCloseTo(
          renderedRoadHeight(transform.position.y) + 0.13,
        );
        fleet.setNight(true);
        expect(
          scene.getTransformNodeByName(`${id}-headlight-pools`)!.isEnabled(),
        ).toBe(true);
        fleet.setNight(false);
        expect(
          scene.getTransformNodeByName(`${id}-headlight-pools`)!.isEnabled(),
        ).toBe(false);
      } finally {
        fleet.dispose();
        scene.dispose();
        engine.dispose();
      }
    },
  );
  it("retains usable vehicles on load failure", async () => {
    const { scene, engine } = setup();
    loader.mockRejectedValue(new Error("offline"));
    const fleet = createVehicleFleet(scene, ["berry-car"]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(scene.getMeshByName("berry-car-body")?.isDisposed()).toBe(false);
    fleet.dispose();
    scene.dispose();
    engine.dispose();
  });
  it("discards an in-flight vehicle model after the fleet is disposed", async () => {
    const { scene, engine } = setup();
    const container = await LoadAssetContainerAsync(
      bytes("/models/city/crossover-far.glb"),
      scene,
      { pluginExtension: ".glb" },
    );
    let finish!: (value: typeof container) => void;
    loader.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const instantiate = vi.spyOn(container, "instantiateModelsToScene");
    const fleet = createVehicleFleet(scene, ["berry-car"]);
    try {
      await vi.waitFor(() => expect(loader).toHaveBeenCalled());
      fleet.dispose();
      finish(container);
      await vi.waitFor(() => expect(instantiate).toHaveBeenCalled());
      expect(scene.getTransformNodeByName("traffic-berry-car")).toBeNull();
      expect(scene.getTransformNodeByName("berry-car-far-model")).toBeNull();
    } finally {
      container.dispose();
      scene.dispose();
      engine.dispose();
    }
  });
  it("replaces tree meshes without changing roots or touching orchard simulation state", async () => {
    const { scene, engine } = setup();
    const root = new TransformNode("tree-0", scene);
    root.position.set(10, 0.75, 12);
    const old = MeshBuilder.CreateBox("old-tree", { size: 1 }, scene);
    old.parent = root;
    const shadows = {
      addShadowCaster: vi.fn(),
      removeShadowCaster: vi.fn(),
    } as never;
    const dispose = upgradeCityTrees(scene, shadows);
    try {
      await vi.waitFor(() =>
        expect(root.metadata?.cityModel).toBe("broadleaf"),
      );
      expect(old.isDisposed()).toBe(true);
      expect(root.position.equals(new Vector3(10, 0.75, 12))).toBe(true);
      expect(
        root.getChildMeshes().every((m) => !m.isPickable && !m.checkCollisions),
      ).toBe(true);
    } finally {
      dispose();
      scene.dispose();
      engine.dispose();
    }
  });
  it("loads both visual detail levels from real files without a network", async () => {
    const { scene, engine } = setup();
    try {
      for (const detail of ["near", "far"] as const) {
        const model = await instantiateCityModel(
          scene,
          "crossover",
          detail,
          detail,
        );
        expect(model.meshes.some((m) => m.getTotalVertices() > 0)).toBe(true);
        model.entries.dispose();
        model.root.dispose();
      }
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
});
