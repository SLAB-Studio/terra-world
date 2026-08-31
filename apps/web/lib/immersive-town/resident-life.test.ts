import { describe, expect, it } from "vitest";

import {
  advanceRoadProgress,
  sampleLane,
  sampleRoadFrame,
  type LaneId,
} from "./road";
import {
  createResidentLife,
  RESIDENT_RIDE_STOPS,
  type ResidentDestination,
  type ResidentMode,
} from "./resident-life";
import {
  createResidentNavigation,
  RESIDENT_CROSSINGS,
} from "./resident-navigation";
import { createTrafficSimulation, stepTraffic } from "./traffic";

const places: readonly ResidentDestination[] = [
  {
    id: "home",
    kind: "home",
    point: { x: -55, z: -47 },
    threshold: { x: -55, z: -48 },
  },
  {
    id: "library",
    kind: "venue",
    point: { x: -35, z: -47 },
    threshold: { x: -35, z: -48 },
  },
  { id: "park", kind: "leisure", point: { x: -35, z: -28 } },
  {
    id: "friend",
    kind: "home",
    point: { x: -54, z: -28 },
    threshold: { x: -54, z: -29 },
  },
];
const person = { id: "resident-test", point: { x: -55, z: -46 }, yaw: 0 };
const separation = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z);

describe("resident social outings", () => {
  const family = [
    {
      id: "parent",
      point: { x: -55, z: -46 },
      yaw: -Math.PI / 2,
      socialGroup: { id: "family", role: "leader" as const },
      walkingSpeed: 1.2,
    },
    {
      id: "child",
      point: { x: -55, z: -45.05 },
      yaw: -Math.PI / 2,
      socialGroup: { id: "family", role: "companion" as const },
      walkingSpeed: 1.05,
    },
  ];

  it("walks and visits together for ten minutes without child car errands or position coupling", () => {
    const navigation = createResidentNavigation([]);
    const life = createResidentLife(family, places, navigation);
    life.setTraffic(createTrafficSimulation());
    let widest = 0;
    try {
      for (let tick = 0; tick < 12_000; tick++) {
        const before = life.states.map((state) => ({ ...state }));
        life.step(0.05);
        const [parent, child] = life.states;
        expect(parent!.destinationId).toBe(child!.destinationId);
        expect(
          life.states.filter(
            (state) =>
              ["entering", "exiting"].includes(state.mode) && state.speed > 0,
          ).length,
        ).toBeLessThanOrEqual(1);
        for (let index = 0; index < life.states.length; index++) {
          const state = life.states[index]!;
          expect(state.ride).toBeNull();
          expect(separation(state, before[index]!)).toBeLessThanOrEqual(0.084);
          if (before[index]!.mode === "walking")
            expect(navigation.segmentIsWalkable(before[index]!, state)).toBe(
              true,
            );
        }
        if (parent!.mode === "walking" && child!.mode === "walking") {
          widest = Math.max(widest, separation(parent!, child!));
          expect(
            separation(parent!, child!),
            JSON.stringify({ tick, before, after: life.states }),
          ).toBeGreaterThanOrEqual(0.6999);
        }
      }
      expect(widest).toBeLessThan(3.5);
      expect(
        life.states.every((state) => state.trips >= 3),
        JSON.stringify(life.states),
      ).toBe(true);
      expect(life.states[0]!.visited.length).toBeGreaterThanOrEqual(3);
      expect(life.states[0]!.visited).toEqual(life.states[1]!.visited);
    } finally {
      life.dispose();
    }
  }, 30_000);

  it("allows a group across a narrow bridge in single file and retains its reservation for the last companion", () => {
    const navigation = createResidentNavigation([]);
    const life = createResidentLife(
      [
        { ...family[0]!, point: { x: -30, z: -30 } },
        { ...family[1]!, point: { x: -30, z: -29.05 } },
        { id: "unrelated", point: { x: -33, z: -30 }, yaw: 0 },
      ],
      [{ id: "far-bank", kind: "leisure", point: { x: 40, z: -30 } }],
      navigation,
    );
    try {
      life.states.forEach((state) => (state.timer = 0));
      life.step(0.05);
      expect(life.states.slice(0, 2).map((state) => state.mode)).toEqual([
        "walking",
        "walking",
      ]);
      life.step(0.05);
      expect(life.states[2]!.mode).toBe("idle");
      for (let tick = 0; tick < 8_000 && life.states[1]!.trips === 0; tick++) {
        const before = life.states.map((state) => ({ ...state }));
        life.step(0.05);
        for (let index = 0; index < 2; index++) {
          expect(
            separation(life.states[index]!, before[index]!),
          ).toBeLessThanOrEqual(0.084);
          expect(
            navigation.segmentIsWalkable(before[index]!, life.states[index]!),
          ).toBe(true);
        }
        expect(separation(life.states[0]!, life.states[1]!)).toBeLessThan(4);
      }
      expect(life.states[0]!.visited).toContain("far-bank");
      expect(life.states[1]!.visited).toContain("far-bank");
    } finally {
      life.dispose();
    }
  }, 30_000);

  it("preserves an explicitly brisk older-adult pace and clamps malformed speed input", () => {
    const life = createResidentLife(
      [
        { ...person, id: "brisk-elder", walkingSpeed: 1.45 },
        {
          ...person,
          id: "invalid",
          point: { x: -53, z: -46 },
          walkingSpeed: NaN,
        },
        {
          ...person,
          id: "too-fast",
          point: { x: -51, z: -46 },
          walkingSpeed: 99,
        },
      ],
      places,
      createResidentNavigation([]),
    );
    try {
      expect(life.states[0]!.walkingSpeed).toBe(1.45);
      expect(Number.isFinite(life.states[1]!.walkingSpeed)).toBe(true);
      expect(life.states[2]!.walkingSpeed).toBe(1.65);
    } finally {
      life.dispose();
    }
  });

  it("keeps an orphaned companion walking without assigning a solo car ride", () => {
    const life = createResidentLife(
      [family[1]!],
      places,
      createResidentNavigation([]),
    );
    try {
      life.setTraffic(createTrafficSimulation());
      life.states[0]!.trips = 1;
      life.states[0]!.timer = 0;
      life.step(0.05);
      expect(life.states[0]!.mode).toBe("walking");
      expect(life.states[0]!.ride).toBeNull();
      expect(life.states[0]!.destinationId).not.toBeNull();
    } finally {
      life.dispose();
    }
  });

  it("replans a family's entire route together after a new barrier appears", () => {
    let blocked = false;
    const navigation = createResidentNavigation([], {
      dynamicObstacles: () =>
        blocked ? [{ minX: -47, maxX: -44, minZ: -48, maxZ: -44 }] : [],
    });
    const life = createResidentLife(
      family,
      [{ id: "east", kind: "leisure", point: { x: -35, z: -46 } }],
      navigation,
    );
    try {
      life.states.forEach((state) => (state.timer = 0));
      for (let tick = 0; tick < 60; tick++) life.step(0.05);
      const beforeChange = life.states.map((state) => ({
        x: state.x,
        z: state.z,
      }));
      blocked = true;
      navigation.invalidateGeometry();
      life.replanRoutes();
      expect(life.states.map((state) => ({ x: state.x, z: state.z }))).toEqual(
        beforeChange,
      );
      expect(life.states.map((state) => state.mode)).toEqual([
        "walking",
        "walking",
      ]);
      for (
        let tick = 0;
        tick < 2_400 && life.states.some((state) => state.trips === 0);
        tick++
      ) {
        const before = life.states.map((state) => ({ x: state.x, z: state.z }));
        life.step(0.05);
        life.states.forEach((state, index) => {
          expect(navigation.segmentIsWalkable(before[index]!, state)).toBe(
            true,
          );
          expect(separation(before[index]!, state)).toBeLessThanOrEqual(0.084);
        });
        expect(separation(life.states[0]!, life.states[1]!)).toBeLessThan(4);
      }
      expect(
        life.states.every((state) => state.visited.includes("east")),
        JSON.stringify(life.states),
      ).toBe(true);
    } finally {
      life.dispose();
    }
  });

  it("keeps a bridge reservation after its leader arrives until the companion arrives too", () => {
    const life = createResidentLife(
      [
        { ...family[0]!, point: { x: -30, z: -30 } },
        { ...family[1]!, point: { x: -30, z: -29.05 } },
        { id: "unrelated", point: { x: -33, z: -30 }, yaw: 0 },
      ],
      [{ id: "far-bank", kind: "leisure", point: { x: 40, z: -30 } }],
      createResidentNavigation([]),
    );
    try {
      life.states.forEach((state) => (state.timer = 0));
      life.step(0.05);
      life.states[0]!.mode = "inside";
      life.states[0]!.timer = 100;
      life.step(0.05);
      expect(life.states[2]!.mode).toBe("idle");
      life.states[1]!.mode = "inside";
      life.states[1]!.timer = 100;
      life.states[2]!.timer = 0;
      life.step(0.05);
      expect(life.states[2]!.mode).toBe("walking");
    } finally {
      life.dispose();
    }
  });
});

describe("resident destination life", () => {
  it("briefly releases an unserved curb request to clear queued vehicles, then safely crosses as a family", () => {
    const crossing = { id: "detour-crossing", progress: 0.4 };
    const frame = sampleRoadFrame(crossing.progress);
    const point = (side: number, along = 0) => ({
      x:
        frame.center.x + frame.lateral.x * side * 4.8 + frame.tangent.x * along,
      z:
        frame.center.z + frame.lateral.z * side * 4.8 + frame.tangent.z * along,
    });
    const life = createResidentLife(
      [
        {
          id: "crossing-parent",
          point: point(1),
          yaw: 0,
          socialGroup: { id: "crossing-family", role: "leader" },
        },
        {
          id: "crossing-child",
          point: point(1, 0.95),
          yaw: 0,
          socialGroup: { id: "crossing-family", role: "companion" },
        },
      ],
      [{ id: "across", kind: "leisure", point: point(-1) }],
      createResidentNavigation([], { additionalCrossings: () => [crossing] }),
    );
    let traffic = createTrafficSimulation([
      {
        id: "queued-car",
        laneId: "clockwise",
        startProgress: crossing.progress,
        cruiseSpeedMetersPerSecond: 8,
        lengthMeters: 4,
      },
    ]);
    try {
      life.setTraffic(traffic);
      life.states.forEach((state) => (state.timer = 0));
      const before = life.states.map((state) => ({ x: state.x, z: state.z }));
      for (let tick = 0; tick < 220; tick++) {
        life.step(0.05);
        life.states.forEach((state, index) => {
          expect(state.crossingPermit).toBeNull();
          expect(separation(before[index]!, state)).toBeLessThan(0.03);
        });
      }
      expect(life.trafficStops).toHaveLength(0);
      for (
        let tick = 0;
        tick < 2_000 && life.states.some((state) => state.trips === 0);
        tick++
      ) {
        traffic = stepTraffic(traffic, 0.05, { stops: life.trafficStops });
        life.setTraffic(traffic);
        life.step(0.05);
      }
      expect(
        life.states.every((state) => state.visited.includes("across")),
      ).toBe(true);
    } finally {
      life.dispose();
    }
  });

  it("never releases a crossing while an admitted pedestrian is still clearing it", () => {
    const crossing = { id: "detour-crossing", progress: 0.4 };
    const frame = sampleRoadFrame(crossing.progress);
    const point = (side: number) => ({
      x: frame.center.x + frame.lateral.x * side * 4.8,
      z: frame.center.z + frame.lateral.z * side * 4.8,
    });
    const life = createResidentLife(
      [
        { id: "waiting", point: point(1), yaw: 0 },
        { id: "clearing", point: point(-1), yaw: 0 },
      ],
      [{ id: "across", kind: "leisure", point: point(-1) }],
      createResidentNavigation([], { additionalCrossings: () => [crossing] }),
    );
    try {
      life.setTraffic(
        createTrafficSimulation([
          {
            id: "queued-car",
            laneId: "clockwise",
            startProgress: crossing.progress,
            cruiseSpeedMetersPerSecond: 8,
            lengthMeters: 4,
          },
        ]),
      );
      life.states[0]!.timer = 0;
      life.step(0.05);
      for (let tick = 0; tick < 500; tick++) {
        // Retain the other person's admission throughout a long clearing phase.
        // They are not permitted to lose protection just because this curb
        // request would otherwise time out and yield to vehicles.
        life.states[1]!.mode = "walking";
        life.states[1]!.crossingPermit = crossing.id;
        life.step(0.05);
        expect(life.trafficStops).toHaveLength(2);
        expect(life.states[0]!.crossingPermit).toBeNull();
      }
    } finally {
      life.dispose();
    }
  });

  it("holds a conflicting bridge trip at its origin until the narrow route is released", () => {
    const life = createResidentLife(
      [
        { id: "first", point: { x: -30, z: -30 }, yaw: 0 },
        { id: "second", point: { x: -32, z: -30 }, yaw: 0 },
      ],
      [{ id: "far-bank", kind: "leisure", point: { x: 40, z: -30 } }],
      createResidentNavigation([]),
    );
    try {
      for (const state of life.states) state.timer = 0;
      life.step(0.05);
      life.step(0.05);
      expect(life.states[0]!.mode).toBe("walking");
      expect(life.states[1]!.mode).toBe("idle");
      expect({ x: life.states[1]!.x, z: life.states[1]!.z }).toEqual({
        x: -32,
        z: -30,
      });
      life.states[0]!.mode = "inside";
      life.states[0]!.timer = 100;
      life.states[1]!.timer = 0;
      life.step(0.05);
      expect(life.states[1]!.mode).toBe("walking");
    } finally {
      life.dispose();
    }
  });

  it("lets a pedestrian pass a stationary coach whose footprint is clear of the stripes", () => {
    const frame = sampleRoadFrame(0.69);
    const start = {
      x: frame.center.x + frame.lateral.x * 4.8,
      z: frame.center.z + frame.lateral.z * 4.8,
    };
    const target = {
      x: frame.center.x - frame.lateral.x * 4.8,
      z: frame.center.z - frame.lateral.z * 4.8,
    };
    const life = createResidentLife(
      [{ id: "coach-crossing", point: start, yaw: 0 }],
      [{ id: "across-coach", kind: "leisure", point: target }],
      createResidentNavigation([]),
    );
    try {
      life.setTraffic(
        createTrafficSimulation([
          {
            id: "metro-bus-0",
            laneId: "clockwise",
            startProgress: 0.6727436051379484,
            cruiseSpeedMetersPerSecond: 8,
            lengthMeters: 5.8,
          },
        ]),
      );
      life.states[0]!.timer = 0;
      for (let i = 0; i < 800 && life.states[0]!.trips === 0; i++)
        life.step(0.05);
      expect(life.states[0]!.visited).toContain("across-coach");
    } finally {
      life.dispose();
    }
  });
  it.each(
    [0.283, 0.705].flatMap((progress) =>
      [-1, 1].map((side) => ({ progress, side })),
    ),
  )(
    "safely backs out and resolves opposing starts on bridge $progress side $side",
    ({ progress, side }) => {
      const frame = sampleRoadFrame(progress);
      const point = (along: number) => ({
        x:
          frame.center.x +
          frame.lateral.x * side * 4.9 +
          frame.tangent.x * along,
        z:
          frame.center.z +
          frame.lateral.z * side * 4.9 +
          frame.tangent.z * along,
      });
      assertOpposingRoutes(point(-2), point(2), 2_400);
    },
  );

  it.each(RESIDENT_CROSSINGS)(
    "passes opposing walkers within marked crossing $id",
    (crossing) => {
      const frame = sampleRoadFrame(crossing.progress);
      const point = (side: number) => ({
        x: frame.center.x + frame.lateral.x * side * 4.8,
        z: frame.center.z + frame.lateral.z * side * 4.8,
      });
      assertOpposingRoutes(point(-1), point(1), 2_400);
    },
  );

  it("does not stop a reserved vehicle during a distant walking approach and expires abandoned reservations", () => {
    const navigation = createResidentNavigation([]);
    const pickup = RESIDENT_RIDE_STOPS.find(
      (stop) => stop.progress === 0.115 && stop.laneId === "clockwise",
    )!;
    const life = createResidentLife(
      [{ id: "distant-rider", point: { x: -55, z: -40 }, yaw: 0 }],
      places,
      navigation,
    );
    try {
      life.setTraffic(
        createTrafficSimulation([
          {
            id: "berry-car",
            laneId: "clockwise",
            startProgress: pickup.progress,
            cruiseSpeedMetersPerSecond: 8,
            lengthMeters: 4,
          },
        ]),
      );
      const state = life.states[0]!;
      state.trips = 1;
      state.timer = 0;
      life.step(0.05);
      expect(state.mode).toBe("walking");
      expect(state.ride).not.toBeNull();
      expect(life.trafficStops).toHaveLength(0);
      state.timer = 0.01;
      life.step(0.05);
      expect(state.ride).toBeNull();
      expect(state.mode).toBe("idle");
      expect(life.trafficStops).toHaveLength(0);
    } finally {
      life.dispose();
    }
  });

  it("passes a head-on pedestrian encounter with local detours and body clearance", () => {
    const navigation = createResidentNavigation([]);
    const destinations: readonly ResidentDestination[] = [
      { id: "west", kind: "leisure", point: { x: -52, z: -42 } },
      { id: "east", kind: "leisure", point: { x: -38, z: -42 } },
    ];
    const life = createResidentLife(
      [
        { id: "eastbound", point: { x: -50, z: -42 }, yaw: -Math.PI / 2 },
        { id: "westbound", point: { x: -40, z: -42 }, yaw: Math.PI / 2 },
      ],
      destinations,
      navigation,
    );
    let detoured = false;
    let lateralTravel = 0;
    try {
      life.states.forEach((state, index) => {
        const destination = destinations[1 - index]!;
        state.path = navigation.findPath(state, destination.point)!;
        state.waypoint = 1;
        state.mode = "walking";
        state.destinationId = destination.id;
        state.timer = 0;
      });
      for (
        let tick = 0;
        tick < 1_200 && life.states.some((state) => state.trips === 0);
        tick++
      ) {
        const before = life.states.map((state) => ({ ...state }));
        life.step(0.05);
        expect(
          separation(life.states[0]!, life.states[1]!),
        ).toBeGreaterThanOrEqual(0.6999);
        life.states.forEach((state, index) => {
          detoured ||= state.detour !== null;
          lateralTravel = Math.max(lateralTravel, Math.abs(state.z + 42));
          expect(separation(before[index]!, state)).toBeLessThanOrEqual(0.08);
          expect(navigation.segmentIsWalkable(before[index]!, state)).toBe(
            true,
          );
        });
      }
      expect(detoured).toBe(true);
      expect(lateralTravel).toBeGreaterThan(0.4);
      expect(life.states[0]!.visited).toContain("east");
      expect(life.states[1]!.visited).toContain("west");
    } finally {
      life.dispose();
    }
  });

  it("places a blocked decorative spawn at its nearest safe destination only during initialization", () => {
    const navigation = createResidentNavigation([
      { minX: -55, maxX: -45, minZ: -50, maxZ: -40 },
    ]);
    const blocked = { x: -50, z: -45 };
    const nearest = { x: -58, z: -45 };
    expect(navigation.closestWalkablePoint(blocked)).toBeNull();
    const life = createResidentLife(
      [{ id: "old-decorative-spawn", point: blocked, yaw: 0 }],
      [
        { id: "far", kind: "leisure", point: { x: -30, z: -30 } },
        { id: "near", kind: "home", point: nearest },
      ],
      navigation,
    );
    try {
      expect({ x: life.states[0]!.x, z: life.states[0]!.z }).toEqual(nearest);
      for (let i = 0; i < 120; i++) {
        const before = { ...life.states[0]! };
        life.step(0.05);
        expect(navigation.isWalkable(life.states[0]!)).toBe(true);
        expect(separation(before, life.states[0]!)).toBeLessThanOrEqual(0.08);
      }
    } finally {
      life.dispose();
    }
  });

  it("requests both traffic lanes to stop and yields before crossing a nearby vehicle", () => {
    const crossing = RESIDENT_CROSSINGS[0]!;
    const frame = sampleRoadFrame(crossing.progress);
    const start = {
      x: frame.center.x + frame.lateral.x * 4.8,
      z: frame.center.z + frame.lateral.z * 4.8,
    };
    const target = {
      x: frame.center.x - frame.lateral.x * 4.8,
      z: frame.center.z - frame.lateral.z * 4.8,
    };
    const life = createResidentLife(
      [
        {
          id: "crossing-pedestrian",
          point: start,
          yaw: Math.atan2(frame.lateral.x, frame.lateral.z),
        },
      ],
      [{ id: "across", kind: "leisure", point: target }],
      createResidentNavigation([]),
    );
    try {
      const state = life.states[0]!;
      state.timer = 0;
      life.setTraffic(
        createTrafficSimulation([
          {
            id: "nearby-car",
            laneId: "clockwise",
            startProgress: crossing.progress,
            cruiseSpeedMetersPerSecond: 8,
            lengthMeters: 4,
          },
        ]),
      );
      for (let i = 0; i < 60; i++) life.step(0.05);
      expect(separation(state, start)).toBeLessThan(0.01);
      expect(state.crossingPermit).toBeNull();
      expect(life.trafficStops.map((stop) => stop.laneId).sort()).toEqual([
        "clockwise",
        "counter-clockwise",
      ]);
      // Once the visible traffic system reports clear, a permit lasts across
      // the crossing and the resident can finish instead of waiting forever.
      life.setTraffic(createTrafficSimulation([]));
      for (let i = 0; i < 800 && state.trips === 0; i++) life.step(0.05);
      expect(state.trips).toBe(1);
      expect(separation(state, target)).toBeLessThan(0.05);
    } finally {
      life.dispose();
    }
  });

  it("crosses marked pavement in a preview that has no traffic simulation", () => {
    const frame = sampleRoadFrame(RESIDENT_CROSSINGS[0]!.progress);
    const start = {
      x: frame.center.x + frame.lateral.x * 4.8,
      z: frame.center.z + frame.lateral.z * 4.8,
    };
    const target = {
      x: frame.center.x - frame.lateral.x * 4.8,
      z: frame.center.z - frame.lateral.z * 4.8,
    };
    const life = createResidentLife(
      [{ id: "preview-walker", point: start, yaw: 0 }],
      [{ id: "preview-across", kind: "leisure", point: target }],
      createResidentNavigation([]),
    );
    try {
      life.states[0]!.timer = 0;
      for (let i = 0; i < 800 && life.states[0]!.trips === 0; i++)
        life.step(0.05);
      expect(life.states[0]!.visited).toContain("preview-across");
      expect(separation(life.states[0]!, target)).toBeLessThan(0.05);
    } finally {
      life.dispose();
    }
  });

  it("deterministically visits multiple destinations, walks through entry and exit, and never teleports between places", () => {
    const navigation = createResidentNavigation([]);
    const first = createResidentLife([person], places, navigation);
    const second = createResidentLife(
      [person],
      places,
      createResidentNavigation([]),
    );
    const entered: string[] = [];
    const exited: string[] = [];
    const modes = new Set<ResidentMode>();
    try {
      for (let tick = 0; tick < 16_000; tick++) {
        const before = { ...first.states[0]! };
        first.step(0.05);
        second.step(0.05);
        const state = first.states[0]!;
        modes.add(state.mode);
        expect(separation(before, state)).toBeLessThanOrEqual(0.08);
        expect(
          Number.isFinite(state.x + state.z + state.yaw + state.speed),
        ).toBe(true);
        if (!["entering", "inside", "exiting"].includes(state.mode))
          expect(navigation.isWalkable(state)).toBe(true);
        for (const event of first.events) {
          const place = places.find(
            (candidate) => candidate.id === event.targetId,
          )!;
          if (event.type === "entered") {
            entered.push(event.targetId);
            expect(state.mode).toBe("inside");
            expect(separation(state, place.threshold!)).toBeLessThan(0.05);
          } else if (event.type === "exited") {
            exited.push(event.targetId);
            expect(state.mode).toBe("idle");
            expect(separation(state, place.point)).toBeLessThan(0.05);
          }
        }
        if (tick % 100 === 0) expect(second.states).toEqual(first.states);
      }
      expect(first.states[0]!.visited.length).toBeGreaterThanOrEqual(3);
      expect(first.states[0]!.trips).toBeGreaterThan(3);
      expect(first.states[0]!.travelled).toBeGreaterThan(100);
      expect(entered.length).toBeGreaterThan(2);
      expect(exited.length).toBeGreaterThan(2);
      expect([...modes]).toEqual(
        expect.arrayContaining([
          "walking",
          "entering",
          "inside",
          "exiting",
          "idle",
        ]),
      );
    } finally {
      first.dispose();
      second.dispose();
    }
  });

  it("freezes reduced motion and invalid deltas, caps delayed frames, and stops after disposal", () => {
    const life = createResidentLife(
      [person],
      places,
      createResidentNavigation([]),
    );
    const twin = createResidentLife(
      [person],
      places,
      createResidentNavigation([]),
    );
    try {
      for (let i = 0; i < 100; i++) {
        life.step(0.05);
        twin.step(0.05);
      }
      const before = structuredClone(life.states);
      for (const delta of [NaN, Infinity, -1, 0]) life.step(delta);
      life.step(100, true);
      expect(life.states).toEqual(before);
      life.step(100);
      twin.step(0.05);
      expect(life.states).toEqual(twin.states);
      life.dispose();
      const disposed = structuredClone(life.states);
      life.step(1);
      expect(life.states).toEqual(disposed);
    } finally {
      life.dispose();
      twin.dispose();
    }
  });

  it.each(["clockwise", "counter-clockwise"] as const)(
    "completes walk→wait→board→ride→alight with real %s traffic",
    (laneId: LaneId) => {
      const pickup = RESIDENT_RIDE_STOPS.find(
        (stop) => stop.progress === 0.115 && stop.laneId === laneId,
      )!;
      const direction = laneId === "clockwise" ? 1 : -1;
      const navigation = createResidentNavigation([]);
      const life = createResidentLife(
        [{ id: `rider-${laneId}`, point: pickup.curb, yaw: 0 }],
        places,
        navigation,
      );
      let traffic = createTrafficSimulation([
        {
          id: laneId === "clockwise" ? "berry-car" : "sky-car",
          laneId,
          startProgress: advanceRoadProgress(pickup.progress, -direction * 25),
          cruiseSpeedMetersPerSecond: 8,
          lengthMeters: 4,
        },
      ]);
      const modes: ResidentMode[] = [];
      const events: string[] = [];
      const state = life.states[0]!;
      // Begin the already-completed first errand, making the next natural plan a ride.
      state.trips = 1;
      state.timer = 0;
      let ridingDistance = 0;
      let checkedRidePause = false;
      const heldDuration = { seated: 0, departing: 0 };
      let previousRidePosition: { x: number; z: number } | null = null;
      try {
        for (
          let tick = 0;
          tick < 8_000 &&
          !(events.includes("alighted") && state.mode === "idle");
          tick++
        ) {
          life.setTraffic(traffic);
          const before = { ...state };
          life.step(0.05);
          if (modes.at(-1) !== state.mode) modes.push(state.mode);
          for (const event of life.events) events.push(event.type);
          const vehicle = traffic.vehicles[0]!;
          if (
            ["boarding", "seated", "alighting", "departing"].includes(
              state.mode,
            )
          ) {
            expect(vehicle.speedMetersPerSecond).toBeLessThan(0.03);
            expect(
              life.trafficStops.some(
                (stop) => stop.vehicleId === vehicle.id && stop.center,
              ),
            ).toBe(true);
          }
          if (state.mode === "seated" || state.mode === "departing") {
            heldDuration[state.mode] += 0.05;
            const stop =
              state.mode === "seated"
                ? state.ride!.pickup
                : state.ride!.dropoff;
            expect(
              life.trafficStops.some(
                (entry) =>
                  entry.progress === stop.progress &&
                  entry.vehicleId === vehicle.id,
              ),
            ).toBe(true);
          }
          if (state.mode === "riding" && before.mode === "riding") {
            const seat = sampleLane(laneId, vehicle.progress).position;
            expect(separation(state, seat)).toBeLessThan(0.001);
            if (previousRidePosition)
              ridingDistance += separation(state, previousRidePosition);
            previousRidePosition = { x: state.x, z: state.z };
            if (!checkedRidePause) {
              checkedRidePause = true;
              const frozen = structuredClone(life.states);
              life.step(20, true);
              const frozenTraffic = stepTraffic(traffic, 20, {
                reducedMotion: true,
                stops: life.trafficStops,
              });
              expect(life.states).toEqual(frozen);
              expect(frozenTraffic).toBe(traffic);
            }
          }
          const seatTransition =
            (before.mode === "boarding" && state.mode === "seated") ||
            (before.mode === "seated" && state.mode === "riding") ||
            (before.mode === "riding" && state.mode === "riding") ||
            (before.mode === "riding" && state.mode === "alighting");
          if (!seatTransition)
            expect(separation(before, state)).toBeLessThanOrEqual(0.08);
          else expect(separation(before, state)).toBeLessThan(1.8); // Local seat transfer only, never district relocation.
          traffic = stepTraffic(traffic, 0.05, { stops: life.trafficStops });
        }
        expect(modes).toEqual([
          "walking",
          "waiting",
          "boarding",
          "seated",
          "riding",
          "alighting",
          "departing",
          "idle",
        ]);
        expect(events).toEqual(["boarded", "alighted"]);
        expect(checkedRidePause).toBe(true);
        expect(heldDuration.seated).toBeGreaterThanOrEqual(0.65);
        expect(heldDuration.departing).toBeGreaterThanOrEqual(0.65);
        expect(ridingDistance).toBeGreaterThan(20);
        expect(state.ride).toBeNull();
        expect(state.visited.some((id) => id.startsWith("pickup-"))).toBe(true);
        expect(navigation.isWalkable(state)).toBe(true);
        expect(life.trafficStops).toHaveLength(0);
        const stopped = traffic.vehicles[0]!.progress;
        for (let i = 0; i < 20; i++)
          traffic = stepTraffic(traffic, 0.05, { stops: life.trafficStops });
        expect(traffic.vehicles[0]!.progress).not.toBe(stopped);
      } finally {
        life.dispose();
      }
    },
  );
});

function assertOpposingRoutes(
  first: { x: number; z: number },
  second: { x: number; z: number },
  maxTicks: number,
) {
  const navigation = createResidentNavigation([]);
  const destinations: readonly ResidentDestination[] = [
    { id: "first-end", kind: "leisure", point: first },
    { id: "second-end", kind: "leisure", point: second },
  ];
  expect(navigation.isWalkable(first)).toBe(true);
  expect(navigation.isWalkable(second)).toBe(true);
  const life = createResidentLife(
    [
      {
        id: "alpha",
        point: first,
        yaw: Math.atan2(first.x - second.x, first.z - second.z),
      },
      {
        id: "beta",
        point: second,
        yaw: Math.atan2(second.x - first.x, second.z - first.z),
      },
    ],
    destinations,
    navigation,
  );
  try {
    life.states.forEach((state, index) => {
      const destination = destinations[1 - index]!;
      state.path = navigation.findPath(state, destination.point)!;
      expect(state.path).not.toBeNull();
      state.waypoint = 1;
      state.mode = "walking";
      state.destinationId = destination.id;
      state.timer = 0;
    });
    for (
      let tick = 0;
      tick < maxTicks && life.states.some((state) => state.trips === 0);
      tick++
    ) {
      const before = life.states.map((state) => ({ x: state.x, z: state.z }));
      life.step(0.05);
      expect(
        separation(life.states[0]!, life.states[1]!),
      ).toBeGreaterThanOrEqual(0.6999);
      life.states.forEach((state, index) => {
        expect(separation(before[index]!, state)).toBeLessThanOrEqual(0.08);
        expect(navigation.segmentIsWalkable(before[index]!, state)).toBe(true);
        // Completed walkers remain stationary so a new random trip cannot
        // hide whether this original opposing encounter was resolved.
        if (state.trips > 0) state.timer = 1_000;
      });
    }
    expect(
      life.states[0]!.visited,
      JSON.stringify(
        life.states.map((state) => ({
          x: state.x,
          z: state.z,
          mode: state.mode,
          detour: state.detour,
        })),
      ),
    ).toContain("second-end");
    expect(life.states[1]!.visited).toContain("first-end");
  } finally {
    life.dispose();
  }
}
