export const PLAYER_NAME_STORAGE_KEY = "terra-world-builder-nickname-v1";

const MAX_PLAYER_NAME_LENGTH = 18;

/**
 * Keeps a short, child-chosen nickname suitable for interface copy. The value
 * is device-local only and is never added to simulation, guide, or 0G payloads.
 */
export function normalisePlayerName(value: string): string {
  const safeCharacters = value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{M}\p{N} '-]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();

  return Array.from(safeCharacters).slice(0, MAX_PLAYER_NAME_LENGTH).join("");
}

export function readStoredPlayerName(value: string | null): string {
  return value === null ? "" : normalisePlayerName(value);
}

export function playerDisplayName(value: string): string {
  return normalisePlayerName(value) || "City Builder";
}
