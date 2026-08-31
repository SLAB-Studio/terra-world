import {
  CHAPTER_SCENARIO,
  type ChapterState,
  validateChapterState,
} from "./story";

/** Never migrate, overwrite or clear the legacy repair/campaign save keys. */
export const CHAPTER_STORAGE_KEY = "terra-world:opening-chapter:east-bridge:v1";

export type ChapterStorage = Pick<Storage, "getItem" | "setItem">;

export type ChapterCheckpointPayload = Readonly<{
  kind: "rivergate-opening-chapter";
  version: 1;
  scenarioId: "rivergate-east-bridge-v1";
  state: ChapterState;
}>;

/** A local, plaintext export bundle. Creation is NOT an upload or 0G receipt. */
export function createChapterCheckpointPayload(
  state: ChapterState,
): ChapterCheckpointPayload | null {
  const canonical = validateChapterState(state);
  return canonical
    ? {
        kind: "rivergate-opening-chapter",
        version: 1,
        scenarioId: CHAPTER_SCENARIO.id,
        state: canonical,
      }
    : null;
}

function browserStorage(): ChapterStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readChapterSave(
  storage: ChapterStorage | null = browserStorage(),
): ChapterState | null {
  try {
    const raw = storage?.getItem(CHAPTER_STORAGE_KEY);
    // A legitimate chapter is small. Reject huge/corrupt data before parsing it.
    if (!raw || raw.length > 32_768) return null;
    return validateChapterState(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** False means play may continue in memory, but the UI must not claim it saved. */
export function writeChapterSave(
  state: ChapterState,
  storage: ChapterStorage | null = browserStorage(),
): boolean {
  try {
    if (!storage) return false;
    const canonical = validateChapterState(state);
    if (!canonical) return false;
    storage.setItem(CHAPTER_STORAGE_KEY, JSON.stringify(canonical));
    return true;
  } catch {
    return false;
  }
}
