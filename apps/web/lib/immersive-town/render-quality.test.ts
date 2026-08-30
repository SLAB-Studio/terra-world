import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { describe, expect, it } from "vitest";
import { createImmersiveTownWorld } from "./create-town-world";

describe("city quality changes", () => {
  it("changes effects in place without removing homes, venues, residents or camera state", () => {
    const engine = new NullEngine();
    const world = createImmersiveTownWorld(engine, {
      attachCameraControls: false,
      quality: "medium",
      reducedMotion: true,
    });
    try {
      const meshes = [...world.scene.meshes];
      const transformNodes = [...world.scene.transformNodes];
      const materials = [...world.scene.materials];
      const camera = world.camera;
      const houseIds = world.houses.map((home) => home.id);
      const venueIds = world.venues.map((place) => place.venue.id);
      const residentIds = world.residents.life.states.map(
        (resident) => resident.id,
      );
      expect(houseIds).toHaveLength(28);
      expect(venueIds).toHaveLength(18);
      expect(residentIds).toHaveLength(32);
      world.camera.alpha = 0.4;
      expect(world.timeOfDay).toBe("night");
      expect(world.scene.shadowsEnabled).toBe(true);
      for (const quality of ["low", "medium", "low", "high"] as const) {
        world.setRenderQuality(quality);
        expect(world.scene.shadowsEnabled).toBe(quality !== "low");
        expect(world.scene.meshes).toEqual(meshes);
        expect(world.scene.transformNodes).toEqual(transformNodes);
        expect(world.scene.materials).toEqual(materials);
        expect(world.camera).toBe(camera);
        expect(world.camera.alpha).toBe(0.4);
        expect(world.houses.map((home) => home.id)).toEqual(houseIds);
        expect(world.venues.map((place) => place.venue.id)).toEqual(venueIds);
        expect(
          world.residents.life.states.map((resident) => resident.id),
        ).toEqual(residentIds);
        for (const home of world.houses) {
          expect(world.getHouseFromMesh(home.pickMesh)?.id).toBe(home.id);
          expect(home.pickMesh.isPickable).toBe(true);
        }
        for (const place of world.venues) {
          expect(world.getVenueFromMesh(place.meshes[0]!)?.venue.id).toBe(
            place.venue.id,
          );
        }
      }
    } finally {
      world.dispose();
      engine.dispose();
    }
    expect(() => world.setRenderQuality("low")).not.toThrow();
  });
});
