import converted from "../../public/models/residents/conversion.json";
import type { TownCharacterProfile } from "./characters-3d";

export const RESIDENT_MODELS = [
  "man-denim",
  "man-casual",
  "woman-casual",
  "woman-knit",
  "boy",
  "girl",
  "elder-man",
  "woman-purple",
  "woman-headscarf",
  "man-tee",
  "man-jacket",
  "boy-sport",
] as const;
export type ResidentModelId = (typeof RESIDENT_MODELS)[number];
export type ResidentDetail = "near" | "far";
export type ResidentClip = "idle" | "walk" | "talk" | "run";

export function residentModelFor(
  profile: Pick<TownCharacterProfile, "id" | "age" | "hair" | "model">,
): ResidentModelId {
  // The player's running clip is retargeted to this specific rig.
  if (profile.id === "player-rivergate") return "man-casual";
  const children: readonly ResidentModelId[] = ["boy", "girl", "boy-sport"];
  if (
    profile.model &&
    children.includes(profile.model) === (profile.age === "child")
  )
    return profile.model;
  const hash = residentAppearanceSeed(profile.id);
  if (profile.age === "child") {
    return children[hash % children.length]!;
  }
  if (profile.age === "elder") return "elder-man";
  const longHair = ["bun", "ponytail", "waves"].includes(profile.hair);
  const pool: readonly ResidentModelId[] = longHair
    ? ["woman-knit", "woman-casual", "woman-purple", "woman-headscarf"]
    : ["man-casual", "man-denim", "man-tee", "man-jacket"];
  return pool[hash % pool.length]!;
}

export function residentAppearanceSeed(id: string) {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  // Mix high bits too: directly using FNV's low two bits repeated wardrobes
  // for many different home names with the same suffix/character parity.
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/** Small stature differences keep original anatomy; stride uses this same scale. */
export function residentHeightFor(
  profile: Pick<TownCharacterProfile, "id" | "age" | "stature">,
) {
  if (profile.id === "player-rivergate") return 1.82;
  const child = profile.age === "child";
  if (profile.stature !== undefined && Number.isFinite(profile.stature))
    return Math.max(
      child ? 1.18 : 1.58,
      Math.min(child ? 1.52 : 1.94, profile.stature),
    );
  return (
    (child ? 1.26 : 1.64) + (residentAppearanceSeed(profile.id) % 7) * 0.035
  );
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
  previous: ResidentClip = "idle",
): ResidentClip {
  if (reducedMotion) return "idle";
  // Locomotion belongs to the current routine, never a resident's original
  // profile. Hysteresis prevents idle/walk chatter at a slowly easing stop.
  if (speed > (previous === "walk" ? 0.06 : 0.12)) return "walk";
  return activity === "chat" || activity === "wave" ? "talk" : "idle";
}

/** Conversation is a small upper-body layer; hips and feet stay in idle. */
export function residentTalkWeight(nodeName: string): number {
  if (/ (Clavicle|UpperArm|Forearm|Hand)$/.test(nodeName)) return 0.24;
  if (/ Finger\d+$/.test(nodeName)) return 0.18;
  if (/ (Head|Neck)$/.test(nodeName)) return 0.16;
  if (/ Spine\d*$/.test(nodeName)) return 0.1;
  return 0;
}

export function residentTransitionBlend(elapsed: number): number {
  const t = Math.max(0, Math.min(1, elapsed / 0.36));
  return t * t * (3 - 2 * t);
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
    clip === "walk" || clip === "run"
      ? travelled / Math.max(0.1, walkDistance)
      : seconds / Math.max(0.1, duration) + phase;
  return ((cycles % 1) + 1) % 1;
}
