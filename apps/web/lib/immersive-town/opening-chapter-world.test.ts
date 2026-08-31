import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { describe, expect, it } from "vitest";
import { createImmersiveTownWorld } from "./create-town-world";
import { createOpeningChapterWorld } from "./opening-chapter-world";
import { createTownWalker } from "./town-walker";
import { EAST_BRIDGE_PROGRESS } from "./bridge-closure";
import { sampleRoadFrame } from "./road";
import { canWalkAt, insideWalkBounds } from "./walking";
import { EAST_BRIDGE_WALK_BOUNDS } from "./bridge-closure";
import { createTrafficSimulation, stepTraffic } from "./traffic";

describe("opening chapter scene controller", () => {
  it("suppresses legacy house help throughout the chapter and chatter only during shots, restoring each prior state", () => {
    const engine = new NullEngine();
    const world = createImmersiveTownWorld(engine, {
      attachCameraControls: false,
      quality: "low",
      reducedMotion: true,
    });
    const help = MeshBuilder.CreatePlane("sunny-help-bubble", {}, world.scene);
    help.metadata = { kind: "terra-house-help" };
    help.isPickable = true;
    const completed = MeshBuilder.CreatePlane(
      "mango-help-bubble",
      {},
      world.scene,
    );
    completed.metadata = { kind: "terra-house-help" };
    completed.setEnabled(false);
    completed.isPickable = false;
    const chatter = MeshBuilder.CreatePlane(
      "resident-conversation-bubble",
      {},
      world.scene,
    );
    chatter.isPickable = false;
    const chapter = createOpeningChapterWorld(world);
    chapter.setActive(true);
    expect(help.isEnabled()).toBe(false);
    expect(help.isVisible).toBe(false);
    expect(chatter.isVisible).toBe(true);
    chapter.setShot("river", false);
    expect(help.isEnabled()).toBe(false);
    expect(help.isVisible).toBe(false);
    expect(help.isPickable).toBe(false);
    expect(chatter.isVisible).toBe(false);
    // A legacy sync may change enabled state; it must not make a billboard
    // visible in the middle of a cinematic or corrupt the saved snapshot.
    help.setEnabled(true);
    chatter.setEnabled(true);
    expect(help.isVisible).toBe(false);
    expect(chatter.isVisible).toBe(false);
    chapter.setShot("bridge", true);
    chapter.clearShot();
    expect(help.isEnabled()).toBe(false);
    expect(help.isVisible).toBe(false);
    expect(help.isPickable).toBe(false);
    expect(completed.isEnabled()).toBe(false);
    expect(completed.isPickable).toBe(false);
    expect(chatter.isEnabled()).toBe(true);
    expect(chatter.isVisible).toBe(true);
    expect(chatter.isPickable).toBe(false);
    const maya = chapter.points.find((point) => point.id === "maya")!;
    world.camera.setPosition(maya.position.add(new Vector3(0, 2, -8)));
    world.camera.getViewMatrix(true);
    chapter.update(0);
    expect(world.scene.getMeshByName("chapter-sign-maya")!.isVisible).toBe(
      false,
    );
    expect(world.scene.getMeshByName("chapter-point-maya")!.isVisible).toBe(
      true,
    );
    expect(world.scene.getMeshByName("chapter-sign-closure-1")!.isVisible).toBe(
      true,
    );
    world.camera.setPosition(maya.position.add(new Vector3(0, 20, -40)));
    world.camera.getViewMatrix(true);
    chapter.update(0);
    expect(world.scene.getMeshByName("chapter-sign-maya")!.isVisible).toBe(
      true,
    );
    chapter.setShot("arrival", true);
    chapter.setActive(false);
    expect(help.isEnabled()).toBe(true);
    expect(help.isVisible).toBe(true);
    expect(help.isPickable).toBe(true);
    chapter.dispose();
    world.dispose();
    engine.dispose();
  }, 30_000);

  it("keeps legacy city intact, physically closes only active chapter, restores camera, and reopens only after observation", () => {
    const engine = new NullEngine();
    const world = createImmersiveTownWorld(engine, {
      attachCameraControls: false,
      quality: "low",
      reducedMotion: true,
    });
    const walker = createTownWalker(world, null, {
      isBlocked: () => false,
      onNearbyHouse: () => undefined,
      onEnterHouse: () => undefined,
    });
    const residents = world.residents.life.states.length;
    const homes = world.houses.length;
    const originalCamera = world.scene.activeCamera;
    const originalPose = {
      alpha: world.camera.alpha,
      beta: world.camera.beta,
      radius: world.camera.radius,
    };
    const chapter = createOpeningChapterWorld(world);
    const center = sampleRoadFrame(EAST_BRIDGE_PROGRESS).center;
    expect(chapter.active).toBe(false);
    expect(chapter.trafficStops).toHaveLength(0);
    expect(canWalkAt(center, walker.obstacles)).toBe(true);
    chapter.setActive(true);
    expect(canWalkAt(center, walker.obstacles)).toBe(false);
    expect(world.residents.navigation.isWalkable(center)).toBe(false);
    expect(chapter.trafficStops).toHaveLength(2);
    expect(chapter.points.map((p) => p.id)).toEqual([
      "bridge",
      "maya",
      "malik",
      "nia",
    ]);
    for (const point of chapter.points) {
      expect(canWalkAt(point.position, walker.obstacles), point.id).toBe(true);
      expect(
        canWalkAt(point.approach, walker.obstacles),
        `${point.id} arrival`,
      ).toBe(true);
      const path = world.residents.navigation.findPath(
        chapter.points[0]!.approach,
        point.approach,
      );
      expect(
        path,
        `${point.id} reachable via the safe crossing`,
      ).not.toBeNull();
      for (const waypoint of path ?? [])
        expect(insideWalkBounds(waypoint, EAST_BRIDGE_WALK_BOUNDS)).toBe(false);
      expect(
        world.residents.navigation.isWalkable(point.position),
        point.id,
      ).toBe(true);
      const marker = world.scene.getMeshByName(`chapter-point-${point.id}`)!;
      expect(marker.metadata.chapterPointId).toBe(point.id);
      if (point.id === "maya" || point.id === "malik") {
        const outward = world.venues.find(
          (venue) =>
            venue.venue.id === (point.id === "maya" ? "cafe" : "workshop"),
        )!.outward;
        const offset = point.approach.subtract(point.position);
        expect(Math.hypot(offset.x, offset.z)).toBeGreaterThanOrEqual(2);
        expect(Math.hypot(offset.x, offset.z)).toBeLessThanOrEqual(4.001);
        expect(
          offset.x * outward.x + offset.z * outward.z,
          `${point.id} faces street`,
        ).toBeGreaterThan(1.8);
        if (point.id === "maya")
          expect(
            world.residents.navigation.segmentIsWalkable(
              point.position,
              point.approach.add(outward.scale(4.5)),
            ),
            "Maya camera boom remains clear of bakery and workshop walls",
          ).toBe(true);
      }
    }
    for (const person of world.residents.life.states) {
      // All existing residents remain outside the newly closed footprint.
      expect(canWalkAt(person, walker.obstacles), person.id).toBe(true);
    }
    chapter.setShot("river", true);
    const cinema = world.scene.activeCamera!;
    const frozen = cinema.position.clone();
    chapter.update(0.1);
    expect(cinema.position.equals(frozen)).toBe(true);
    chapter.setShot("bakery", false);
    const moving = cinema.position.clone();
    chapter.update(0.1);
    expect(cinema.position.equals(moving)).toBe(false);
    chapter.clearShot();
    expect(world.scene.activeCamera).toBe(originalCamera);
    expect({
      alpha: world.camera.alpha,
      beta: world.camera.beta,
      radius: world.camera.radius,
    }).toEqual(originalPose);
    chapter.setStage("repair", false);
    expect(chapter.trafficStops).toHaveLength(2);
    chapter.setStage("repair", true);
    expect(chapter.trafficStops).toHaveLength(0);
    expect(canWalkAt(center, walker.obstacles)).toBe(true);
    chapter.setStage("shuttle", true);
    expect(chapter.trafficStops).toHaveLength(2);
    chapter.setActive(false);
    expect(chapter.trafficStops).toHaveLength(0);
    expect(canWalkAt(center, walker.obstacles)).toBe(true);
    expect(world.residents.life.states).toHaveLength(residents);
    expect(world.houses).toHaveLength(homes);
    chapter.dispose();
    expect(world.scene.getCameraByName("opening-chapter-camera")).toBeNull();
    expect(world.scene.getTransformNodeByName("opening-chapter")).toBeNull();
    walker.dispose();
    world.dispose();
    engine.dispose();
  }, 60_000);

  it("keeps residents and traffic moving for five chapter minutes without anyone walking through East Bridge", () => {
    const engine = new NullEngine();
    const world = createImmersiveTownWorld(engine, {
      attachCameraControls: false,
      quality: "low",
    });
    const chapter = createOpeningChapterWorld(world);
    chapter.setActive(true);
    const life = world.residents.life;
    let traffic = chapter.prepareTraffic(createTrafficSimulation());
    life.setTraffic(traffic);
    let lateMovement = 0;
    const crossingIds = new Set<string>();
    for (let frame = 0; frame < 6000; frame++) {
      life.step(0.05);
      for (const state of life.states)
        if (!["riding", "inside", "seated"].includes(state.mode))
          expect(
            insideWalkBounds(state, EAST_BRIDGE_WALK_BOUNDS),
            state.id,
          ).toBe(false);
      for (const stop of life.trafficStops)
        if (stop.id.includes("chapter-")) crossingIds.add(stop.id);
      traffic = chapter.routeTraffic(
        stepTraffic(traffic, 0.05, {
          stops: [...life.trafficStops, ...chapter.trafficStops],
        }),
      );
      life.setTraffic(traffic);
      if (frame > 5500)
        lateMovement += traffic.vehicles.reduce(
          (sum, vehicle) => sum + vehicle.speedMetersPerSecond * 0.05,
          0,
        );
    }
    expect(
      life.states.filter((state) => state.trips > 0).length,
    ).toBeGreaterThan(20);
    expect(lateMovement).toBeGreaterThan(25);
    expect(crossingIds.size).toBeGreaterThan(0);
    chapter.dispose();
    world.dispose();
    engine.dispose();
  }, 60_000);
});
