import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { describe, expect, it, vi } from "vitest";
import {
  createHouseInteriorWorld,
  INTERIOR_ROOMS,
  type InteriorRoomId,
} from "./house-interior-world";
import {
  canWalkInside,
  interiorRoomAt,
  nearbyInteriorTask,
  ROOM_STARTS,
  stepInterior,
} from "./interior-navigation";
import { createInteriorWalker } from "./interior-walker";
import { Scene } from "@babylonjs/core/scene";

describe("walkable 3D home", () => {
  it("reserves future bin space and keeps the player mobile after recycling is repaired", () => {
    const engine = new NullEngine();
    const world = createHouseInteriorWorld(engine, "sunny", []);
    try {
      world.focusRoom("utility-room");
      for (const x of [2.4, 4.2, 6]) {
        expect(canWalkInside({ x, z: 2.9 }, world.walker.obstacles)).toBe(
          false,
        );
        expect(
          world.scene
            .getMeshByName(`utility-sorting-stand-${[2.4, 4.2, 6].indexOf(x)}`)
            ?.isEnabled(),
        ).toBe(true);
      }
      world.walker.camera.position.set(2.4, 2.25, 1.55);
      world.walker.camera.rotation.y = 0;
      expect(nearbyInteriorTask(world.walker.camera.position)).toBe(
        "utility-room",
      );
      expect(
        canWalkInside(world.walker.camera.position, world.walker.obstacles),
      ).toBe(true);
      const before = world.walker.camera.position.clone();
      world.setInstalled(["recycle"]);
      expect(world.walker.camera.position.equals(before)).toBe(true);
      expect(
        canWalkInside(world.walker.camera.position, world.walker.obstacles),
      ).toBe(true);
      world.walker.nudge("back");
      expect(world.walker.camera.position.z).toBeLessThan(before.z);
    } finally {
      world.dispose();
      engine.dispose();
    }
  });
  it("clears held movement on blur, hidden dialogs, and lost focus; a second finger does not stop walking", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const fakeWindow = new EventTarget();
    const dialog = { open: true };
    let focused = true;
    const fakeDocument = Object.assign(new EventTarget(), {
      visibilityState: "visible",
      activeElement: null,
    });
    const fakeCanvas = Object.assign(new EventTarget(), {
      closest: (selector: string) => (selector === "dialog" ? dialog : null),
      focus: () => {
        focused = true;
      },
      parentElement: { contains: () => focused },
    });
    vi.stubGlobal("window", fakeWindow);
    vi.stubGlobal("document", fakeDocument);
    vi.spyOn(engine, "getDeltaTime").mockReturnValue(16);
    const walker = createInteriorWalker(
      scene,
      fakeCanvas as unknown as HTMLCanvasElement,
      () => [],
    );
    const frame = () => scene.onBeforeRenderObservable.notifyObservers(scene);
    try {
      walker.enter("living-room");
      const before = walker.camera.position.clone();
      walker.hold("forward", true);
      fakeCanvas.dispatchEvent(
        Object.assign(new Event("pointerup"), { pointerId: 2 }),
      );
      frame();
      expect(walker.camera.position.equals(before)).toBe(false);
      const stopped = walker.camera.position.clone();
      fakeWindow.dispatchEvent(new Event("blur"));
      frame();
      expect(walker.camera.position.equals(stopped)).toBe(true);
      walker.hold("forward", true);
      focused = false;
      frame();
      focused = true;
      frame();
      expect(walker.camera.position.equals(stopped)).toBe(true);
      walker.hold("forward", true);
      dialog.open = false;
      frame();
      dialog.open = true;
      frame();
      expect(walker.camera.position.equals(stopped)).toBe(true);
      walker.hold("forward", true);
      fakeDocument.visibilityState = "hidden";
      fakeDocument.dispatchEvent(new Event("visibilitychange"));
      fakeDocument.visibilityState = "visible";
      frame();
      expect(walker.camera.position.equals(stopped)).toBe(true);
    } finally {
      walker.dispose();
      expect(scene.onBeforeRenderObservable.hasObservers()).toBe(false);
      scene.dispose();
      engine.dispose();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  });
  it("uses an eye-level camera, preserves position on room updates, and toggles the cutaway enclosure", () => {
    const engine = new NullEngine();
    const onRoomChange = vi.fn();
    const world = createHouseInteriorWorld(engine, "sunny", [], {
      onRoomChange,
    });
    try {
      world.focusRoom("living-room");
      expect(world.scene.activeCamera?.name).toBe("walking-party-camera");
      expect(world.walker.camera.position.y).toBe(2.25);
      expect(world.scene.getMeshByName("interior-ceiling")?.isEnabled()).toBe(
        true,
      );
      const before = world.walker.camera.position.clone();
      world.walker.nudge("forward");
      expect(world.walker.camera.position.equals(before)).toBe(false);
      const moved = world.walker.camera.position.clone();
      world.focusRoom("living-room");
      expect(world.walker.camera.position.equals(moved)).toBe(true);
      world.setInstalled(["light"]);
      expect(world.walker.camera.position.equals(moved)).toBe(true);
      expect(world.rooms[0]?.healthy.isEnabled()).toBe(true);
      world.focusRoom(null);
      expect(world.scene.activeCamera).toBe(world.camera);
      expect(world.scene.getMeshByName("interior-ceiling")?.isEnabled()).toBe(
        false,
      );
      expect(world.walker.active).toBe(false);
    } finally {
      world.dispose();
      engine.dispose();
    }
  });

  it("has walkable connected doorways and reachable repairs in all four rooms, before and after upgrades", () => {
    const engine = new NullEngine();
    const world = createHouseInteriorWorld(engine, "bluebell", []);
    try {
      world.focusRoom("living-room");
      for (const installed of [
        [],
        ["light", "water", "garden", "recycle"],
      ] as const) {
        world.setInstalled(installed);
        const obstacles = world.walker.obstacles;
        for (const start of Object.values(ROOM_STARTS))
          expect(canWalkInside(start, obstacles)).toBe(true);
        // Explore a fine grid using the SAME swept collision routine as the camera.
        const queue = [{ x: -1.4, z: -3.05, yaw: 0 }];
        const visited = new Set<string>();
        const reachableRooms = new Set<InteriorRoomId>();
        const reachableTasks = new Set<InteriorRoomId>();
        for (let i = 0; i < queue.length; i++) {
          const pose = queue[i]!;
          reachableRooms.add(interiorRoomAt(pose));
          const task = nearbyInteriorTask(pose);
          if (task) reachableTasks.add(task);
          for (const input of [
            { forward: 1, right: 0, turn: 0 },
            { forward: -1, right: 0, turn: 0 },
            { forward: 0, right: 1, turn: 0 },
            { forward: 0, right: -1, turn: 0 },
          ]) {
            const next = stepInterior(pose, input, 0.05, obstacles);
            const key = `${Math.round(next.x / 0.1)},${Math.round(next.z / 0.1)}`;
            if (!visited.has(key)) {
              visited.add(key);
              queue.push(next);
            }
          }
        }
        expect([...reachableRooms].sort()).toEqual(
          INTERIOR_ROOMS.map((r) => r.id).sort(),
        );
        expect([...reachableTasks].sort()).toEqual(
          INTERIOR_ROOMS.map((r) => r.id).sort(),
        );
        for (const point of [
          { x: 0, z: 1 },
          { x: -4, z: 0 },
          { x: 4.2, z: -1.9 },
          { x: -4.1, z: -4.4 },
        ])
          expect(canWalkInside(point, obstacles)).toBe(false);
      }
    } finally {
      world.dispose();
      engine.dispose();
    }
  });

  it("changes rooms through doors and only interacts near a task", () => {
    const engine = new NullEngine();
    const onRoomChange = vi.fn(),
      onInteract = vi.fn();
    const world = createHouseInteriorWorld(engine, "mango", [], {
      onRoomChange,
      onInteract,
    });
    try {
      world.focusRoom("living-room");
      world.walker.interact();
      expect(onInteract).not.toHaveBeenCalled();
      world.walker.camera.rotation.y = 0;
      for (let i = 0; i < 10; i++) world.walker.nudge("forward");
      expect(world.walker.room).toBe("garden-room");
      expect(onRoomChange).toHaveBeenLastCalledWith("garden-room");
      world.walker.camera.position.set(-4.1, 2.25, 1.2);
      world.walker.interact();
      expect(onInteract).toHaveBeenCalledWith("garden-room");
      world.focusRoom(null);
      world.walker.interact();
      expect(onInteract).toHaveBeenCalledTimes(1);
    } finally {
      world.dispose();
      engine.dispose();
    }
  });
});
