export type EngineerOutfit = "engineer" | "casual" | "field";

export type EngineerWardrobe = Readonly<{
  player: EngineerOutfit;
  leo: EngineerOutfit;
}>;

export const DEFAULT_ENGINEER_WARDROBE: EngineerWardrobe = Object.freeze({
  player: "engineer",
  leo: "engineer",
});

export const ENGINEER_OUTFITS = ["engineer", "casual", "field"] as const;

export type EngineerRole = "player" | "leo";

export const ENGINEER_OUTFIT_MODELS = {
  player: {
    engineer: "engineer-worker",
    casual: "man-casual",
    field: "man-denim",
  },
  leo: {
    engineer: "engineer-worker",
    casual: "man-tee",
    field: "man-jacket",
  },
} as const;

export const ENGINEER_ROLE_PALETTES = {
  player: {
    Worker_Vest: "#2F6F8F",
    Brown: "#304653",
    Brown2: "#243844",
    Skin: "#976349",
  },
  leo: {
    Worker_Vest: "#9B443B",
    Brown: "#514235",
    Brown2: "#3D332B",
    Skin: "#70412E",
  },
} as const;

export function engineerOutfitModelFor(
  role: EngineerRole,
  outfit: EngineerOutfit,
) {
  return ENGINEER_OUTFIT_MODELS[role][outfit];
}

export function isEngineerOutfit(value: unknown): value is EngineerOutfit {
  return value === "engineer" || value === "casual" || value === "field";
}

export function normalizeEngineerOutfit(value: unknown): EngineerOutfit {
  return isEngineerOutfit(value) ? value : "engineer";
}

export function normalizeEngineerWardrobe(
  value: Partial<Record<keyof EngineerWardrobe, unknown>> | null | undefined,
): EngineerWardrobe {
  return Object.freeze({
    player: normalizeEngineerOutfit(value?.player),
    leo: normalizeEngineerOutfit(value?.leo),
  });
}

export type EngineerWardrobeListener = (wardrobe: EngineerWardrobe) => void;

let wardrobe = DEFAULT_ENGINEER_WARDROBE;
const listeners = new Set<EngineerWardrobeListener>();

export function getEngineerWardrobe(): EngineerWardrobe {
  return wardrobe;
}

export function setEngineerWardrobe(
  next: Partial<EngineerWardrobe>,
): EngineerWardrobe {
  const updated = Object.freeze({
    player:
      next.player === undefined
        ? wardrobe.player
        : normalizeEngineerOutfit(next.player),
    leo:
      next.leo === undefined ? wardrobe.leo : normalizeEngineerOutfit(next.leo),
  });

  if (updated.player === wardrobe.player && updated.leo === wardrobe.leo) {
    return wardrobe;
  }

  wardrobe = updated;
  for (const listener of listeners) listener(wardrobe);
  return wardrobe;
}

export function subscribeEngineerWardrobe(
  listener: EngineerWardrobeListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
