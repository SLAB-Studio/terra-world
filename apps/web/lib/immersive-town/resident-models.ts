import converted from "../../public/models/residents/conversion.json";
import type { TownCharacterProfile } from "./characters-3d";

export type ResidentModelId =
  "man-denim" | "man-casual" | "woman-casual" | "woman-knit" | "boy" | "girl";
export type ResidentDetail = "near" | "far";
export type ResidentClip = "idle" | "walk" | "talk";

export function residentModelFor(
  profile: Pick<TownCharacterProfile, "id" | "age" | "hair">,
): ResidentModelId {
  if (profile.age === "child") {
    return /maya|anya|nia|tomi/.test(profile.id) ? "girl" : "boy";
  }
  const longHair = ["bun", "ponytail", "waves"].includes(profile.hair);
  const hash = [...profile.id].reduce(
    (value, character) => value + character.charCodeAt(0),
    0,
  );
  return longHair
    ? hash % 2
      ? "woman-knit"
      : "woman-casual"
    : hash % 2
      ? "man-casual"
      : "man-denim";
}

export function residentAsset(id: ResidentModelId, detail: ResidentDetail) {
  const metadata = converted.find((entry) => entry.id === id);
  if (!metadata) throw new Error(`Missing resident conversion: ${id}`);
  return { ...metadata, url: `/models/residents/${id}-${detail}.glb` };
}

/** Hysteresis avoids replacing the model every time the camera crosses an edge. */
export function residentDetailFor(
  distance: number,
  previous: ResidentDetail,
  performance: boolean,
): ResidentDetail {
  const enter = performance ? 12 : 20;
  return distance < (previous === "near" ? enter + 6 : enter) ? "near" : "far";
}

export function residentPoseRate(distance: number): number {
  return distance < 22 ? 30 : distance < 60 ? 12 : 6;
}

export function residentClipFor(
  activity: TownCharacterProfile["activity"],
  speed: number,
  reducedMotion: boolean,
): ResidentClip {
  if (reducedMotion) return "idle";
  if (activity === "walk") return speed > 0.08 ? "walk" : "idle";
  return activity === "chat" || activity === "wave" ? "talk" : "idle";
}

export function residentClipProgress(
  clip: ResidentClip,
  seconds: number,
  travelled: number,
  phase: number,
  walkDistance: number,
  duration: number,
) {
  const cycles =
    clip === "walk"
      ? travelled / Math.max(0.1, walkDistance)
      : seconds / Math.max(0.1, duration) + phase;
  return ((cycles % 1) + 1) % 1;
}
