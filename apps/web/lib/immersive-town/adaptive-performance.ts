import type { RenderBudget } from "./render-quality";

const WARMUP_MS = 2_000;
const SAMPLE_WINDOW_MS = 1_000;
const CHANGE_COOLDOWN_MS = 3_000;
const UPSCALE_PROBE_MS = 15_000;
const UPSCALE_RETRY_MS = 30_000;
const MAX_UPSCALE_RETRY_MS = 120_000;

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
  let upscaleHoldMs = 0;
  let failedUpscales = 0;
  let upscaleProbe: { fromRatio: number; remainingMs: number } | null = null;

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
    /** Resizes retain learned Auto detail; explicit quality changes start fresh. */
    reset(nextBudget?: RenderBudget) {
      if (nextBudget) {
        const retainAutoResolution = budget.adaptive && nextBudget.adaptive;
        budget = nextBudget;
        pixelRatio = retainAutoResolution
          ? Math.max(
              budget.minPixelRatio,
              Math.min(budget.maxPixelRatio, pixelRatio),
            )
          : budget.initialPixelRatio;
        upscaleHoldMs = 0;
        failedUpscales = 0;
      }
      upscaleProbe = null;
      clearSamples();
    },
    /** Returns a new ratio only when a real change is warranted. */
    sample(frameMs: number): number | null {
      if (!budget.adaptive) return null;
      if (!Number.isFinite(frameMs) || frameMs <= 0 || frameMs > 1_000) {
        upscaleProbe = null;
        clearSamples();
        return null;
      }
      // Count only active rendering time, never a hidden-tab suspension gap.
      upscaleHoldMs = Math.max(0, upscaleHoldMs - frameMs);
      if (upscaleProbe !== null) {
        upscaleProbe.remainingMs -= frameMs;
        if (upscaleProbe.remainingMs <= 0) {
          upscaleProbe = null;
          failedUpscales = 0;
        }
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
      slowWindows = meanFrameMs > 21 ? Math.min(2, slowWindows + 1) : 0;
      fastWindows = meanFrameMs < 17.5 ? Math.min(8, fastWindows + 1) : 0;

      // Two slow windows reduce load; eight fast windows earn extra detail.
      // A failed increase may also have enabled shadows. Do not keep retrying
      // that same costly tier every few seconds; retry later, not never.
      const delta =
        slowWindows >= 2
          ? -0.1
          : fastWindows >= 8 && upscaleHoldMs === 0 && upscaleProbe === null
            ? 0.1
            : 0;
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
      if (delta > 0) {
        upscaleProbe = { fromRatio: pixelRatio, remainingMs: UPSCALE_PROBE_MS };
      } else if (upscaleProbe !== null && next <= upscaleProbe.fromRatio) {
        failedUpscales += 1;
        upscaleHoldMs = Math.min(
          MAX_UPSCALE_RETRY_MS,
          UPSCALE_RETRY_MS * 2 ** (failedUpscales - 1),
        );
        upscaleProbe = null;
      }
      pixelRatio = next;
      cooldownMs = CHANGE_COOLDOWN_MS;
      return pixelRatio;
    },
  };
}
