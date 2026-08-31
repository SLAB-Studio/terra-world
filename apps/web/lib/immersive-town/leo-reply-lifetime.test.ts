import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLeoReplyLifetime,
  LEO_REPLY_LIFETIME_MS,
} from "./leo-reply-lifetime";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-31T12:00:00Z"));
});

afterEach(() => {
  vi.clearAllTimers();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Leo reply lifetime", () => {
  it("starts only at the first eligible appearance and expires at 30 seconds", () => {
    const lifetime = createLeoReplyLifetime();
    const expired = vi.fn();
    lifetime.watch("hello", false, expired);
    vi.advanceTimersByTime(60_000);
    expect(lifetime.isLive("hello")).toBe(true);
    expect(vi.getTimerCount()).toBe(0);

    lifetime.watch("hello", true, expired);
    vi.advanceTimersByTime(LEO_REPLY_LIFETIME_MS - 1);
    expect(lifetime.isLive("hello")).toBe(true);
    expect(expired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(lifetime.isLive("hello")).toBe(false);
    expect(expired).toHaveBeenCalledExactlyOnceWith("hello");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not reset a stable ID during ordinary rerenders or text changes", () => {
    const lifetime = createLeoReplyLifetime();
    const expired = vi.fn();
    let cleanup = lifetime.watch("same-id", true, expired);
    for (let i = 0; i < 5; i += 1) {
      vi.advanceTimersByTime(5_000);
      cleanup();
      cleanup = lifetime.watch("same-id", true, expired);
      expect(vi.getTimerCount()).toBe(1);
    }
    vi.advanceTimersByTime(4_999);
    expect(expired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(expired).toHaveBeenCalledExactlyOnceWith("same-id");
  });

  it("gives a new reply a fresh lifetime without firing the old reply timer", () => {
    const lifetime = createLeoReplyLifetime();
    const expired = vi.fn();
    lifetime.watch("old", true, expired);
    vi.advanceTimersByTime(20_000);
    lifetime.watch("new", true, expired);
    vi.advanceTimersByTime(10_000);
    expect(lifetime.isLive("old")).toBe(false);
    expect(lifetime.isLive("new")).toBe(true);
    expect(expired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(19_999);
    expect(expired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(expired).toHaveBeenCalledExactlyOnceWith("new");
  });

  it("ignores an already queued stale timeout after another reply takes over", () => {
    const schedule = vi.spyOn(globalThis, "setTimeout");
    const lifetime = createLeoReplyLifetime();
    const expired = vi.fn();
    lifetime.watch("old", true, expired);
    const staleTimeout = schedule.mock.calls[0]![0] as () => void;
    vi.advanceTimersByTime(10_000);
    lifetime.watch("new", true, expired);
    staleTimeout();
    expect(lifetime.isLive("new")).toBe(true);
    expect(expired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30_000);
    expect(expired).toHaveBeenCalledExactlyOnceWith("new");
  });

  it("continues counting while aerial mode or a reading overlay hides the bubble", () => {
    const lifetime = createLeoReplyLifetime();
    const expired = vi.fn();
    const cleanup = lifetime.watch("hello", true, expired);
    vi.advanceTimersByTime(10_000);
    cleanup();
    lifetime.watch("hello", false, expired);
    vi.advanceTimersByTime(20_000);
    expect(expired).toHaveBeenCalledExactlyOnceWith("hello");
    lifetime.watch("hello", true, expired);
    expect(lifetime.isLive("hello")).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it("restores only the remaining time when a hidden bubble returns early", () => {
    const lifetime = createLeoReplyLifetime();
    const expired = vi.fn();
    lifetime.watch("hello", true, expired);
    vi.advanceTimersByTime(10_000);
    lifetime.watch("hello", false, expired);
    vi.advanceTimersByTime(10_000);
    lifetime.watch("hello", true, expired);
    vi.advanceTimersByTime(9_999);
    expect(lifetime.isLive("hello")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(expired).toHaveBeenCalledExactlyOnceWith("hello");
  });

  it("keeps a missing reply expired when it is selected again later", () => {
    const lifetime = createLeoReplyLifetime();
    const expired = vi.fn();
    lifetime.watch("chapter-reply", true, expired);
    vi.advanceTimersByTime(10_000);
    lifetime.watch(null, false, expired);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(25_000);
    expect(lifetime.isLive("chapter-reply")).toBe(false);
    lifetime.watch("chapter-reply", true, expired);
    expect(expired).toHaveBeenCalledExactlyOnceWith("chapter-reply");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retains an older reply's original deadline when switching IDs and back", () => {
    const lifetime = createLeoReplyLifetime();
    const expired = vi.fn();
    lifetime.watch("first", true, expired);
    vi.advanceTimersByTime(10_000);
    lifetime.watch("second", true, expired);
    vi.advanceTimersByTime(10_000);
    lifetime.watch("first", true, expired);
    vi.advanceTimersByTime(10_000);
    expect(expired).toHaveBeenCalledExactlyOnceWith("first");
    expect(lifetime.isLive("second")).toBe(true);
  });

  it("permanently dismisses an ID, including after another reply appears", () => {
    const lifetime = createLeoReplyLifetime();
    const expired = vi.fn();
    lifetime.watch("dismissed", true, expired);
    lifetime.dismiss("dismissed");
    expect(lifetime.isLive("dismissed")).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    lifetime.watch("different", true, expired);
    lifetime.watch("dismissed", true, expired);
    vi.advanceTimersByTime(60_000);
    expect(lifetime.isLive("dismissed")).toBe(false);
    expect(expired).not.toHaveBeenCalled();
  });

  it("allows dismissal before a reply starts and does not cancel a different reply", () => {
    const lifetime = createLeoReplyLifetime();
    const expired = vi.fn();
    lifetime.watch("current", true, expired);
    lifetime.dismiss("unseen");
    expect(lifetime.isLive("unseen")).toBe(false);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(30_000);
    expect(expired).toHaveBeenCalledExactlyOnceWith("current");
    lifetime.watch("unseen", true, expired);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans up without notifications and tolerates repeated disposal", () => {
    const lifetime = createLeoReplyLifetime();
    const expired = vi.fn();
    const cleanup = lifetime.watch("hello", true, expired);
    cleanup();
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(expired).not.toHaveBeenCalled();
  });

  it("preserves the deadline through Strict Mode effect cleanup and setup", () => {
    const lifetime = createLeoReplyLifetime();
    const expired = vi.fn();
    const firstCleanup = lifetime.watch("hello", true, expired);
    firstCleanup();
    vi.advanceTimersByTime(1_000);
    const secondCleanup = lifetime.watch("hello", true, expired);
    firstCleanup();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(29_000);
    expect(expired).toHaveBeenCalledExactlyOnceWith("hello");
    secondCleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not notify again if an expired timer callback is invoked twice", () => {
    const schedule = vi.spyOn(globalThis, "setTimeout");
    const lifetime = createLeoReplyLifetime();
    const expired = vi.fn();
    lifetime.watch("hello", true, expired);
    const timeout = schedule.mock.calls[0]![0] as () => void;
    vi.advanceTimersByTime(30_000);
    timeout();
    expect(expired).toHaveBeenCalledExactlyOnceWith("hello");
  });
});
