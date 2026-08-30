import type { WalkBounds, WalkPoint, WalkPose } from "./walking";
import { INTERIOR_RADIUS } from "./interior-navigation";

export const INDOOR_RESIDENT_RADIUS = 0.19;
const CLEARANCE = 0.012;
const BLEND_SECONDS = 0.9;
const TAU = Math.PI * 2;

export type IndoorRoutineStop = WalkPose &
  Readonly<{
    label: string;
    activity?: "chat" | "idle";
    dwell?: number;
  }>;
export type IndoorRoutineResident = Readonly<{
  id: string;
  home: WalkPose;
  stops: readonly IndoorRoutineStop[];
  seated?: boolean;
  room?: WalkBounds;
  label?: string;
}>;
export type IndoorRoutineSnapshot = Readonly<{
  id: string;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  travelled: number;
  phase: "task" | "leaving" | "walking" | "visiting" | "returning" | "settling";
  taskWeight: number;
  seatWeight: number;
  label: string;
  activity: "idle" | "walk" | "chat";
  cycle: number;
}>;
type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type Waypoint = WalkPoint & { homePass?: boolean };
type Graph = {
  points: WalkPoint[];
  edges: [number, number][][];
  bounds: WalkBounds;
};
type Occupant = WalkPoint & { radius: number; square?: boolean };

const finite = (value: number, fallback = 0) =>
  Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const angle = (value: number) =>
  ((((finite(value) + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
const distance = (a: WalkPoint, b: WalkPoint) =>
  Math.hypot(b.x - a.x, b.z - a.z);
const inside = (p: WalkPoint, b: WalkBounds) =>
  p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ;
const validBounds = (b: WalkBounds) =>
  Object.values(b).every(Number.isFinite) && b.minX < b.maxX && b.minZ < b.maxZ;
const expand = (b: WalkBounds, radius: number): WalkBounds => ({
  minX: b.minX - radius,
  maxX: b.maxX + radius,
  minZ: b.minZ - radius,
  maxZ: b.maxZ + radius,
});
const smooth = (value: number) => value * value * (3 - 2 * value);
function hash(value: string) {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++)
    result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return result >>> 0;
}

/** Exact segment/AABB intersection: thin walls cannot be skipped between frames. */
function intersects(a: WalkPoint, b: WalkPoint, box: WalkBounds) {
  let lo = 0,
    hi = 1;
  for (const axis of ["x", "z"] as const) {
    const min = axis === "x" ? box.minX : box.minZ;
    const max = axis === "x" ? box.maxX : box.maxZ;
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-10) {
      if (a[axis] < min || a[axis] > max) return false;
    } else {
      const first = (min - a[axis]) / delta,
        last = (max - a[axis]) / delta;
      lo = Math.max(lo, Math.min(first, last));
      hi = Math.min(hi, Math.max(first, last));
      if (lo > hi) return false;
    }
  }
  return true;
}
function corners(b: WalkBounds): WalkPoint[] {
  return [
    { x: b.minX - CLEARANCE, z: b.minZ - CLEARANCE },
    { x: b.minX - CLEARANCE, z: b.maxZ + CLEARANCE },
    { x: b.maxX + CLEARANCE, z: b.minZ - CLEARANCE },
    { x: b.maxX + CLEARANCE, z: b.maxZ + CLEARANCE },
  ];
}
function segmentDistance(a: WalkPoint, b: WalkPoint, p: WalkPoint) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const denominator = dx * dx + dz * dz;
  const t =
    denominator > 0
      ? clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / denominator, 0, 1)
      : 0;
  return Math.hypot(a.x + dx * t - p.x, a.z + dz * t - p.z);
}

/** Match the player's expanded NPC AABB, including diagonal approaches. */
function safeBoxMotion(
  a: WalkPoint,
  b: WalkPoint,
  center: WalkPoint,
  box: WalkBounds,
) {
  if (!inside(a, box)) return !intersects(a, b, box);
  // An existing overlap may escape along an outward nearest-face direction,
  // but may not cross deeper through the player before reaching the other side.
  const dx = a.x - center.x,
    dz = a.z - center.z;
  const before = Math.max(Math.abs(dx), Math.abs(dz));
  const away =
    before === 0 ||
    (Math.abs(dx) >= Math.abs(dz) && dx * (b.x - a.x) > 0) ||
    (Math.abs(dz) >= Math.abs(dx) && dz * (b.z - a.z) > 0);
  return (
    away &&
    Math.max(Math.abs(b.x - center.x), Math.abs(b.z - center.z)) > before + 1e-7
  );
}

/** A small, deterministic indoor-only scheduler. Geometry is captured at creation. */
export function createIndoorRoutines(options: {
  obstacles: readonly WalkBounds[];
  bounds: WalkBounds;
  residents: readonly IndoorRoutineResident[];
  player?: () => WalkPoint | null;
}) {
  const world = validBounds(options.bounds)
    ? options.bounds
    : { minX: -8, maxX: 8, minZ: -6, maxZ: 6 };
  const raw = options.obstacles.filter(validBounds).map((b) => ({ ...b }));
  const solids = raw.map((b) => expand(b, INDOOR_RESIDENT_RADIUS));
  const graphs = new Map<string, Graph>();
  function clear(a: WalkPoint, b: WalkPoint, bounds: WalkBounds, ignore = -1) {
    return (
      inside(a, bounds) &&
      inside(b, bounds) &&
      !solids.some((box, i) => i !== ignore && intersects(a, b, box))
    );
  }
  function graphFor(bounds: WalkBounds): Graph {
    const key = [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ].join(",");
    const cached = graphs.get(key);
    if (cached) return cached;
    const points = solids.flatMap(corners).filter((p) => clear(p, p, bounds));
    const edges: Graph["edges"] = points.map(() => []);
    for (let i = 0; i < points.length; i++)
      for (let j = i + 1; j < points.length; j++) {
        if (!clear(points[i]!, points[j]!, bounds)) continue;
        const length = distance(points[i]!, points[j]!);
        edges[i]!.push([j, length]);
        edges[j]!.push([i, length]);
      }
    const graph = { points, edges, bounds };
    graphs.set(key, graph);
    return graph;
  }
  function route(
    a: WalkPoint,
    b: WalkPoint,
    bounds: WalkBounds,
    occupants: Occupant[],
  ): Waypoint[] | null {
    if (!clear(a, a, bounds) || !clear(b, b, bounds)) return null;
    // Allow an already-overlapping actor to escape, but never enter an occupied goal.
    const boxes = occupants
      .filter(
        (o) => o.square || distance(a, o) >= o.radius + INDOOR_RESIDENT_RADIUS,
      )
      .map((o) => ({
        ...expand(
          { minX: o.x, maxX: o.x, minZ: o.z, maxZ: o.z },
          o.radius + INDOOR_RESIDENT_RADIUS + CLEARANCE,
        ),
        player: o.square ? o : null,
      }));
    const free = (from: WalkPoint, to: WalkPoint) =>
      boxes.every((box) =>
        box.player
          ? safeBoxMotion(
              to === a ? a : from,
              to === a ? from : to,
              box.player,
              box,
            )
          : !intersects(from, to, box),
      );
    if (!free(b, b)) return null;
    if (clear(a, b, bounds) && free(a, b)) return [{ ...b }];
    const graph = graphFor(bounds);
    const points = [
      ...graph.points,
      a,
      b,
      ...boxes
        .flatMap(corners)
        .filter((p) => clear(p, p, bounds) && free(p, p)),
    ];
    const start = graph.points.length,
      end = start + 1;
    const edges: Graph["edges"] = points.map((_, i) =>
      i < start
        ? graph.edges[i]!.filter(([j]) => free(points[i]!, points[j]!))
        : [],
    );
    for (let i = start; i < points.length; i++)
      for (let j = 0; j < i; j++) {
        if (
          !clear(points[i]!, points[j]!, bounds) ||
          !free(points[i]!, points[j]!)
        )
          continue;
        const length = distance(points[i]!, points[j]!);
        edges[i]!.push([j, length]);
        edges[j]!.push([i, length]);
      }
    const costs = points.map(() => Infinity),
      previous = points.map(() => -1),
      visited = new Set<number>();
    costs[start] = 0;
    for (let step = 0; step < points.length; step++) {
      let at = -1;
      for (let i = 0; i < points.length; i++)
        if (!visited.has(i) && (at < 0 || costs[i]! < costs[at]!)) at = i;
      if (at < 0 || !Number.isFinite(costs[at]!)) break;
      if (at === end) {
        const path: Waypoint[] = [];
        for (let cursor = end; cursor !== start; cursor = previous[cursor]!)
          path.unshift(points[cursor]!);
        return path;
      }
      visited.add(at);
      for (const [next, length] of edges[at]!)
        if (costs[at]! + length < costs[next]!) {
          costs[next] = costs[at]! + length;
          previous[next] = at;
        }
    }
    return null;
  }
  const states = options.residents.map((resident, index) => {
    let seed = hash(resident.id + ":" + index);
    const random = () => {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const candidate =
      resident.room && validBounds(resident.room)
        ? {
            minX: Math.max(world.minX, resident.room.minX),
            maxX: Math.min(world.maxX, resident.room.maxX),
            minZ: Math.max(world.minZ, resident.room.minZ),
            maxZ: Math.min(world.maxZ, resident.room.maxZ),
          }
        : world;
    const bounds = validBounds(candidate) ? candidate : world;
    const home = {
      x: clamp(finite(resident.home.x), bounds.minX, bounds.maxX),
      z: clamp(finite(resident.home.z), bounds.minZ, bounds.maxZ),
      yaw: angle(resident.home.yaw),
    };
    let exit: WalkPoint | null = clear(home, home, bounds) ? home : null;
    let homeObstacle = -1;
    if (!exit) {
      // The only collision exception is a short connection out of ONE containing
      // furniture-sized box. Other furniture and thin wall boxes remain solid.
      const choices = raw
        .map((box, i) => ({ box, i }))
        .filter(({ box }) => {
          const w = box.maxX - box.minX,
            d = box.maxZ - box.minZ;
          return (
            inside(home, expand(box, INDOOR_RESIDENT_RADIUS)) &&
            Math.min(w, d) >= 0.35 &&
            Math.min(w, d) <= 2.2 &&
            Math.max(w, d) <= 6
          );
        });
      let best = Infinity;
      for (const { i } of choices) {
        const box = solids[i]!;
        const candidates = [
          { x: box.minX - CLEARANCE, z: home.z },
          { x: box.maxX + CLEARANCE, z: home.z },
          { x: home.x, z: box.minZ - CLEARANCE },
          { x: home.x, z: box.maxZ + CLEARANCE },
          ...corners(box),
        ];
        for (const point of candidates) {
          const length = distance(home, point);
          if (
            length > 1.65 ||
            !clear(point, point, bounds) ||
            !clear(home, point, bounds, i)
          )
            continue;
          const score =
            length +
            (1 -
              Math.cos(
                angle(
                  Math.atan2(point.x - home.x, point.z - home.z) +
                    Math.PI -
                    home.yaw,
                ),
              )) *
              0.08;
          if (score < best) {
            best = score;
            exit = point;
            homeObstacle = i;
          }
        }
      }
    }
    const snapshot: Mutable<IndoorRoutineSnapshot> = {
      id: resident.id,
      ...home,
      speed: 0,
      travelled: 0,
      phase: "task",
      taskWeight: 1,
      seatWeight: resident.seated ? 1 : 0,
      label: resident.label ?? "At their usual task",
      activity: "idle",
      cycle: 0,
    };
    const stops = resident.stops
      .filter(
        (stop) =>
          Number.isFinite(stop.x) &&
          Number.isFinite(stop.z) &&
          clear(stop, stop, bounds) &&
          distance(home, stop) > 0.3,
      )
      .map((stop) => ({ ...stop, yaw: angle(stop.yaw) }));
    return {
      resident,
      snapshot,
      home,
      bounds,
      exit,
      homeObstacle,
      stops,
      random,
      timer: 6 + ((index * 0.61803398875 + random()) % 1) * 8,
      path: [] as Waypoint[],
      stop: null as IndoorRoutineStop | null,
      previousStop: -1,
      stuck: 0,
      retry: 0,
      detour: false,
      cruise: 0.72 + random() * 0.18,
    };
  });
  type State = (typeof states)[number];
  const residents: readonly IndoorRoutineSnapshot[] = states.map(
    (state) => state.snapshot,
  );
  // Stable boxes are mutated in place, so a scene may safely retain/spread them.
  const obstacles = states.map(({ snapshot: p }) => ({
    minX: p.x - INDOOR_RESIDENT_RADIUS,
    maxX: p.x + INDOOR_RESIDENT_RADIUS,
    minZ: p.z - INDOOR_RESIDENT_RADIUS,
    maxZ: p.z + INDOOR_RESIDENT_RADIUS,
  }));
  function occupantsFor(state: State, player: WalkPoint | null): Occupant[] {
    const others: Occupant[] = states
      .filter((s) => s !== state)
      .map(({ snapshot }) => ({
        x: snapshot.x,
        z: snapshot.z,
        radius: INDOOR_RESIDENT_RADIUS + 0.025,
      }));
    if (player && Number.isFinite(player.x) && Number.isFinite(player.z))
      others.push({
        x: player.x,
        z: player.z,
        radius: INTERIOR_RADIUS + 0.02,
        square: true,
      });
    return others;
  }
  function safeMotion(
    state: State,
    next: WalkPoint,
    occupants: Occupant[],
    homePass = false,
  ) {
    if (
      !clear(
        state.snapshot,
        next,
        state.bounds,
        homePass ? state.homeObstacle : -1,
      )
    )
      return false;
    return occupants.every((o) => {
      const separation = o.radius + INDOOR_RESIDENT_RADIUS;
      if (o.square)
        return safeBoxMotion(
          state.snapshot,
          next,
          o,
          expand({ minX: o.x, maxX: o.x, minZ: o.z, maxZ: o.z }, separation),
        );
      const before = distance(state.snapshot, o);
      if (before < separation) {
        const movingAway =
          (next.x - state.snapshot.x) * (state.snapshot.x - o.x) +
          (next.z - state.snapshot.z) * (state.snapshot.z - o.z);
        return movingAway >= 0 && distance(next, o) > before + 1e-7;
      }
      return segmentDistance(state.snapshot, next, o) >= separation;
    });
  }
  function pathTo(
    state: State,
    destination: WalkPoint,
    occupants: Occupant[],
    returning: boolean,
  ): Waypoint[] | null {
    if (!state.exit) return null;
    const fromHome =
      state.homeObstacle >= 0 &&
      inside(state.snapshot, solids[state.homeObstacle]!);
    const start = fromHome ? state.exit : state.snapshot;
    const end = returning ? state.exit : destination;
    const path = route(start, end, state.bounds, occupants);
    if (!path) return null;
    if (fromHome) {
      if (!clear(state.snapshot, state.exit, state.bounds, state.homeObstacle))
        return null;
      path.unshift({ ...state.exit, homePass: true });
    }
    if (returning && distance(state.exit, state.home) > 0.001)
      path.push({ ...state.home, homePass: true });
    return path;
  }
  function chooseStop(state: State, occupants: Occupant[]) {
    const order = state.stops
      .map((stop, index) => ({
        stop,
        index,
        score: state.random() + (index === state.previousStop ? 2 : 0),
      }))
      .sort((a, b) => a.score - b.score);
    for (const { stop, index } of order) {
      const path = pathTo(state, stop, occupants, false);
      if (!path) continue;
      state.stop = stop;
      state.previousStop = index;
      state.path = path;
      state.detour = false;
      return true;
    }
    return false;
  }
  function replan(state: State, occupants: Occupant[]) {
    const returning = state.snapshot.phase === "returning";
    const goal = returning ? state.home : state.stop;
    if (!goal) return;
    const path = pathTo(state, goal, occupants, returning);
    if (path) {
      state.path = path;
      state.detour = false;
      return;
    }
    // A bounded side-step/back-step lets two people yield in a passage. Replan
    // the original trip after the detour; never replace a real stop with it.
    const offset = state.random() * TAU;
    for (const length of [0.7, 1.1])
      for (let i = 0; i < 8; i++) {
        const yaw = offset + (i * Math.PI) / 4;
        const next = {
          x: state.snapshot.x + Math.sin(yaw) * length,
          z: state.snapshot.z + Math.cos(yaw) * length,
        };
        if (!safeMotion(state, next, occupants)) continue;
        state.path = [next];
        state.detour = true;
        return;
      }
  }
  function turn(state: State, yaw: number, dt: number) {
    const delta = angle(yaw - state.snapshot.yaw);
    state.snapshot.yaw = angle(
      state.snapshot.yaw + clamp(delta, -2.7 * dt, 2.7 * dt),
    );
    return Math.abs(angle(yaw - state.snapshot.yaw));
  }
  function arrive(state: State, occupants: Occupant[]) {
    const p = state.snapshot;
    p.speed = 0;
    p.activity = "idle";
    if (state.detour) {
      state.detour = false;
      replan(state, occupants);
      return;
    }
    if (p.phase === "returning") {
      p.phase = "settling";
      state.timer = 0;
      p.label = state.resident.label ?? "At their usual task";
    } else {
      p.phase = "visiting";
      state.timer = clamp(
        finite(state.stop?.dwell ?? 3 + state.random() * 4, 4),
        1,
        20,
      );
      p.label = state.stop?.label ?? "Taking a break";
      p.activity = state.stop?.activity ?? "idle";
    }
  }
  function update(dt: number, blocked = false, reducedMotion = false) {
    dt = clamp(finite(dt), 0, 0.05);
    if (!dt || blocked || reducedMotion) return;
    const player = options.player?.() ?? null;
    for (let index = 0; index < states.length; index++) {
      const state = states[index]!,
        p = state.snapshot;
      const occupants = occupantsFor(state, player);
      if (p.phase === "task") {
        state.timer -= dt;
        if (state.timer <= 0) {
          if (chooseStop(state, occupants)) {
            p.phase = "leaving";
            state.timer = 0;
          } else state.timer = 1.5 + state.random();
        }
      } else if (p.phase === "leaving") {
        state.timer = Math.min(BLEND_SECONDS, state.timer + dt);
        p.taskWeight = 1 - smooth(state.timer / BLEND_SECONDS);
        p.seatWeight = state.resident.seated ? p.taskWeight : 0;
        if (state.timer >= BLEND_SECONDS) {
          p.phase = "walking";
          p.label = "Walking to the next activity";
          state.retry = 0;
          state.stuck = 0;
        }
      } else if (p.phase === "settling") {
        const facing = turn(state, state.home.yaw, dt);
        if (facing < 0.12)
          state.timer = Math.min(BLEND_SECONDS, state.timer + dt);
        p.taskWeight = smooth(state.timer / BLEND_SECONDS);
        p.seatWeight = state.resident.seated ? p.taskWeight : 0;
        if (state.timer >= BLEND_SECONDS) {
          p.phase = "task";
          p.cycle++;
          state.timer = 10 + state.random() * 14;
        }
      } else if (p.phase === "visiting") {
        turn(state, state.stop?.yaw ?? p.yaw, dt);
        state.timer -= dt;
        if (state.timer <= 0) {
          p.phase = "returning";
          p.activity = "idle";
          p.label = "Returning to their task";
          state.path = pathTo(state, state.home, occupants, true) ?? [];
          state.detour = false;
          state.retry = 0;
          state.stuck = 0;
        }
      } else {
        state.retry = Math.max(0, state.retry - dt);
        while (state.path.length && distance(p, state.path[0]!) < 0.00001)
          state.path.shift();
        if (!state.path.length) {
          const goal = p.phase === "returning" ? state.home : state.stop;
          if (state.detour || (goal && distance(p, goal) < 0.001))
            arrive(state, occupants);
          else if (!state.retry) {
            replan(state, occupants);
            state.retry = 0.9 + state.random() * 0.7;
          }
        }
        const waypoint = state.path[0];
        if (waypoint) {
          const remaining = distance(p, waypoint);
          // Character rigs face local -Z (the player camera uses the opposite convention).
          const travelYaw = Math.atan2(waypoint.x - p.x, waypoint.z - p.z);
          const desiredYaw = angle(travelYaw + Math.PI);
          const error = turn(state, desiredYaw, dt);
          const targetSpeed =
            error > 0.22
              ? 0
              : Math.min(state.cruise, Math.sqrt(2 * 1.6 * remaining));
          p.speed += clamp(targetSpeed - p.speed, -2.4 * dt, 1.25 * dt);
          const step = error > 0.22 ? 0 : Math.min(remaining, p.speed * dt);
          const next = {
            x: p.x + Math.sin(travelYaw) * step,
            z: p.z + Math.cos(travelYaw) * step,
          };
          if (
            step > 0 &&
            safeMotion(state, next, occupants, waypoint.homePass)
          ) {
            p.x = next.x;
            p.z = next.z;
            p.travelled += step;
            state.stuck = 0;
            p.activity = step / dt > 0.035 ? "walk" : "idle";
            if (remaining - step < 0.00001) {
              state.path.shift();
              if (!state.path.length) arrive(state, occupants);
            }
          } else {
            // No foot cycling/sliding while stopped or turning in place.
            p.speed = 0;
            p.activity = "idle";
            if (error <= 0.22) state.stuck += dt;
            if (state.stuck > 0.75 && !state.retry) {
              replan(state, occupants);
              state.retry = 0.9 + state.random() * 0.7;
              state.stuck = 0;
            }
          }
        } else {
          p.speed = 0;
          p.activity = "idle";
        }
      }
      const obstacle = obstacles[index]!;
      obstacle.minX = p.x - INDOOR_RESIDENT_RADIUS;
      obstacle.maxX = p.x + INDOOR_RESIDENT_RADIUS;
      obstacle.minZ = p.z - INDOOR_RESIDENT_RADIUS;
      obstacle.maxZ = p.z + INDOOR_RESIDENT_RADIUS;
    }
  }
  return { update, residents, obstacles: obstacles as readonly WalkBounds[] };
}
