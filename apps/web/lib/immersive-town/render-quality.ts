import type { TownQuality } from "./types";

export type RenderQualityPreference = "auto" | "performance" | "balanced";

export const RENDER_QUALITY_STORAGE_KEY = "terra-world-render-quality";

export function parseRenderQuality(value: unknown): RenderQualityPreference {
  return value === "performance" || value === "balanced" ? value : "auto";
}

export type RenderBudget = Readonly<{
  minPixelRatio: number;
  maxPixelRatio: number;
  initialPixelRatio: number;
  adaptive: boolean;
}>;

/** Limit framebuffer work, not city population, gameplay, or CSS coordinates. */
export function getRenderBudget(
  preference: RenderQualityPreference,
  devicePixelRatio: number,
  width: number,
  height: number,
): RenderBudget {
  const dpr =
    Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
      ? devicePixelRatio
      : 1;
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 1;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 1;
  const area = safeWidth * safeHeight;
  const pixelLimit = Math.sqrt(1_800_000 / area);
  const cap = preference === "performance" ? 0.85 : 1.25;
  const maxPixelRatio = Math.min(dpr, cap, pixelLimit);
  const minPixelRatio = Math.min(0.65, maxPixelRatio);
  return {
    minPixelRatio,
    maxPixelRatio,
    initialPixelRatio: Math.min(
      preference === "auto" ? 0.9 : cap,
      maxPixelRatio,
    ),
    adaptive: preference === "auto",
  };
}

export function sceneQualityForRenderBudget(
  preference: RenderQualityPreference,
  pixelRatio: number,
): TownQuality {
  return preference === "performance" ||
    (preference === "auto" && pixelRatio < 0.85)
    ? "low"
    : "medium";
}

export function shouldPauseTown(
  pageVisible: boolean,
  onScreen: boolean,
  visitOpen: boolean,
): boolean {
  return !pageVisible || !onScreen || visitOpen;
}
