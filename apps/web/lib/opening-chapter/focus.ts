/** Restore world controls after React removes the focused dialogue button. */
export function deferChapterWorldFocus(
  onReturnToWorld: (() => void) | undefined,
  scheduleFrame:
    ((callback: FrameRequestCallback) => number) | undefined = typeof window ===
  "undefined"
    ? undefined
    : window.requestAnimationFrame.bind(window),
): number | null {
  if (!onReturnToWorld || !scheduleFrame) return null;
  return scheduleFrame(() => onReturnToWorld());
}
