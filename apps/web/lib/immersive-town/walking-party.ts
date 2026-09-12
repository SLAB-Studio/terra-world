import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { createTownCharacter } from "./characters-3d";
import { updateRealisticResident } from "./realistic-residents";
import {
  createCompanionState,
  stepCompanion,
  turnTowards,
  type CompanionState,
} from "./companion-motion";
import type { WalkBounds, WalkPoint } from "./walking";
import { createPartyContactShadows } from "./party-contact-shadow";
import { partyModelStatus } from "./party-status";
import {
  engineerOutfitModelFor,
  getEngineerWardrobe,
  subscribeEngineerWardrobe,
  type EngineerOutfit,
  type EngineerRole,
} from "../engineer-wardrobe";

export type WalkingParty = ReturnType<typeof createWalkingParty>;
const parties = new WeakMap<Scene, WalkingParty>();
export const walkingPartyFor = (scene: Scene) => parties.get(scene);

function createEngineer(
  scene: Scene,
  parent: TransformNode,
  role: EngineerRole,
  outfit: EngineerOutfit,
) {
  const leo = role === "leo";
  const rig = createTownCharacter(scene, parent, null, {
    // Keep Leo's legacy runtime id so traffic integrations and old diagnostics
    // continue to recognise the same companion after the visual-model upgrade.
    id: leo ? "leo-dog" : "player-rivergate",
    model: engineerOutfitModelFor(role, outfit),
    age: "adult",
    activity: "idle",
    hair: leo ? "coils" : "short",
    skin: leo ? "#70412E" : "#976349",
    hairColor: leo ? "#1F1712" : "#30271F",
    shirt: outfit === "engineer" ? "#D79B2A" : "#607B72",
    bottoms: "#334653",
    shoes: "#292825",
    x: 0,
    z: 0,
    rotation: 0,
    phase: leo ? 0.5 : 0,
    ...(leo ? { storyRole: "leo" as const } : {}),
  });
  rig.root.metadata = {
    ...rig.root.metadata,
    kind: leo ? "engineer-companion" : "player",
    engineerRole: role,
    model: engineerOutfitModelFor(role, outfit),
    outfit,
  };
  // Never flash the geometric mannequin while the selected skinned model loads.
  rig.root.getChildMeshes().forEach((mesh) => (mesh.visibility = 0));
  return { rig };
}

type Engineer = ReturnType<typeof createEngineer>;

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
  let wardrobe = getEngineerWardrobe();
  let player = createEngineer(scene, root, "player", wardrobe.player);
  let leo = createEngineer(scene, root, "leo", wardrobe.leo);
  let pendingPlayer: Engineer | null = null;
  let pendingLeo: Engineer | null = null;
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
  let cameraDistance = options.indoors ? 3.2 : 4.5;
  const pendingFor = (role: EngineerRole) =>
    role === "player" ? pendingPlayer : pendingLeo;
  const setPending = (role: EngineerRole, value: Engineer | null) => {
    if (role === "player") pendingPlayer = value;
    else pendingLeo = value;
  };
  const commitReadyEngineer = (role: EngineerRole) => {
    const pending = pendingFor(role);
    if (!pending) return;
    const state = pending.rig.root.metadata?.modelState;
    if (state === "fallback" && pending.rig.root.metadata?.modelError) {
      pending.rig.root.dispose(false, false);
      setPending(role, null);
      return;
    }
    if (state !== "ready") return;
    const current = role === "player" ? player : leo;
    pending.rig.root.position.copyFrom(current.rig.root.position);
    pending.rig.root.rotation.copyFrom(current.rig.root.rotation);
    pending.rig.root.metadata.routineMotion =
      current.rig.root.metadata?.routineMotion;
    pending.rig.root.setEnabled(active);
    current.rig.root.dispose(false, false);
    if (role === "player") player = pending;
    else leo = pending;
    setPending(role, null);
  };
  const replaceEngineer = (role: EngineerRole, outfit: EngineerOutfit) => {
    const current = role === "player" ? player : leo;
    const pending = pendingFor(role);
    if (current.rig.root.metadata?.outfit === outfit) {
      pending?.rig.root.dispose(false, false);
      setPending(role, null);
      return;
    }
    if (pending?.rig.root.metadata?.outfit === outfit) return;
    pending?.rig.root.dispose(false, false);
    const next = createEngineer(scene, root, role, outfit);
    // NullEngine tests have no asynchronous asset loader. In the live canvas,
    // keep the current person visible until the complete replacement is ready.
    if (!scene.getEngine().getRenderingCanvas()) {
      next.rig.root.setEnabled(active);
      current.rig.root.dispose(false, false);
      if (role === "player") player = next;
      else leo = next;
      return;
    }
    next.rig.root.setEnabled(false);
    setPending(role, next);
  };
  const unsubscribeWardrobe = subscribeEngineerWardrobe((next) => {
    if (disposed) return;
    wardrobe = next;
    replaceEngineer("player", next.player);
    replaceEngineer("leo", next.leo);
    update(0);
  });
  function update(dt: number) {
    if (!active || disposed) return;
    commitReadyEngineer("player");
    commitReadyEngineer("leo");
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
    player.rig.root.position.set(
      position.x,
      options.groundHeight(position),
      position.z,
    );
    player.rig.root.rotation.y = heading + Math.PI;
    player.rig.root.metadata.routineMotion = {
      activity: speed > 0.05 ? "walk" : "idle",
      speed,
      travelled,
    };
    // Locomotion remains distance-driven; reduced motion removes idle swaying.
    updateRealisticResident(
      player.rig,
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
    const leoSpeed = dt > 0 ? (dog!.travelled - oldTravel) / dt : 0;
    leo.rig.root.position.set(dog!.x, options.groundHeight(dog!), dog!.z);
    leo.rig.root.rotation.y = dog!.yaw + Math.PI;
    leo.rig.root.metadata.routineMotion = {
      activity: leoSpeed > 0.05 ? "walk" : "idle",
      speed: leoSpeed,
      travelled: dog!.travelled,
    };
    updateRealisticResident(
      leo.rig,
      seconds,
      reduced && leoSpeed < 0.05,
      leoSpeed,
      dog!.travelled,
    );
    if (contacts[0])
      contacts[0].position
        .copyFrom(player.rig.root.position)
        .addInPlaceFromFloats(0, 0.018, 0);
    if (contacts[1]) {
      contacts[1].position
        .copyFrom(leo.rig.root.position)
        .addInPlaceFromFloats(0, 0.018, 0);
      contacts[1].rotation.y = leo.rig.root.rotation.y;
    }
    previous.copyFrom(position);
    const aim = new Vector3(
      position.x,
      player.rig.root.position.y + 1.15,
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
    player.rig.root
      .getChildMeshes()
      .forEach(
        (m) =>
          (m.visibility =
            player.rig.root.metadata?.modelState === "ready"
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
    get player() {
      return player.rig.root;
    },
    get leo() {
      return leo.rig.root;
    },
    get modelState() {
      return partyModelStatus(
        player.rig.root.metadata?.modelState,
        leo.rig.root.metadata?.modelState,
      );
    },
    setActive(value: boolean) {
      if (active === value) return;
      active = value;
      root.setEnabled(value);
      initial = true;
      if (value) {
        update(0);
      }
    },
    /** DOM overlay coordinates come from Leo's actual position, never a fixed HUD corner. */
    project(width: number, height: number) {
      if (!active || leo.rig.root.metadata?.modelState !== "ready") return null;
      const p = Vector3.Project(
        leo.rig.root.position.add(new Vector3(0, 2.0, 0)),
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
      unsubscribeWardrobe();
      scene.onBeforeRenderObservable.remove(observer);
      root.dispose();
      camera.dispose();
      parties.delete(scene);
    },
  };
  parties.set(scene, party);
  scene.onDisposeObservable.addOnce(() => party.dispose());
  return party;
}
