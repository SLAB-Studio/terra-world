import {
  advanceRoadProgress,
  sampleLane,
  sampleRoadFrame,
  type LaneId,
} from "./road";
import type { TrafficSimulation, TrafficStop } from "./traffic";
import type { WalkPoint } from "./walking";
import {
  RESIDENT_CROSSINGS,
  type createResidentNavigation,
} from "./resident-navigation";

export type ResidentDestination = Readonly<{
  id: string;
  kind: "home" | "venue" | "leisure";
  point: WalkPoint;
  threshold?: WalkPoint;
}>;
export type ResidentMode =
  | "idle"
  | "walking"
  | "entering"
  | "inside"
  | "exiting"
  | "waiting"
  | "boarding"
  | "seated"
  | "riding"
  | "alighting"
  | "departing";
export type ResidentLifeState = {
  id: string;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  travelled: number;
  mode: ResidentMode;
  timer: number;
  homeId: string;
  destinationId: string | null;
  path: readonly WalkPoint[];
  waypoint: number;
  trips: number;
  seed: number;
  crossingPermit: string | null;
  detour: WalkPoint | null;
  ride: { vehicleId: string; pickup: RideStop; dropoff: RideStop } | null;
  visited: string[];
};
export type RideStop = Readonly<{
  id: string;
  progress: number;
  laneId: LaneId;
  curb: WalkPoint;
  door: WalkPoint;
}>;
export type ResidentLifeEvent = Readonly<{
  residentId: string;
  type: "entered" | "exited" | "boarded" | "alighted";
  targetId: string;
}>;
type Navigation = ReturnType<typeof createResidentNavigation>;
const distance = (a: WalkPoint, b: WalkPoint) =>
  Math.hypot(a.x - b.x, a.z - b.z);
const finiteDelta = (delta: number) =>
  Number.isFinite(delta) ? Math.max(0, Math.min(0.05, delta)) : 0;
const angleDifference = (a: number, b: number) =>
  Math.atan2(Math.sin(b - a), Math.cos(b - a));
const bridgeCorridors = [0.283, 0.705].flatMap((progress) =>
  [-1, 1].map((side) => ({
    id: `${progress}:${side}`,
    frame: sampleRoadFrame(progress),
    side,
  })),
);
type CorridorPass = {
  corridor: (typeof bridgeCorridors)[number];
  winner: ResidentLifeState;
  yielding: ResidentLifeState;
  direction: number;
  phase: "backoff" | "pass" | "resume";
  path: readonly WalkPoint[];
  waypoint: number;
  exitPath: readonly WalkPoint[];
  winnerGoal: WalkPoint;
  yieldingGoal: WalkPoint;
};

/** Curbside service points stay away from the two bridge crossings. */
export const RESIDENT_RIDE_STOPS: readonly RideStop[] = (
  [0.115, 0.445, 0.565, 0.88] as const
).flatMap((progress, index) =>
  (["clockwise", "counter-clockwise"] as const).map((laneId) => {
    const frame = sampleRoadFrame(progress),
      sign = laneId === "clockwise" ? 1 : -1;
    const lane = sampleLane(laneId, progress);
    return {
      id: `pickup-${index}-${laneId}`,
      progress,
      laneId,
      curb: {
        x: frame.center.x + frame.lateral.x * sign * 6.5,
        z: frame.center.z + frame.lateral.z * sign * 6.5,
      },
      door: {
        x: lane.position.x + frame.lateral.x * sign * 1.25,
        z: lane.position.z + frame.lateral.z * sign * 1.25,
      },
    };
  }),
);

/** Destination-driven, local crowd simulation. No individual per-frame path search. */
export function createResidentLife(
  people: readonly {
    id: string;
    point: WalkPoint;
    yaw: number;
    phase?: number;
  }[],
  destinations: readonly ResidentDestination[],
  navigation: Navigation,
) {
  const places = new Map(destinations.map((d) => [d.id, d]));
  const states: ResidentLifeState[] = people.map((person, index) => {
    // Initial placement only: never leave a resident inside scenery if their
    // old decorative spawn was not on the walkable network.
    const start =
      navigation.closestWalkablePoint(person.point, 2) ??
      [...destinations].sort(
        (a, b) =>
          distance(person.point, a.point) - distance(person.point, b.point),
      )[0]?.point ??
      person.point;
    const homes = destinations.filter((d) => d.kind === "home");
    const home =
      [...homes].sort(
        (a, b) => distance(start, a.point) - distance(start, b.point),
      )[index % Math.min(3, homes.length)] ?? destinations[0];
    return {
      id: person.id,
      ...start,
      yaw: person.yaw,
      speed: 0,
      travelled: 0,
      mode: "idle",
      timer: 2 + (index % 11) * 1.7,
      homeId: home?.id ?? "",
      destinationId: null,
      path: [],
      waypoint: 0,
      trips: 0,
      seed: hash(person.id),
      crossingPermit: null,
      detour: null,
      ride: null,
      visited: [],
    };
  });
  const availableStops = RESIDENT_RIDE_STOPS.filter((stop) =>
    navigation.isWalkable(stop.curb),
  );
  let traffic: TrafficSimulation | null = null;
  let events: ResidentLifeEvent[] = [];
  let night = true;
  let disposed = false;
  const crossings = new Set<string>();
  const reservations = new Map<string, string>();
  const corridorPasses = new Map<string, CorridorPass>();
  const routeOwners = new Map<string, string>();
  const routeResourceCache = new WeakMap<
    readonly WalkPoint[],
    readonly string[]
  >();
  let elapsed = 0;
  let nextCorridorCheck = 0;
  let planningCursor = 0;
  const random = (state: ResidentLifeState) => {
    state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
    return state.seed / 4294967296;
  };
  const requestPath = (
    state: ResidentLifeState,
    point: WalkPoint,
    reserve = true,
  ) => {
    const path = navigation.findPath(state, point);
    if (!path) return false;
    let resources = routeResourceCache.get(path);
    if (!resources) {
      const required = new Set<string>();
      for (let index = 1; index < path.length; index++) {
        const from = path[index - 1]!,
          to = path[index]!;
        const count = Math.max(1, Math.ceil(distance(from, to) / 0.5));
        for (let step = 0; step <= count; step++) {
          const point = {
            x: from.x + ((to.x - from.x) * step) / count,
            z: from.z + ((to.z - from.z) * step) / count,
          };
          for (const corridor of bridgeCorridors)
            if (inCorridor(point, corridor)) required.add(corridor.id);
          const crossing = navigation.crossingAt(point);
          if (crossing) required.add(crossing.id);
        }
      }
      resources = [...required];
      routeResourceCache.set(path, resources);
    }
    // Admit a complete narrow-section route atomically. Waiting at the trip
    // origin leaves bridge exits free; partial reservations could deadlock two
    // opposite trips while queues prevent either pedestrian from backing out.
    if (reserve) {
      if (
        resources.some(
          (key) => routeOwners.has(key) && routeOwners.get(key) !== state.id,
        )
      )
        return false;
      for (const [key, owner] of routeOwners)
        if (owner === state.id) routeOwners.delete(key);
      for (const key of resources) routeOwners.set(key, state.id);
    }
    state.path = path;
    state.waypoint = 1;
    state.mode = "walking";
    state.speed = 0;
    state.detour = null;
    return true;
  };
  const emit = (
    state: ResidentLifeState,
    type: ResidentLifeEvent["type"],
    targetId: string,
  ) => events.push({ residentId: state.id, type, targetId });
  const recordVisit = (state: ResidentLifeState, id: string) => {
    if (!state.visited.includes(id)) state.visited.push(id);
    if (state.visited.length > 48) state.visited.shift();
  };
  function plan(state: ResidentLifeState) {
    // Rides are errands, not a teleport shortcut: walk to a curb, wait, board,
    // remain with that vehicle, and leave only when it stops at the destination.
    const rideDue = state.trips % 3 === 1;
    if (rideDue && traffic) {
      const vehicle = traffic.vehicles.find(
        (v) =>
          /^(berry-car|sky-car|sunny-bus|lilac-bus)$/.test(v.id) &&
          !reservations.has(v.id),
      );
      if (vehicle) {
        const stops = availableStops
          .filter((s) => s.laneId === vehicle.laneId)
          .map((stop) => {
            if (!vehicle.id.includes("bus")) return stop;
            // The coach doorway is ahead of its centre, between the wheel arches.
            const forward = sampleLane(stop.laneId, stop.progress).forward;
            return {
              ...stop,
              door: {
                x: stop.door.x + forward.x * 0.6,
                z: stop.door.z + forward.z * 0.6,
              },
            };
          });
        const pickup = [...stops].sort(
          (a, b) => distance(state, a.curb) - distance(state, b.curb),
        )[0];
        const alternatives = stops.filter((s) => s !== pickup);
        const dropoff =
          alternatives[Math.floor(random(state) * alternatives.length)];
        if (pickup && dropoff && requestPath(state, pickup.curb)) {
          state.ride = { vehicleId: vehicle.id, pickup, dropoff };
          state.destinationId = null;
          state.timer = 180; // Approach reservations cannot hold a vehicle indefinitely.
          reservations.set(vehicle.id, state.id);
          return;
        }
      }
    }
    const home = places.get(state.homeId);
    const candidates = destinations.filter(
      (d) => d.id !== state.destinationId && distance(state, d.point) > 8,
    );
    // Varied errands across districts; night makes home visits more frequent.
    const ordered =
      night && state.trips % 3 === 2 && home
        ? [home, ...candidates]
        : candidates;
    const start = ordered.length
      ? Math.floor(random(state) * ordered.length)
      : 0;
    for (let attempt = 0; attempt < Math.min(8, ordered.length); attempt++) {
      const place =
        ordered[
          night && state.trips % 3 === 2 && attempt === 0
            ? 0
            : (start + attempt) % ordered.length
        ]!;
      if (requestPath(state, place.point)) {
        state.destinationId = place.id;
        return;
      }
    }
    state.timer = 4 + random(state) * 6;
  }
  function crossingIsClear(id: string) {
    if (!traffic) return true; // A preview scene has no vehicle system.
    const cross = RESIDENT_CROSSINGS.find((c) => c.id === id)!;
    const frame = sampleRoadFrame(cross.progress);
    return !traffic.vehicles.some((vehicle) => {
      const lane = sampleLane(vehicle.laneId, vehicle.progress);
      const dx = lane.position.x - frame.center.x,
        dz = lane.position.z - frame.center.z;
      const along = dx * frame.tangent.x + dz * frame.tangent.z;
      const across = dx * frame.lateral.x + dz * frame.lateral.z;
      const alignment =
        lane.forward.x * frame.tangent.x + lane.forward.z * frame.tangent.z;
      const lateralAlignment =
        lane.lateral.x * frame.tangent.x + lane.lateral.z * frame.tangent.z;
      const footprint =
        (vehicle.lengthMeters / 2) * Math.abs(alignment) +
        0.9 * Math.abs(lateralAlignment);
      const approaching = along * alignment < 0;
      // Test the actual longitudinal vehicle footprint against the marked
      // crossing + pedestrian body, not a large circle. A bus safely stopped
      // beyond the stripes must not permanently block its own crossing signal.
      return (
        Math.abs(across) < 7 &&
        Math.abs(along) <
          3.35 +
            0.4 +
            footprint +
            (approaching ? vehicle.speedMetersPerSecond * 2 : 0)
      );
    });
  }
  function corridorAlong(point: WalkPoint, corridor: CorridorPass["corridor"]) {
    return (
      (point.x - corridor.frame.center.x) * corridor.frame.tangent.x +
      (point.z - corridor.frame.center.z) * corridor.frame.tangent.z
    );
  }
  function inCorridor(point: WalkPoint, corridor: CorridorPass["corridor"]) {
    const across =
      ((point.x - corridor.frame.center.x) * corridor.frame.lateral.x +
        (point.z - corridor.frame.center.z) * corridor.frame.lateral.z) *
      corridor.side;
    return (
      Math.abs(corridorAlong(point, corridor)) < 11 &&
      across > 4 &&
      across < 5.3
    );
  }
  function corridorPoint(
    corridor: CorridorPass["corridor"],
    along: number,
    across: number,
  ): WalkPoint {
    const { frame, side } = corridor;
    return {
      x:
        frame.center.x +
        frame.tangent.x * along +
        frame.lateral.x * side * across,
      z:
        frame.center.z +
        frame.tangent.z * along +
        frame.lateral.z * side * across,
    };
  }
  function prepareCorridorPasses() {
    if (elapsed < nextCorridorCheck) return;
    nextCorridorCheck = elapsed + 0.5;
    for (const corridor of bridgeCorridors) {
      if (corridorPasses.has(corridor.id)) continue;
      const occupants = states
        .filter(
          (state) =>
            state.mode === "walking" &&
            inCorridor(state, corridor) &&
            ![...corridorPasses.values()].some(
              (pass) => pass.winner === state || pass.yielding === state,
            ),
        )
        .sort((a, b) => a.id.localeCompare(b.id));
      for (let i = 0; i < occupants.length; i++) {
        const winner = occupants[i]!;
        const winnerTarget = winner.path[winner.waypoint];
        if (!winnerTarget) continue;
        const direction = Math.sign(
          corridorAlong(winnerTarget, corridor) -
            corridorAlong(winner, corridor),
        );
        const yielding = occupants.slice(i + 1).find((other) => {
          const target = other.path[other.waypoint];
          return (
            target &&
            distance(winner, other) < 3 &&
            (corridorAlong(other, corridor) - corridorAlong(winner, corridor)) *
              direction >
              0 &&
            (corridorAlong(target, corridor) - corridorAlong(other, corridor)) *
              direction <
              0
          );
        });
        if (!yielding || !direction) continue;
        // A bridge edge cannot fit two bodies. Back out to a real bank turnout,
        // then let the other person clear it before returning to either goal.
        // The temporary pass can extend beyond a goal inside the narrow strip.
        let pass: CorridorPass | null = null;
        // Prefer stable identity order, but an obstructed bank can make only
        // the opposite right-of-way feasible on a curved bridge approach.
        for (const reversed of [false, true]) {
          const leader = reversed ? yielding : winner;
          const follower = reversed ? winner : yielding;
          const forward = reversed ? -direction : direction;
          for (const along of [13, 16, 19]) {
            for (const [across, exitAcross] of [
              [7.2, 4.9],
              [8.5, 6.5],
              [10, 6.5],
              [10, 8.5],
            ] as const) {
              const bay = corridorPoint(corridor, forward * along, across);
              const exit = corridorPoint(
                corridor,
                forward * (along + 2.5),
                exitAcross,
              );
              if (!navigation.isWalkable(bay) || !navigation.isWalkable(exit))
                continue;
              const backoff = navigation.findPath(follower, bay);
              const exitPath = navigation.findPath(leader, exit);
              if (
                !backoff ||
                !exitPath ||
                !backoff.every(
                  (point) =>
                    (corridorAlong(point, corridor) -
                      corridorAlong(follower, corridor)) *
                      forward >
                    -0.35,
                )
              )
                continue;
              // A parked yielding person must be outside the passing route.
              if (
                exitPath.some(
                  (point, index) =>
                    index > 0 &&
                    segmentDistance(bay, exitPath[index - 1]!, point) < 0.9,
                )
              )
                continue;
              pass = {
                corridor,
                winner: leader,
                yielding: follower,
                direction: forward,
                phase: "backoff",
                path: backoff,
                waypoint: 1,
                exitPath,
                winnerGoal: leader.path.at(-1)!,
                yieldingGoal: follower.path.at(-1)!,
              };
              break;
            }
            if (pass) break;
          }
          if (pass) break;
        }
        if (pass) {
          winner.detour = null;
          yielding.detour = null;
          winner.speed = 0;
          yielding.speed = 0;
          corridorPasses.set(corridor.id, pass);
          break;
        }
      }
    }
  }
  function corridorUpdate(state: ResidentLifeState, dt: number): boolean {
    const pass = [...corridorPasses.values()].find(
      (entry) => entry.winner === state || entry.yielding === state,
    );
    if (!pass) return false;
    const active = pass.phase === "pass" ? pass.winner : pass.yielding;
    if (state !== active) {
      state.speed = 0;
      return true;
    }
    const target = pass.path[pass.waypoint];
    if (target && !move(state, target, dt, false, true)) return true;
    if (target) pass.waypoint++;
    if (pass.waypoint < pass.path.length) return true;
    state.speed = 0;
    if (pass.phase === "backoff") {
      pass.phase = "pass";
      pass.path = pass.exitPath;
      pass.waypoint = 1;
    } else if (pass.phase === "pass") {
      const path = navigation.findPath(pass.yielding, pass.yieldingGoal);
      if (!path) return true;
      pass.phase = "resume";
      pass.path = path;
      pass.waypoint = 1;
    } else {
      // Both agents keep the original destination and lifecycle. The yield
      // route is walked, never used as a reposition or visit completion.
      corridorPasses.delete(pass.corridor.id);
      requestPath(pass.yielding, pass.yieldingGoal, false);
      requestPath(pass.winner, pass.winnerGoal, false);
    }
    return true;
  }
  function move(
    state: ResidentLifeState,
    target: WalkPoint,
    dt: number,
    portal = false,
    corridorRecovery = false,
  ) {
    const aim = !portal && state.detour ? state.detour : target;
    const gap = distance(state, aim);
    if (
      aim !== target &&
      gap < 0.025 &&
      navigation.segmentIsWalkable(state, aim)
    ) {
      state.x = aim.x;
      state.z = aim.z;
      state.detour = null;
      state.speed = 0;
      return false;
    }
    if (gap < 0.025) {
      if (!portal && !navigation.segmentIsWalkable(state, target)) {
        state.speed = 0;
        return false;
      }
      state.x = target.x;
      state.z = target.z;
      state.speed = 0;
      return true;
    }
    const dx = (aim.x - state.x) / gap,
      dz = (aim.z - state.z) / gap;
    const wantedYaw = Math.atan2(-dx, -dz);
    const turn = angleDifference(state.yaw, wantedYaw);
    state.yaw += Math.max(-2.6 * dt, Math.min(2.6 * dt, turn));
    const pace = 1.05 + (hash(state.id) % 45) / 100;
    const wantedSpeed =
      Math.abs(turn) > 0.6 ? 0 : Math.min(pace, Math.sqrt(2 * 1.8 * gap));
    state.speed += Math.max(
      -2.4 * dt,
      Math.min(1.4 * dt, wantedSpeed - state.speed),
    );
    let travel = Math.min(gap, state.speed * dt);
    const ahead = {
      x: state.x + dx * Math.min(gap, 2.3),
      z: state.z + dz * Math.min(gap, 2.3),
    };
    const crossing =
      navigation.crossingAt(state) ?? navigation.crossingAt(ahead);
    if (!portal && crossing) {
      crossings.add(crossing.id);
      if (state.crossingPermit !== crossing.id) {
        if (crossingIsClear(crossing.id)) state.crossingPermit = crossing.id;
        else travel = 0;
      }
    } else if (!portal) {
      state.crossingPermit = null;
    }
    const next = { x: state.x + dx * travel, z: state.z + dz * travel };
    const nearby = states.filter(
      (other) =>
        other !== state && !["inside", "seated", "riding"].includes(other.mode),
    );
    const blocked = nearby.some(
      (other) =>
        distance(next, other) < 0.7 &&
        distance(next, other) < distance(state, other),
    );
    if (!portal && (!navigation.segmentIsWalkable(state, next) || blocked)) {
      // Both walkers prefer their own right, so approaching people pass on
      // opposite sides instead of freezing face-to-face. Sweeps still rule
      // out walls, riverbanks and unmarked road crossings.
      if (blocked && !corridorRecovery) {
        // A third pedestrian may have occupied an earlier sidestep. Recheck
        // its complete sweep and choose again instead of keeping a stale aim.
        state.detour = null;
        const targetGap = Math.max(0.001, distance(state, target));
        const forwardX = (target.x - state.x) / targetGap;
        const forwardZ = (target.z - state.z) / targetGap;
        for (const angle of [
          Math.PI / 2,
          -Math.PI / 2,
          Math.PI * 0.75,
          -Math.PI * 0.75,
          Math.PI,
        ]) {
          const candidate = {
            x:
              state.x +
              (forwardX * Math.cos(angle) - forwardZ * Math.sin(angle)) * 0.95,
            z:
              state.z +
              (forwardX * Math.sin(angle) + forwardZ * Math.cos(angle)) * 0.95,
          };
          if (
            navigation.segmentIsWalkable(state, candidate) &&
            navigation.segmentIsWalkable(candidate, target) &&
            nearby.every(
              (other) =>
                distance(candidate, other) > 0.75 &&
                segmentDistance(other, state, candidate) >=
                  Math.min(0.7, distance(state, other)) - 1e-6,
            )
          ) {
            state.detour = candidate;
            break;
          }
        }
      }
      state.speed = 0;
      return false;
    }
    if (travel === 0) {
      state.speed = 0;
      return false;
    }
    state.x = next.x;
    state.z = next.z;
    state.travelled += travel;
    // Keep each authored waypoint exact. Advancing while 4cm short can cut a
    // rail/lane corner on the next segment and permanently strand a walker.
    return distance(state, target) < 1e-6;
  }
  function vehicleReady(state: ResidentLifeState, stop: RideStop) {
    const vehicle = traffic?.vehicles.find(
      (v) => v.id === state.ride?.vehicleId,
    );
    return Boolean(
      vehicle &&
      vehicle.speedMetersPerSecond < 0.03 &&
      distance(
        sampleLane(vehicle.laneId, vehicle.progress).position,
        sampleLane(stop.laneId, stop.progress).position,
      ) < 0.25,
    );
  }
  function update(state: ResidentLifeState, dt: number) {
    state.timer = Math.max(0, state.timer - dt);
    if (state.mode === "walking" && state.ride && state.timer === 0) {
      reservations.delete(state.ride.vehicleId);
      state.ride = null;
      if (
        ![...corridorPasses.values()].some(
          (pass) => pass.winner === state || pass.yielding === state,
        )
      ) {
        state.mode = "idle";
        state.timer = 3;
        state.speed = 0;
        return;
      }
    }
    if (corridorUpdate(state, dt)) return;
    const place = state.destinationId ? places.get(state.destinationId) : null;
    if (state.mode === "walking") {
      const point = state.path[state.waypoint];
      if (point && !move(state, point, dt)) return;
      if (point) state.waypoint++;
      if (state.waypoint < state.path.length) return;
      state.speed = 0;
      if (state.ride) {
        state.mode = "waiting";
        state.timer = 150;
        return;
      }
      if (place?.threshold) {
        state.mode = "entering";
        state.timer = 0.7;
        return;
      }
      state.mode = "idle";
      state.trips++;
      state.timer = 10 + random(state) * 18;
      if (place) recordVisit(state, place.id);
    } else if (state.mode === "entering" && place?.threshold) {
      if (state.timer > 0) return;
      if (move(state, place.threshold, dt, true)) {
        state.mode = "inside";
        state.timer = 18 + random(state) * 30;
        state.speed = 0;
        recordVisit(state, place.id);
        emit(state, "entered", place.id);
      }
    } else if (state.mode === "inside" && state.timer === 0 && place) {
      state.mode = "exiting";
      state.timer = 0.7;
    } else if (state.mode === "exiting" && place) {
      if (state.timer > 0) return;
      if (move(state, place.point, dt, true)) {
        emit(state, "exited", place.id);
        state.mode = "idle";
        state.trips++;
        state.timer = 2 + random(state) * 4;
      }
    } else if (state.mode === "waiting" && state.ride) {
      if (vehicleReady(state, state.ride.pickup)) {
        state.mode = "boarding";
        state.timer = 0.7;
      } else if (state.timer === 0) {
        reservations.delete(state.ride.vehicleId);
        state.ride = null;
        state.mode = "idle";
        state.trips++;
        state.timer = 3;
      }
    } else if (state.mode === "boarding" && state.ride) {
      if (state.timer > 0 || !vehicleReady(state, state.ride.pickup)) return;
      if (move(state, state.ride.pickup.door, dt, true)) {
        state.mode = "seated";
        state.timer = 0.7;
        state.speed = 0;
        emit(state, "boarded", state.ride.vehicleId);
      }
    } else if (state.mode === "seated" && state.timer === 0 && state.ride) {
      // The passenger is now in the cabin. Hold the pickup while the door
      // closes, then release the car toward its reserved drop-off.
      state.mode = "riding";
    } else if (state.mode === "riding" && state.ride) {
      const vehicle = traffic?.vehicles.find(
        (v) => v.id === state.ride!.vehicleId,
      );
      if (vehicle) {
        const position = sampleLane(vehicle.laneId, vehicle.progress).position;
        state.x = position.x;
        state.z = position.z;
      }
      if (vehicleReady(state, state.ride.dropoff)) {
        state.x = state.ride.dropoff.door.x;
        state.z = state.ride.dropoff.door.z;
        state.mode = "alighting";
        state.timer = 0.7;
      }
    } else if (state.mode === "alighting" && state.ride) {
      if (state.timer > 0 || !vehicleReady(state, state.ride.dropoff)) return;
      if (move(state, state.ride.dropoff.curb, dt, true)) {
        emit(state, "alighted", state.ride.vehicleId);
        recordVisit(state, state.ride.dropoff.id);
        state.mode = "departing";
        state.timer = 0.7;
        state.speed = 0;
      }
    } else if (state.mode === "departing" && state.timer === 0 && state.ride) {
      reservations.delete(state.ride.vehicleId);
      state.ride = null;
      state.mode = "idle";
      state.trips++;
      state.timer = 3;
    }
  }
  return {
    states,
    destinations,
    stops: availableStops,
    setTraffic(value: TrafficSimulation) {
      traffic = value;
    },
    setNight(value: boolean) {
      night = value;
    },
    step(delta: number, reduced = false) {
      events = [];
      if (disposed || reduced) return;
      const dt = finiteDelta(delta);
      if (!dt) return;
      elapsed += dt;
      for (const [key, owner] of routeOwners)
        if (states.find((state) => state.id === owner)?.mode !== "walking")
          routeOwners.delete(key);
      crossings.clear();
      prepareCorridorPasses();
      states.forEach((state) => update(state, dt));
      // Spread expensive trip planning across frames, never rebuild a graph per resident.
      for (let i = 0; i < states.length; i++) {
        const state = states[(planningCursor + i) % states.length]!;
        if (state.mode === "idle" && state.timer === 0) {
          plan(state);
          planningCursor = (planningCursor + i + 1) % states.length;
          break;
        }
      }
    },
    get events() {
      return events;
    },
    get trafficStops(): readonly TrafficStop[] {
      const result: TrafficStop[] = [];
      for (const id of crossings) {
        const crossing = RESIDENT_CROSSINGS.find((c) => c.id === id)!;
        for (const laneId of ["clockwise", "counter-clockwise"] as const) {
          const direction = laneId === "clockwise" ? 1 : -1;
          result.push({
            id: `pedestrian-${id}-${laneId}`,
            laneId,
            progress: advanceRoadProgress(crossing.progress, -direction * 6),
          });
        }
      }
      for (const state of states)
        if (state.ride && state.mode !== "walking") {
          const stop = ["riding", "alighting", "departing"].includes(state.mode)
            ? state.ride.dropoff
            : state.ride.pickup;
          result.push({
            id: `ride-${state.id}`,
            vehicleId: state.ride.vehicleId,
            laneId: stop.laneId,
            progress: stop.progress,
            center: true,
          });
        }
      return result;
    },
    dispose() {
      disposed = true;
      reservations.clear();
      corridorPasses.clear();
      routeOwners.clear();
      crossings.clear();
      navigation.clearCache();
    },
  };
}
function hash(text: string) {
  let value = 2166136261;
  for (const c of text) value = Math.imul(value ^ c.charCodeAt(0), 16777619);
  return value >>> 0;
}
function segmentDistance(point: WalkPoint, from: WalkPoint, to: WalkPoint) {
  const dx = to.x - from.x,
    dz = to.z - from.z;
  const lengthSquared = dx * dx + dz * dz;
  const t =
    lengthSquared > 0
      ? Math.max(
          0,
          Math.min(
            1,
            ((point.x - from.x) * dx + (point.z - from.z) * dz) / lengthSquared,
          ),
        )
      : 0;
  return Math.hypot(point.x - from.x - t * dx, point.z - from.z - t * dz);
}
