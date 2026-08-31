import { describe, expect, it } from "vitest";
import {
  CHAPTER_STORAGE_KEY,
  createChapterCheckpointPayload,
  readChapterSave,
  writeChapterSave,
  type ChapterStorage,
} from "./persistence";
import { createChapterState, reduceChapter, type ChapterState } from "./story";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe("separate opening chapter persistence", () => {
  it("builds a deterministic validated local checkpoint without remote receipts or personal data", () => {
    const state = reduceChapter(createChapterState(), { type: "skip-intro" });
    const checkpoint = createChapterCheckpointPayload(state);
    expect(checkpoint).toEqual({
      kind: "rivergate-opening-chapter",
      version: 1,
      scenarioId: "rivergate-east-bridge-v1",
      state,
    });
    expect(checkpoint?.state).not.toBe(state);
    expect(createChapterCheckpointPayload(state)).toEqual(checkpoint);
    expect(createChapterCheckpointPayload({ ...state, budget: 0 })).toBeNull();
    expect(Object.keys(checkpoint!).sort()).toEqual([
      "kind",
      "scenarioId",
      "state",
      "version",
    ]);
  });
  it("round-trips progress without touching existing residential or campaign saves", () => {
    const storage = memoryStorage();
    storage.setItem("terra-world:legacy", "keep my fifteen missions");
    storage.setItem("terra-world:resident-casework:v1", "keep my visits");
    let state = reduceChapter(createChapterState(), { type: "skip-intro" });
    state = reduceChapter(state, { type: "collect-evidence", id: "bridge" });
    expect(writeChapterSave(state, storage)).toBe(true);
    expect(readChapterSave(storage)).toEqual(state);
    expect(storage.values.size).toBe(3);
    expect(storage.getItem("terra-world:legacy")).toBe(
      "keep my fifteen missions",
    );
    expect(storage.getItem("terra-world:resident-casework:v1")).toBe(
      "keep my visits",
    );
  });

  it("restores every completed branch through the deterministic gates", () => {
    for (const decision of ["repair", "shuttle", "divert"] as const) {
      const storage = memoryStorage();
      let state = reduceChapter(createChapterState(), { type: "skip-intro" });
      for (const id of ["bridge", "nia", "malik", "maya"] as const) {
        state = reduceChapter(state, { type: "collect-evidence", id });
      }
      state = reduceChapter(state, { type: "choose", decision });
      state = reduceChapter(state, { type: "observe" });
      state = reduceChapter(state, { type: "finish" });
      expect(writeChapterSave(state, storage)).toBe(true);
      expect(readChapterSave(storage)).toEqual(state);
    }
  });

  it("fails safely when browser storage is absent, denied or full", () => {
    expect(readChapterSave(null)).toBeNull();
    expect(writeChapterSave(createChapterState(), null)).toBe(false);
    const denied: ChapterStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(readChapterSave(denied)).toBeNull();
    expect(writeChapterSave(createChapterState(), denied)).toBe(false);
  });

  it("does not delete malformed, future-version or oversized saves", () => {
    const storage = memoryStorage();
    for (const raw of [
      "not json",
      "null",
      "[]",
      JSON.stringify({ ...createChapterState(), version: 2 }),
      JSON.stringify({ ...createChapterState(), phase: "complete" }),
      " ".repeat(32_769),
    ]) {
      storage.setItem(CHAPTER_STORAGE_KEY, raw);
      expect(readChapterSave(storage)).toBeNull();
      expect(storage.getItem(CHAPTER_STORAGE_KEY)).toBe(raw);
    }
  });

  it("refuses invalid or private extra fields without replacing a good save", () => {
    const storage = memoryStorage();
    const state = createChapterState();
    expect(writeChapterSave(state, storage)).toBe(true);
    const old = storage.getItem(CHAPTER_STORAGE_KEY);
    const invalid = {
      ...state,
      playerName: "private player",
      rawChat: "private message",
    };
    expect(writeChapterSave(invalid as ChapterState, storage)).toBe(false);
    expect(writeChapterSave({ ...state, budget: 100 }, storage)).toBe(false);
    expect(storage.getItem(CHAPTER_STORAGE_KEY)).toBe(old);
    expect(old).not.toContain("playerName");
    expect(old).not.toContain("rawChat");
  });
});
