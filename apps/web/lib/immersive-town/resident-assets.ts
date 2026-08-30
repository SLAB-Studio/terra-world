import "@babylonjs/loaders/glTF/2.0/glTFLoader";
import "@babylonjs/loaders/glTF/glTFFileLoader";
import { GLTFLoaderAnimationStartMode } from "@babylonjs/loaders/glTF/glTFFileLoader";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Scene } from "@babylonjs/core/scene";
import {
  residentAsset,
  type ResidentDetail,
  type ResidentModelId,
} from "./resident-models";

type ResidentLibrary = {
  assets: Map<string, Promise<AssetContainer>>;
  abort: AbortController;
  queue: Array<() => void>;
  active: number;
};
const libraries = new WeakMap<Scene, ResidentLibrary>();

/** One model download per appearance/detail/scene; never 35 separate downloads. */
export function loadResidentAsset(
  scene: Scene,
  id: ResidentModelId,
  detail: ResidentDetail,
): Promise<AssetContainer> {
  let library = libraries.get(scene);
  if (!library) {
    library = {
      assets: new Map(),
      abort: new AbortController(),
      queue: [],
      active: 0,
    };
    libraries.set(scene, library);
    const owned = library;
    scene.onDisposeObservable.addOnce(() => {
      owned.abort.abort();
      // Let queued jobs reject and settle as well; none starts another request.
      owned.queue.splice(0).forEach((run) => run());
      owned.assets.forEach((asset) => {
        void asset.then(
          (container) => container.dispose(),
          () => {},
        );
      });
      libraries.delete(scene);
    });
  }
  const key = `${id}-${detail}`;
  const cached = library.assets.get(key);
  if (cached) return cached;
  const owned = library;
  const promise = new Promise<AssetContainer>((resolve, reject) => {
    const run = async () => {
      owned.active++;
      const timeout = new AbortController();
      const cancel = () => timeout.abort();
      owned.abort.signal.addEventListener("abort", cancel, { once: true });
      const timer = setTimeout(cancel, 20_000);
      try {
        if (scene.isDisposed || owned.abort.signal.aborted)
          throw new Error("Resident scene disposed");
        const response = await fetch(residentAsset(id, detail).url, {
          signal: timeout.signal,
        });
        if (!response.ok)
          throw new Error(`Resident asset returned ${response.status}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (scene.isDisposed) throw new Error("Resident scene disposed");
        const container = await LoadAssetContainerAsync(bytes, scene, {
          pluginExtension: ".glb",
          pluginOptions: {
            gltf: { animationStartMode: GLTFLoaderAnimationStartMode.NONE },
          },
        });
        if (scene.isDisposed) {
          container.dispose();
          throw new Error("Resident scene disposed");
        }
        // Authored rough, diffuse surfaces use existing sunlight/street lighting.
        // No environment maps, morph targets, or additional lighting passes.
        container.meshes.forEach((mesh) => {
          mesh.isPickable = false;
          mesh.checkCollisions = false;
        });
        resolve(container);
      } catch (error) {
        reject(error);
      } finally {
        clearTimeout(timer);
        owned.abort.signal.removeEventListener("abort", cancel);
        owned.active--;
        owned.queue.shift()?.();
      }
    };
    if (owned.active < 2) void run();
    else
      owned.queue.push(() => {
        void run();
      });
  });
  owned.assets.set(key, promise);
  return promise;
}
