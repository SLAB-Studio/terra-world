import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it, vi } from "vitest";

import {
  applyTownCharacterMotion,
  createTownCharacter,
  RIVERGATE_CHARACTER_PROFILES,
} from "./characters-3d";
import { createImmersiveTownWorld } from "./create-town-world";
import {
  PEDESTRIAN_ROUTES,
  sampleFootstep,
  samplePedestrianRoute,
  solvePedestrianLeg,
} from "./pedestrian-motion";
import { createTownWalker } from "./town-walker";
import { canWalkAt, walkingRoadHeight } from "./walking";

describe("grounded Rivergate pedestrians", () => {
  it("faces the actual travel direction, including the return journey", () => {
    for (const route of Object.values(PEDESTRIAN_ROUTES)) {
      for (let time = 0.1; time < 100; time += 0.17) {
        const here = samplePedestrianRoute(route, time);
        const next = samplePedestrianRoute(route, time + 0.001);
        if (here.speed < 0.05 || !next.moving) continue;
        const dx = next.x - here.x;
        const dz = next.z - here.z;
        const facing =
          (-Math.sin(here.yaw) * dx - Math.cos(here.yaw) * dz) /
          Math.hypot(dx, dz);
        expect(facing, `${route.id} at ${time}`).toBeGreaterThan(0.999);
      }
    }
  });

  it("decelerates, pauses and turns without teleporting or spinning while moving", () => {
    const route = PEDESTRIAN_ROUTES["south-walker-kai"]!;
    let pauses = 0;
    let pausedTurns = 0;
    for (let time = 0; time < 60; time += 0.05) {
      const from = samplePedestrianRoute(route, time);
      const to = samplePedestrianRoute(route, time + 0.05);
      expect(Math.hypot(to.x - from.x, to.z - from.z)).toBeLessThanOrEqual(
        route.speed * 0.05 + 0.00001,
      );
      const turn = Math.atan2(
        Math.sin(to.yaw - from.yaw),
        Math.cos(to.yaw - from.yaw),
      );
      expect(Math.abs(turn)).toBeLessThan(0.17);
      if (!from.moving && !to.moving) {
        pauses += 1;
        expect(to.x).toBeCloseTo(from.x);
        expect(to.z).toBeCloseTo(from.z);
        if (Math.abs(turn) > 0.01) pausedTurns += 1;
      }
    }
    expect(pauses).toBeGreaterThan(20);
    expect(pausedTurns).toBeGreaterThan(20);
  });

  it("keeps planted feet stationary relative to the ground and lifts only the swing foot", () => {
    const stride = 0.64;
    const from = sampleFootstep(0.1, stride, 0);
    const to = sampleFootstep(0.11, stride, 0);
    expect(from.planted && to.planted).toBe(true);
    expect(to.z - from.z).toBeCloseTo(0.01);
    expect(to.lift).toBe(0);
    for (let distance = 0; distance < 4; distance += 0.01) {
      const left = sampleFootstep(distance, stride, 0);
      const right = sampleFootstep(distance, stride, 0.5);
      expect(left.planted || right.planted).toBe(true);
      expect(Math.max(left.lift, right.lift)).toBeLessThanOrEqual(0.16);
    }
    const pose = solvePedestrianLeg(0.7, 0.69, 1.3494, -0.32);
    expect(
      -0.7 * Math.sin(pose.hip) - 0.69 * Math.sin(pose.hip + pose.knee),
    ).toBeCloseTo(-0.32);
    expect(
      0.7 * Math.cos(pose.hip) + 0.69 * Math.cos(pose.hip + pose.knee),
    ).toBeCloseTo(1.3494);
    expect(pose.hip + pose.knee + pose.ankle).toBeCloseTo(0);
  });

  it("keeps every authored pedestrian route away from homes, trees, water and car lanes", () => {
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
    try {
      const walkers = RIVERGATE_CHARACTER_PROFILES.filter(
        (profile) => profile.activity === "walk",
      );
      expect(walkers).toHaveLength(5);
      for (const profile of walkers) {
        const route = PEDESTRIAN_ROUTES[profile.id]!;
        expect(route).toBeDefined();
        for (let time = 0; time < 100; time += 0.3) {
          const point = samplePedestrianRoute(route, time, profile.phase);
          expect(
            canWalkAt(point, walker.obstacles),
            `${profile.id} at ${point.x},${point.z}`,
          ).toBe(true);
          expect(walkingRoadHeight(point), profile.id).toBeNull();
        }
      }
    } finally {
      walker.dispose();
      world.dispose();
      engine.dispose();
    }
  });

  it("keeps the head joined to the torso and rendered shoe soles on their paths", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const parent = new TransformNode("population-test", scene);
    try {
      for (const id of ["south-walker-kai", "resident-malik", "guide-leo"]) {
        const profile = RIVERGATE_CHARACTER_PROFILES.find((p) => p.id === id)!;
        const rig = createTownCharacter(scene, parent, null, profile);
        expect(rig.head.parent).toBe(rig.torso);
        expect(rig.leftShoulder.parent).toBe(rig.torso);
        for (let time = 0; time < 24; time += 0.13) {
          applyTownCharacterMotion(rig, time, false);
          const route = PEDESTRIAN_ROUTES[id];
          const floor = route
            ? samplePedestrianRoute(route, time, profile.phase).y
            : rig.baseY;
          const soles = ["left", "right"].map((side) => {
            const shoe = scene.getMeshByName(`${id}-${side}-shoe`)!;
            shoe.computeWorldMatrix(true);
            return shoe.getBoundingInfo().boundingBox.minimumWorld.y;
          });
          expect(Math.min(...soles)).toBeCloseTo(floor, 4);
          expect(Math.max(...soles) - floor).toBeLessThanOrEqual(0.161);
          const head = scene.getMeshByName(`${id}-head`)!;
          const neck = scene.getMeshByName(`${id}-neck`)!;
          const chest = scene.getMeshByName(`${id}-torso`)!;
          for (const mesh of [head, neck, chest]) mesh.computeWorldMatrix(true);
          expect(
            neck.getBoundingInfo().boundingBox.maximumWorld.y,
          ).toBeGreaterThan(head.getBoundingInfo().boundingBox.minimumWorld.y);
          expect(
            neck.getBoundingInfo().boundingBox.minimumWorld.y,
          ).toBeLessThan(chest.getBoundingInfo().boundingBox.maximumWorld.y);
          const before = rig.root.position.clone();
          applyTownCharacterMotion(rig, time, true);
          if (route)
            expect(Vector3.Distance(rig.root.position, before)).toBeLessThan(
              0.001,
            );
        }
      }
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
});
