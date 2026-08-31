import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { describe, expect, it } from "vitest";
import { createImmersiveTownWorld } from "./create-town-world";
import { createTrafficSimulation, stepTraffic } from "./traffic";

describe("resident routines in the actual town", () => {
  it("keeps the whole population making progress through ten simulated minutes", () => {
    const engine = new NullEngine();
    const world = createImmersiveTownWorld(engine, {
      attachCameraControls: false,
      quality: "low",
    });
    try {
      const life = world.residents.life;
      const families = new Map<string, typeof life.states>();
      for (const state of life.states) {
        if (!state.socialGroup) continue;
        const members = families.get(state.socialGroup.id) ?? [];
        members.push(state);
        families.set(state.socialGroup.id, members);
      }
      const widest = new Map<string, number>();
      const widestAt = new Map<string, unknown>();
      expect(families.size).toBeGreaterThanOrEqual(4);
      let traffic = createTrafficSimulation();
      let boardings = 0,
        alightings = 0,
        lateTrafficMovement = 0;
      life.setTraffic(traffic);
      for (let frame = 0; frame < 12000; frame++) {
        life.step(0.05);
        for (const [id, members] of families) {
          expect(
            new Set(members.map((member) => member.destinationId)).size,
            id,
          ).toBe(1);
          if (members.every((member) => member.mode === "walking")) {
            const [first, second] = members;
            const gap = Math.hypot(first!.x - second!.x, first!.z - second!.z);
            expect(
              gap,
              `${id} walking body clearance at frame ${frame}`,
            ).toBeGreaterThanOrEqual(0.6999);
            if (gap > (widest.get(id) ?? 0))
              widestAt.set(id, {
                frame,
                members: members.map((state) => ({
                  id: state.id,
                  x: state.x,
                  z: state.z,
                  destinationId: state.destinationId,
                  waypoint: state.waypoint,
                  path: state.path,
                })),
              });
            widest.set(id, Math.max(widest.get(id) ?? 0, gap));
          }
          expect(
            members.every((member) => member.ride === null),
            id,
          ).toBe(true);
        }
        boardings += life.events.filter((e) => e.type === "boarded").length;
        alightings += life.events.filter((e) => e.type === "alighted").length;
        traffic = stepTraffic(traffic, 0.05, { stops: life.trafficStops });
        life.setTraffic(traffic);
        if (frame > 10800)
          lateTrafficMovement += traffic.vehicles.reduce(
            (sum, v) => sum + v.speedMetersPerSecond * 0.05,
            0,
          );
      }
      expect(life.states.filter((s) => s.trips === 0).map((s) => s.id)).toEqual(
        [],
      );
      expect(boardings).toBeGreaterThan(0);
      expect(alightings).toBeGreaterThan(0);
      expect(lateTrafficMovement).toBeGreaterThan(100);
      expect(
        [...widest]
          .filter(([, gap]) => gap >= 4)
          .map(([id, gap]) => ({ id, gap, at: widestAt.get(id) })),
      ).toEqual([]);
    } finally {
      world.dispose();
      engine.dispose();
    }
  }, 30000);
  it("keeps the complete population and reaches all home and public entrances", () => {
    const engine = new NullEngine();
    const world = createImmersiveTownWorld(engine, {
      attachCameraControls: false,
      quality: "low",
    });
    try {
      const { life, navigation } = world.residents;
      const mei = life.states.find((state) => state.id === "north-walker-mei")!;
      const ada = life.states.find((state) => state.id === "north-child-ada")!;
      expect({ x: mei.x, z: mei.z }).toEqual({ x: -28.8, z: 61 });
      expect({ x: ada.x, z: ada.z }).toEqual({ x: -29.8, z: 61 });
      expect(world.houses).toHaveLength(28);
      expect(world.venues).toHaveLength(18);
      expect(
        [
          ...world.houses.map((h) => h.id),
          ...world.venues.map((v) => v.venue.id),
        ].filter((id) => !life.destinations.some((d) => d.id === id)),
      ).toEqual([]);
      expect(life.states.length).toBeGreaterThanOrEqual(30);
      for (const state of life.states)
        expect(navigation.isWalkable(state), state.id).toBe(true);
      for (const place of world.venues.filter((v) => v.venue.outdoor))
        expect(
          life.destinations.find((d) => d.id === place.venue.id)?.threshold,
        ).toBeUndefined();
      for (let frame = 0; frame < 180; frame++)
        world.residents.update(0.05, false);
      for (const state of life.states) {
        const root = world.scene.getTransformNodeByName(
          `character-${state.id}`,
        )!;
        expect(root.position.x).toBeCloseTo(state.x);
        expect(root.position.z).toBeCloseTo(state.z);
        expect(root.rotation.y).toBeCloseTo(state.yaw);
        expect(root.metadata.routineMotion.travelled).toBe(state.travelled);
      }
      const resident = life.states[0]!;
      const place = life.destinations.find(
        (d) => d.kind === "home" && d.threshold,
      )!;
      resident.x = place.point.x;
      resident.z = place.point.z;
      resident.destinationId = place.id;
      resident.mode = "entering";
      resident.timer = 0.7;
      const root = world.scene.getTransformNodeByName(
        `character-${resident.id}`,
      )!;
      const currentMode = () => resident.mode;
      for (let i = 0; i < 300 && currentMode() !== "inside"; i++)
        world.residents.update(0.05, false);
      expect(resident.mode).toBe("inside");
      expect(root.isEnabled()).toBe(false);
      expect(
        world.scene.getTransformNodeByName(`resident-${place.id}-door-hinge`),
      ).not.toBeNull();
      resident.timer = 0;
      for (let i = 0; i < 300 && currentMode() !== "idle"; i++)
        world.residents.update(0.05, false);
      expect(resident.mode).toBe("idle");
      expect(root.isEnabled()).toBe(true);
      const snapshot = JSON.stringify(life.states);
      world.residents.update(5, true);
      expect(JSON.stringify(life.states)).toBe(snapshot);
    } finally {
      world.dispose();
      engine.dispose();
    }
  }, 15000);
});
