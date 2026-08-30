import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it, vi } from "vitest";
import { createInteriorWalker } from "./interior-walker";
import { createTownWalker } from "./town-walker";
import { createImmersiveTownWorld } from "./create-town-world";

describe("street and interior running controls", () => {
  it.each([false, true])(
    "supports Shift and touch run, clears on interruptions (indoors: %s)",
    (indoors) => {
      const engine = new NullEngine();
      const world = indoors
        ? null
        : createImmersiveTownWorld(engine, {
            attachCameraControls: false,
            quality: "low",
            reducedMotion: true,
          });
      const scene = world?.scene ?? new Scene(engine);
      const win = new EventTarget();
      let focused = true,
        blocked = false;
      const doc = Object.assign(new EventTarget(), {
        visibilityState: "visible",
        activeElement: null,
        querySelector: () => null,
      });
      const canvas = Object.assign(new EventTarget(), {
        closest: () => null,
        focus: () => {
          focused = true;
        },
        parentElement: { contains: () => focused },
      });
      vi.stubGlobal("window", win);
      vi.stubGlobal("document", doc);
      vi.stubGlobal("HTMLElement", EventTarget);
      vi.spyOn(engine, "getDeltaTime").mockReturnValue(50);
      const walker = world
        ? createTownWalker(world, canvas as unknown as HTMLCanvasElement, {
            isBlocked: () => blocked,
            onNearbyHouse: vi.fn(),
            onEnterHouse: vi.fn(),
          })
        : createInteriorWalker(
            scene,
            canvas as unknown as HTMLCanvasElement,
            () => [],
            { isBlocked: () => blocked },
          );
      const key = (type: string, code: string) => {
        const event = new Event(type, { cancelable: true });
        Object.defineProperties(event, {
          code: { value: code },
          target: { value: canvas },
        });
        win.dispatchEvent(event);
        return event;
      };
      const frame = () => scene.onBeforeRenderObservable.notifyObservers(scene);
      const resetPosition = () => {
        walker.camera.position.set(indoors ? 0 : -40, 2, 0);
        walker.camera.rotation.y = 0;
      };
      try {
        if ("setActive" in walker) walker.setActive(true);
        else walker.enter("living-room");
        resetPosition();
        key("keydown", "KeyW");
        frame();
        const walked = walker.camera.position.z;
        resetPosition();
        expect(key("keydown", "ShiftLeft").defaultPrevented).toBe(false);
        expect(walker.running).toBe(true);
        frame();
        expect(walker.camera.position.z / walked).toBeCloseTo(
          indoors ? 1 / 0.6 : 2,
        );
        key("keyup", "ShiftLeft");
        expect(walker.running).toBe(false);
        key("keyup", "KeyW");
        walker.setRunning(true);
        const still = walker.camera.position.clone();
        frame();
        expect(walker.camera.position.equals(still)).toBe(true); // Toggle doesn't auto-run.
        walker.hold("back", true);
        frame();
        expect(walker.camera.position.equals(still)).toBe(false);
        win.dispatchEvent(new Event("blur"));
        frame();
        expect(walker.running).toBe(false);
        const stopped = walker.camera.position.clone();
        frame();
        expect(walker.camera.position.equals(stopped)).toBe(true);
        walker.setRunning(true);
        focused = false;
        frame();
        focused = true;
        expect(walker.running).toBe(false);
        walker.setRunning(true);
        blocked = true;
        frame();
        blocked = false;
        expect(walker.running).toBe(false);
        walker.setRunning(true);
        doc.dispatchEvent(new Event("visibilitychange"));
        expect(walker.running).toBe(false);
        walker.setRunning(true);
        if ("setActive" in walker) walker.setActive(false);
        else walker.stop();
        expect(walker.running).toBe(false);
        walker.setRunning(true); // An inactive controller cannot start running.
        expect(walker.running).toBe(false);
      } finally {
        walker.dispose();
        world?.dispose();
        if (!world) scene.dispose();
        engine.dispose();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
      }
    },
  );
});
