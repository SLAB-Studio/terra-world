import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it, vi } from "vitest";
import { createWalkingParty, walkingPartyFor } from "./walking-party";

describe("shared player and Leo presentation", () => {
  it.each([false, true])(
    "keeps gameplay coordinates authoritative and disposes its scene resources (indoors: %s)",
    async (indoors) => {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      const pose = new UniversalCamera(
        "logical-walker",
        new Vector3(0, 2, 0),
        scene,
      );
      const observers = scene.onBeforeRenderObservable.observers.length;
      const party = createWalkingParty(scene, pose, {
        indoors,
        obstacles: () => [],
        canStand: () => true,
        groundHeight: () => (indoors ? 0.275 : 0.75),
      });
      try {
        party.setActive(true);
        for (let frame = 0; frame < 240; frame++) {
          pose.position.z += 1.8 / 60;
          const expected = pose.position.clone();
          party.update(1 / 60);
          expect(pose.position.equals(expected)).toBe(true);
          expect(party.player.position.z).toBe(pose.position.z);
        }
        expect(scene.activeCamera?.name).toBe("walking-party-camera");
        expect(party.leo.position.x).toBeCloseTo(0.95, 1);
        expect(Math.abs(party.leo.position.z - pose.position.z)).toBeLessThan(
          0.5,
        );
        expect(party.player.position.y).toBe(indoors ? 0.275 : 0.75);
        expect(party.leo.position.y).toBe(party.player.position.y);
        party.setActive(false);
        expect(party.root.isEnabled()).toBe(false);
        party.setActive(true);
        expect(walkingPartyFor(scene)).toBe(party);
        party.dispose();
        expect(walkingPartyFor(scene)).toBeUndefined();
        expect(scene.getTransformNodeByName("walking-party")).toBeNull();
        expect(scene.cameras).toHaveLength(1);
        // Babylon defers the physical removal of an unregistered observer.
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(scene.onBeforeRenderObservable.observers.length).toBe(observers);
      } finally {
        party.dispose();
        scene.dispose();
        engine.dispose();
      }
    },
  );
  it("keeps horizontal space for the pair when the viewport becomes portrait", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const pose = new UniversalCamera("logical-walker", Vector3.Zero(), scene);
    const ratio = vi.spyOn(engine, "getAspectRatio").mockReturnValue(0.5);
    const party = createWalkingParty(scene, pose, {
      obstacles: () => [],
      canStand: () => true,
      groundHeight: () => 0,
    });
    try {
      party.setActive(true);
      expect(party.camera.fovMode).toBe(
        UniversalCamera.FOVMODE_HORIZONTAL_FIXED,
      );
      ratio.mockReturnValue(1.5);
      party.update(1 / 60);
      expect(party.camera.fovMode).toBe(UniversalCamera.FOVMODE_VERTICAL_FIXED);
    } finally {
      ratio.mockRestore();
      party.dispose();
      scene.dispose();
      engine.dispose();
    }
  });
});
