import type { InstantiatedEntries } from "@babylonjs/core/assetContainer";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";

export type CityModelId = "crossover" | "shuttlebus" | "broadleaf" | "fir";
export type CityModelInstance = {
  entries: InstantiatedEntries;
  root: TransformNode;
  meshes: AbstractMesh[];
};
export function canLoadCityModels(scene: Scene) {
  return (
    typeof window !== "undefined" &&
    Boolean(scene.getEngine().getRenderingCanvas())
  );
}
export async function instantiateCityModel(
  scene: Scene,
  id: CityModelId,
  detail: "near" | "far",
  name: string,
): Promise<CityModelInstance> {
  const { loadLocalSceneAsset } = await import("./resident-assets");
  const container = await loadLocalSceneAsset(
    scene,
    `/models/city/${id}-${detail}.glb`,
  );
  if (scene.isDisposed) throw new Error("City scene disposed");
  const entries = container.instantiateModelsToScene(
    (n) => `${name}:${n}`,
    false,
    { doNotInstantiate: true },
  );
  const root = new TransformNode(`${name}-model`, scene);
  entries.rootNodes.forEach((node) => {
    node.parent = root;
  });
  const meshes = root.getChildMeshes();
  meshes.forEach((mesh) => {
    mesh.isPickable = false;
    mesh.checkCollisions = false;
    mesh.receiveShadows = true;
  });
  return { entries, root, meshes };
}
export function disposeCityModel(
  model: CityModelInstance,
  shadows?: ShadowGenerator,
) {
  model.meshes.forEach((mesh) => shadows?.removeShadowCaster(mesh, false));
  model.entries.dispose();
  model.root.dispose();
}

/** Replace existing trees in place; do not alter collision roots or garden state. */
export function upgradeCityTrees(scene: Scene, shadows: ShadowGenerator) {
  if (!canLoadCityModels(scene)) return () => {};
  const trees = scene.transformNodes.filter((node) =>
    /^(tree-\d+|district-tree-\d+|orchard-fruit-tree-\d+)$/.test(node.name),
  );
  const states = trees.map((root, index) => ({
    root,
    id: (index % 4 === 1 ? "fir" : "broadleaf") as CityModelId,
    current: null as CityModelInstance | null,
    detail: "far" as "near" | "far",
    pending: false,
    failed: false,
    fallback: root.getChildMeshes(),
    orchard: root.name.startsWith("orchard"),
    disposed: false,
  }));
  const request = async (
    state: (typeof states)[number],
    detail: "near" | "far",
  ) => {
    if (state.pending || state.failed || state.disposed) return;
    state.pending = true;
    try {
      const model = await instantiateCityModel(
        scene,
        state.id,
        detail,
        `${state.root.name}-${detail}`,
      );
      if (state.disposed || state.root.isDisposed()) {
        disposeCityModel(model);
        return;
      }
      model.root.parent = state.root;
      model.root.rotation.y = states.indexOf(state) * 2.399;
      // Keep established clearances: crowns do not grow into roads/doorways.
      model.root.scaling.set(
        state.orchard ? 0.38 : 0.72,
        state.orchard ? 0.58 : 1,
        state.orchard ? 0.38 : 0.72,
      );
      if (detail === "near")
        model.meshes.forEach((mesh) => {
          if (mesh.getTotalVertices()) shadows.addShadowCaster(mesh, false);
        });
      if (state.current) disposeCityModel(state.current, shadows);
      state.current = model;
      state.detail = detail;
      state.fallback.forEach((mesh) => {
        shadows.removeShadowCaster(mesh, false);
        mesh.dispose(false, false);
      });
      state.fallback = [];
      state.root.metadata = {
        ...state.root.metadata,
        cityModel: state.id,
        modelDetail: detail,
      };
    } catch {
      state.failed = true;
    } finally {
      state.pending = false;
    }
  };
  states.forEach((state) => {
    state.root.onDisposeObservable.addOnce(() => {
      state.disposed = true;
      if (state.current) disposeCityModel(state.current, shadows);
      state.current = null;
    });
    void request(state, "far");
  });
  let since = 0;
  const observer = scene.onBeforeRenderObservable.add(() => {
    since += Math.min(scene.getEngine().getDeltaTime(), 100) / 1000;
    if (since < 0.75 || !scene.activeCamera) return;
    since = 0;
    states.forEach((state) => {
      if (!state.current || !state.root.isEnabled()) return;
      const distance = Vector3.Distance(
        scene.activeCamera!.globalPosition,
        state.root.getAbsolutePosition(),
      );
      const threshold = scene.shadowsEnabled
        ? state.detail === "near"
          ? 36
          : 28
        : state.detail === "near"
          ? 20
          : 14;
      const desired = distance < threshold ? "near" : "far";
      if (desired !== state.detail) void request(state, desired);
    });
  });
  return () => {
    scene.onBeforeRenderObservable.remove(observer);
    states.forEach((state) => {
      state.disposed = true;
      if (state.current) disposeCityModel(state.current, shadows);
      state.current = null;
    });
  };
}
