import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { describe, expect, it, vi } from "vitest";
import { createImmersiveTownWorld } from "./create-town-world";
import { createTownWalker } from "./town-walker";

describe("the controlled Rivergate builder", () => {
  it("moves a visible grounded character, stops at walls and gates house entry by the character, not the camera", () => {
    const engine = new NullEngine();
    const world = createImmersiveTownWorld(engine, {
      quality: "low",
      attachCameraControls: false,
    });
    const onEnterHouse = vi.fn();
    const walker = createTownWalker(world, null, {
      isBlocked: () => false,
      onNearbyHouse: vi.fn(),
      onEnterHouse,
    });
    try {
      expect(walker.avatar.root.isEnabled()).toBe(false);
      walker.setActive(true);
      const before = walker.position.clone();
      const oldHip = walker.avatar.rig.leftHip.rotation.x;
      walker.nudge("forward");
      expect(walker.position.subtract(before).length()).toBeGreaterThan(0.2);
      expect(walker.avatar.rig.leftHip.rotation.x).not.toBe(oldHip);
      const facing = Vector3.TransformNormal(
        new Vector3(0, 0, -1),
        walker.avatar.rig.root.computeWorldMatrix(true),
      );
      const movement = walker.position.subtract(before).normalize();
      expect(Vector3.Dot(facing.normalize(), movement)).toBeGreaterThan(0.98);
      expect(
        walker.avatar.root.getChildMeshes().every((mesh) => !mesh.isPickable),
      ).toBe(true);
      walker.clearInput();
      expect(walker.avatar.rig.torso.rotation.x).toBeCloseTo(0);
      const heading = walker.avatar.rig.root.rotation.y;
      walker.avatar.update(0, 0, 0.1, 2.5, false);
      expect(walker.avatar.rig.root.rotation.y).toBe(heading);
      const facingBeforeBack = walker.position.clone();
      for (let step = 0; step < 4; step++) walker.nudge("back");
      const backMovement = walker.position
        .subtract(facingBeforeBack)
        .normalize();
      const backFacing = Vector3.TransformNormal(
        new Vector3(0, 0, -1),
        walker.avatar.rig.root.computeWorldMatrix(true),
      ).normalize();
      expect(Vector3.Dot(backFacing, backMovement)).toBeGreaterThan(0.98);

      // A camera near the doorway must not let a distant player enter it.
      const door = walker.doors[0]!;
      walker.position.set(-14, 0.79, -50);
      walker.camera.position.copyFrom(door.approach);
      walker.enterHouse();
      expect(onEnterHouse).not.toHaveBeenCalled();
      walker.position.copyFrom(door.approach);
      walker.camera.position.set(-14, 5, -50);
      walker.enterHouse();
      expect(onEnterHouse).toHaveBeenCalledWith(door.house);

      // Continue until a world obstacle stops us; footsteps must stop too.
      walker.setActive(false);
      walker.setActive(true);
      for (let n = 0; n < 400; n++) walker.nudge("forward");
      const stopped = walker.position.clone();
      const distance = walker.avatar.travelled;
      walker.nudge("forward");
      expect(walker.position.equals(stopped)).toBe(true);
      expect(walker.avatar.travelled).toBe(distance);
      expect(walker.avatar.rig.torso.rotation.x).toBeCloseTo(0);
    } finally {
      walker.dispose();
      world.dispose();
      engine.dispose();
    }
  });
  it("preserves the avatar through day/night and view switches, supports reduced motion, and disposes its meshes", () => {
    const engine = new NullEngine();
    const world = createImmersiveTownWorld(engine, {
      quality: "low",
      attachCameraControls: false,
      reducedMotion: true,
    });
    const walker = createTownWalker(world, null, {
      isBlocked: () => false,
      onNearbyHouse: vi.fn(),
      onEnterHouse: vi.fn(),
    });
    walker.setActive(true);
    walker.nudge("forward");
    const position = walker.position.clone();
    const root = walker.avatar.root;
    world.setTimeOfDay("night");
    expect(walker.position.equals(position)).toBe(true);
    walker.setActive(false);
    walker.setActive(true);
    expect(walker.avatar.root).toBe(root);
    expect(walker.position.equals(position)).toBe(true);
    walker.dispose();
    expect(root.isDisposed()).toBe(true);
    expect(world.scene.getMeshByName("player-backpack")).toBeNull();
    world.dispose();
    engine.dispose();
  });
});
