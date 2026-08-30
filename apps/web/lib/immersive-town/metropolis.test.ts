import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { describe, expect, it, vi } from "vitest";
import { createImmersiveTownWorld } from "./create-town-world";
import { DOWNTOWN_BUILDINGS } from "./metropolis";
import { createTownWalker } from "./town-walker";
import { canWalkAt, walkingRoadHeight } from "./walking";
import {
  createTrafficSimulation,
  getVehicleTransforms,
  stepTraffic,
  MIN_BUMPER_GAP_METERS,
} from "./traffic";
import { forwardRoadDistance } from "./road";
import { createVehicleFleet } from "./vehicles-3d";

const setup = () => {
  const engine = new NullEngine();
  const world = createImmersiveTownWorld(engine, {
    attachCameraControls: false,
    reducedMotion: true,
    quality: "low",
  });
  const walker = createTownWalker(world, null, {
    isBlocked: () => false,
    onNearbyHouse: vi.fn(),
    onEnterHouse: vi.fn(),
  });
  return {
    engine,
    world,
    walker,
    dispose() {
      walker.dispose();
      world.dispose();
      engine.dispose();
    },
  };
};

describe("Rivergate metropolitan district", () => {
  it("adds a varied commercial skyline without replacing or blocking homes, roads or the canal", () => {
    const { world, walker, dispose } = setup();
    try {
      expect(world.houses).toHaveLength(28);
      expect(DOWNTOWN_BUILDINGS).toHaveLength(8);
      expect(
        new Set(DOWNTOWN_BUILDINGS.map((building) => building.height)).size,
      ).toBeGreaterThan(5);
      for (const building of DOWNTOWN_BUILDINGS) {
        expect(canWalkAt(building, walker.obstacles), building.id).toBe(false);
        for (let x = building.x - 4; x <= building.x + 4; x += 1) {
          for (let z = building.z - 4; z <= building.z + 4; z += 1) {
            expect(
              walkingRoadHeight({ x, z }),
              `${building.id} overlaps road ${x},${z}`,
            ).toBeNull();
            expect(
              canWalkAt({ x, z }, []),
              `${building.id} overlaps water/boundary`,
            ).toBe(true);
          }
        }
        for (const home of world.houses) {
          home.pickMesh.computeWorldMatrix(true);
          const { minimumWorld: min, maximumWorld: max } =
            home.pickMesh.getBoundingInfo().boundingBox;
          const overlaps =
            building.x + 4 >= min.x &&
            building.x - 4 <= max.x &&
            building.z + 4 >= min.z &&
            building.z - 4 <= max.z;
          expect(overlaps, `${building.id} overlaps ${home.id}`).toBe(false);
        }
      }
      for (const door of walker.doors)
        expect(canWalkAt(door.approach, walker.obstacles), door.id).toBe(true);
      const people = world.scene.transformNodes.filter((node) =>
        /^character-downtown-resident-\d+$/.test(node.name),
      );
      expect(people.length).toBe(12);
      for (const x of [-14.15, -12.85]) {
        for (let z = -62; z <= -16; z += 0.5) {
          expect(
            canWalkAt({ x, z }, walker.obstacles),
            `boulevard ${x},${z}`,
          ).toBe(true);
          expect(walkingRoadHeight({ x, z })).toBeNull();
        }
      }
    } finally {
      dispose();
    }
  });

  it("changes the 3D sky, lamps and windows without recreating the world or changing the walking camera", () => {
    const { world, walker, dispose } = setup();
    try {
      walker.setActive(true);
      const camera = world.scene.activeCamera;
      const position = walker.camera.position.clone();
      const houses = world.houses;
      const counts = [
        world.scene.meshes.length,
        world.scene.materials.length,
        world.scene.lights.length,
      ];
      const daylight = world.scene.clearColor.clone();
      const material = world.scene.getMaterialByName(
        "downtown-lit-windows",
      ) as StandardMaterial;
      for (let repeat = 0; repeat < 12; repeat++) {
        world.setTimeOfDay("night");
        expect(world.timeOfDay).toBe("night");
        expect(world.scene.clearColor.b).toBeLessThan(daylight.b);
        expect(world.scene.getMeshByName("rivergate-moon")?.isEnabled()).toBe(
          true,
        );
        expect(material.emissiveColor.r).toBeGreaterThan(0.7);
        expect(
          world.scene
            .getTransformNodeByName("streetlight-night-pools")
            ?.isEnabled(),
        ).toBe(true);
        world.setTimeOfDay("day");
        expect(world.timeOfDay).toBe("day");
        expect(world.scene.clearColor.equals(daylight)).toBe(true);
        expect(world.scene.getMeshByName("rivergate-moon")?.isEnabled()).toBe(
          false,
        );
        expect(material.emissiveColor.r).toBe(0);
      }
      expect(world.scene.activeCamera).toBe(camera);
      expect(walker.camera.position.equals(position)).toBe(true);
      expect(world.houses).toBe(houses);
      expect([
        world.scene.meshes.length,
        world.scene.materials.length,
        world.scene.lights.length,
      ]).toEqual(counts);
      expect(world.scene.lights).toHaveLength(4);
      expect(
        world.scene.getMeshByName("streetlight-pools")?.hasVertexAlpha,
      ).toBe(true);
    } finally {
      dispose();
    }
  });

  it("keeps all eighteen vehicles safely spaced and makes headlights follow the car only at night", () => {
    const { world, dispose } = setup();
    const fleet = createVehicleFleet(
      world.scene,
      createTrafficSimulation().vehicles.map((v) => v.id),
    );
    try {
      let traffic = createTrafficSimulation();
      expect(traffic.vehicles).toHaveLength(18);
      for (let tick = 0; tick < 600; tick++) {
        traffic = stepTraffic(traffic, 0.1);
        for (const vehicle of traffic.vehicles) {
          for (const other of traffic.vehicles) {
            if (vehicle.id === other.id || vehicle.laneId !== other.laneId)
              continue;
            const distance = forwardRoadDistance(
              vehicle.progress,
              other.progress,
              vehicle.laneId === "clockwise" ? 1 : -1,
            );
            expect(
              distance - (vehicle.lengthMeters + other.lengthMeters) / 2,
            ).toBeGreaterThanOrEqual(MIN_BUMPER_GAP_METERS - 1e-6);
          }
        }
      }
      fleet.sync(getVehicleTransforms(traffic), traffic.elapsedSeconds);
      fleet.setNight(true);
      const pools = world.scene.getTransformNodeByName(
        "sunny-bus-headlight-pools",
      )!;
      expect(pools.isEnabled()).toBe(true);
      expect(pools.parent?.name).toBe("traffic-sunny-bus");
      fleet.setNight(false);
      expect(pools.isEnabled()).toBe(false);
    } finally {
      fleet.dispose();
      dispose();
    }
  });
});
