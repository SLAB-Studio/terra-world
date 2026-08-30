import {
  advanceRoadProgress,
  ROAD_LENGTH_METERS,
  sampleRoadFrame,
} from "./road";
import {
  WALK_BODY_RADIUS,
  WALK_LIMITS,
  insideWalkBounds,
  type WalkBounds,
  type WalkPoint,
} from "./walking";

export type ResidentCrossing = Readonly<{ id: string; progress: number }>;
export type ResidentNavigationOptions = Readonly<{
  cellSize?: number;
  bounds?: WalkBounds;
  maxSnapDistance?: number;
  maxSearchNodes?: number;
  cacheSize?: number;
  groundHeight?: (point: WalkPoint) => number;
  maxStepHeight?: number;
}>;

// These are the stripes authored in town-details.ts, not invented shortcuts.
export const RESIDENT_CROSSINGS: readonly ResidentCrossing[] = Object.freeze([
  Object.freeze({ id: "crosswalk-0", progress: 0.275 }),
  Object.freeze({ id: "crosswalk-1", progress: 0.69 }),
]);

// The rails leave too little asphalt-free deck for a 0.8m-wide body. This
// reserved edge strip is outside both vehicle envelopes (2.25 + 0.9m), but
// inside the bridge rails. It deliberately does not authorize lane walking.
const LANE_EXCLUSION = 4.4;
const BRIDGE_WALK_OFFSET = 4.9;
const SWEEP_STEP = 0.2;
const ROAD_BUCKET_SIZE = 8;
const roadFrames = Array.from({ length: 480 }, (_, i) =>
  sampleRoadFrame(i / 480),
);
const crossingFrames = RESIDENT_CROSSINGS.map((crossing) => ({
  crossing,
  frame: sampleRoadFrame(crossing.progress),
}));
const bridgeFrames = [0.283, 0.705].map(sampleRoadFrame);
const roadBuckets = new Map<string, typeof roadFrames>();
for (const frame of roadFrames) {
  const key = bucketKey(frame.center, ROAD_BUCKET_SIZE);
  const bucket = roadBuckets.get(key) ?? [];
  bucket.push(frame);
  roadBuckets.set(key, bucket);
}

/** Pure, shared, lazily built town graph. Nothing here runs every render frame. */
export function createResidentNavigation(
  obstacles: readonly WalkBounds[],
  options: ResidentNavigationOptions = {},
) {
  const cellSize = finiteOption(options.cellSize, 1.75, 1, 3);
  const maxSnap = finiteOption(options.maxSnapDistance, 2, 0, 2);
  const searchLimit = Math.floor(
    finiteOption(options.maxSearchNodes, 16_000, 1, 30_000),
  );
  const cacheLimit = Math.floor(finiteOption(options.cacheSize, 192, 0, 512));
  const maxStep = finiteOption(options.maxStepHeight, 0.75, 0, 3);
  const requestedBounds = options.bounds ?? WALK_LIMITS;
  const bounds: WalkBounds = {
    minX: Math.max(WALK_LIMITS.minX, requestedBounds.minX),
    maxX: Math.min(WALK_LIMITS.maxX, requestedBounds.maxX),
    minZ: Math.max(WALK_LIMITS.minZ, requestedBounds.minZ),
    maxZ: Math.min(WALK_LIMITS.maxZ, requestedBounds.maxZ),
  };
  const validBounds = validBox(bounds);
  // Snapshot callers' geometry: a cached graph must never silently change.
  // Malformed geometry fails closed instead of letting residents cross it.
  const validObstacles = obstacles.every(validBox);
  const boxes = obstacles.map((box) => ({
    minX: box.minX - WALK_BODY_RADIUS,
    maxX: box.maxX + WALK_BODY_RADIUS,
    minZ: box.minZ - WALK_BODY_RADIUS,
    maxZ: box.maxZ + WALK_BODY_RADIUS,
  }));
  const boxBuckets = new Map<string, WalkBounds[]>();
  for (const box of boxes) {
    if (!validBox(box)) continue;
    for (
      let x = Math.floor(Math.max(bounds.minX, box.minX) / 8);
      x <= Math.floor(Math.min(bounds.maxX, box.maxX) / 8);
      x++
    )
      for (
        let z = Math.floor(Math.max(bounds.minZ, box.minZ) / 8);
        z <= Math.floor(Math.min(bounds.maxZ, box.maxZ) / 8);
        z++
      ) {
        const key = `${x},${z}`;
        const bucket = boxBuckets.get(key) ?? [];
        bucket.push(box);
        boxBuckets.set(key, bucket);
      }
  }
  const points: WalkPoint[] = [];
  const pointBuckets = new Map<string, number[]>();
  const neighborCache = new Map<number, readonly number[]>();
  const pathCache = new Map<string, readonly WalkPoint[] | null>();
  let built = false;

  function crossingAt(point: WalkPoint): ResidentCrossing | null {
    if (!finitePoint(point)) return null;
    for (const { crossing, frame } of crossingFrames) {
      const dx = point.x - frame.center.x;
      const dz = point.z - frame.center.z;
      const along = dx * frame.tangent.x + dz * frame.tangent.z;
      const across = dx * frame.lateral.x + dz * frame.lateral.z;
      if (Math.abs(along) <= 3.35 && Math.abs(across) <= 6.1) return crossing;
    }
    return null;
  }

  function isWalkable(point: WalkPoint): boolean {
    if (
      !validBounds ||
      !validObstacles ||
      !finitePoint(point) ||
      !insideWalkBounds(point, bounds)
    )
      return false;
    if (
      (boxBuckets.get(bucketKey(point, 8)) ?? []).some((box) =>
        insideWalkBounds(point, box),
      )
    )
      return false;
    // Same 480 road samples, 5.7m support radius and river equation as
    // canWalkAt(), spatially indexed so graph construction stays inexpensive.
    const road = nearestRoad(point);
    const riverCenter =
      12 + Math.sin(((point.z + 70) / 140) * Math.PI * 2 - Math.PI / 2) * 3.4;
    if (
      Math.abs(point.x - riverCenter) < 7 &&
      (road === null || road.distance > 5.7)
    )
      return false;
    if (
      road !== null &&
      road.distance < LANE_EXCLUSION &&
      crossingAt(point) === null
    )
      return false;
    // Actual bridge rails: do not use the outside-deck strip as a shortcut.
    for (const frame of bridgeFrames) {
      const dx = point.x - frame.center.x;
      const dz = point.z - frame.center.z;
      const along = dx * frame.tangent.x + dz * frame.tangent.z;
      const across = Math.abs(dx * frame.lateral.x + dz * frame.lateral.z);
      if (Math.abs(along) <= 10.65 && across >= 5.18 && across <= 6.32)
        return false;
    }
    return (
      options.groundHeight === undefined ||
      Number.isFinite(options.groundHeight(point))
    );
  }

  function segmentIsWalkable(from: WalkPoint, to: WalkPoint): boolean {
    if (!isWalkable(from) || !isWalkable(to)) return false;
    // Analytic rectangle sweep closes thin-wall and diagonal-corner holes that
    // point sampling alone can miss, including during path simplification.
    if (boxes.some((box) => segmentHitsBox(from, to, box))) return false;
    const crossingIntervals = crossingFrames.flatMap(({ frame }) => {
      const local = (point: WalkPoint): WalkPoint => ({
        x:
          (point.x - frame.center.x) * frame.lateral.x +
          (point.z - frame.center.z) * frame.lateral.z,
        z:
          (point.x - frame.center.x) * frame.tangent.x +
          (point.z - frame.center.z) * frame.tangent.z,
      });
      const interval = segmentBoxInterval(local(from), local(to), {
        minX: -6.1,
        maxX: 6.1,
        minZ: -3.35,
        maxZ: 3.35,
      });
      return interval === null ? [] : [interval];
    });
    // Check the complete lane intersection, not just sampled points. A short
    // diagonal at a crossing corner must not clip a live traffic lane.
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const lengthSquared = dx * dx + dz * dz;
    if (lengthSquared > 1e-12) {
      const minX = Math.floor(
        (Math.min(from.x, to.x) - LANE_EXCLUSION) / ROAD_BUCKET_SIZE,
      );
      const maxX = Math.floor(
        (Math.max(from.x, to.x) + LANE_EXCLUSION) / ROAD_BUCKET_SIZE,
      );
      const minZ = Math.floor(
        (Math.min(from.z, to.z) - LANE_EXCLUSION) / ROAD_BUCKET_SIZE,
      );
      const maxZ = Math.floor(
        (Math.max(from.z, to.z) + LANE_EXCLUSION) / ROAD_BUCKET_SIZE,
      );
      for (let x = minX; x <= maxX; x++)
        for (let z = minZ; z <= maxZ; z++)
          for (const frame of roadBuckets.get(`${x},${z}`) ?? []) {
            const rx = from.x - frame.center.x;
            const rz = from.z - frame.center.z;
            const dot = rx * dx + rz * dz;
            const discriminant =
              dot * dot -
              lengthSquared *
                (rx * rx + rz * rz - LANE_EXCLUSION * LANE_EXCLUSION);
            if (discriminant <= 0) continue;
            const root = Math.sqrt(discriminant);
            const enter = Math.max(0, (-dot - root) / lengthSquared);
            const leave = Math.min(1, (-dot + root) / lengthSquared);
            if (
              enter < leave &&
              !crossingIntervals.some(
                ([a, b]) => a <= enter + 1e-9 && b >= leave - 1e-9,
              )
            )
              return false;
          }
    }
    for (const frame of bridgeFrames) {
      const local = (point: WalkPoint): WalkPoint => {
        const dx = point.x - frame.center.x;
        const dz = point.z - frame.center.z;
        return {
          x: dx * frame.lateral.x + dz * frame.lateral.z,
          z: dx * frame.tangent.x + dz * frame.tangent.z,
        };
      };
      for (const side of [-1, 1])
        if (
          segmentHitsBox(local(from), local(to), {
            minX: side < 0 ? -6.32 : 5.18,
            maxX: side < 0 ? -5.18 : 6.32,
            minZ: -10.65,
            maxZ: 10.65,
          })
        )
          return false;
    }
    const steps = Math.max(1, Math.ceil(distance(from, to) / SWEEP_STEP));
    let previousHeight = options.groundHeight?.(from);
    for (let i = 1; i <= steps; i++) {
      const point = interpolate(from, to, i / steps);
      if (!isWalkable(point)) return false;
      if (options.groundHeight !== undefined) {
        const height = options.groundHeight(point);
        if (
          previousHeight !== undefined &&
          Math.abs(height - previousHeight) > maxStep
        )
          return false;
        previousHeight = height;
      }
    }
    return true;
  }

  function closestWalkablePoint(
    point: WalkPoint,
    maxDistance = maxSnap,
  ): WalkPoint | null {
    if (!finitePoint(point) || !Number.isFinite(maxDistance)) return null;
    if (isWalkable(point)) return freezePoint(point);
    const radiusLimit = Math.max(0, Math.min(maxSnap, maxDistance));
    for (let radius = 0.2; radius <= radiusLimit + 0.0001; radius += 0.2) {
      for (let angle = 0; angle < 32; angle++) {
        const candidate = {
          x: point.x + Math.sin((angle * Math.PI) / 16) * radius,
          z: point.z + Math.cos((angle * Math.PI) / 16) * radius,
        };
        if (isWalkable(candidate)) return freezePoint(candidate);
      }
    }
    return null;
  }

  function addPoint(point: WalkPoint) {
    if (!isWalkable(point)) return;
    const id = points.length;
    points.push(freezePoint(point));
    const key = bucketKey(point, cellSize);
    const bucket = pointBuckets.get(key) ?? [];
    bucket.push(id);
    pointBuckets.set(key, bucket);
  }

  function buildGraph() {
    if (built) return;
    built = true;
    if (!validBounds || !validObstacles) return;
    for (let z = bounds.minZ; z <= bounds.maxZ; z += cellSize)
      for (let x = bounds.minX; x <= bounds.maxX; x += cellSize)
        addPoint({ x, z });
    // Perimeter homes leave sub-cell-width frontage at the town limit. Include
    // the actual boundary and obstacle corners, rather than treating a missed
    // grid row as an impassable wall or expanding the playable map.
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      addPoint({ x, z: bounds.minZ });
      addPoint({ x, z: bounds.maxZ });
    }
    for (let z = bounds.minZ; z <= bounds.maxZ; z += 1) {
      addPoint({ x: bounds.minX, z });
      addPoint({ x: bounds.maxX, z });
    }
    for (const box of boxes)
      for (const x of [box.minX - 0.05, box.maxX + 0.05])
        for (const z of [box.minZ - 0.05, box.maxZ + 0.05]) addPoint({ x, z });
    // Road edges can also be thinner than one coarse cell between a building
    // and the lane exclusion. These nodes follow existing pavement only.
    for (let along = 0; along < ROAD_LENGTH_METERS; along += 1.5) {
      const frame = sampleRoadFrame(advanceRoadProgress(0, along));
      for (const side of [-1, 1])
        addPoint({
          x: frame.center.x + frame.lateral.x * side * BRIDGE_WALK_OFFSET,
          z: frame.center.z + frame.lateral.z * side * BRIDGE_WALK_OFFSET,
        });
    }
    // Coarse grid cells alone miss the narrow safe margins across the river.
    // Follow the same spline on both edges and connect back onto bank cells.
    for (const progress of [0.283, 0.705])
      for (const side of [-1, 1])
        for (let along = -19; along <= 19; along += 1) {
          const frame = sampleRoadFrame(advanceRoadProgress(progress, along));
          addPoint({
            x: frame.center.x + frame.lateral.x * side * BRIDGE_WALK_OFFSET,
            z: frame.center.z + frame.lateral.z * side * BRIDGE_WALK_OFFSET,
          });
        }
    // The rendered bridge deck/rails are straight boxes over a curved road.
    // Include its local edge corridor as well as spline edges; otherwise a
    // curved edge can intersect a straight rail and falsely sever the bank.
    for (const frame of bridgeFrames)
      for (const side of [-1, 1])
        for (const offset of [4.45, 4.7, 4.95, 5.15])
          for (let along = -12; along <= 12; along += 0.75)
            addPoint({
              x:
                frame.center.x +
                frame.tangent.x * along +
                frame.lateral.x * side * offset,
              z:
                frame.center.z +
                frame.tangent.z * along +
                frame.lateral.z * side * offset,
            });
    // These explicit nodes also guarantee the grid cannot miss a crossing.
    for (const { frame } of crossingFrames)
      for (let across = -7; across <= 7; across += 1)
        addPoint({
          x: frame.center.x + frame.lateral.x * across,
          z: frame.center.z + frame.lateral.z * across,
        });
  }

  function nearbyNodes(point: WalkPoint, radius: number): number[] {
    const result: number[] = [];
    const minX = Math.floor((point.x - radius) / cellSize);
    const maxX = Math.floor((point.x + radius) / cellSize);
    const minZ = Math.floor((point.z - radius) / cellSize);
    const maxZ = Math.floor((point.z + radius) / cellSize);
    for (let x = minX; x <= maxX; x++)
      for (let z = minZ; z <= maxZ; z++)
        for (const id of pointBuckets.get(`${x},${z}`) ?? [])
          if (distance(point, points[id]!) <= radius + 1e-8) result.push(id);
    return result.sort(
      (a, b) =>
        distance(point, points[a]!) - distance(point, points[b]!) || a - b,
    );
  }

  function neighbors(id: number): readonly number[] {
    const cached = neighborCache.get(id);
    if (cached !== undefined) return cached;
    const point = points[id]!;
    const result = nearbyNodes(point, cellSize * Math.SQRT2 + 0.01).filter(
      (next) => next !== id && segmentIsWalkable(point, points[next]!),
    );
    neighborCache.set(id, result);
    return result;
  }

  function remember(key: string, path: readonly WalkPoint[] | null) {
    if (cacheLimit > 0) {
      if (pathCache.size >= cacheLimit)
        pathCache.delete(pathCache.keys().next().value!);
      pathCache.set(key, path);
    }
    return path;
  }

  function findPath(
    from: WalkPoint,
    to: WalkPoint,
  ): readonly WalkPoint[] | null {
    // No implicit relocation through a wall. Use closestWalkablePoint only for
    // deliberate initial placement; live trips always retain their endpoints.
    if (!isWalkable(from) || !isWalkable(to)) return null;
    const key = `${from.x},${from.z}:${to.x},${to.z}`;
    if (pathCache.has(key)) {
      const result = pathCache.get(key)!;
      pathCache.delete(key);
      pathCache.set(key, result);
      return result;
    }
    if (segmentIsWalkable(from, to))
      return remember(key, Object.freeze([freezePoint(from), freezePoint(to)]));
    buildGraph();
    const starts = nearbyNodes(from, maxSnap).filter((id) =>
      segmentIsWalkable(from, points[id]!),
    );
    const ends = new Set(
      nearbyNodes(to, maxSnap).filter((id) =>
        segmentIsWalkable(points[id]!, to),
      ),
    );
    if (starts.length === 0 || ends.size === 0) return remember(key, null);
    const scores = new Float64Array(points.length).fill(Infinity);
    const parents = new Int32Array(points.length).fill(-1);
    const closed = new Uint8Array(points.length);
    const heap = new MinHeap();
    for (const id of starts) {
      scores[id] = distance(from, points[id]!);
      heap.push({ id, score: scores[id]! + distance(points[id]!, to) });
    }
    let visited = 0;
    while (heap.length > 0 && visited < searchLimit) {
      const current = heap.pop()!.id;
      if (closed[current]) continue;
      closed[current] = 1;
      visited++;
      if (ends.has(current)) {
        const route: WalkPoint[] = [freezePoint(to)];
        for (let id = current; id !== -1; id = parents[id]!)
          route.push(points[id]!);
        route.push(freezePoint(from));
        route.reverse();
        const simplified: WalkPoint[] = [route[0]!];
        // Bounded visibility smoothing preserves all collision/crossing rules.
        for (let i = 0; i < route.length - 1;) {
          let next = Math.min(route.length - 1, i + 24);
          while (next > i + 1 && !segmentIsWalkable(route[i]!, route[next]!))
            next--;
          simplified.push(route[next]!);
          i = next;
        }
        return remember(key, Object.freeze(simplified));
      }
      for (const next of neighbors(current)) {
        if (closed[next]) continue;
        const score =
          scores[current]! + distance(points[current]!, points[next]!);
        if (score >= scores[next]!) continue;
        scores[next] = score;
        parents[next] = current;
        heap.push({ id: next, score: score + distance(points[next]!, to) });
      }
    }
    return remember(key, null);
  }

  return {
    findPath,
    isWalkable,
    closestWalkablePoint,
    crossingAt,
    segmentIsWalkable,
    clearCache: () => pathCache.clear(),
  };
}

export type ResidentNavigation = ReturnType<typeof createResidentNavigation>;

function nearestRoad(point: WalkPoint) {
  let nearest: { distance: number } | null = null;
  const bx = Math.floor(point.x / ROAD_BUCKET_SIZE);
  const bz = Math.floor(point.z / ROAD_BUCKET_SIZE);
  for (let x = bx - 1; x <= bx + 1; x++)
    for (let z = bz - 1; z <= bz + 1; z++)
      for (const frame of roadBuckets.get(`${x},${z}`) ?? []) {
        const d = distance(point, frame.center);
        if (d <= 5.7 && (nearest === null || d < nearest.distance))
          nearest = { distance: d };
      }
  return nearest;
}

function segmentHitsBox(from: WalkPoint, to: WalkPoint, box: WalkBounds) {
  return segmentBoxInterval(from, to, box) !== null;
}

function segmentBoxInterval(
  from: WalkPoint,
  to: WalkPoint,
  box: WalkBounds,
): readonly [number, number] | null {
  let low = 0;
  let high = 1;
  for (const [start, delta, min, max] of [
    [from.x, to.x - from.x, box.minX, box.maxX],
    [from.z, to.z - from.z, box.minZ, box.maxZ],
  ] as const) {
    if (Math.abs(delta) < 1e-12) {
      if (start < min || start > max) return null;
    } else {
      const a = (min - start) / delta;
      const b = (max - start) / delta;
      low = Math.max(low, Math.min(a, b));
      high = Math.min(high, Math.max(a, b));
      if (low > high) return null;
    }
  }
  return [low, high];
}

type HeapEntry = { id: number; score: number };
class MinHeap {
  private entries: HeapEntry[] = [];
  get length() {
    return this.entries.length;
  }
  push(value: HeapEntry) {
    let index = this.entries.length;
    this.entries.push(value);
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!this.before(value, this.entries[parent]!)) break;
      this.entries[index] = this.entries[parent]!;
      index = parent;
    }
    this.entries[index] = value;
  }
  pop(): HeapEntry | undefined {
    const first = this.entries[0];
    const last = this.entries.pop();
    if (this.entries.length > 0 && last !== undefined) {
      let index = 0;
      while (index * 2 + 1 < this.entries.length) {
        let child = index * 2 + 1;
        if (
          child + 1 < this.entries.length &&
          this.before(this.entries[child + 1]!, this.entries[child]!)
        )
          child++;
        if (!this.before(this.entries[child]!, last)) break;
        this.entries[index] = this.entries[child]!;
        index = child;
      }
      this.entries[index] = last;
    }
    return first;
  }
  private before(a: HeapEntry, b: HeapEntry) {
    return a.score < b.score || (a.score === b.score && a.id < b.id);
  }
}

function bucketKey(point: WalkPoint, size: number) {
  return `${Math.floor(point.x / size)},${Math.floor(point.z / size)}`;
}
function distance(a: WalkPoint, b: WalkPoint) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
function finitePoint(point: WalkPoint) {
  return Number.isFinite(point.x) && Number.isFinite(point.z);
}
function freezePoint(point: WalkPoint): WalkPoint {
  return Object.freeze({ x: point.x, z: point.z });
}
function interpolate(from: WalkPoint, to: WalkPoint, t: number): WalkPoint {
  return { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t };
}
function validBox(box: WalkBounds) {
  return (
    Object.values(box).every(Number.isFinite) &&
    box.minX <= box.maxX &&
    box.minZ <= box.maxZ
  );
}
function finiteOption(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  return value === undefined || !Number.isFinite(value)
    ? fallback
    : Math.max(min, Math.min(max, value));
}
