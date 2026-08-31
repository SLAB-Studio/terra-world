import type { WalkPoint } from "./walking";

type SafeNavigation = {
  isWalkable(point: WalkPoint): boolean;
  segmentIsWalkable(from: WalkPoint, to: WalkPoint): boolean;
  findPath(from: WalkPoint, to: WalkPoint): readonly WalkPoint[] | null;
};
const distance = (a: WalkPoint, b: WalkPoint) =>
  Math.hypot(a.x - b.x, a.z - b.z);

/** Plan once per outing: parallel where there is room, the same legal trail
 * where there is not. Every transition is swept by the normal navigation rules.
 * Formation never grants permission to cross an unmarked road or bridge rail. */
export function companionWalkingPath(
  route: readonly WalkPoint[],
  start: WalkPoint,
  navigation: SafeNavigation,
  slot = 1,
): readonly WalkPoint[] | null {
  if (
    route.length < 2 ||
    route.every((point) => distance(route[0]!, point) < 0.001)
  )
    return null;
  const center: WalkPoint[] = [route[0]!];
  for (let index = 1; index < route.length; index++) {
    const from = route[index - 1]!,
      to = route[index]!;
    const count = Math.max(1, Math.ceil(distance(from, to) / 2));
    for (let step = 1; step <= count; step++)
      center.push({
        x: from.x + ((to.x - from.x) * step) / count,
        z: from.z + ((to.z - from.z) * step) / count,
      });
  }
  const first = center[0]!,
    next = center[1]!;
  const side =
    Math.sign(
      (start.x - first.x) * -(next.z - first.z) +
        (start.z - first.z) * (next.x - first.x),
    ) || 1;
  const offset = side * (slot % 2 ? 1 : -1) * Math.ceil(slot / 2) * 0.95;
  const shifted = center.map((point, index) => {
    const before = center[Math.max(0, index - 1)]!;
    const after = center[Math.min(center.length - 1, index + 1)]!;
    const length = Math.max(0.001, distance(before, after));
    const candidate = {
      x: point.x - ((after.z - before.z) / length) * offset,
      z: point.z + ((after.x - before.x) / length) * offset,
    };
    return navigation.isWalkable(candidate) &&
      navigation.segmentIsWalkable(point, candidate)
      ? candidate
      : point;
  });
  // Reverting both ends of an unsafe transition converges to the original
  // valid center route. This also creates gradual, legal single-file merges.
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 1; index < shifted.length; index++) {
      if (navigation.segmentIsWalkable(shifted[index - 1]!, shifted[index]!))
        continue;
      if (
        shifted[index - 1] === center[index - 1] &&
        shifted[index] === center[index]
      )
        return null;
      shifted[index - 1] = center[index - 1]!;
      shifted[index] = center[index]!;
      changed = true;
    }
  }
  // A narrow destination cannot hold two bodies at the same point. Its
  // companion waits one body-length back, including at a doorway approach.
  if (distance(shifted.at(-1)!, route.at(-1)!) < 0.75) {
    let remaining = 0.95 * slot;
    while (shifted.length > 1 && remaining > 0) {
      const end = shifted.at(-1)!,
        before = shifted.at(-2)!;
      const length = distance(before, end);
      if (length <= remaining) {
        shifted.pop();
        remaining -= length;
      } else {
        shifted[shifted.length - 1] = {
          x: end.x + ((before.x - end.x) * remaining) / length,
          z: end.z + ((before.z - end.z) * remaining) / length,
        };
        remaining = 0;
      }
    }
  }
  const approach = navigation.findPath(start, shifted[0]!);
  if (!approach) return null;
  const result: WalkPoint[] = [];
  for (const point of [...approach, ...shifted.slice(1)]) {
    if (result.length && distance(result.at(-1)!, point) < 1e-6) continue;
    // Remove only collinear samples: broad simplification would erase the
    // intentional side-by-side route around roomy bends.
    while (result.length > 1) {
      const a = result.at(-2)!,
        b = result.at(-1)!;
      if (
        Math.abs(distance(a, b) + distance(b, point) - distance(a, point)) >
        1e-6
      )
        break;
      result.pop();
    }
    result.push(point);
  }
  return result;
}
