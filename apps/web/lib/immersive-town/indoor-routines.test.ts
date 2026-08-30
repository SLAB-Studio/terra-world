import { describe, expect, it } from "vitest";
import {
  createIndoorRoutines,
  INDOOR_RESIDENT_RADIUS,
  type IndoorRoutineResident,
  type IndoorRoutineSnapshot,
} from "./indoor-routines";
import type { WalkBounds, WalkPoint } from "./walking";
import { canWalkInside, stepInterior } from "./interior-navigation";

const bounds = { minX: -5, maxX: 5, minZ: -4, maxZ: 4 };
const resident = (id = "Ada", x = -3, z = 0): IndoorRoutineResident => ({
  id,
  home: { x, z, yaw: -Math.PI / 2 },
  seated: true,
  label: "Reading",
  stops: [{ x: 3, z, yaw: 0, label: "window", activity: "chat", dwell: 2 }],
});
type Routines = ReturnType<typeof createIndoorRoutines>;
function advance(
  routines: Routines,
  seconds: number,
  inspect?: (snapshot: IndoorRoutineSnapshot) => void,
) {
  for (let i = 0; i < Math.ceil(seconds / 0.05); i++) {
    routines.update(0.05);
    for (const snapshot of routines.residents) inspect?.(snapshot);
  }
}
const touching = (point: WalkPoint, box: WalkBounds) =>
  point.x >= box.minX - INDOOR_RESIDENT_RADIUS &&
  point.x <= box.maxX + INDOOR_RESIDENT_RADIUS &&
  point.z >= box.minZ - INDOOR_RESIDENT_RADIUS &&
  point.z <= box.maxZ + INDOOR_RESIDENT_RADIUS;

describe("bounded indoor routines", () => {
  it("leaves a task, uses a real stop, returns and settles without seat popping", () => {
    const routines = createIndoorRoutines({
      bounds,
      obstacles: [],
      residents: [resident()],
    });
    const phases = new Set<string>();
    let previousSeat = 1,
      previousTask = 1;
    let visited = false,
      travelled = 0;
    advance(routines, 65, (p) => {
      phases.add(p.phase);
      expect(Math.abs(p.seatWeight - previousSeat)).toBeLessThan(0.084);
      expect(Math.abs(p.taskWeight - previousTask)).toBeLessThan(0.084);
      if (p.phase === "leaving") expect(p.x).toBe(-3);
      if (p.phase === "visiting") {
        expect(p.x).toBeCloseTo(3);
        expect(p.label).toBe("window");
        visited = true;
      }
      previousSeat = p.seatWeight;
      previousTask = p.taskWeight;
      expect(p.travelled).toBeGreaterThanOrEqual(travelled);
      travelled = p.travelled;
    });
    expect(visited).toBe(true);
    expect(phases).toEqual(
      new Set([
        "task",
        "leaving",
        "walking",
        "visiting",
        "returning",
        "settling",
      ]),
    );
    expect(routines.residents[0]!.cycle).toBeGreaterThanOrEqual(1);
  });

  it("turns in place before moving, then moves forward with bounded acceleration", () => {
    const definition = resident();
    const routines = createIndoorRoutines({
      bounds,
      obstacles: [],
      residents: [
        { ...definition, home: { ...definition.home, yaw: Math.PI / 2 } },
      ],
    });
    let previous = { ...routines.residents[0]! };
    let turnedWithoutTranslation = false,
      moved = false;
    advance(routines, 25, (p) => {
      const dx = p.x - previous.x,
        dz = p.z - previous.z;
      const step = Math.hypot(dx, dz);
      if (p.phase === "walking" && p.yaw !== previous.yaw && step === 0)
        turnedWithoutTranslation = true;
      if (step > 0.00001) {
        expect(-dx * Math.sin(p.yaw) - dz * Math.cos(p.yaw)).toBeGreaterThan(0);
        expect(
          Math.abs(dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw)) / step,
        ).toBeLessThan(0.22);
        moved = true;
      }
      expect(step).toBeLessThanOrEqual(0.046);
      expect(p.speed - previous.speed).toBeLessThanOrEqual(0.062501);
      previous = { ...p };
    });
    expect(turnedWithoutTranslation).toBe(true);
    expect(moved).toBe(true);
  });

  it("routes around furniture and sweeps thin walls rather than tunnelling", () => {
    const wall = { minX: -0.015, maxX: 0.015, minZ: -2.4, maxZ: 2.4 };
    const routines = createIndoorRoutines({
      bounds,
      obstacles: [wall],
      residents: [resident()],
    });
    let maxZ = 0;
    advance(routines, 65, (p) => {
      expect(touching(p, wall)).toBe(false);
      maxZ = Math.max(maxZ, Math.abs(p.z));
      expect(p.x).toBeGreaterThanOrEqual(bounds.minX);
      expect(p.x).toBeLessThanOrEqual(bounds.maxX);
      expect(p.z).toBeGreaterThanOrEqual(bounds.minZ);
      expect(p.z).toBeLessThanOrEqual(bounds.maxZ);
    });
    expect(maxZ).toBeGreaterThan(2.59);
    expect(routines.residents[0]!.cycle).toBeGreaterThanOrEqual(1);
  });

  it("stays within a resident's room and skips unreachable/blocked destinations", () => {
    const room = { minX: -5, maxX: -0.4, minZ: -3, maxZ: 3 };
    const furniture = { minX: -2.2, maxX: -1.8, minZ: -0.4, maxZ: 0.4 };
    const routines = createIndoorRoutines({
      bounds,
      obstacles: [furniture],
      residents: [
        {
          ...resident(),
          room,
          stops: [
            { x: 3, z: 0, yaw: 0, label: "outside" },
            { x: -2, z: 0, yaw: 0, label: "inside a desk" },
            { x: -3, z: 2, yaw: 0, label: "bookcase", dwell: 1 },
          ],
        },
      ],
    });
    const visited = new Set<string>();
    advance(routines, 70, (p) => {
      expect(p.x).toBeLessThanOrEqual(room.maxX);
      expect(p.z).toBeLessThanOrEqual(room.maxZ);
      if (p.phase === "visiting") visited.add(p.label);
    });
    expect(visited).toEqual(new Set(["bookcase"]));
    expect(routines.residents[0]!.cycle).toBeGreaterThan(0);
  });

  it("does not route across a sealed wall or invent a stop when none is reachable", () => {
    const wall = { minX: -0.1, maxX: 0.1, minZ: -4, maxZ: 4 };
    const routines = createIndoorRoutines({
      bounds,
      obstacles: [wall],
      residents: [resident()],
    });
    advance(routines, 80);
    expect(routines.residents[0]).toMatchObject({
      x: -3,
      z: 0,
      phase: "task",
      speed: 0,
      travelled: 0,
    });
  });

  it("allows only a short home-chair egress, never adjacent furniture or walls", () => {
    const chair = { minX: -3.4, maxX: -2.6, minZ: -0.4, maxZ: 0.4 };
    const desk = { minX: -2.5, maxX: -1.4, minZ: -1.1, maxZ: 1.1 };
    const wall = { minX: -3.8, maxX: -3.7, minZ: -4, maxZ: 4 };
    const routines = createIndoorRoutines({
      bounds,
      obstacles: [chair, desk, wall],
      residents: [resident()],
    });
    let departedChair = false,
      returned = false;
    advance(routines, 65, (p) => {
      expect(touching(p, desk)).toBe(false);
      expect(touching(p, wall)).toBe(false);
      if (!touching(p, chair)) departedChair = true;
      if (p.cycle > 0) returned = true;
      if (p.phase === "visiting") expect(touching(p, chair)).toBe(false);
    });
    expect(departedChair).toBe(true);
    expect(returned).toBe(true);
    // Even a home anchor inside a thin wall is not granted a furniture exception.
    const embedded = createIndoorRoutines({
      bounds,
      obstacles: [{ minX: -3.05, maxX: -2.95, minZ: -4, maxZ: 4 }],
      residents: [resident()],
    });
    advance(embedded, 50);
    expect(embedded.residents[0]!.travelled).toBe(0);
  });

  it("never ignores a second obstacle overlapping the home chair", () => {
    const routines = createIndoorRoutines({
      bounds,
      obstacles: [
        { minX: -3.4, maxX: -2.6, minZ: -0.4, maxZ: 0.4 },
        { minX: -3.3, maxX: -2.7, minZ: -0.5, maxZ: 0.5 },
      ],
      residents: [resident()],
    });
    advance(routines, 60);
    expect(routines.residents[0]!.travelled).toBe(0);
  });

  it("tracks moving resident positions with stable dynamic collider objects", () => {
    const routines = createIndoorRoutines({
      bounds,
      obstacles: [],
      residents: [resident()],
    });
    const collider = routines.obstacles[0]!;
    let moved = false;
    advance(routines, 25, (p) => {
      expect(routines.obstacles[0]).toBe(collider);
      expect((collider.minX + collider.maxX) / 2).toBeCloseTo(p.x);
      expect((collider.minZ + collider.maxZ) / 2).toBeCloseTo(p.z);
      if (p.x > -2) moved = true;
    });
    expect(moved).toBe(true);
  });

  it("freezes all state for pauses/reduced motion and never catches up afterwards", () => {
    const a = createIndoorRoutines({
      bounds,
      obstacles: [],
      residents: [resident()],
    });
    const b = createIndoorRoutines({
      bounds,
      obstacles: [],
      residents: [resident()],
    });
    advance(a, 15);
    advance(b, 15);
    const before = { ...a.residents[0]! };
    for (let i = 0; i < 500; i++) {
      a.update(20, true);
      a.update(20, false, true);
      a.update(NaN);
      a.update(Infinity);
      a.update(-1);
    }
    expect(a.residents[0]).toEqual(before);
    a.update(80);
    b.update(0.05);
    expect(a.residents).toEqual(b.residents);
  });

  it("normalizes malformed poses, goals, bounds and frame deltas to finite bounded state", () => {
    const routines = createIndoorRoutines({
      bounds,
      obstacles: [{ minX: NaN, maxX: Infinity, minZ: 0, maxZ: 1 }],
      residents: [
        {
          id: "bad-data",
          home: { x: Infinity, z: NaN, yaw: Infinity },
          stops: [
            { x: NaN, z: 2, yaw: 0, label: "invalid" },
            { x: 3, z: 2, yaw: NaN, dwell: Infinity, label: "valid point" },
          ],
        },
      ],
      player: () => ({ x: NaN, z: Infinity }),
    });
    advance(routines, 65, (p) => {
      for (const value of [
        p.x,
        p.z,
        p.yaw,
        p.speed,
        p.travelled,
        p.taskWeight,
        p.seatWeight,
        p.cycle,
      ])
        expect(Number.isFinite(value)).toBe(true);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(5);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(4);
    });
    expect(routines.residents[0]!.cycle).toBeGreaterThan(0);
  });

  it("stagger departures reproducibly, varies destination order, and preserves later task dwells", () => {
    const people = Array.from({ length: 4 }, (_, i) => ({
      ...resident(`person-${i}`, -3, -2.4 + i * 1.6),
      stops: [
        { x: 2, z: -2.4 + i * 1.6, yaw: 0, label: "first", dwell: 1 },
        { x: 3, z: -2.4 + i * 1.6, yaw: 0, label: "second", dwell: 1 },
      ],
    }));
    const a = createIndoorRoutines({
      bounds,
      obstacles: [],
      residents: people,
    });
    const b = createIndoorRoutines({
      bounds,
      obstacles: [],
      residents: people,
    });
    const firstDeparture = new Map<string, number>();
    const visits = new Map<string, Set<string>>();
    for (let i = 0; i < 2800; i++) {
      a.update(0.05);
      b.update(0.05);
      expect(a.residents).toEqual(b.residents);
      for (const p of a.residents) {
        if (p.phase === "leaving" && !firstDeparture.has(p.id))
          firstDeparture.set(p.id, i * 0.05);
        if (p.phase === "visiting") {
          const set = visits.get(p.id) ?? new Set<string>();
          set.add(p.label);
          visits.set(p.id, set);
        }
      }
    }
    expect(firstDeparture.size).toBe(4);
    expect(new Set(firstDeparture.values()).size).toBe(4);
    for (const departure of firstDeparture.values()) {
      expect(departure).toBeGreaterThanOrEqual(5.95);
      expect(departure).toBeLessThanOrEqual(14);
    }
    for (const set of visits.values()) expect(set.size).toBe(2);
    for (const p of a.residents) expect(p.cycle).toBeGreaterThanOrEqual(2);
  });

  it("waits for a blocked destination and resumes once the player moves", () => {
    let player: WalkPoint | null = { x: 3, z: 0 };
    const routines = createIndoorRoutines({
      bounds,
      obstacles: [],
      residents: [resident()],
      player: () => player,
    });
    advance(routines, 22);
    expect(routines.residents[0]!.travelled).toBe(0);
    player = null;
    advance(routines, 38);
    expect(routines.residents[0]!.cycle).toBeGreaterThan(0);
  });

  it("yields/replans around a player who blocks a trip mid-route, without freezing permanently", () => {
    let player: WalkPoint | null = null;
    const routines = createIndoorRoutines({
      bounds,
      obstacles: [],
      residents: [resident()],
      player: () => player,
    });
    for (let i = 0; i < 500 && routines.residents[0]!.x < -1.7; i++)
      routines.update(0.05);
    player = { x: -0.8, z: 0 };
    let lateral = 0;
    advance(routines, 48, (p) => {
      expect(
        Math.hypot(p.x - player!.x, p.z - player!.z),
      ).toBeGreaterThanOrEqual(0.4899);
      lateral = Math.max(lateral, Math.abs(p.z));
    });
    expect(lateral).toBeGreaterThan(0.49);
    expect(routines.residents[0]!.cycle).toBeGreaterThan(0);
  });

  it("never traps player controls during a diagonal mid-route approach, even when motion is paused", () => {
    let player: WalkPoint | null = null;
    const routines = createIndoorRoutines({
      bounds,
      obstacles: [],
      residents: [resident("Ada", -3, 0.4)],
      player: () => player,
    });
    for (
      let frame = 0;
      frame < 1800 && routines.residents[0]!.x < -1.7;
      frame++
    )
      routines.update(1 / 60);
    expect(routines.residents[0]!.x).toBeGreaterThanOrEqual(-1.7);
    player = { x: 0, z: 0 };
    const escapeAvailable = () => {
      expect(canWalkInside(player!, routines.obstacles, bounds)).toBe(true);
      const moves = [
        { forward: 1, right: 0, turn: 0 },
        { forward: -1, right: 0, turn: 0 },
        { forward: 0, right: 1, turn: 0 },
        { forward: 0, right: -1, turn: 0 },
      ].map((input) =>
        stepInterior(
          { ...player!, yaw: 0 },
          input,
          1 / 60,
          routines.obstacles,
          bounds,
        ),
      );
      expect(
        moves.some((pose) => pose.x !== player!.x || pose.z !== player!.z),
      ).toBe(true);
    };
    let pausedBesidePlayer = false;
    for (let frame = 0; frame < 3600; frame++) {
      routines.update(1 / 60);
      escapeAvailable();
      const p = routines.residents[0]!;
      if (!pausedBesidePlayer && Math.hypot(p.x, p.z) < 0.8) {
        const before = { ...p };
        for (let pause = 0; pause < 60; pause++) {
          routines.update(1 / 60, false, true);
          escapeAvailable();
        }
        expect(p).toEqual(before);
        pausedBesidePlayer = true;
      }
    }
    expect(pausedBesidePlayer).toBe(true);
    expect(routines.residents[0]!.cycle).toBeGreaterThan(0);
  });

  it.each([
    { x: -0.4, z: 0.4 },
    { x: 0, z: 0 },
  ])(
    "escapes an existing player-box overlap at $x,$z without moving deeper",
    (home) => {
      let player: WalkPoint | null = { x: 0, z: 0 };
      const routines = createIndoorRoutines({
        bounds,
        obstacles: [],
        residents: [resident("overlap", home.x, home.z)],
        player: () => player,
      });
      let previous = Math.max(Math.abs(home.x), Math.abs(home.z));
      let escaped = false;
      for (let frame = 0; frame < 1800; frame++) {
        routines.update(1 / 60);
        const p = routines.residents[0]!;
        const separation = Math.max(Math.abs(p.x), Math.abs(p.z));
        expect(separation).toBeGreaterThanOrEqual(previous - 1e-7);
        previous = separation;
        if (separation > 0.502) {
          escaped = true;
          break;
        }
      }
      expect(escaped).toBe(true);
      player = null;
      advance(routines, 65);
      expect(routines.residents[0]!.cycle).toBeGreaterThan(0);
    },
  );

  it("keeps crossing residents separated and gives both continuing progress", () => {
    const routines = createIndoorRoutines({
      bounds,
      obstacles: [],
      residents: [
        { ...resident("east"), seated: false },
        {
          ...resident("west", 3, 0.6),
          seated: false,
          home: { x: 3, z: 0.6, yaw: -Math.PI / 2 },
          stops: [{ x: -3, z: -0.6, yaw: 0, label: "shelves", dwell: 1 }],
        },
      ],
    });
    for (let i = 0; i < 2000; i++) {
      routines.update(0.05);
      const [a, b] = routines.residents;
      expect(Math.hypot(a!.x - b!.x, a!.z - b!.z)).toBeGreaterThanOrEqual(
        0.4049,
      );
    }
    for (const p of routines.residents) {
      expect(p.cycle).toBeGreaterThanOrEqual(1);
      expect(p.travelled).toBeGreaterThan(15);
    }
  });
});
