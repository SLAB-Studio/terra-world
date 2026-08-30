import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { Bone } from "@babylonjs/core/Bones/bone";
import type { InstantiatedEntries } from "@babylonjs/core/assetContainer";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { TownCharacterRig } from "./characters-3d";
import {
  residentAsset,
  residentClipFor,
  residentClipProgress,
  residentDetailFor,
  residentModelFor,
  residentPoseRate,
  type ResidentClip,
  type ResidentDetail,
} from "./resident-models";

type Pose = { node: TransformNode; rotation: Quaternion; position: Vector3 };
type ResidentInstance = {
  entries: InstantiatedEntries;
  mount: TransformNode;
  meshes: AbstractMesh[];
  clips: Map<ResidentClip, AnimationGroup>;
  poses: Pose[];
  bindings: Array<{ bone: Bone; node: TransformNode }>;
};
type ResidentState = {
  scene: Scene;
  rig: TownCharacterRig;
  shadows: ShadowGenerator | null;
  fallback: AbstractMesh[];
  instance: ResidentInstance | null;
  detail: ResidentDetail;
  pending: boolean;
  failedNear: boolean;
  disposed: boolean;
  lastPose: number;
  lastDistance: number;
  lastMeasuredDistance: number;
  reducedPoseApplied: boolean;
  clip: ResidentClip;
  clipChangedAt: number;
  transition: Pose[];
};
const residents = new WeakMap<TransformNode, ResidentState>();

export function hasRealisticResident(rig: TownCharacterRig) {
  return residents.get(rig.root)?.instance !== null && residents.has(rig.root);
}

function disposeInstance(
  instance: ResidentInstance,
  shadows: ShadowGenerator | null,
) {
  instance.meshes.forEach((mesh) => shadows?.removeShadowCaster(mesh, false));
  instance.entries.dispose();
  instance.mount.dispose();
}

/** Sample authored channels directly: no thousands of paused Animatable objects. */
function samplePose(group: AnimationGroup, frame: number) {
  for (const { animation, target } of group.targetedAnimations) {
    const node = target as TransformNode;
    const value = animation.evaluate(frame);
    if (animation.targetProperty === "rotationQuaternion") {
      if (!node.rotationQuaternion)
        node.rotationQuaternion = Quaternion.Identity();
      node.rotationQuaternion.copyFrom(value);
    } else if (animation.targetProperty === "position")
      node.position.copyFrom(value);
    else if (animation.targetProperty === "scaling")
      node.scaling.copyFrom(value);
  }
}

function syncBones(instance: ResidentInstance) {
  for (const { bone, node } of instance.bindings) {
    bone.position = node.position;
    if (node.rotationQuaternion)
      bone.rotationQuaternion = node.rotationQuaternion;
    else bone.rotation = node.rotation;
    bone.scaling = node.scaling;
  }
}

async function requestDetail(state: ResidentState, detail: ResidentDetail) {
  if (
    state.pending ||
    state.disposed ||
    (detail === "near" && state.failedNear)
  )
    return;
  state.pending = true;
  const model = residentModelFor(state.rig.profile);
  try {
    const { loadResidentAsset } = await import("./resident-assets");
    if (state.disposed) return;
    const container = await loadResidentAsset(state.scene, model, detail);
    if (state.disposed || state.rig.root.isDisposed() || state.scene.isDisposed)
      return;
    const entries = container.instantiateModelsToScene(
      (name) => `${state.rig.profile.id}:${detail}:${name}`,
      false,
      { doNotInstantiate: true },
    );
    const mount = new TransformNode(
      `${state.rig.profile.id}-real-person`,
      state.scene,
    );
    mount.parent = state.rig.root;
    // Rocketbox glTF faces +Z in Babylon; pedestrian route headings use -Z.
    mount.rotation.y = Math.PI;
    // The old rig uses 0.58 scene scale; assets are already in metres.
    // Preserve child/adult stature, independent of the imported authoring units.
    const height = state.rig.profile.age === "child" ? 1.38 : 1.82;
    mount.scaling.setAll(
      height / residentAsset(model, detail).height / state.rig.root.scaling.x,
    );
    for (const root of entries.rootNodes) {
      root.parent = mount;
    }
    const meshes = mount.getChildMeshes();
    for (const mesh of meshes) {
      mesh.isPickable = false;
      mesh.checkCollisions = false;
      mesh.receiveShadows = true;
      if (detail === "near" && mesh.getTotalVertices() > 0)
        state.shadows?.addShadowCaster(mesh, false);
    }
    const clips = new Map<ResidentClip, AnimationGroup>();
    for (const group of entries.animationGroups) {
      const name = (["idle", "walk", "talk"] as const).find((clip) =>
        group.name.endsWith(clip),
      );
      if (name) clips.set(name, group);
    }
    if (clips.size !== 3) {
      entries.dispose();
      mount.dispose();
      throw new Error("Resident model is missing a required animation");
    }
    const nodes = new Set<TransformNode>();
    for (const group of clips.values()) {
      for (const target of group.targetedAnimations) {
        if (target.target instanceof TransformNode) nodes.add(target.target);
      }
    }
    const poses = [...nodes].map((node) => ({
      node,
      rotation: node.rotationQuaternion?.clone() ?? Quaternion.Identity(),
      position: node.position.clone(),
    }));
    const bindings: Array<{ bone: Bone; node: TransformNode }> = [];
    for (const skeleton of entries.skeletons) {
      for (const bone of skeleton.bones) {
        const node = bone.getTransformNode();
        if (node) {
          bindings.push({ bone, node });
          // Update links only at our pose rate; Babylon otherwise marks every
          // linked skeleton dirty on every render, including stationary people.
          bone.linkTransformNode(null);
        }
      }
    }
    const next = { entries, mount, meshes, clips, poses, bindings };
    const previous = state.instance;
    state.instance = next;
    state.detail = detail;
    state.clip = "idle";
    state.lastPose = -Infinity;
    state.reducedPoseApplied = false;
    state.transition = [];
    const idle = clips.get("idle")!;
    samplePose(idle, idle.from);
    syncBones(next);
    if (previous) disposeInstance(previous, state.shadows);
    // Release the primitive meshes only after a complete replacement is ready.
    state.fallback.forEach((mesh) => {
      state.shadows?.removeShadowCaster(mesh, false);
      mesh.dispose(false, false);
    });
    state.fallback = [];
    state.rig.root.metadata = {
      ...state.rig.root.metadata,
      appearance: model,
      modelDetail: detail,
      modelState: "ready",
    };
  } catch {
    if (!state.disposed) {
      if (detail === "near") state.failedNear = true;
      state.rig.root.metadata = {
        ...state.rig.root.metadata,
        modelState: state.instance ? "ready" : "fallback",
      };
    }
  } finally {
    state.pending = false;
  }
}

/** Register only in real canvas scenes; deterministic NullEngine worlds stay offline. */
export function registerRealisticResident(
  scene: Scene,
  rig: TownCharacterRig,
  shadows: ShadowGenerator | null,
) {
  if (typeof window === "undefined" || !scene.getEngine().getRenderingCanvas())
    return;
  const state: ResidentState = {
    scene,
    rig,
    shadows,
    fallback: rig.root.getChildMeshes(),
    instance: null,
    detail: "far",
    pending: false,
    failedNear: false,
    disposed: false,
    lastPose: -Infinity,
    lastDistance: -Infinity,
    lastMeasuredDistance: Infinity,
    reducedPoseApplied: false,
    clip: "idle",
    clipChangedAt: 0,
    transition: [],
  };
  residents.set(rig.root, state);
  rig.root.metadata = { ...rig.root.metadata, modelState: "loading" };
  rig.root.onDisposeObservable.addOnce(() => {
    state.disposed = true;
    if (state.instance) disposeInstance(state.instance, shadows);
    residents.delete(rig.root);
  });
  void requestDetail(state, "far");
}

export function updateRealisticResident(
  rig: TownCharacterRig,
  seconds: number,
  reducedMotion: boolean,
  speed: number,
  travelled: number,
) {
  const state = residents.get(rig.root);
  if (!state?.instance || state.disposed || !rig.root.isEnabled()) return;
  const camera = state.scene.activeCamera;
  const distance = camera
    ? Vector3.Distance(camera.globalPosition, rig.root.getAbsolutePosition())
    : 100;
  if (
    seconds - state.lastDistance > 0.5 ||
    (reducedMotion && Math.abs(distance - state.lastMeasuredDistance) > 1)
  ) {
    state.lastDistance = seconds;
    state.lastMeasuredDistance = distance;
    const desired = residentDetailFor(
      distance,
      state.detail,
      !state.scene.shadowsEnabled,
    );
    if (desired !== state.detail) void requestDetail(state, desired);
  }
  if (reducedMotion && state.reducedPoseApplied) return;
  if (
    !reducedMotion &&
    seconds - state.lastPose < 1 / residentPoseRate(distance)
  )
    return;
  state.lastPose = seconds;
  state.reducedPoseApplied = reducedMotion;
  const instance = state.instance;
  if (rig.profile.activity !== "walk") rig.root.position.y = rig.baseY;
  const clip = residentClipFor(rig.profile.activity, speed, reducedMotion);
  if (clip !== state.clip) {
    state.transition = instance.poses.map(({ node }) => ({
      node,
      rotation: node.rotationQuaternion?.clone() ?? Quaternion.Identity(),
      position: node.position.clone(),
    }));
    state.clip = clip;
    state.clipChangedAt = seconds;
  }
  const group = instance.clips.get(clip)!;
  const frameRate = group.targetedAnimations[0]?.animation.framePerSecond ?? 60;
  const duration = (group.to - group.from) / frameRate;
  const model = residentAsset(residentModelFor(rig.profile), state.detail);
  const stature = (rig.profile.age === "child" ? 1.38 : 1.82) / model.height;
  const progress = reducedMotion
    ? 0
    : residentClipProgress(
        clip,
        seconds,
        travelled,
        rig.profile.phase,
        model.walkDistance * stature,
        duration,
      );
  samplePose(group, group.from + progress * (group.to - group.from));
  const blend = Math.min(
    1,
    Math.max(0, (seconds - state.clipChangedAt) / 0.22),
  );
  if (blend < 1 && !reducedMotion) {
    for (const pose of state.transition) {
      if (pose.node.rotationQuaternion)
        Quaternion.SlerpToRef(
          pose.rotation,
          pose.node.rotationQuaternion,
          blend,
          pose.node.rotationQuaternion,
        );
      Vector3.LerpToRef(
        pose.position,
        pose.node.position,
        blend,
        pose.node.position,
      );
    }
  } else state.transition = [];
  syncBones(instance);
  // The skinned animation already contains grounded hip and foot movement.
  // Do not add the old primitive rig's body bob on top of it.
}
