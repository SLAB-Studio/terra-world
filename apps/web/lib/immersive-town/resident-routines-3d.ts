import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";
import type { TownCharacterRig } from "./characters-3d";
import type { TownHouseMetadata } from "./types";
import type { TownVenueMetadata } from "./venues";
import { createResidentNavigation } from "./resident-navigation";
import { createResidentLife, type ResidentDestination } from "./resident-life";
import { insideWalkBounds, walkingRoadHeight, type WalkPoint } from "./walking";
import type { TrafficSimulation } from "./traffic";

/** Existing doorway coordinates remain authoritative; no buildings are moved. */
export function createResidentRoutines(
  scene: Scene,
  actors: readonly TownCharacterRig[],
  houses: readonly TownHouseMetadata[],
  venues: readonly TownVenueMetadata[],
) {
  const box = (mesh: AbstractMesh) => {
    mesh.computeWorldMatrix(true);
    const b = mesh.getBoundingInfo().boundingBox;
    return {
      minX: b.minimumWorld.x,
      maxX: b.maximumWorld.x,
      minZ: b.minimumWorld.z,
      maxZ: b.maximumWorld.z,
      top: b.maximumWorld.y,
    };
  };
  const obstacles = [
    ...houses.map((h) => box(h.pickMesh)),
    ...scene.meshes
      .filter(
        (m) =>
          /^(school-main-building|clinic-building)$|trunk$/.test(m.name) ||
          m.metadata?.blocksWalking === true,
      )
      .map(box),
  ];
  const raised = scene.meshes
    .filter((m) =>
      /^(compound-lawn|compound-yard)|-(foundation|front-step)$/.test(m.name),
    )
    .map(box);
  const ground = (p: WalkPoint) => {
    let y = Math.max(0.71, walkingRoadHeight(p) ?? 0);
    for (const b of raised)
      if (b.top < 2.2 && insideWalkBounds(p, b)) y = Math.max(y, b.top);
    return y;
  };
  const nav = createResidentNavigation(obstacles, {
    dynamicObstacles: () => scene.metadata?.openingChapterWalkObstacles ?? [],
    additionalCrossings: () => scene.metadata?.openingChapterCrossings ?? [],
  });
  const doors = new Map<
    string,
    { door: Vector3; outward: Vector3; mesh: AbstractMesh | null }
  >();
  for (const house of houses) {
    house.root.computeWorldMatrix(true);
    const mesh = house.meshes.find((m) => m.name.endsWith("-door")) ?? null;
    mesh?.computeWorldMatrix(true);
    const door =
      mesh?.getAbsolutePosition().clone() ??
      Vector3.TransformCoordinates(
        new Vector3(0, 0, -4.2),
        house.root.getWorldMatrix(),
      );
    const outward = Vector3.TransformNormal(
      new Vector3(0, 0, -1),
      house.root.getWorldMatrix(),
    ).normalize();
    doors.set(house.id, { door, outward, mesh });
  }
  for (const place of venues)
    if (!doors.has(place.venue.id)) {
      doors.set(place.venue.id, {
        door: place.door.clone(),
        outward: place.outward.clone(),
        mesh: place.meshes.find((m) => m.name.endsWith("-door")) ?? null,
      });
    }
  const origin = { x: -38, z: -30 };
  const destinations: ResidentDestination[] = [];
  for (const [id, { door, outward }] of doors) {
    const yaw = Math.atan2(outward.x, outward.z);
    const points = [2.5, 3.5, 1.5, 4.5, 1, 2, 3, 4, 4.7].flatMap((radius) =>
      Array.from({ length: 32 }, (_, i) => ({
        x: door.x + Math.sin(yaw + (i * Math.PI) / 16) * radius,
        z: door.z + Math.cos(yaw + (i * Math.PI) / 16) * radius,
      })),
    );
    const point = points.find(
      (p) =>
        (p.x - door.x) * outward.x + (p.z - door.z) * outward.z >= 0.1 &&
        nav.isWalkable(p) &&
        nav.findPath(origin, p),
    );
    if (!point) continue;
    // The final metre is an explicit doorway portal, not a navigation shortcut
    // through arbitrary walls. Indoor dwell resumes at this SAME threshold.
    const threshold = {
      x: door.x + outward.x * 0.08,
      z: door.z + outward.z * 0.08,
    };
    destinations.push({
      id,
      kind: houses.some((h) => h.id === id) ? "home" : "venue",
      point,
      ...(venues.find((v) => v.venue.id === id)?.venue.outdoor
        ? {}
        : { threshold }),
    });
  }
  // Preserve social spaces as places to pause, not tiny looping movement paths.
  for (const [id, x, z] of [
    ["market-square", 50, 15],
    ["school-garden", -53, 22],
    ["river-promenade", 4, 30],
  ] as const) {
    const point = nav.closestWalkablePoint({ x, z }, 4);
    if (point) destinations.push({ id, kind: "leisure", point });
  }
  const life = createResidentLife(
    actors.map((a) => ({
      id: a.profile.id,
      point: { x: a.root.position.x, z: a.root.position.z },
      yaw: a.root.rotation.y,
    })),
    destinations,
    nav,
  );
  const byId = new Map(actors.map((a) => [a.profile.id, a]));
  type Portal = {
    mesh: AbstractMesh;
    original: Vector3;
    hinge: TransformNode;
    angle: number;
    created: boolean;
  };
  const portals = new Map<string, Portal>();
  const playerDoors = new Set<string>();
  const doorwayMaterial = new StandardMaterial(
    "resident-doorway-shadow",
    scene,
  );
  doorwayMaterial.diffuseColor = Color3.FromHexString("#111916");
  doorwayMaterial.disableLighting = true;
  function portalFor(id: string) {
    let portal = portals.get(id);
    if (portal) return portal;
    const entry = doors.get(id);
    if (!entry) return null;
    const original = entry.mesh?.position.clone() ?? entry.door.clone();
    const mesh =
      entry.mesh ??
      MeshBuilder.CreateBox(
        `resident-${id}-door`,
        { width: 1.3, height: 2.25, depth: 0.12 },
        scene,
      );
    if (!entry.mesh) {
      mesh.position.copyFrom(entry.door);
      mesh.position.y = ground(entry.door) + 1.12;
      mesh.rotation.y = Math.atan2(-entry.outward.x, -entry.outward.z);
      mesh.material = doorwayMaterial;
      mesh.isPickable = false;
    }
    const parent = mesh.parent;
    const width = mesh.getBoundingInfo().boundingBox.extendSize.x * 2;
    // The existing interiors are separate scenes. An unlit recess marks the
    // portal; residents hand off at this doorway, never traverse a solid wall.
    const recess = MeshBuilder.CreatePlane(
      `resident-${id}-doorway-recess`,
      { width, height: mesh.getBoundingInfo().boundingBox.extendSize.y * 2 },
      scene,
    );
    recess.parent = parent;
    recess.position.copyFrom(mesh.position);
    recess.rotation.copyFrom(mesh.rotation);
    recess.material = doorwayMaterial;
    recess.isPickable = false;
    const hinge = new TransformNode(`resident-${id}-door-hinge`, scene);
    hinge.parent = parent;
    hinge.position.copyFrom(mesh.position);
    hinge.rotation.copyFrom(mesh.rotation);
    const xAxis = new Vector3(
      Math.cos(hinge.rotation.y),
      0,
      -Math.sin(hinge.rotation.y),
    );
    hinge.position.subtractInPlace(xAxis.scale(width / 2));
    mesh.parent = hinge;
    mesh.position.set(width / 2, 0, 0);
    mesh.rotation.setAll(0);
    portal = { mesh, original, hinge, angle: 0, created: !entry.mesh };
    portals.set(id, portal);
    return portal;
  }
  let disposed = false;
  const baseYaw = new Map<string, number>();
  function sync(dt: number, reduced: boolean) {
    const open = new Set<string>(playerDoors);
    for (const state of life.states) {
      const actor = byId.get(state.id)!;
      actor.root.setEnabled(
        !["inside", "seated", "riding"].includes(state.mode),
      );
      if (!actor.root.isEnabled()) continue;
      const y = ground(state);
      const conversation = actor.root.metadata?.conversationPose;
      if (state.mode === "idle" && conversation && !reduced) {
        const turn = Math.atan2(
          Math.sin(conversation.yaw - state.yaw),
          Math.cos(conversation.yaw - state.yaw),
        );
        state.yaw += Math.max(-dt * 1.8, Math.min(dt * 1.8, turn));
      }
      actor.root.position.set(state.x, y, state.z);
      actor.root.rotation.y = state.yaw;
      actor.root.metadata = {
        ...actor.root.metadata,
        routineMotion: {
          activity:
            state.speed > 0.02
              ? "walk"
              : state.mode === "idle" && conversation?.speaking
                ? "chat"
                : "idle",
          speed: reduced ? 0 : state.speed,
          travelled: state.travelled,
        },
        residentRoutine: state.mode,
        residentDestination: state.destinationId,
      };
      if (state.destinationId && ["entering", "exiting"].includes(state.mode))
        open.add(state.destinationId);
    }
    for (const id of open) {
      const p = portalFor(id);
      if (p && !baseYaw.has(id)) baseYaw.set(id, p.hinge.rotation.y);
    }
    for (const [id, p] of portals) {
      const target = open.has(id) ? 1.25 : 0;
      p.angle = reduced
        ? target
        : p.angle + Math.max(-dt * 2.7, Math.min(dt * 2.7, target - p.angle));
      p.hinge.rotation.y = (baseYaw.get(id) ?? 0) + p.angle;
    }
  }
  sync(0, false);
  return {
    life,
    navigation: nav,
    refreshNavigation() {
      nav.invalidateGeometry();
      life.replanRoutes();
    },
    /** Player and residents share one hinge; neither can close it on the other. */
    setPlayerDoor(id: string, open: boolean) {
      if (open) playerDoors.add(id);
      else playerDoors.delete(id);
    },
    get trafficStops() {
      return life.trafficStops;
    },
    get boardingVehicles() {
      return life.states
        .filter((s) => s.ride && ["boarding", "alighting"].includes(s.mode))
        .map((s) => s.ride!.vehicleId);
    },
    setTraffic(traffic: TrafficSimulation) {
      life.setTraffic(traffic);
    },
    update(delta: number, reduced: boolean) {
      if (disposed) return;
      life.setNight(scene.metadata?.timeOfDay === "night");
      life.step(delta, reduced);
      sync(reduced ? 0 : delta, reduced);
    },
    dispose() {
      disposed = true;
      life.dispose();
      for (const actor of actors) {
        delete actor.root.metadata?.routineMotion;
        delete actor.root.metadata?.residentRoutine;
      }
    },
  };
}
