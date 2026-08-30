import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Vector3, Matrix, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { createTownCharacter } from "./characters-3d";
import { updateRealisticResident } from "./realistic-residents";
import { loadLocalSceneAsset } from "./resident-assets";
import {
  createCompanionState,
  stepCompanion,
  turnTowards,
  type CompanionState,
} from "./companion-motion";
import type { WalkBounds, WalkPoint } from "./walking";
import { createPartyContactShadows } from "./party-contact-shadow";
import { partyModelStatus } from "./party-status";

export type WalkingParty = ReturnType<typeof createWalkingParty>;
const parties = new WeakMap<Scene, WalkingParty>();
export const walkingPartyFor = (scene: Scene) => parties.get(scene);

/** Presentation follows the collision controller; cameras never own gameplay position.
 * The same small party works in street, home, venue and upper-floor scenes.
 */
export function createWalkingParty(
  scene: Scene,
  pose: UniversalCamera,
  options: {
    indoors?: boolean;
    reducedMotion?(): boolean;
    obstacles(): readonly WalkBounds[];
    canStand(point: WalkPoint, bounds: readonly WalkBounds[]): boolean;
    groundHeight(point: WalkPoint): number;
  },
) {
  const root = new TransformNode("walking-party", scene);
  const contacts = createPartyContactShadows(scene, root);
  const player = createTownCharacter(scene, root, null, {
    id: "player-rivergate",
    age: "adult",
    activity: "idle",
    hair: "short",
    skin: "#976349",
    hairColor: "#30271f",
    shirt: "#607b72",
    bottoms: "#334653",
    shoes: "#292825",
    x: 0,
    z: 0,
    rotation: 0,
    phase: 0,
  });
  player.root.metadata = { ...player.root.metadata, kind: "player" };
  // Never flash the old geometric mannequin while the detailed avatar loads.
  player.root.getChildMeshes().forEach((m) => (m.visibility = 0));
  const leo = new TransformNode("leo-dog", scene);
  leo.parent = root;
  leo.scaling.setAll(0.9);
  // This asset's imported forward axis is already Babylon +Z.
  const dogMount = new TransformNode("leo-model-mount", scene);
  dogMount.parent = leo;
  dogMount.rotation.y = 0;
  const camera = new UniversalCamera(
    "walking-party-camera",
    Vector3.Zero(),
    scene,
  );
  camera.inputs.clear();
  camera.minZ = 0.08;
  camera.maxZ = options.indoors ? 65 : 320;
  camera.fov = options.indoors ? 1.15 : 0.95;
  camera.inertia = 0;
  let active = false,
    disposed = false,
    initial = true,
    seconds = 0,
    travelled = 0,
    heading = 0;
  let desiredHeading = 0;
  const previous = Vector3.Zero();
  let dog: CompanionState | null = null;
  let dogClips: AnimationGroup[] = [];
  let modelState: "loading" | "ready" | "failed" = "loading";
  let lastClip = "",
    lastDogPose = -Infinity,
    dogBlend = 0;
  let cameraDistance = options.indoors ? 3.2 : 4.5;
  const poses = new Map<
    TransformNode,
    {
      position: Vector3;
      rotation: import("@babylonjs/core/Maths/math.vector").Quaternion;
    }
  >();
  let pending: Promise<void> | null = null;
  function loadDog() {
    if (pending || disposed) return;
    if (!scene.getEngine().getRenderingCanvas()) return;
    modelState = "loading";
    pending = loadLocalSceneAsset(scene, "/models/leo/leo.glb")
      .then((asset) => {
        if (disposed || scene.isDisposed) return;
        const instance = asset.instantiateModelsToScene(
          (name) => `leo:${name}`,
          false,
          { doNotInstantiate: true },
        );
        instance.rootNodes.forEach((n) => (n.parent = dogMount));
        dogClips = instance.animationGroups;
        if (
          !["idle", "walk", "trot"].every((name) =>
            dogClips.some((g) => g.name.endsWith(name)),
          )
        )
          throw new Error("Leo has no locomotion clips");
        dogClips.forEach((g) => {
          g.start(true);
          g.pause();
        });
        dogMount.getChildMeshes().forEach((m) => {
          m.isPickable = false;
          m.receiveShadows = true;
        });
        modelState = "ready";
      })
      .catch(() => {
        if (!disposed) modelState = "failed";
      })
      .finally(() => (pending = null));
  }
  function animateDog(speed: number, reduced: boolean) {
    if (!dog || !dogClips.length || seconds - lastDogPose < 1 / 30) return;
    lastDogPose = seconds;
    const clip =
      speed > (lastClip === "trot" ? 2.0 : 2.3)
        ? "trot"
        : speed > (lastClip !== "idle" ? 0.035 : 0.1)
          ? "walk"
          : "idle";
    if (lastClip !== clip) {
      poses.clear();
      for (const g of dogClips)
        for (const a of g.targetedAnimations) {
          const n = a.target as TransformNode;
          if (n.rotationQuaternion && !poses.has(n))
            poses.set(n, {
              position: n.position.clone(),
              rotation: n.rotationQuaternion.clone(),
            });
        }
      lastClip = clip;
      dogBlend = seconds;
    }
    const group = dogClips.find((g) => g.name.endsWith(clip))!;
    const phase =
      clip !== "idle"
        ? dog.travelled / ((clip === "trot" ? 1.05 : 0.72) * 0.9)
        : reduced
          ? 0
          : seconds / 2;
    group.goToFrame(group.from + (phase % 1) * (group.to - group.from));
    const blend = Math.min(1, (seconds - dogBlend) / 0.18);
    if (blend < 1)
      for (const [n, p] of poses) {
        if (n.rotationQuaternion)
          Quaternion.SlerpToRef(
            p.rotation,
            n.rotationQuaternion,
            blend,
            n.rotationQuaternion,
          );
        Vector3.LerpToRef(p.position, n.position, blend, n.position);
      }
  }
  function update(dt: number) {
    if (!active || disposed) return;
    dt = Math.max(0, Math.min(0.05, Number.isFinite(dt) ? dt : 0));
    seconds += dt;
    const reduced = options.reducedMotion?.() ?? false;
    const bounds = options.obstacles();
    const canStand = (p: WalkPoint) => options.canStand(p, bounds);
    const position = pose.position;
    const dx = position.x - previous.x,
      dz = position.z - previous.z;
    const distance = Math.hypot(dx, dz);
    if (initial || distance > 3) {
      heading = pose.rotation.y;
      desiredHeading = heading;
      dog = createCompanionState(
        { x: position.x, z: position.z, yaw: heading },
        canStand,
      );
      initial = false;
    } else {
      if (distance > 0.0001) desiredHeading = Math.atan2(dx, dz);
      heading = turnTowards(heading, desiredHeading, dt);
      travelled += distance;
    }
    const speed = dt > 0 && distance < 3 ? distance / dt : 0;
    player.root.position.set(
      position.x,
      options.groundHeight(position),
      position.z,
    );
    player.root.rotation.y = heading + Math.PI;
    player.root.metadata.routineMotion = {
      activity: speed > 0.05 ? "walk" : "idle",
      speed,
      travelled,
    };
    // Locomotion remains distance-driven; reduced motion removes idle swaying.
    updateRealisticResident(
      player,
      seconds,
      reduced && speed < 0.05,
      speed,
      travelled,
    );
    const oldTravel = dog!.travelled;
    stepCompanion(
      dog!,
      { x: position.x, z: position.z, yaw: heading },
      dt,
      canStand,
      speed,
    );
    leo.position.set(dog!.x, options.groundHeight(dog!), dog!.z);
    leo.rotation.y = dog!.yaw;
    if (contacts[0])
      contacts[0].position
        .copyFrom(player.root.position)
        .addInPlaceFromFloats(0, 0.018, 0);
    if (contacts[1]) {
      contacts[1].position
        .copyFrom(leo.position)
        .addInPlaceFromFloats(0, 0.018, 0);
      contacts[1].rotation.y = leo.rotation.y;
    }
    animateDog(dt > 0 ? (dog!.travelled - oldTravel) / dt : 0, reduced);
    previous.copyFrom(position);
    const aim = new Vector3(
      position.x,
      player.root.position.y + 1.15,
      position.z,
    );
    const yaw = pose.rotation.y;
    const elevation = options.indoors ? 1.45 : 1.65;
    const wanted = options.indoors ? 3.2 : 4.5;
    // Camera boom is swept against the same walls. Returning to full distance
    // eases out; an obstruction shortens immediately to avoid seeing through it.
    let free = 0.5;
    for (let d = 0.5; d <= wanted; d += 0.12) {
      if (
        !canStand({
          x: aim.x - Math.sin(yaw) * d,
          z: aim.z - Math.cos(yaw) * d,
        })
      )
        break;
      free = d;
    }
    cameraDistance =
      reduced || free < cameraDistance
        ? free
        : Math.min(free, cameraDistance + dt * 3);
    camera.position.set(
      aim.x - Math.sin(yaw) * cameraDistance,
      aim.y +
        elevation * Math.min(1, cameraDistance / 2) +
        Math.sin(-pose.rotation.x) * 1.2,
      aim.z - Math.cos(yaw) * cameraDistance,
    );
    camera.setTarget(
      aim.add(new Vector3(Math.cos(yaw) * 0.3, 0, -Math.sin(yaw) * 0.3)),
    );
    // Preserve space for two bodies in a portrait viewport, rather than cropping
    // Leo out as a vertically-fixed field of view becomes progressively narrower.
    camera.fovMode =
      scene.getEngine().getAspectRatio(camera) < 1
        ? UniversalCamera.FOVMODE_HORIZONTAL_FIXED
        : UniversalCamera.FOVMODE_VERTICAL_FIXED;
    // At a wall the boom can become too short to frame a full body.
    player.root
      .getChildMeshes()
      .forEach(
        (m) =>
          (m.visibility =
            player.root.metadata?.modelState === "ready"
              ? cameraDistance < 0.7
                ? 0.18
                : 1
              : 0),
      );
    scene.activeCamera = camera;
  }
  const observer = scene.onBeforeRenderObservable.add(() =>
    update(scene.getEngine().getDeltaTime() / 1000),
  );
  root.setEnabled(false);
  const party = {
    camera,
    root,
    player: player.root,
    leo,
    get modelState() {
      return partyModelStatus(player.root.metadata?.modelState, modelState);
    },
    setActive(value: boolean) {
      if (active === value) return;
      active = value;
      root.setEnabled(value);
      initial = true;
      if (value) {
        loadDog();
        update(0);
      }
    },
    /** DOM overlay coordinates come from Leo's actual position, never a fixed HUD corner. */
    project(width: number, height: number) {
      if (!active || modelState !== "ready") return null;
      const p = Vector3.Project(
        leo.position.add(new Vector3(0, 1.0, 0)),
        Matrix.Identity(),
        scene.getTransformMatrix(),
        camera.viewport.toGlobal(width, height),
      );
      return p.z >= 0 && p.z <= 1 ? { x: p.x, y: p.y } : null;
    },
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.onBeforeRenderObservable.remove(observer);
      dogClips.forEach((g) => g.dispose());
      root.dispose();
      camera.dispose();
      parties.delete(scene);
    },
  };
  parties.set(scene, party);
  scene.onDisposeObservable.addOnce(() => party.dispose());
  return party;
}
