import type { WalkInput } from "./walking";

/** Normalize BEFORE choosing pace: diagonals and mixed touch/keyboard input
 * must not multiply speed. The navigation sweeps still own all collisions. */
export function pacedInput(
  input: WalkInput,
  running: boolean,
  indoors = false,
): WalkInput {
  const clamp = (n: number) =>
    Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0;
  const forward = clamp(input.forward),
    right = clamp(input.right);
  const length = Math.max(1, Math.hypot(forward, right));
  // Street: 1.8 / 3.6 m/s. Interiors: 1.56 / 2.6 m/s in tighter spaces.
  const pace = indoors ? (running ? 1 : 0.6) : running ? 0.6 : 0.3;
  return {
    forward: (forward / length) * pace,
    right: (right / length) * pace,
    turn: clamp(input.turn),
  };
}

export function shiftHeld(keys: ReadonlySet<string>) {
  return keys.has("ShiftLeft") || keys.has("ShiftRight");
}
