import { describe, expect, it } from "vitest";
import { createAdaptiveResolution } from "./adaptive-performance";
import {
  getRenderBudget,
  parseRenderQuality,
  sceneQualityForRenderBudget,
  shouldPauseTown,
} from "./render-quality";

const autoBudget = () => getRenderBudget("auto", 2, 1200, 800);
function feed(
  controller: ReturnType<typeof createAdaptiveResolution>,
  frameMs: number,
  durationMs: number,
) {
  const changes: number[] = [];
  for (let elapsed = 0; elapsed < durationMs; elapsed += frameMs) {
    const result = controller.sample(frameMs);
    if (result !== null) changes.push(result);
  }
  return changes;
}

describe("render budgets", () => {
  it("defaults unknown stored values to Auto", () => {
    expect(parseRenderQuality(null)).toBe("auto");
    expect(parseRenderQuality("ultra")).toBe("auto");
    expect(parseRenderQuality("performance")).toBe("performance");
    expect(parseRenderQuality("balanced")).toBe("balanced");
  });
  it("caps Retina pixels and uses a conservative Auto starting resolution", () => {
    expect(autoBudget()).toEqual({
      minPixelRatio: 0.65,
      maxPixelRatio: 1.25,
      initialPixelRatio: 0.9,
      adaptive: true,
    });
    expect(getRenderBudget("balanced", 1, 1000, 600).maxPixelRatio).toBe(1);
    expect(getRenderBudget("performance", 3, 1000, 600).maxPixelRatio).toBe(
      0.85,
    );
    expect(getRenderBudget("auto", NaN, 1000, 600).maxPixelRatio).toBe(1);
  });
  it("bounds framebuffer area on large displays", () => {
    const budget = getRenderBudget("balanced", 2, 2560, 1440);
    expect(2560 * 1440 * budget.maxPixelRatio ** 2).toBeCloseTo(1_800_000);
    expect(budget.minPixelRatio).toBeLessThanOrEqual(budget.maxPixelRatio);
    const large = getRenderBudget("auto", 2, 3840, 2160);
    expect(3840 * 2160 * large.maxPixelRatio ** 2).toBeCloseTo(1_800_000);
    expect(large.initialPixelRatio).toBeLessThanOrEqual(large.maxPixelRatio);
    expect(getRenderBudget("auto", 1, NaN, 0).initialPixelRatio).toBe(0.9);
  });
  it("lowers rendering effects, never city content", () => {
    expect(sceneQualityForRenderBudget("performance", 1)).toBe("low");
    expect(sceneQualityForRenderBudget("auto", 0.8)).toBe("low");
    expect(sceneQualityForRenderBudget("auto", 0.9)).toBe("medium");
    expect(sceneQualityForRenderBudget("balanced", 0.7)).toBe("medium");
  });
  it("pauses when hidden, offscreen, or visiting; resumes only when all clear", () => {
    expect(shouldPauseTown(true, true, false)).toBe(false);
    expect(shouldPauseTown(false, true, false)).toBe(true);
    expect(shouldPauseTown(true, false, false)).toBe(true);
    expect(shouldPauseTown(true, true, true)).toBe(true);
  });
});

describe("adaptive resolution", () => {
  it("does not react during shader/loading warmup or to one slow window", () => {
    const controller = createAdaptiveResolution(autoBudget());
    expect(feed(controller, 40, 3000)).toEqual([]);
    expect(controller.pixelRatio).toBe(0.9);
    expect(feed(controller, 40, 1200)).toEqual([0.8]);
  });
  it("steps down within limits with a cooldown between changes", () => {
    const controller = createAdaptiveResolution(autoBudget());
    expect(feed(controller, 40, 4200)).toEqual([0.8]);
    expect(feed(controller, 40, 2000)).toEqual([]);
    feed(controller, 40, 30_000);
    expect(controller.pixelRatio).toBe(0.65);
    expect(feed(controller, 40, 20_000)).toEqual([]);
  });
  it("requires sustained headroom before increasing and never exceeds the cap", () => {
    const controller = createAdaptiveResolution(autoBudget());
    expect(feed(controller, 1000 / 60, 8000)).toEqual([]);
    expect(feed(controller, 1000 / 60, 2500)).toEqual([1]);
    feed(controller, 1000 / 60, 60_000);
    expect(controller.pixelRatio).toBe(1.25);
  });
  it("does not oscillate in the neutral frame-time band", () => {
    const controller = createAdaptiveResolution(autoBudget());
    expect(feed(controller, 19, 30_000)).toEqual([]);
  });
  it("ignores invalid measurements and suspension gaps, rewarming on resume", () => {
    const controller = createAdaptiveResolution(autoBudget());
    feed(controller, 40, 4200);
    expect(controller.sample(30_000)).toBeNull();
    expect(controller.sample(NaN)).toBeNull();
    expect(controller.sample(-1)).toBeNull();
    expect(feed(controller, 40, 1800)).toEqual([]);
    controller.reset();
    expect(controller.pixelRatio).toBe(0.8);
    expect(feed(controller, 40, 1800)).toEqual([]);
  });
  it("leaves explicit quality choices stable and resets for a changed viewport", () => {
    const controller = createAdaptiveResolution(
      getRenderBudget("performance", 2, 1000, 800),
    );
    expect(feed(controller, 40, 30_000)).toEqual([]);
    expect(controller.pixelRatio).toBe(0.85);
    controller.reset(getRenderBudget("auto", 1, 800, 600));
    expect(controller.pixelRatio).toBe(0.9);
    expect(feed(controller, 40, 4200)).toEqual([0.8]);
  });
});
