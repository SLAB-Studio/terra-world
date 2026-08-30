import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { describe, expect, it, vi } from "vitest";
import { createImmersiveTownWorld } from "./create-town-world";
import { createTownWalker } from "./town-walker";
import { createBuildingTraversal } from "./building-traversal";
import { canWalkInside, INTERIOR_EYE_HEIGHT } from "./interior-navigation";
import { VENUE_LIMITS } from "./venue-world";
import { WALK_EYE_HEIGHT } from "./walking";
import type { InteriorUpgradeId } from "./house-interior-world";
import {
  neighborhoodHomeProfile,
  startingNeighborhoodUpgrades,
} from "./neighborhood-home-stories";

function setup(reduced = true) {
  const engine = new NullEngine();
  const world = createImmersiveTownWorld(engine, {
    attachCameraControls: false,
    quality: "low",
    reducedMotion: true,
  });
  let blocked = false;
  const installed: Record<string, readonly InteriorUpgradeId[]> = {};
  const onRepair = vi.fn((id: string, upgrade: InteriorUpgradeId) => {
    installed[id] = [...(installed[id] ?? []), upgrade];
  });
  const onError = vi.fn();
  const street = createTownWalker(world, null, {
    isBlocked: () => false,
    onNearbyHouse: vi.fn(),
    onEnterHouse: vi.fn(),
  });
  const traversal = createBuildingTraversal(world, street, {
    isBlocked: () => blocked,
    reducedMotion: () => reduced,
    upgrades: (id) => installed[id] ?? [],
    onRepair,
    onError,
    onChange: vi.fn(),
    onRoom: vi.fn(),
    onNearby: vi.fn(),
    onLift: vi.fn(),
  });
  const tick = (count = 1) => {
    for (let i = 0; i < count; i++) {
      world.residents.update(0.05, reduced);
      traversal.update(0.05);
    }
  };
  return {
    engine,
    world,
    street,
    traversal,
    onRepair,
    onError,
    installed,
    tick,
    block: (next: boolean) => {
      blocked = next;
    },
    dispose() {
      traversal.dispose();
      street.dispose();
      world.dispose();
      engine.dispose();
    },
  };
}

describe("walk-through building entrances", () => {
  it("opens a shared hinge, enters at eye level, and returns through the same door without rebuilding the city", () => {
    const s = setup(false);
    try {
      const aerial = s.world.camera;
      const radius = aerial.radius;
      expect(s.traversal.open("sunny")).toBe(true);
      const porch = s.street.camera.position.clone();
      const approach = s.street.doors.find((d) => d.id === "sunny")!.approach;
      expect(porch.y).toBeCloseTo(
        s.street.groundHeight(approach) + WALK_EYE_HEIGHT,
      );
      expect(s.traversal.phase).toBe("opening");
      expect(s.traversal.open("bluebell")).toBe(false);
      s.tick(10);
      expect(
        s.world.scene.getTransformNodeByName("resident-sunny-door-hinge"),
      ).not.toBeNull();
      expect(s.street.camera.position.subtract(porch).length()).toBeGreaterThan(
        0,
      );
      s.tick(40);
      expect(s.traversal.phase).toBe("inside");
      expect(s.traversal.scene.getEngine()).toBe(s.engine);
      expect(s.engine.scenes).toHaveLength(2);
      expect(s.traversal.walker.camera.position.y).toBe(INTERIOR_EYE_HEIGHT);
      expect(s.traversal.walker.camera.position.z).toBeCloseTo(-4.9);
      s.traversal.leave();
      s.tick(40);
      expect(s.traversal.phase).toBe("outside");
      expect(s.street.camera.position.equalsWithEpsilon(porch)).toBe(true);
      expect(s.world.scene.activeCamera).toBe(s.street.camera);
      expect(s.engine.scenes).toHaveLength(1);
      expect(s.world.camera).toBe(aerial);
      expect(aerial.radius).toBe(radius);
      expect(s.world.houses).toHaveLength(28);
    } finally {
      s.dispose();
    }
  });

  it("freezes transitions while blocked and snaps safely for reduced motion", () => {
    const s = setup();
    try {
      s.traversal.open("sunny");
      s.block(true);
      const p = s.street.camera.position.clone();
      s.tick(60);
      expect(s.traversal.phase).toBe("opening");
      expect(s.street.camera.position.equals(p)).toBe(true);
      s.block(false);
      s.tick(2);
      expect(s.traversal.phase).toBe("inside");
      s.traversal.leave();
      s.tick(2);
      expect(s.traversal.phase).toBe("outside");
    } finally {
      s.dispose();
    }
  });

  it("keeps all 28 homes and 18 venues enterable with only one loaded interior", () => {
    const s = setup();
    try {
      const ids = [
        ...new Set([
          ...s.world.houses.map((h) => h.id),
          ...s.world.venues.map((v) => v.venue.id),
        ]),
      ];
      for (const id of ids) {
        s.street.setActive(false);
        expect(s.traversal.open(id), id).toBe(true);
        s.tick(2);
        expect(s.traversal.phase, id).toBe("inside");
        expect(s.engine.scenes, id).toHaveLength(2);
        const walker = s.traversal.walker;
        expect(
          canWalkInside(
            walker.camera.position,
            walker.obstacles,
            s.traversal.visit?.kind === "venue" ? VENUE_LIMITS : undefined,
          ),
          id,
        ).toBe(true);
        s.traversal.leave();
        s.tick(2);
        expect(s.traversal.phase, id).toBe("outside");
        expect(s.engine.scenes, id).toHaveLength(1);
      }
      expect(s.onError).not.toHaveBeenCalled();
    } finally {
      s.dispose();
    }
  });

  it("does not teleport a walking player across town to a distant entrance", () => {
    const s = setup();
    try {
      s.street.setActive(true);
      const distant = s.street.doors.find(
        (d) =>
          Math.hypot(
            d.x - s.street.camera.position.x,
            d.z - s.street.camera.position.z,
          ) > 20,
      )!;
      const before = s.street.camera.position.clone();
      expect(s.traversal.open(distant.id)).toBe(false);
      expect(s.street.camera.position.equals(before)).toBe(true);
      expect(s.traversal.phase).toBe("outside");
    } finally {
      s.dispose();
    }
  });

  it("keeps repairs tied to the entered home and exits by physically crossing its threshold", () => {
    const s = setup();
    try {
      s.traversal.open("sunny");
      s.tick(2);
      s.traversal.walker.camera.position.set(-6.8, 2.25, -3);
      s.traversal.interact();
      expect(s.onRepair).toHaveBeenCalledWith("sunny", "light");
      const atLamp = s.traversal.walker.camera.position.clone();
      s.traversal.syncUpgrades();
      expect(s.traversal.walker.camera.position.equals(atLamp)).toBe(true);
      s.traversal.leave();
      expect(s.traversal.phase).toBe("inside");
      s.traversal.walker.camera.position.set(-1.4, 2.25, -6.3);
      s.tick();
      expect(s.traversal.phase).toBe("leaving");
      s.tick(2);
      expect(s.traversal.phase).toBe("outside");
    } finally {
      s.dispose();
    }
  });

  it("changes floors only at a lift and requires ground-floor departure", () => {
    const s = setup();
    try {
      const venue = s.world.venues.find((v) => v.venue.floors.length > 1)!;
      s.traversal.open(venue.venue.id);
      s.tick(2);
      expect(s.traversal.changeFloor(1)).toBe(false);
      s.traversal.walker.camera.position.set(0, 2.25, 7);
      s.traversal.interact();
      expect(s.traversal.changeFloor(1)).toBe(true);
      expect(s.traversal.visit?.floor).toBe(1);
      expect(s.engine.scenes).toHaveLength(2);
      s.traversal.walker.camera.position.set(0, 2.25, -8.1);
      s.traversal.leave();
      expect(s.traversal.phase).toBe("inside");
      expect(s.onError).toHaveBeenCalledWith(
        expect.stringContaining("ground floor"),
      );
    } finally {
      s.dispose();
    }
  });

  it.each(["district-apartments-west", "district-apartments-east"])(
    "preserves repairs, floor visits and the entrance at %s without a popup",
    (id) => {
      const s = setup();
      try {
        const profile = neighborhoodHomeProfile(id);
        s.installed[id] = startingNeighborhoodUpgrades(profile.need);
        s.traversal.open(id);
        s.tick(2);
        expect(s.traversal.visit?.kind).toBe("venue");
        const scene = s.traversal.scene;
        const walker = s.traversal.walker;
        walker.camera.position.set(-6, INTERIOR_EYE_HEIGHT, 0.6);
        expect(
          canWalkInside(walker.camera.position, walker.obstacles, VENUE_LIMITS),
        ).toBe(true);
        const position = walker.camera.position.clone();
        s.traversal.interact();
        expect(s.onRepair).toHaveBeenCalledExactlyOnceWith(id, profile.need);
        s.traversal.syncUpgrades();
        s.traversal.interact();
        expect(s.onRepair).toHaveBeenCalledTimes(1);
        expect(s.traversal.scene).toBe(scene);
        expect(walker.camera.position.equals(position)).toBe(true);
        expect(s.engine.scenes).toHaveLength(2);
        walker.camera.position.set(0, INTERIOR_EYE_HEIGHT, 7);
        s.traversal.interact();
        expect(s.traversal.changeFloor(1)).toBe(true);
        s.traversal.walker.camera.position.set(0, INTERIOR_EYE_HEIGHT, 7);
        s.traversal.interact();
        expect(s.traversal.changeFloor(0)).toBe(true);
        s.traversal.walker.camera.position.set(0, INTERIOR_EYE_HEIGHT, -8.15);
        s.traversal.interact();
        s.tick(2);
        expect(s.traversal.phase).toBe("outside");
        expect(s.engine.scenes).toHaveLength(1);
      } finally {
        s.dispose();
      }
    },
  );
});
