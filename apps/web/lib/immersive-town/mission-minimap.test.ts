import { describe, expect, it } from "vitest";
import {
  createChapterState,
  reduceChapter,
  type ChapterEvidenceId,
  type ChapterState,
} from "../opening-chapter/story";
import { EAST_BRIDGE_PROGRESS } from "./bridge-closure";
import { sampleRoadFrame } from "./road";
import {
  buildMissionMapGeometry,
  deriveChapterMapTarget,
  EAST_BRIDGE_MAP_POSITION,
  mapBearing,
  mapCardinalDirection,
  mapDistance,
  mapHeadingDegrees,
  mapProjectionScale,
  MISSION_MAP_BOUNDS,
  MISSION_MAP_RIVER_WIDTH,
  MISSION_MAP_ROAD_WIDTH,
  projectMapPoint,
  type MapBounds,
} from "./mission-minimap";

const evidenceIds: readonly ChapterEvidenceId[] = [
  "bridge",
  "maya",
  "malik",
  "nia",
];
const points = evidenceIds.map((id, index) => ({
  id,
  position: { x: index * 10, z: index * -5 },
  radius: 4.5,
}));
const investigation = () =>
  reduceChapter(createChapterState(), { type: "skip-intro" });
const decision = () =>
  evidenceIds.reduce(
    (state, id) => reduceChapter(state, { type: "collect-evidence", id }),
    investigation(),
  );

describe("the next opening-chapter map objective", () => {
  it("follows the authored bridge, Maya, Malik, Nia sequence", () => {
    let state = investigation();
    for (const id of evidenceIds) {
      const target = deriveChapterMapTarget(state, points);
      expect(target?.id).toBe(id);
      expect(target?.position).toEqual(
        points.find((p) => p.id === id)?.position,
      );
      expect(target?.radius).toBe(4.5);
      expect(target?.instruction.length).toBeGreaterThan(0);
      state = reduceChapter(state, { type: "collect-evidence", id });
    }
    expect(state.phase).toBe("decision");
    expect(deriveChapterMapTarget(state, points)).toBeNull();
  });

  it("handles all evidence subsets without relying on collection or point order", () => {
    for (let mask = 0; mask < 16; mask += 1) {
      const evidence = evidenceIds.filter((_, index) => mask & (1 << index));
      const state = { ...investigation(), evidence };
      expect(
        deriveChapterMapTarget(state, [...points].reverse())?.id ?? null,
      ).toBe(evidenceIds.find((id) => !evidence.includes(id)) ?? null);
    }
  });

  it("returns to the actual bridge point for each unobserved choice", () => {
    for (const choice of ["repair", "shuttle", "divert"] as const) {
      const state = reduceChapter(decision(), {
        type: "choose",
        decision: choice,
      });
      const target = deriveChapterMapTarget(state, points);
      expect(target?.id).toBe("bridge");
      expect(target?.instruction).toContain("observe the outcome");
      const observed = reduceChapter(state, { type: "observe" });
      expect(deriveChapterMapTarget(observed, points)).toBeNull();
      expect(
        deriveChapterMapTarget(
          reduceChapter(observed, { type: "finish" }),
          points,
        ),
      ).toBeNull();
    }
  });

  it("does not add destinations during intro, decision or completion", () => {
    for (const phase of ["intro", "decision", "complete"] as const) {
      expect(
        deriveChapterMapTarget({ ...createChapterState(), phase }, points),
      ).toBeNull();
    }
    const incompleteAftermath: ChapterState = {
      ...createChapterState(),
      phase: "aftermath",
    };
    expect(deriveChapterMapTarget(incompleteAftermath, points)).toBeNull();
  });

  it("does not jump objectives when the current destination is absent or invalid", () => {
    expect(deriveChapterMapTarget(investigation(), points.slice(1))).toBeNull();
    for (const point of [
      { ...points[0]!, position: { x: NaN, z: 0 } },
      { ...points[0]!, position: { x: 0, z: Infinity } },
      { ...points[0]!, radius: -1 },
      { ...points[0]!, radius: Infinity },
    ]) {
      expect(
        deriveChapterMapTarget(investigation(), [point, ...points.slice(1)]),
      ).toBeNull();
    }
  });

  it("copies its destination data without modifying chapter or source points", () => {
    const state = investigation();
    const before = JSON.stringify({ state, points });
    const target = deriveChapterMapTarget(state, points);
    expect(target?.position).not.toBe(points[0]!.position);
    expect(JSON.stringify({ state, points })).toBe(before);
  });
});

describe("north-up minimap coordinates", () => {
  const square = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
  const origin = { x: 0, z: 0 };
  const directions = [
    { x: 0, z: 1, degrees: 0, compass: "N" },
    { x: 1, z: 1, degrees: 45, compass: "NE" },
    { x: 1, z: 0, degrees: 90, compass: "E" },
    { x: 1, z: -1, degrees: 135, compass: "SE" },
    { x: 0, z: -1, degrees: 180, compass: "S" },
    { x: -1, z: -1, degrees: 225, compass: "SW" },
    { x: -1, z: 0, degrees: 270, compass: "W" },
    { x: -1, z: 1, degrees: 315, compass: "NW" },
  ];

  it("aligns all compass bearings, player arrows and projected motion", () => {
    const center = projectMapPoint(origin, square, 200, 200, 0);
    for (const direction of directions) {
      const yaw = mapBearing(origin, direction)!;
      expect(mapHeadingDegrees(yaw)).toBeCloseTo(direction.degrees);
      expect(mapCardinalDirection(yaw)).toBe(direction.compass);
      const next = projectMapPoint(direction, square, 200, 200, 0);
      expect(next.x - center.x).toBeCloseTo(
        Math.sin(yaw) * mapDistance(origin, direction)! * 10,
      );
      expect(next.y - center.y).toBeCloseTo(
        -Math.cos(yaw) * mapDistance(origin, direction)! * 10,
      );
    }
  });

  it("projects +Z at the top and +X to the right without mirror flips", () => {
    expect(projectMapPoint({ x: -10, z: 10 }, square, 200, 200, 10)).toEqual({
      x: 10,
      y: 10,
    });
    expect(projectMapPoint({ x: 10, z: -10 }, square, 200, 200, 10)).toEqual({
      x: 190,
      y: 190,
    });
  });

  it("preserves world aspect ratio and centers unused viewport space", () => {
    expect(mapProjectionScale(square, 300, 120, 10)).toBe(5);
    expect(projectMapPoint({ x: -10, z: 10 }, square, 300, 120, 10)).toEqual({
      x: 100,
      y: 10,
    });
    expect(projectMapPoint({ x: 10, z: -10 }, square, 120, 300, 10)).toEqual({
      x: 110,
      y: 200,
    });
    const rectangle = { ...square, minX: -20, maxX: 20 };
    expect(mapProjectionScale(rectangle, 200, 200, 0)).toBe(5);
    expect(projectMapPoint({ x: 20, z: 10 }, rectangle, 200, 200, 0)).toEqual({
      x: 200,
      y: 50,
    });
  });

  it("clamps to map bounds by default and permits deliberate unclipped projection", () => {
    expect(projectMapPoint({ x: 100, z: -100 }, square, 200, 200, 10)).toEqual({
      x: 190,
      y: 190,
    });
    expect(
      projectMapPoint({ x: 100, z: -100 }, square, 200, 200, 10, false),
    ).toEqual({ x: 1000, y: 1000 });
  });

  it("handles degenerate bounds, invalid points, dimensions and padding finitely", () => {
    for (const bounds of [
      { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
      { ...square, minX: NaN },
      { ...square, maxZ: Infinity },
      { ...square, maxZ: -20 },
    ]) {
      expect(projectMapPoint(origin, bounds, 200, 200)).toEqual(
        projectMapPoint(origin, MISSION_MAP_BOUNDS, 200, 200),
      );
    }
    for (const invalid of [NaN, Infinity, -Infinity]) {
      expect(projectMapPoint({ x: invalid, z: 0 }, square, 200, 200)).toEqual({
        x: 100,
        y: 100,
      });
      const result = projectMapPoint(origin, square, invalid, invalid, invalid);
      expect(Number.isFinite(result.x) && Number.isFinite(result.y)).toBe(true);
    }
    expect(projectMapPoint({ x: 5, z: 5 }, square, 10, 10, 100)).toEqual({
      x: 5,
      y: 5,
    });
    expect(mapProjectionScale(square, -1, 0, -12)).toBeGreaterThanOrEqual(0);
  });

  it("wraps turns, uses local straight-line distance and never fabricates invalid bearings", () => {
    expect(mapHeadingDegrees(-Math.PI / 2)).toBeCloseTo(270);
    expect(mapHeadingDegrees((9 * Math.PI) / 2)).toBeCloseTo(90);
    expect(mapDistance(origin, { x: 3, z: 4 })).toBe(5);
    expect(mapDistance(origin, origin)).toBe(0);
    expect(mapBearing(origin, origin)).toBeNull();
    for (const invalid of [NaN, Infinity, -Infinity]) {
      expect(mapHeadingDegrees(invalid)).toBe(0);
      expect(mapDistance(origin, { x: invalid, z: 4 })).toBeNull();
      expect(mapBearing({ x: 0, z: invalid }, origin)).toBeNull();
    }
    expect(
      mapDistance(
        { x: -Number.MAX_VALUE, z: 0 },
        { x: Number.MAX_VALUE, z: 0 },
      ),
    ).toBeNull();
  });
});

describe("lightweight actual-world map geometry", () => {
  it("samples the authored road and river and includes both banks and outer neighborhoods", () => {
    const geometry = buildMissionMapGeometry();
    expect(geometry.bounds).toEqual(MISSION_MAP_BOUNDS);
    expect(geometry.road).toHaveLength(129);
    expect(geometry.road[128]).toEqual(geometry.road[0]);
    for (let index = 0; index <= 128; index += 1) {
      const sample = sampleRoadFrame(index / 128).center;
      expect(geometry.road[index]).toEqual({ x: sample.x, z: sample.z });
    }
    expect(geometry.river).toHaveLength(43);
    expect(geometry.river[0]).toEqual({ x: 8.6, z: -70 });
    expect(geometry.river[21]).toEqual({ x: 15.4, z: 0 });
    expect(geometry.river[42]).toEqual({ x: 8.6, z: 70 });
    expect(MISSION_MAP_ROAD_WIDTH).toBe(10.4);
    expect(MISSION_MAP_RIVER_WIDTH).toBe(13);
    const bridge = sampleRoadFrame(EAST_BRIDGE_PROGRESS).center;
    expect(EAST_BRIDGE_MAP_POSITION).toEqual({ x: bridge.x, z: bridge.z });
  });

  it("uses supplied home and venue footprints, respecting rotations and copying positions", () => {
    const home = { id: "home", position: { x: -82, z: 0 }, width: 8, depth: 4 };
    const venue = {
      id: "venue",
      position: { x: 80, z: 80 },
      width: 10,
      depth: 4,
      rotation: Math.PI / 2,
    };
    const geometry = buildMissionMapGeometry({
      homes: [home],
      venues: [venue],
    });
    expect(geometry.buildings).toEqual([home, venue]);
    expect(geometry.buildings[0]!.position).not.toBe(home.position);
    expect(geometry.bounds.minX).toBe(-86);
    expect(geometry.bounds.maxX).toBeCloseTo(82);
    expect(geometry.bounds.maxZ).toBeCloseTo(85);
    expect(home.position.x).toBe(-82);
  });

  it("rejects unusable footprint data and invalid custom bounds", () => {
    const base = {
      id: "invalid",
      position: { x: 0, z: 0 },
      width: 8,
      depth: 4,
    };
    const geometry = buildMissionMapGeometry({
      homes: [
        { ...base, width: -1 },
        { ...base, width: NaN },
        { ...base, depth: Infinity },
        { ...base, rotation: NaN },
        { ...base, position: { x: Infinity, z: 0 } },
      ],
      bounds: { minX: 0, maxX: 0, minZ: NaN, maxZ: 1 } as MapBounds,
    });
    expect(geometry.buildings).toEqual([]);
    expect(geometry.bounds).toEqual(MISSION_MAP_BOUNDS);
  });
});
