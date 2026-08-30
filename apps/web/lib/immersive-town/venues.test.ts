import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { describe, expect, it, vi } from "vitest";
import { createImmersiveTownWorld } from "./create-town-world";
import { createTownWalker } from "./town-walker";
import { TOWN_VENUES } from "./venue-catalog";
import { DOWNTOWN_BUILDINGS } from "./metropolis";
import { canWalkAt, nearbyWalkDoor } from "./walking";

describe("every Rivergate destination", () => {
  it("starts at night and indexes the roofs, facades and merged windows of every public building", () => {
    const engine = new NullEngine();
    const world = createImmersiveTownWorld(engine, {
      attachCameraControls: false,
      quality: "low",
    });
    try {
      expect(world.timeOfDay).toBe("night");
      expect(world.houses).toHaveLength(28);
      expect(world.venues).toHaveLength(18);
      expect(new Set(TOWN_VENUES.map((v) => v.id)).size).toBe(18);
      for (const venue of world.venues) {
        expect(venue.meshes.length, venue.venue.id).toBeGreaterThan(0);
        for (const mesh of venue.meshes) {
          expect(mesh.isPickable, mesh.name).toBe(true);
          expect(world.getVenueFromMesh(mesh)?.venue.id, mesh.name).toBe(
            venue.venue.id,
          );
        }
      }
      for (const tower of DOWNTOWN_BUILDINGS) {
        const place = world.venues.find((v) => v.venue.id === tower.id)!;
        expect(place.venue.floors.length).toBe(
          2 + Math.floor((tower.height - 3.5) / 2.8),
        );
        for (const part of ["body", "roof", "lit"]) {
          const mesh = world.scene.getMeshByName(
            `downtown-${tower.id}-${part}`,
          );
          expect(mesh, `${tower.id}-${part}`).not.toBeNull();
          expect(world.getVenueFromMesh(mesh)?.venue.id).toBe(tower.id);
        }
      }
      expect(world.getVenueFromMesh(null)).toBeNull();
    } finally {
      world.dispose();
      engine.dispose();
    }
  });

  it("offers a reachable door for every venue and enters only the nearby destination", () => {
    const engine = new NullEngine();
    const world = createImmersiveTownWorld(engine, {
      attachCameraControls: false,
      quality: "low",
    });
    let blocked = false;
    const onEnter = vi.fn();
    const homeEnter = vi.fn();
    const walker = createTownWalker(world, null, {
      isBlocked: () => blocked,
      onNearbyHouse: vi.fn(),
      onEnterHouse: homeEnter,
      onEnterVenue: onEnter,
    });
    try {
      walker.setActive(true);
      for (const door of walker.venueDoors) {
        expect(canWalkAt(door.approach, walker.obstacles), door.id).toBe(true);
        expect(
          nearbyWalkDoor(door.approach, walker.venueDoors)?.id,
          door.id,
        ).toBe(door.id);
        walker.camera.position.copyFrom(door.approach);
        onEnter.mockClear();
        walker.enterVenue("not-this-building");
        expect(onEnter).not.toHaveBeenCalled();
        walker.enterNearby();
        expect(onEnter.mock.calls[0]?.[0]?.venue.id, door.id).toBe(door.id);
        blocked = true;
        onEnter.mockClear();
        walker.enterNearby();
        expect(onEnter).not.toHaveBeenCalled();
        blocked = false;
      }
      expect(homeEnter).not.toHaveBeenCalled();
      walker.camera.position.set(0, 2, -6);
      onEnter.mockClear();
      walker.enterVenue("hub");
      expect(onEnter).not.toHaveBeenCalled();
    } finally {
      walker.dispose();
      world.dispose();
      engine.dispose();
    }
  });
});
