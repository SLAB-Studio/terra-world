import { Animation } from "@babylonjs/core/Animations/animation";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

export type PlayerRunData = {
  version: number;
  model: string;
  duration: number;
  distance: number;
  channels: {
    node: string;
    property: "position" | "rotationQuaternion";
    keys: number[][];
  }[];
};
let cached: Promise<PlayerRunData> | undefined;

/** One small animation-only download, shared across street and interior scenes.
 * Crowd models remain unchanged; no second player mesh or texture set is loaded. */
export function loadPlayerRun(): Promise<PlayerRunData> {
  return (cached ??= fetch("/models/residents/player-run.json")
    .then(async (response) => {
      if (!response.ok) throw new Error("Player run animation could not load");
      const data = (await response.json()) as PlayerRunData;
      if (
        data.version !== 1 ||
        data.model !== "man-casual" ||
        !(data.distance > 0)
      )
        throw new Error("Incompatible player run animation");
      return data;
    })
    .catch((error) => {
      cached = undefined;
      throw error;
    }));
}

export function createPlayerRunClip(
  scene: Scene,
  nodes: ReadonlyMap<string, TransformNode>,
  data: PlayerRunData,
) {
  const group = new AnimationGroup("player-run", scene);
  for (const channel of data.channels) {
    const target = nodes.get(channel.node);
    if (!target) continue;
    const rotation = channel.property === "rotationQuaternion";
    const animation = new Animation(
      `run:${channel.node}:${channel.property}`,
      channel.property,
      30,
      rotation
        ? Animation.ANIMATIONTYPE_QUATERNION
        : Animation.ANIMATIONTYPE_VECTOR3,
      Animation.ANIMATIONLOOPMODE_CYCLE,
    );
    animation.setKeys(
      channel.keys.map(([time, ...v]) => ({
        frame: time! * 30,
        value: rotation ? Quaternion.FromArray(v) : Vector3.FromArray(v),
      })),
    );
    group.addTargetedAnimation(animation, target);
  }
  return group;
}
