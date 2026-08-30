import type { RenderBudget } from "./render-quality";

const WARMUP_MS = 2_000;
const SAMPLE_WINDOW_MS = 1_000;
const CHANGE_COOLDOWN_MS = 3_000;

/** Frame timings only: no renderer identification, network calls, or telemetry. */
export function createAdaptiveResolution(initialBudget: RenderBudget) {
  let budget = initialBudget;
  let pixelRatio = budget.initialPixelRatio;
  let warmupMs = WARMUP_MS;
  let cooldownMs = 0;
  let windowMs = 0;
  let frames = 0;
  let slowWindows = 0;
  let fastWindows = 0;

  const clearSamples = () => {
    warmupMs = WARMUP_MS;
    cooldownMs = 0;
    windowMs = 0;
    frames = 0;
    slowWindows = 0;
    fastWindows = 0;
  };

  return {
    get pixelRatio() {
      return pixelRatio;
    },
    /** New preferences/resizes restart measurement; tab resume keeps resolution. */
    reset(nextBudget?: RenderBudget) {
      if (nextBudget) {
        budget = nextBudget;
        pixelRatio = budget.initialPixelRatio;
      }
      clearSamples();
    },
    /** Returns a new ratio only when a real change is warranted. */
    sample(frameMs: number): number | null {
      if (!budget.adaptive) return null;
      if (!Number.isFinite(frameMs) || frameMs <= 0 || frameMs > 1_000) {
        clearSamples();
        return null;
      }
      if (warmupMs > 0) {
        warmupMs -= frameMs;
        return null;
      }
      if (cooldownMs > 0) {
        cooldownMs -= frameMs;
        return null;
      }
      windowMs += frameMs;
      frames += 1;
      if (windowMs < SAMPLE_WINDOW_MS) return null;

      const meanFrameMs = windowMs / frames;
      windowMs = 0;
      frames = 0;
      slowWindows = meanFrameMs > 21 ? slowWindows + 1 : 0;
      fastWindows = meanFrameMs < 17.5 ? fastWindows + 1 : 0;

      // Two slow windows reduce load; eight fast windows earn extra detail.
      // The neutral band and cooldown prevent visible resolution oscillation.
      const delta = slowWindows >= 2 ? -0.1 : fastWindows >= 8 ? 0.1 : 0;
      if (delta === 0) return null;
      slowWindows = 0;
      fastWindows = 0;
      const next = Math.max(
        budget.minPixelRatio,
        Math.min(
          budget.maxPixelRatio,
          Math.round((pixelRatio + delta) * 100) / 100,
        ),
      );
      if (Math.abs(next - pixelRatio) < 0.001) return null;
      pixelRatio = next;
      cooldownMs = CHANGE_COOLDOWN_MS;
      return pixelRatio;
    },
  };
}
