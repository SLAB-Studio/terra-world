import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { describe, expect, it, vi } from "vitest";

import { createImmersiveTownWorld } from "./create-town-world";
import { createTownWalker } from "./town-walker";
import { canWalkAt, nearbyWalkDoor } from "./walking";

describe("Rivergate walking camera", () => {
  it("keeps a held movement control running when another pointer releases", () => {
    const engine = new NullEngine();
    const world = createImmersiveTownWorld(engine, {
      attachCameraControls: false,
      quality: "low",
      reducedMotion: true,
    });
    const fakeWindow = new EventTarget();
    const fakeDocument = Object.assign(new EventTarget(), {
      visibilityState: "visible",
      activeElement: null,
      querySelector: () => null,
    });
    const fakeCanvas = Object.assign(new EventTarget(), {
      closest: () => null,
      focus: () => undefined,
      parentElement: { contains: () => true },
    });
    vi.stubGlobal("window", fakeWindow);
    vi.stubGlobal("document", fakeDocument);
    vi.spyOn(engine, "getDeltaTime").mockReturnValue(16);
    const walker = createTownWalker(
      world,
      fakeCanvas as unknown as HTMLCanvasElement,
      {
        isBlocked: () => false,
        onNearbyHouse: vi.fn(),
        onEnterHouse: vi.fn(),
      },
    );
    try {
      walker.setActive(true);
      walker.hold("forward", true);
      fakeWindow.dispatchEvent(
        Object.assign(new Event("pointerup"), { pointerId: 2 }),
      );
      const before = walker.camera.position.clone();
      world.scene.onBeforeRenderObservable.notifyObservers(world.scene);
      expect(walker.camera.position.subtract(before).length()).toBeGreaterThan(
        0,
      );
      walker.hold("forward", false);
      const stopped = walker.camera.position.clone();
      world.scene.onBeforeRenderObservable.notifyObservers(world.scene);
      expect(walker.camera.position.equals(stopped)).toBe(true);
      walker.hold("back", true);
      fakeWindow.dispatchEvent(new Event("blur"));
      world.scene.onBeforeRenderObservable.notifyObservers(world.scene);
      expect(walker.camera.position.equals(stopped)).toBe(true);
    } finally {
      walker.dispose();
      world.dispose();
      engine.dispose();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });
  it("switches cameras without losing the aerial pose, homes, or walking position", () => {
    const engine = new NullEngine();
    const world = createImmersiveTownWorld(engine, {
      attachCameraControls: false,
      quality: "low",
      reducedMotion: true,
    });
    const onEnterHouse = vi.fn();
    let isBlocked = false;
    const walker = createTownWalker(world, null, {
      isBlocked: () => isBlocked,
      onNearbyHouse: vi.fn(),
      onEnterHouse,
    });
    const originalCamera = world.camera;
    const originalRadius = world.camera.radius;
    const homes = [...world.houses];
    walker.setActive(true);
    expect(world.scene.activeCamera).toBe(walker.camera);
    expect(canWalkAt(walker.camera.position, walker.obstacles)).toBe(true);
    const firstDoor = walker.doors[0]!;
    walker.camera.position.copyFrom(firstDoor.approach);
    walker.enterHouse();
    expect(onEnterHouse).toHaveBeenCalledOnce();
    isBlocked = true;
    const pausedPosition = walker.camera.position.clone();
    walker.nudge("forward");
    walker.enterHouse();
    expect(walker.camera.position.equals(pausedPosition)).toBe(true);
    expect(onEnterHouse).toHaveBeenCalledOnce();
    isBlocked = false;
    walker.nudge("back");
    const streetPosition = walker.camera.position.clone();
    walker.setActive(false);
    expect(world.scene.activeCamera).toBe(originalCamera);
    expect(world.camera.radius).toBe(originalRadius);
    expect(world.houses).toEqual(homes);
    walker.setActive(true);
    expect(walker.camera.position.equals(streetPosition)).toBe(true);
    walker.dispose();
    expect(world.scene.activeCamera).toBe(originalCamera);
    world.dispose();
    engine.dispose();
  });
  it("registers front doors and safe approaches for all 28 homes", () => {
    const engine = new NullEngine();
    const world = createImmersiveTownWorld(engine, {
      attachCameraControls: false,
      quality: "low",
      reducedMotion: true,
    });
    const walker = createTownWalker(world, null, {
      isBlocked: () => false,
      onNearbyHouse: vi.fn(),
      onEnterHouse: vi.fn(),
    });
    expect(walker.doors).toHaveLength(28);
    for (const door of walker.doors) {
      expect(canWalkAt(door.approach, walker.obstacles), door.id).toBe(true);
      expect(nearbyWalkDoor(door.approach, walker.doors)?.id, door.id).toBe(
        door.id,
      );
    }
    walker.dispose();
    world.dispose();
    engine.dispose();
  });
});
