import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import type { ImmersiveTownWorld, TownHouseMetadata } from "./types";
import {
  WALK_EYE_HEIGHT,
  canWalkAt,
  insideWalkBounds,
  nearbyWalkDoor,
  stepWalk,
  walkingRoadHeight,
  type WalkBounds,
  type WalkDoor,
  type WalkInput,
} from "./walking";

export type WalkCommand = "forward" | "back" | "left" | "right";
export type TownWalker = ReturnType<typeof createTownWalker>;

/** A second camera in the SAME scene. Switching never rebuilds the town or its state. */
export function createTownWalker(
  world: ImmersiveTownWorld,
  canvas: HTMLCanvasElement | null,
  callbacks: {
    isBlocked(): boolean;
    onNearbyHouse(house: TownHouseMetadata | null): void;
    onEnterHouse(house: TownHouseMetadata): void;
  },
) {
  const boundsForMesh = (mesh: AbstractMesh): WalkBounds & { top: number } => {
    mesh.computeWorldMatrix(true);
    const { minimumWorld: min, maximumWorld: max } =
      mesh.getBoundingInfo().boundingBox;
    return { minX: min.x, maxX: max.x, minZ: min.z, maxZ: max.z, top: max.y };
  };
  const obstacles = [
    ...world.houses.map((house) => boundsForMesh(house.pickMesh)),
    ...world.scene.meshes
      .filter(
        (mesh) =>
          /^(school-main-building|clinic-building)$|trunk$/.test(mesh.name) ||
          mesh.metadata?.blocksWalking === true,
      )
      .map(boundsForMesh),
  ];
  const raisedGround = world.scene.meshes
    .filter((mesh) =>
      /^(compound-lawn|compound-yard)|-(foundation|front-step)$/.test(
        mesh.name,
      ),
    )
    .map(boundsForMesh);
  const groundHeight = (point: { x: number; z: number }) => {
    let height = Math.max(0.71, walkingRoadHeight(point) ?? 0);
    for (const ground of raisedGround) {
      if (ground.top < 2.2 && insideWalkBounds(point, ground))
        height = Math.max(height, ground.top);
    }
    return height;
  };
  const doors: (WalkDoor & { approach: Vector3; house: TownHouseMetadata })[] =
    world.houses.map((house) => {
      house.root.computeWorldMatrix(true);
      const doorMesh = house.meshes.find((mesh) => mesh.name.endsWith("-door"));
      doorMesh?.computeWorldMatrix(true);
      const door =
        doorMesh?.getAbsolutePosition() ??
        Vector3.TransformCoordinates(
          new Vector3(0, 0, -4.2),
          house.root.getWorldMatrix(),
        );
      const outward = Vector3.TransformNormal(
        new Vector3(0, 0, -1),
        house.root.getWorldMatrix(),
      ).normalize();
      let approach = door.add(outward.scale(3.2));
      // Edge-of-town and rotated homes need a reachable spot beside the porch.
      // Keep the doorway itself authoritative; never move a house for navigation.
      if (!canWalkAt(approach, obstacles)) {
        const yaw = Math.atan2(outward.x, outward.z);
        const candidates = [3.2, 2, 1, 4.2].flatMap((radius) =>
          Array.from({ length: 24 }, (_, index) => {
            const angle = yaw + (index / 24) * Math.PI * 2;
            return new Vector3(
              door.x + Math.sin(angle) * radius,
              door.y,
              door.z + Math.cos(angle) * radius,
            );
          }),
        );
        approach =
          candidates.find((point) => canWalkAt(point, obstacles)) ?? approach;
      }
      return {
        id: house.id,
        x: door.x,
        z: door.z,
        approach,
        house,
      };
    });
  const camera = new UniversalCamera(
    "rivergate-walking-camera",
    new Vector3(-38, 2.6, -30),
    world.scene,
  );
  camera.inputs.clear();
  camera.minZ = 0.12;
  camera.maxZ = 320;
  camera.fov = 1.05;
  camera.inertia = 0;
  let active = false;
  let hasStarted = false;
  let nearby: TownHouseMetadata | null = null;
  let dragging: { id: number; x: number; y: number } | null = null;
  let lookDistance = 0;
  let ignorePickUntil = 0;
  const keys = new Set<string>();
  const heldButtons = new Set<WalkCommand>();

  const clearInput = () => {
    keys.clear();
    heldButtons.clear();
    dragging = null;
  };
  const blocked = () =>
    callbacks.isBlocked() ||
    (canvas !== null &&
      (canvas.closest("[inert]") !== null ||
        document.querySelector(
          'dialog[open], [role="dialog"][aria-modal="true"]',
        ) !== null ||
        document.visibilityState !== "visible"));
  const publishNearby = () => {
    const door = nearbyWalkDoor(camera.position, doors);
    const next =
      door === null
        ? null
        : (world.houses.find((house) => house.id === door.id) ?? null);
    if (next?.id !== nearby?.id) {
      nearby = next;
      callbacks.onNearbyHouse(next);
    }
  };
  const move = (input: WalkInput, dt: number) => {
    const pose = stepWalk(
      { x: camera.position.x, z: camera.position.z, yaw: camera.rotation.y },
      input,
      dt,
      obstacles,
    );
    camera.position.set(pose.x, groundHeight(pose) + WALK_EYE_HEIGHT, pose.z);
    camera.rotation.y = pose.yaw;
    publishNearby();
  };
  const enterHouse = (id?: string) => {
    if (!active || blocked() || performance.now() < ignorePickUntil) return;
    publishNearby();
    if (nearby === null || (id !== undefined && nearby.id !== id)) return;
    clearInput();
    callbacks.onEnterHouse(nearby);
  };
  const setActive = (next: boolean) => {
    clearInput();
    if (next === active) return;
    active = next;
    if (active) {
      world.camera.detachControl();
      if (!hasStarted) {
        // Begin beside a real front door, not in a road or inside a building.
        const start = doors.find((door) => canWalkAt(door.approach, obstacles));
        if (start !== undefined) {
          camera.position.copyFrom(start.approach);
          const away = new Vector3(
            start.approach.x - start.x,
            0,
            start.approach.z - start.z,
          ).normalize();
          const streetStart = start.approach.add(away.scale(5));
          if (canWalkAt(streetStart, obstacles))
            camera.position.copyFrom(streetStart);
          camera.position.y = groundHeight(camera.position) + WALK_EYE_HEIGHT;
          camera.rotation.y =
            Math.atan2(
              start.x - camera.position.x,
              start.z - camera.position.z,
            ) + 0.48;
        }
        hasStarted = true;
      }
      world.scene.activeCamera = camera;
      canvas?.focus({ preventScroll: true });
      publishNearby();
    } else {
      world.scene.activeCamera = world.camera;
      if (canvas !== null) world.camera.attachControl(canvas, true);
      nearby = null;
      callbacks.onNearbyHouse(null);
    }
  };
  const keyboardInMap = (event: KeyboardEvent) => {
    if (canvas === null || !(event.target instanceof HTMLElement)) return false;
    return (
      canvas.parentElement?.contains(event.target) === true &&
      !event.target.closest('input, textarea, select, [contenteditable="true"]')
    );
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (!active || blocked() || !keyboardInMap(event)) return;
    if (
      [
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
      ].includes(event.code)
    ) {
      event.preventDefault();
      keys.add(event.code);
    } else if (event.code === "KeyE" && !event.repeat) {
      event.preventDefault();
      enterHouse();
    }
  };
  const onKeyUp = (event: KeyboardEvent) => {
    keys.delete(event.code);
  };
  const onPointerDown = (event: PointerEvent) => {
    if (!active || blocked() || event.button !== 0) return;
    canvas?.focus({ preventScroll: true });
    dragging = { id: event.pointerId, x: event.clientX, y: event.clientY };
    lookDistance = 0;
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!active || blocked() || dragging?.id !== event.pointerId) return;
    const dx = event.clientX - dragging.x;
    const dy = event.clientY - dragging.y;
    lookDistance += Math.abs(dx) + Math.abs(dy);
    if (lookDistance > 5) ignorePickUntil = performance.now() + 250;
    camera.rotation.y += dx * 0.004;
    camera.rotation.x = Math.max(
      -0.65,
      Math.min(0.65, camera.rotation.x + dy * 0.004),
    );
    dragging = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: PointerEvent) => {
    if (dragging?.id === event.pointerId) dragging = null;
    // Movement buttons own their pointer capture/release. Ending a second
    // finger's look gesture must not cancel a thumb still holding Forward.
  };
  const frame = world.scene.onBeforeRenderObservable.add(() => {
    if (!active) return;
    if (
      blocked() ||
      (canvas !== null &&
        !canvas.parentElement?.contains(document.activeElement))
    ) {
      clearInput();
      return;
    }
    const pressed = (...codes: string[]) =>
      codes.some((code) => keys.has(code)) ? 1 : 0;
    move(
      {
        forward:
          pressed("KeyW", "ArrowUp") +
          Number(heldButtons.has("forward")) -
          pressed("KeyS", "ArrowDown") -
          Number(heldButtons.has("back")),
        right: pressed("KeyD") - pressed("KeyA"),
        turn:
          pressed("ArrowRight") +
          Number(heldButtons.has("right")) -
          pressed("ArrowLeft") -
          Number(heldButtons.has("left")),
      },
      world.engine.getDeltaTime() / 1000,
    );
  });
  if (canvas !== null) {
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearInput);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    document.addEventListener("visibilitychange", clearInput);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerUp);
  }
  return {
    camera,
    obstacles,
    doors,
    setActive,
    clearInput,
    enterHouse,
    get active() {
      return active;
    },
    hold(command: WalkCommand, pressed: boolean) {
      if (pressed && active && !blocked()) heldButtons.add(command);
      else heldButtons.delete(command);
    },
    nudge(command: WalkCommand) {
      if (!active || blocked()) return;
      const input = {
        forward: command === "forward" ? 1 : command === "back" ? -1 : 0,
        right: 0,
        turn: command === "right" ? 1 : command === "left" ? -1 : 0,
      };
      for (let i = 0; i < 4; i += 1) move(input, 0.05);
    },
    dispose() {
      clearInput();
      if (world.scene.activeCamera === camera)
        world.scene.activeCamera = world.camera;
      if (frame !== null) world.scene.onBeforeRenderObservable.remove(frame);
      if (canvas !== null) {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        window.removeEventListener("blur", clearInput);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
        document.removeEventListener("visibilitychange", clearInput);
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerleave", onPointerUp);
      }
      camera.dispose();
    },
  };
}
