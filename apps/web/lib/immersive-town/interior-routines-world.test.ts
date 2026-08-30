import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { describe, expect, it } from "vitest";
import { createHouseInteriorWorld } from "./house-interior-world";
import { type InteriorLife } from "./interior-life";
import { homeLifePlan, venueLifePlan } from "./interior-life-plan";
import { interiorRoutinePlan } from "./interior-routine-plans";
import {
  INDOOR_RESIDENT_RADIUS,
  type IndoorRoutineResident,
} from "./indoor-routines";
import { canWalkInside, INTERIOR_LIMITS } from "./interior-navigation";
import { TOWN_VENUES } from "./venue-catalog";
import { createVenueWorld, VENUE_LIMITS } from "./venue-world";
import type { WalkBounds, WalkPoint } from "./walking";

const venueFloors = TOWN_VENUES.flatMap((venue) =>
  venue.floors.map((floor, index) => ({
    title: `${venue.id}/${index}/${floor.use}`,
    venue,
    index,
  })),
);
const contains = (
  p: WalkPoint,
  box: WalkBounds,
  radius = INDOOR_RESIDENT_RADIUS,
) =>
  p.x >= box.minX - radius &&
  p.x <= box.maxX + radius &&
  p.z >= box.minZ - radius &&
  p.z <= box.maxZ + radius;
const rounded = (value: number) => Math.round(value * 1000) / 1000;

function geometryDiagnostic(
  definition: IndoorRoutineResident,
  obstacles: readonly WalkBounds[],
) {
  return {
    home: definition.home,
    containingHome: obstacles.filter((box) => contains(definition.home, box)),
    stops: definition.stops.map((stop) => ({
      label: stop.label,
      x: stop.x,
      z: stop.z,
      blockedBy: obstacles.filter((box) => contains(stop, box)),
      outsideRoom: definition.room
        ? !contains(stop, definition.room, 0)
        : false,
    })),
  };
}

function verifySimulation(
  life: InteriorLife,
  definitions: readonly IndoorRoutineResident[],
  staticObstacles: readonly WalkBounds[],
  bounds: WalkBounds,
  protectedPoints: readonly WalkPoint[],
) {
  const routines = life.routines;
  expect(routines).not.toBeNull();
  if (!routines) return;
  const colliders = life.obstacles.slice(-definitions.length);
  const issues = new Set<string>();
  const observations = routines.residents.map((p) => ({
    previous: { ...p },
    phases: new Map<string, number>(),
    visited: new Set<string>(),
    minX: p.x,
    maxX: p.x,
    minZ: p.z,
    maxZ: p.z,
  }));
  for (let frame = 0; frame < 3000; frame++) {
    life.update(0.05, false);
    for (let index = 0; index < routines.residents.length; index++) {
      const p = routines.residents[index]!,
        observed = observations[index]!,
        before = observed.previous;
      const step = Math.hypot(p.x - before.x, p.z - before.z);
      if (
        ![
          p.x,
          p.z,
          p.yaw,
          p.speed,
          p.travelled,
          p.taskWeight,
          p.seatWeight,
        ].every(Number.isFinite)
      )
        issues.add(`${p.id}: nonfinite motion`);
      if (step > 0.046) issues.add(`${p.id}: jumped ${step}m in one frame`);
      if (Math.abs(p.seatWeight - before.seatWeight) > 0.084)
        issues.add(`${p.id}: discontinuous seat transition`);
      if (
        p.x < bounds.minX ||
        p.x > bounds.maxX ||
        p.z < bounds.minZ ||
        p.z > bounds.maxZ
      )
        issues.add(`${p.id}: left world bounds`);
      const rig = life.people[index]!.rig;
      if (
        Math.hypot(rig.root.position.x - p.x, rig.root.position.z - p.z) >
        0.000001
      )
        issues.add(`${p.id}: scene root does not follow routine`);
      const collider = colliders[index]!;
      if (
        Math.hypot(
          (collider.minX + collider.maxX) / 2 - p.x,
          (collider.minZ + collider.maxZ) / 2 - p.z,
        ) > 0.000001
      )
        issues.add(`${p.id}: stale anchor collider`);
      if (
        Math.abs(collider.maxX - collider.minX - INDOOR_RESIDENT_RADIUS * 2) >
        0.000001
      )
        issues.add(`${p.id}: inconsistent collider radius`);
      for (const point of protectedPoints) {
        if (!canWalkInside(point, routines.obstacles, bounds))
          issues.add(
            `${p.id}: routine blocks protected passage ${point.x},${point.z}`,
          );
      }
      observed.phases.set(p.phase, (observed.phases.get(p.phase) ?? 0) + 1);
      if (p.phase === "visiting") observed.visited.add(p.label);
      observed.minX = Math.min(observed.minX, p.x);
      observed.maxX = Math.max(observed.maxX, p.x);
      observed.minZ = Math.min(observed.minZ, p.z);
      observed.maxZ = Math.max(observed.maxZ, p.z);
      observed.previous = { ...p };
    }
  }
  const stalled = routines.residents.flatMap((p, index) => {
    const observed = observations[index]!;
    if (p.travelled >= 1 && p.cycle >= 1 && observed.visited.size > 0)
      return [];
    return [
      {
        id: p.id,
        travelled: rounded(p.travelled),
        cycle: p.cycle,
        phase: p.phase,
        at: [rounded(p.x), rounded(p.z)],
        phases: Object.fromEntries(observed.phases),
        visited: [...observed.visited],
        extent: [
          observed.minX,
          observed.maxX,
          observed.minZ,
          observed.maxZ,
        ].map(rounded),
        ...geometryDiagnostic(definitions[index]!, staticObstacles),
      },
    ];
  });
  expect(
    [...issues],
    "Live transforms, colliders, and protected passages must remain valid",
  ).toEqual([]);
  expect(
    stalled,
    `Residents must each visit a real destination and return within 150s:\n${JSON.stringify(stalled, null, 2)}`,
  ).toEqual([]);
}

describe("indoor routines in actual furnished worlds", () => {
  it.each(venueFloors)(
    "moves and returns every resident on $title",
    ({ venue, index }) => {
      const engine = new NullEngine();
      const world = createVenueWorld(engine, venue, index, "day");
      try {
        world.enterDoor();
        const definitions = interiorRoutinePlan(venueLifePlan(venue, index));
        const staticObstacles = world.obstacles.slice(0, -definitions.length);
        const protectedPoints = [
          { x: 0, z: -8 },
          { x: 0, z: -5.8 },
          ...(venue.floors.length > 1 ? [{ x: 0, z: 7.2 }] : []),
        ];
        for (const point of protectedPoints)
          expect(canWalkInside(point, staticObstacles, VENUE_LIMITS)).toBe(
            true,
          );
        verifySimulation(
          world.life,
          definitions,
          staticObstacles,
          VENUE_LIMITS,
          protectedPoints,
        );
      } finally {
        world.dispose();
        engine.dispose();
      }
    },
    20000,
  );

  it.each(["sunny", "bluebell", "mango"] as const)(
    "moves and returns every resident in the %s home",
    (house) => {
      const engine = new NullEngine();
      const world = createHouseInteriorWorld(engine, house, []);
      try {
        world.enterDoor();
        const staticObstacles: WalkBounds[] = [
          ...world.life.dressing.obstacles,
          ...world.scene.meshes
            .filter(
              (mesh) =>
                mesh.isEnabled() &&
                (/^interior-wall-/.test(mesh.name) ||
                  /^(living-sofa|living-table|living-lamp-pole|kitchen-counter|kitchen-island|garden-planter|garden-bench|utility-bin|utility-shelf|utility-sorting-stand)/.test(
                    mesh.name,
                  )),
            )
            .flatMap((mesh) => {
              mesh.computeWorldMatrix(true);
              const { minimumWorld: min, maximumWorld: max } =
                mesh.getBoundingInfo().boundingBox;
              return min.y > 2.9
                ? []
                : [{ minX: min.x, maxX: max.x, minZ: min.z, maxZ: max.z }];
            }),
        ];
        verifySimulation(
          world.life,
          interiorRoutinePlan(homeLifePlan()),
          staticObstacles,
          INTERIOR_LIMITS,
          [{ x: -1.4, z: -6.4 }],
        );
      } finally {
        world.dispose();
        engine.dispose();
      }
    },
    20000,
  );

  it("preserves live world motion and colliders through blocked and reduced-motion updates", () => {
    const engine = new NullEngine();
    let blocked = false;
    const world = createHouseInteriorWorld(engine, "sunny", [], {
      isBlocked: () => blocked,
    });
    try {
      world.enterDoor();
      for (let i = 0; i < 400; i++) world.life.update(0.05, false);
      const snapshots = () => ({
        residents: world.life.routines!.residents.map((p) => ({ ...p })),
        obstacles: world.life.routines!.obstacles.map((box) => ({ ...box })),
        positions: world.life.people.map(({ rig }) => [
          rig.root.position.x,
          rig.root.position.y,
          rig.root.position.z,
          rig.root.rotation.y,
        ]),
      });
      const before = snapshots();
      blocked = true;
      for (let i = 0; i < 60; i++) world.life.update(10, false);
      expect(snapshots()).toEqual(before);
      blocked = false;
      for (let i = 0; i < 60; i++) world.life.update(10, true);
      expect(snapshots()).toEqual(before);
      world.life.update(10, false);
      for (const [i, resident] of world.life.routines!.residents.entries())
        expect(
          Math.hypot(
            resident.x - before.residents[i]!.x,
            resident.z - before.residents[i]!.z,
          ),
        ).toBeLessThanOrEqual(0.046);
    } finally {
      world.dispose();
      engine.dispose();
    }
  });
});
