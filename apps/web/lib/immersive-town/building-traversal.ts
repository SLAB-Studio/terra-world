import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  INTERIOR_ROOMS,
  createHouseInteriorWorld,
  type HouseInteriorWorld,
  type InteriorRoomId,
  type InteriorUpgradeId,
} from "./house-interior-world";
import { createVenueWorld, type VenueWorld } from "./venue-world";
import type { ImmersiveTownWorld } from "./types";
import type { TownWalker, WalkCommand } from "./town-walker";
import type { TownVenue } from "./venue-catalog";
import { WALK_EYE_HEIGHT } from "./walking";
import { neighborhoodHomeProfile } from "./neighborhood-home-stories";

export type BuildingVisit = Readonly<{
  id: string;
  name: string;
  kind: "home" | "venue";
  venue?: TownVenue;
  floor: number;
}>;
export type TraversalPhase =
  "outside" | "opening" | "entering" | "inside" | "leaving" | "emerging";
export type BuildingTraversal = ReturnType<typeof createBuildingTraversal>;

/** One canvas/engine, one active interior. The street remains allocated for return. */
export function createBuildingTraversal(
  world: ImmersiveTownWorld,
  street: TownWalker,
  options: {
    isBlocked(): boolean;
    reducedMotion(): boolean;
    upgrades(id: string): readonly InteriorUpgradeId[];
    onRepair(id: string, upgrade: InteriorUpgradeId): void;
    onChange(visit: BuildingVisit | null, phase: TraversalPhase): void;
    onRoom(room: InteriorRoomId | null): void;
    onNearby(area: string | null): void;
    onError(message: string): void;
    onLift(): void;
  },
) {
  let visit: BuildingVisit | null = null;
  let phase: TraversalPhase = "outside";
  let interior: HouseInteriorWorld | VenueWorld | null = null;
  let timer = 0;
  let doorAmount = 1;
  let start = Vector3.Zero();
  let end = Vector3.Zero();
  let returnPoint = Vector3.Zero();
  let outward = Vector3.Zero();
  let startYaw = 0;
  let endYaw = 0;
  let disposed = false;
  const canvas = world.engine.getRenderingCanvas();
  const notify = () => options.onChange(visit, phase);
  const disposeInterior = () => interior?.dispose();
  const setPhase = (next: TraversalPhase) => {
    phase = next;
    timer = 0;
    notify();
  };
  const blocked = () => options.isBlocked() || phase !== "inside";
  const entryPoint = () =>
    visit?.kind === "home" ? { x: -1.4, z: -6.4 } : { x: 0, z: -9.65 };
  const restoreStreet = (animate = false) => {
    interior?.dispose();
    interior = null;
    if (canvas) world.scene.attachControl();
    world.scene.activeCamera = street.camera;
    street.camera.position.copyFrom(returnPoint);
    street.camera.rotation.set(0, Math.atan2(outward.x, outward.z), 0);
    street.clearInput();
    options.onRoom(null);
    options.onNearby(null);
    if (animate && visit) {
      const door =
        street.venueDoors.find((d) => d.id === visit?.id) ??
        street.doors.find((d) => d.id === visit?.id);
      start = new Vector3(
        (door?.x ?? returnPoint.x) + outward.x * 0.25,
        returnPoint.y,
        (door?.z ?? returnPoint.z) + outward.z * 0.25,
      );
      end = returnPoint.clone();
      street.camera.position.copyFrom(start);
      setPhase("emerging");
    } else {
      if (visit) world.residents.setPlayerDoor(visit.id, false);
      visit = null;
      setPhase("outside");
    }
    canvas?.focus({ preventScroll: true });
  };
  function allocateInterior() {
    if (!visit) return;
    const id = visit.id;
    if (visit.kind === "home") {
      const template =
        id === "sunny" || id === "bluebell" || id === "mango"
          ? id
          : ((["sunny", "bluebell", "mango"] as const)[
              [...id].reduce(
                (sum, character) => sum + character.charCodeAt(0),
                0,
              ) % 3
            ] ?? "sunny");
      interior = createHouseInteriorWorld(
        world.engine,
        template,
        options.upgrades(id),
        {
          isBlocked: blocked,
          onRoomChange: options.onRoom,
          onNearbyChange: options.onNearby,
          onInteract: (room) => {
            const upgrade = INTERIOR_ROOMS.find(
              (r) => r.id === room,
            )?.upgradeId;
            if (upgrade && !options.upgrades(id).includes(upgrade))
              options.onRepair(id, upgrade);
          },
        },
      );
    } else if (visit.venue) {
      interior = createVenueWorld(
        world.engine,
        visit.venue,
        visit.floor,
        world.scene.metadata?.timeOfDay === "night" ? "night" : "day",
        {
          isBlocked: blocked,
          onNearby: options.onNearby,
          onExit: leave,
          onLift: options.onLift,
          onRepair: () => {
            const need = neighborhoodHomeProfile(id).need;
            if (!options.upgrades(id).includes(need))
              options.onRepair(id, need);
          },
        },
      );
      interior.setApartmentHealthy(
        options.upgrades(id).includes(neighborhoodHomeProfile(id).need),
      );
    }
    if (!interior) throw new Error("This entrance has no interior");
    world.camera.detachControl();
    world.scene.detachControl();
    interior.enterDoor();
    interior.setDoorOpen(1);
    doorAmount = 1;
    start = interior.walker.camera.position.clone();
    end = start.add(new Vector3(0, 0, 1.5));
    setPhase("entering");
  }
  function open(id: string) {
    if (disposed || phase !== "outside" || options.isBlocked()) return false;
    const venueDoor = street.venueDoors.find((d) => d.id === id);
    const houseDoor = street.doors.find((d) => d.id === id);
    const door = venueDoor ?? houseDoor;
    if (!door) return false;
    // Walking never teleports across town. Aerial/directory travel starts at a porch.
    const wasWalking = street.active;
    if (
      wasWalking &&
      Math.hypot(
        street.camera.position.x - door.x,
        street.camera.position.z - door.z,
      ) > 4.8
    )
      return false;
    street.setActive(true);
    street.clearInput();
    outward =
      venueDoor?.place.outward.clone() ??
      Vector3.TransformNormal(
        new Vector3(0, 0, -1),
        houseDoor!.house.root.getWorldMatrix(),
      ).normalize();
    if (!wasWalking) {
      street.camera.position.copyFrom(door.approach);
      street.camera.position.y =
        street.groundHeight(door.approach) + WALK_EYE_HEIGHT;
      street.camera.rotation.set(0, Math.atan2(-outward.x, -outward.z), 0);
    }
    returnPoint = street.camera.position.clone();
    visit = venueDoor
      ? {
          id,
          kind: "venue",
          name: venueDoor.place.venue.name,
          venue: venueDoor.place.venue,
          floor: 0,
        }
      : { id, kind: "home", name: houseDoor!.house.displayName, floor: 0 };
    start = street.camera.position.clone();
    // Handoff at the actual doorway recess, before the exterior shell wall.
    end = new Vector3(
      door.x + outward.x * 0.18,
      start.y,
      door.z + outward.z * 0.18,
    );
    startYaw = street.camera.rotation.y;
    endYaw = Math.atan2(-outward.x, -outward.z);
    world.residents.setPlayerDoor(id, true);
    setPhase("opening");
    canvas?.focus({ preventScroll: true });
    return true;
  }
  function leave() {
    if (!interior || phase !== "inside") return;
    if ((visit?.floor ?? 0) > 0) {
      options.onError(
        "Take the lift to the ground floor, then walk through the front door.",
      );
      return;
    }
    const point = entryPoint();
    const camera = interior.walker.camera;
    if (
      Math.hypot(camera.position.x - point.x, camera.position.z - point.z) > 2.8
    )
      return;
    interior.walker.clearInput();
    start = camera.position.clone();
    end = new Vector3(point.x, camera.position.y, point.z);
    startYaw = camera.rotation.y;
    endYaw = Math.PI;
    setPhase("leaving");
  }
  const ease = (n: number) => n * n * (3 - 2 * n);
  function update(seconds: number) {
    if (!visit || disposed) return;
    if (options.isBlocked()) {
      street.clearInput();
      interior?.walker.clearInput();
      return;
    }
    const dt = Number.isFinite(seconds)
      ? Math.max(0, Math.min(0.05, seconds))
      : 0;
    const reduced = options.reducedMotion();
    timer += dt;
    if (phase === "opening") {
      const t = reduced ? 1 : Math.min(1, Math.max(0, (timer - 0.45) / 1.05));
      Vector3.LerpToRef(start, end, ease(t), street.camera.position);
      const turn = Math.atan2(
        Math.sin(endYaw - startYaw),
        Math.cos(endYaw - startYaw),
      );
      street.camera.rotation.set(
        0,
        startYaw + turn * ease(Math.min(1, timer / 0.4)),
        0,
      );
      if (t === 1) {
        try {
          allocateInterior();
        } catch {
          restoreStreet();
          options.onError(
            "The interior could not open. You're safely outside—try the door again.",
          );
        }
      }
    } else if ((phase === "entering" || phase === "leaving") && interior) {
      const t = reduced
        ? 1
        : Math.min(1, timer / (phase === "entering" ? 0.65 : 0.75));
      Vector3.LerpToRef(start, end, ease(t), interior.walker.camera.position);
      if (phase === "leaving") {
        interior.setDoorOpen(reduced ? 1 : Math.min(1, timer / 0.3));
        const turn = Math.atan2(
          Math.sin(endYaw - startYaw),
          Math.cos(endYaw - startYaw),
        );
        interior.walker.camera.rotation.y = startYaw + turn * ease(t);
      }
      if (t === 1) {
        if (phase === "leaving") restoreStreet(true);
        else setPhase("inside");
      }
    } else if (phase === "emerging") {
      const t = reduced ? 1 : Math.min(1, timer / 0.75);
      Vector3.LerpToRef(start, end, ease(t), street.camera.position);
      if (t === 1) restoreStreet();
    } else if (phase === "inside" && interior) {
      const p = interior.walker.camera.position;
      const entry = entryPoint();
      const nearDoor = Math.hypot(p.x - entry.x, p.z - entry.z) < 2.5;
      const target = nearDoor ? 1 : 0;
      doorAmount = reduced
        ? target
        : doorAmount +
          Math.max(-dt * 2.5, Math.min(dt * 2.5, target - doorAmount));
      interior.setDoorOpen(doorAmount);
      if (
        visit.floor === 0 &&
        Math.abs(p.x - entry.x) < 0.85 &&
        p.z < entry.z + 0.18
      )
        leave();
    }
  }
  return {
    open,
    leave,
    update,
    get phase() {
      return phase;
    },
    get visit() {
      return visit;
    },
    get inside() {
      return interior !== null;
    },
    get scene() {
      return interior?.scene ?? world.scene;
    },
    get walker() {
      return interior?.walker ?? street;
    },
    get nearExit() {
      if (!interior || (visit?.floor ?? 0) > 0) return false;
      const p = interior.walker.camera.position,
        e = entryPoint();
      return Math.hypot(p.x - e.x, p.z - e.z) < 2.8;
    },
    syncUpgrades() {
      if (visit?.kind === "home" && interior && "setInstalled" in interior)
        interior.setInstalled(options.upgrades(visit.id));
      else if (
        visit?.venue?.kind === "apartments" &&
        interior &&
        "setApartmentHealthy" in interior
      )
        interior.setApartmentHealthy(
          options
            .upgrades(visit.id)
            .includes(neighborhoodHomeProfile(visit.id).need),
        );
    },
    changeFloor(index: number) {
      if (
        phase !== "inside" ||
        !visit?.venue ||
        !Number.isInteger(index) ||
        !visit.venue.floors[index] ||
        interior?.walker.nearby !== "lift"
      )
        return false;
      const old = interior;
      const previousFloor = visit.floor;
      visit = { ...visit, floor: index };
      interior = null;
      try {
        allocateInterior();
        old?.dispose();
        // Arrive at the lift, not at a false street exit on an upper floor.
        interior!.walker.startAt({ x: 0, z: 6.2, yaw: Math.PI });
        setPhase("inside");
        return true;
      } catch {
        disposeInterior();
        interior = old;
        visit = { ...visit, floor: previousFloor };
        setPhase("inside");
        options.onError(
          "That floor could not load. Your current floor is still available.",
        );
        return false;
      }
    },
    hold(command: WalkCommand, down: boolean) {
      (interior?.walker ?? street).hold(command, down);
    },
    nudge(command: WalkCommand) {
      (interior?.walker ?? street).nudge(command);
    },
    interact() {
      if (interior) {
        if (this.nearExit) leave();
        else interior.walker.interact();
      } else street.enterNearby();
    },
    dispose() {
      disposed = true;
      if (visit) world.residents.setPlayerDoor(visit.id, false);
      interior?.dispose();
      interior = null;
    },
  };
}
