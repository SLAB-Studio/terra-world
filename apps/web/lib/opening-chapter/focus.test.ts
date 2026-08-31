import { describe, expect, it, vi } from "vitest";
import { deferChapterWorldFocus } from "./focus";

describe("returning focus from chapter dialogue", () => {
  it("waits until the next frame so a removed dialogue cannot take focus back", () => {
    const onReturnToWorld = vi.fn();
    const frames: FrameRequestCallback[] = [];
    const scheduleFrame = vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return 42;
    });
    expect(deferChapterWorldFocus(onReturnToWorld, scheduleFrame)).toBe(42);
    expect(onReturnToWorld).not.toHaveBeenCalled();
    frames[0]?.(0);
    expect(onReturnToWorld).toHaveBeenCalledOnce();
  });

  it("does not schedule a focus change when the world has no callback", () => {
    const scheduleFrame = vi.fn(() => 1);
    expect(deferChapterWorldFocus(undefined, scheduleFrame)).toBeNull();
    expect(scheduleFrame).not.toHaveBeenCalled();
  });

  it("remains safe without a browser frame scheduler", () => {
    const onReturnToWorld = vi.fn();
    expect(deferChapterWorldFocus(onReturnToWorld)).toBeNull();
    expect(onReturnToWorld).not.toHaveBeenCalled();
  });
});
