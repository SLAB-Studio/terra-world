import type { Engine } from "@babylonjs/core/Engines/engine";
import { createAdaptiveResolution } from "./adaptive-performance";
import {
  getRenderBudget,
  parseRenderQuality,
  RENDER_QUALITY_STORAGE_KEY,
  sceneQualityForRenderBudget,
  shouldPauseTown,
} from "./render-quality";
import type { TownQuality } from "./types";

/** The same local render budget follows the player indoors. */
export function startCanvasRenderLoop(
  options: Readonly<{
    engine: Engine;
    canvas: HTMLCanvasElement;
    render(): void;
    onPause(): void;
    onQuality(quality: TownQuality): void;
  }>,
) {
  const { engine, canvas } = options;
  let preference = parseRenderQuality(null);
  try {
    preference = parseRenderQuality(
      localStorage.getItem(RENDER_QUALITY_STORAGE_KEY),
    );
  } catch {
    // Restricted storage is compatible with the default Auto budget.
  }
  const readBudget = () =>
    getRenderBudget(
      preference,
      window.devicePixelRatio,
      canvas.clientWidth,
      canvas.clientHeight,
    );
  const resolution = createAdaptiveResolution(readBudget());
  let quality: TownQuality | undefined;
  const applyResolution = () => {
    engine.setHardwareScalingLevel(1 / resolution.pixelRatio);
    const nextQuality = sceneQualityForRenderBudget(
      preference,
      resolution.pixelRatio,
    );
    if (quality !== nextQuality) {
      quality = nextQuality;
      options.onQuality(nextQuality);
    }
  };
  applyResolution();

  let disposed = false;
  let rendering = false;
  let onscreen = true;
  let lastFrameAt = 0;
  const renderFrame = () => {
    if (disposed || !rendering) return;
    const now = performance.now();
    if (lastFrameAt > 0 && resolution.sample(now - lastFrameAt) !== null)
      applyResolution();
    lastFrameAt = now;
    options.render();
  };
  const syncVisibility = () => {
    if (disposed) return;
    const paused = shouldPauseTown(
      document.visibilityState === "visible",
      onscreen,
      false,
    );
    if (paused) options.onPause();
    if (paused && rendering) {
      engine.stopRenderLoop(renderFrame);
      rendering = false;
      lastFrameAt = 0;
      resolution.reset();
    } else if (!paused && !rendering) {
      lastFrameAt = 0;
      resolution.reset();
      engine.runRenderLoop(renderFrame);
      rendering = true;
    }
  };
  let viewport = "";
  const resize = new ResizeObserver(() => {
    if (disposed) return;
    const nextViewport = `${canvas.clientWidth}:${canvas.clientHeight}:${window.devicePixelRatio}`;
    if (nextViewport === viewport) return;
    viewport = nextViewport;
    resolution.reset(readBudget());
    applyResolution();
    engine.resize();
  });
  const intersection = new IntersectionObserver(
    ([entry]) => {
      onscreen = entry?.isIntersecting === true;
      syncVisibility();
    },
    { threshold: 0.01 },
  );
  resize.observe(canvas);
  intersection.observe(canvas);
  document.addEventListener("visibilitychange", syncVisibility);
  syncVisibility();

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      resize.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", syncVisibility);
      engine.stopRenderLoop(renderFrame);
      options.onPause();
    },
  };
}
