import type { Engine } from "@babylonjs/core/Engines/engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startCanvasRenderLoop } from "./canvas-render-loop";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup(
  storedPreference: string | null = null,
  initiallyVisible = true,
) {
  let visible = initiallyVisible;
  let now = 0;
  const events = new EventTarget();
  Object.defineProperty(events, "visibilityState", {
    get: () => (visible ? "visible" : "hidden"),
  });
  vi.stubGlobal("document", events);
  vi.stubGlobal("window", { devicePixelRatio: 2 });
  vi.stubGlobal("localStorage", { getItem: () => storedPreference });
  vi.spyOn(performance, "now").mockImplementation(() => now);
  let onResize: () => void = () => undefined;
  let onIntersection: (entries: { isIntersecting: boolean }[]) => void = () =>
    undefined;
  const resizeDisconnect = vi.fn();
  const intersectionDisconnect = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        onResize = callback;
      }
      observe() {}
      disconnect = resizeDisconnect;
    },
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: typeof onIntersection) {
        onIntersection = callback;
      }
      observe() {}
      disconnect = intersectionDisconnect;
    },
  );
  let frame: () => void = () => undefined;
  const engine = {
    runRenderLoop: vi.fn((callback: () => void) => {
      frame = callback;
    }),
    stopRenderLoop: vi.fn(),
    setHardwareScalingLevel: vi.fn(),
    resize: vi.fn(),
  };
  const canvas = { clientWidth: 1200, clientHeight: 800 };
  const render = vi.fn();
  const onPause = vi.fn();
  const onQuality = vi.fn();
  const loop = startCanvasRenderLoop({
    engine: engine as unknown as Engine,
    canvas: canvas as HTMLCanvasElement,
    render,
    onPause,
    onQuality,
  });
  return {
    loop,
    engine,
    canvas,
    render,
    onPause,
    onQuality,
    resizeDisconnect,
    intersectionDisconnect,
    tick(ms = 16) {
      now += ms;
      frame();
    },
    visibility(value: boolean) {
      visible = value;
      events.dispatchEvent(new Event("visibilitychange"));
    },
    intersection(value: boolean) {
      onIntersection([{ isIntersecting: value }]);
    },
    resize() {
      onResize();
    },
  };
}

describe("interior render lifecycle", () => {
  it("follows the saved Performance budget without enabling shadows", () => {
    const s = setup("performance");
    expect(s.engine.setHardwareScalingLevel).toHaveBeenLastCalledWith(1 / 0.85);
    expect(s.onQuality).toHaveBeenCalledExactlyOnceWith("low");
    expect(s.engine.runRenderLoop).toHaveBeenCalledTimes(1);
    s.tick();
    expect(s.render).toHaveBeenCalledTimes(1);
    s.loop.dispose();
  });
  it("stops hidden/offscreen work and resumes only when both visible, without duplicate loops", () => {
    const s = setup();
    s.tick();
    s.visibility(false);
    expect(s.engine.stopRenderLoop).toHaveBeenCalledTimes(1);
    s.tick();
    expect(s.render).toHaveBeenCalledTimes(1);
    s.intersection(false);
    s.visibility(true);
    expect(s.engine.runRenderLoop).toHaveBeenCalledTimes(1);
    s.intersection(true);
    expect(s.engine.runRenderLoop).toHaveBeenCalledTimes(2);
    s.visibility(true);
    expect(s.engine.runRenderLoop).toHaveBeenCalledTimes(2);
    expect(s.onPause).toHaveBeenCalled();
    s.tick();
    expect(s.render).toHaveBeenCalledTimes(2);
    s.loop.dispose();
  });
  it("does not start behind a hidden tab and cleans all observers idempotently", () => {
    const s = setup(null, false);
    expect(s.engine.runRenderLoop).not.toHaveBeenCalled();
    s.visibility(true);
    expect(s.engine.runRenderLoop).toHaveBeenCalledTimes(1);
    s.loop.dispose();
    s.loop.dispose();
    expect(s.resizeDisconnect).toHaveBeenCalledTimes(1);
    expect(s.intersectionDisconnect).toHaveBeenCalledTimes(1);
    s.visibility(false);
    s.visibility(true);
    s.intersection(true);
    s.tick();
    expect(s.engine.runRenderLoop).toHaveBeenCalledTimes(1);
    expect(s.render).not.toHaveBeenCalled();
  });
  it("adapts in place and resets the warmup after tab suspension", () => {
    const s = setup();
    for (let n = 0; n < 110; n++) s.tick(40);
    expect(s.engine.setHardwareScalingLevel).toHaveBeenLastCalledWith(1 / 0.8);
    expect(s.onQuality).toHaveBeenLastCalledWith("low");
    s.visibility(false);
    s.tick(30_000);
    s.visibility(true);
    for (let n = 0; n < 40; n++) s.tick(40);
    expect(s.engine.setHardwareScalingLevel).toHaveBeenLastCalledWith(1 / 0.8);
    s.loop.dispose();
  });
  it("rebudgets only when viewport dimensions change", () => {
    const s = setup("balanced");
    s.resize();
    s.resize();
    expect(s.engine.resize).toHaveBeenCalledTimes(1);
    s.canvas.clientWidth = 3840;
    s.canvas.clientHeight = 2160;
    s.resize();
    expect(s.engine.resize).toHaveBeenCalledTimes(2);
    expect(s.engine.setHardwareScalingLevel).toHaveBeenLastCalledWith(
      1 / Math.sqrt(1_800_000 / (3840 * 2160)),
    );
    s.loop.dispose();
  });
});
