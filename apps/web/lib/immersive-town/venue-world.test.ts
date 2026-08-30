import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { describe, expect, it, vi } from "vitest";
import { TOWN_VENUES, venueFloorDescription } from "./venue-catalog";
import { createVenueWorld, VENUE_LIMITS, VENUE_START } from "./venue-world";
import { canWalkInside, stepInterior } from "./interior-navigation";

describe("purpose-built public interiors", () => {
  it("describes the actual floor and gives repeated layouts honest shared-use names", () => {
    for (const venue of TOWN_VENUES) {
      const labelsByUse = new Map<string, Set<string>>();
      venue.floors.forEach((floor, index) => {
        const names = labelsByUse.get(floor.use) ?? new Set<string>();
        names.add(floor.label.replace(/^\d+ · /, ""));
        labelsByUse.set(floor.use, names);
        if (floor.use === "roof") {
          expect(venueFloorDescription(venue, index)).toContain(
            "open-air terrace",
          );
          expect(venueFloorDescription(venue, index)).not.toContain(
            "bookshelves",
          );
        }
      });
      for (const names of labelsByUse.values()) expect(names.size).toBe(1);
    }
  });
  it("builds every advertised floor with safe spawn, an uninterrupted entrance-to-lift route and bounded movement", () => {
    const engine = new NullEngine();
    try {
      for (const venue of TOWN_VENUES)
        for (let i = 0; i < venue.floors.length; i++) {
          const world = createVenueWorld(engine, venue, i, "night");
          try {
            expect(
              canWalkInside(VENUE_START, world.obstacles, VENUE_LIMITS),
              `${venue.id} ${i} spawn`,
            ).toBe(true);
            expect(world.scene.activeCamera?.name).toBe("walking-party-camera");
            for (let z = -8; z <= 8; z += 0.25)
              expect(
                canWalkInside({ x: 0, z }, world.obstacles, VENUE_LIMITS),
                `${venue.id} ${i} hallway ${z}`,
              ).toBe(true);
            let pose = { ...VENUE_START };
            for (let step = 0; step < 300; step++)
              pose = stepInterior(
                pose,
                { forward: 1, right: 0, turn: 0 },
                0.05,
                world.obstacles,
                VENUE_LIMITS,
              );
            expect(pose.z).toBeLessThanOrEqual(VENUE_LIMITS.maxZ);
            expect(pose.z).toBeGreaterThan(7.9);
            expect(world.scene.meshes.length).toBeGreaterThan(25);
          } finally {
            world.dispose();
          }
          expect(engine.scenes).toHaveLength(0);
        }
    } finally {
      engine.dispose();
    }
  });

  it("uses place-specific architecture instead of a generic home layout", () => {
    const fixtures: Record<string, string> = {
      library: "book-",
      science: "microscope",
      studios: "mixing-fader",
      hub: "reception-desk",
      bookshop: "book-",
      arts: "gallery-plinth",
      cafe: "espresso",
      workshop: "vice",
      school: "classroom-board",
      clinic: "exam-bed",
      "district-apartments-west": "mailbox",
      market: "market-canopy",
      playground: "slide",
      "bus-0": "shelter-roof",
      dock: "river-water",
    };
    const engine = new NullEngine();
    try {
      for (const [id, fixture] of Object.entries(fixtures)) {
        const world = createVenueWorld(
          engine,
          TOWN_VENUES.find((v) => v.id === id)!,
          0,
          "night",
        );
        expect(
          world.scene.meshes.some((mesh) => mesh.name.startsWith(fixture)),
          `${id}: ${fixture}`,
        ).toBe(true);
        world.dispose();
      }
    } finally {
      engine.dispose();
    }
  });

  it("interacts with the exit and lift only at their real locations, and preserves position otherwise", () => {
    const engine = new NullEngine();
    const exit = vi.fn(),
      lift = vi.fn();
    const world = createVenueWorld(engine, TOWN_VENUES[0]!, 1, "night", {
      onExit: exit,
      onLift: lift,
    });
    try {
      world.walker.interact();
      expect(exit).not.toHaveBeenCalled();
      expect(lift).not.toHaveBeenCalled();
      world.walker.camera.position.z = 7.7;
      world.walker.interact();
      expect(lift).toHaveBeenCalledOnce();
      const pose = world.walker.camera.position.clone();
      world.walker.enter("floor");
      expect(world.walker.camera.position.equals(pose)).toBe(true);
      world.walker.camera.position.z = -7.7;
      world.walker.interact();
      expect(exit).toHaveBeenCalledOnce();
    } finally {
      world.dispose();
      engine.dispose();
    }
  });
});
