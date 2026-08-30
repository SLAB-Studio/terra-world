import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { InteriorRoomId } from "./house-interior-world";
import {
  INTERIOR_EYE_HEIGHT,
  interiorRoomAt,
  nearbyInteriorTask,
  ROOM_STARTS,
  stepInterior,
} from "./interior-navigation";
import type { WalkBounds, WalkInput, WalkPoint, WalkPose } from "./walking";

export type InteriorCommand = "forward" | "back" | "left" | "right";
export type InteriorWalker = ReturnType<typeof createInteriorWalker>;
export type IndoorCallbacks<Area extends string> = {
  onRoomChange?(room: Area): void;
  onNearbyChange?(room: Area | null): void;
  onInteract?(room: Area): void;
};
export type InteriorWalkCallbacks = IndoorCallbacks<InteriorRoomId>;

export function createInteriorWalker(
  scene: Scene,
  canvas: HTMLCanvasElement | null,
  obstacles: () => readonly WalkBounds[],
  callbacks: InteriorWalkCallbacks = {},
) {
  return createIndoorWalker(
    scene,
    canvas,
    obstacles,
    {
      starts: ROOM_STARTS,
      roomAt: interiorRoomAt,
      nearbyAt: nearbyInteriorTask,
      step: stepInterior,
    },
    callbacks,
  );
}

/** Shared first-person controls; each building supplies its own navigable layout. */
export function createIndoorWalker<Area extends string>(
  scene: Scene,
  canvas: HTMLCanvasElement | null,
  obstacles: () => readonly WalkBounds[],
  navigation: {
    starts: Record<Area, WalkPose>;
    roomAt(point: WalkPoint): Area;
    nearbyAt(point: WalkPoint): Area | null;
    step(
      pose: WalkPose,
      input: WalkInput,
      seconds: number,
      obstacles: readonly WalkBounds[],
    ): WalkPose;
  },
  callbacks: IndoorCallbacks<Area> = {},
) {
  const camera = new UniversalCamera(
    "interior-walking-camera",
    new Vector3(0, INTERIOR_EYE_HEIGHT, 0),
    scene,
  );
  camera.inputs.clear();
  camera.minZ = 0.08;
  camera.maxZ = 65;
  camera.fov = 1.2;
  camera.inertia = 0;
  let active = false;
  let currentRoom: Area | null = null;
  let nearby: Area | null = null;
  const keys = new Set<string>();
  const holds = new Set<InteriorCommand>();
  let look: { id: number; x: number; y: number } | null = null;
  const clearInput = () => {
    keys.clear();
    holds.clear();
    look = null;
  };
  const blocked = () =>
    canvas !== null &&
    (document.visibilityState !== "visible" ||
      canvas.closest("[inert]") !== null ||
      canvas.closest("dialog")?.open === false);
  const publish = () => {
    const next = navigation.roomAt(camera.position);
    if (next !== currentRoom) {
      currentRoom = next;
      callbacks.onRoomChange?.(next);
    }
    const task = navigation.nearbyAt(camera.position);
    if (task !== nearby) {
      nearby = task;
      callbacks.onNearbyChange?.(task);
    }
  };
  const move = (input: WalkInput, dt: number) => {
    if (!active || blocked()) return;
    const pose = navigation.step(
      { x: camera.position.x, z: camera.position.z, yaw: camera.rotation.y },
      input,
      dt,
      obstacles(),
    );
    camera.position.set(pose.x, INTERIOR_EYE_HEIGHT, pose.z);
    camera.rotation.y = pose.yaw;
    publish();
  };
  const interact = () => {
    if (!active || blocked()) return;
    publish();
    if (nearby) {
      clearInput();
      callbacks.onInteract?.(nearby);
    }
  };
  const keydown = (e: KeyboardEvent) => {
    if (
      !active ||
      blocked() ||
      !(e.target instanceof HTMLElement) ||
      !canvas?.parentElement?.contains(e.target) ||
      e.target.closest('input, textarea, select, [contenteditable="true"]')
    )
      return;
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
      ].includes(e.code)
    ) {
      e.preventDefault();
      keys.add(e.code);
    }
    if (e.code === "KeyE" && !e.repeat) {
      e.preventDefault();
      interact();
    }
  };
  const keyup = (e: KeyboardEvent) => keys.delete(e.code);
  const pointerdown = (e: PointerEvent) => {
    if (!active || blocked() || e.button !== 0) return;
    canvas?.focus({ preventScroll: true });
    canvas?.setPointerCapture(e.pointerId);
    look = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const pointermove = (e: PointerEvent) => {
    if (!active || blocked() || look?.id !== e.pointerId) return;
    camera.rotation.y += (e.clientX - look.x) * 0.004;
    camera.rotation.x = Math.max(
      -0.7,
      Math.min(0.85, camera.rotation.x + (e.clientY - look.y) * 0.004),
    );
    look = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const pointerup = (e: PointerEvent) => {
    if (look?.id === e.pointerId) look = null;
  };
  const frame = scene.onBeforeRenderObservable.add(() => {
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
      Number(codes.some((code) => keys.has(code)));
    move(
      {
        forward:
          pressed("KeyW", "ArrowUp") -
          pressed("KeyS", "ArrowDown") +
          Number(holds.has("forward")) -
          Number(holds.has("back")),
        right: pressed("KeyD") - pressed("KeyA"),
        turn:
          pressed("ArrowRight") -
          pressed("ArrowLeft") +
          Number(holds.has("right")) -
          Number(holds.has("left")),
      },
      scene.getEngine().getDeltaTime() / 1000,
    );
  });
  if (canvas) {
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", clearInput);
    document.addEventListener("visibilitychange", clearInput);
    canvas.addEventListener("pointerdown", pointerdown);
    canvas.addEventListener("pointermove", pointermove);
    canvas.addEventListener("pointerup", pointerup);
    canvas.addEventListener("pointercancel", pointerup);
    canvas.addEventListener("lostpointercapture", pointerup);
  }
  return {
    camera,
    get obstacles() {
      return obstacles();
    },
    get active() {
      return active;
    },
    get room() {
      return currentRoom;
    },
    get nearby() {
      return nearby;
    },
    enter(room: Area) {
      if (active && currentRoom === room) return; // React room updates must not teleport the walker.
      clearInput();
      const start = navigation.starts[room];
      camera.position.set(start.x, INTERIOR_EYE_HEIGHT, start.z);
      camera.rotation.set(0.12, start.yaw, 0);
      active = true;
      scene.activeCamera = camera;
      canvas?.focus({ preventScroll: true });
      publish();
    },
    stop() {
      active = false;
      clearInput();
      currentRoom = null;
      nearby = null;
      callbacks.onNearbyChange?.(null);
    },
    clearInput,
    interact,
    hold(command: InteriorCommand, down: boolean) {
      if (down && active && !blocked()) holds.add(command);
      else holds.delete(command);
    },
    nudge(command: InteriorCommand) {
      const input = {
        forward: command === "forward" ? 1 : command === "back" ? -1 : 0,
        right: 0,
        turn: command === "right" ? 1 : command === "left" ? -1 : 0,
      };
      for (let i = 0; i < 4; i++) move(input, 0.05);
    },
    dispose() {
      clearInput();
      if (frame) scene.onBeforeRenderObservable.remove(frame);
      if (canvas) {
        window.removeEventListener("keydown", keydown);
        window.removeEventListener("keyup", keyup);
        window.removeEventListener("blur", clearInput);
        document.removeEventListener("visibilitychange", clearInput);
        canvas.removeEventListener("pointerdown", pointerdown);
        canvas.removeEventListener("pointermove", pointermove);
        canvas.removeEventListener("pointerup", pointerup);
        canvas.removeEventListener("pointercancel", pointerup);
        canvas.removeEventListener("lostpointercapture", pointerup);
      }
      camera.dispose();
    },
  };
}
