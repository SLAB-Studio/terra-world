import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import {
  createTownCharacter,
  applyTownCharacterMotion,
  type TownCharacterProfile,
} from "./characters-3d";
import {
  createBridgeTrafficClosure,
  EAST_BRIDGE_PROGRESS,
  EAST_BRIDGE_WALK_BOUNDS,
  CHAPTER_DETOUR_CROSSINGS,
} from "./bridge-closure";
import { renderedRoadHeight, sampleRoadFrame } from "./road";
import type { ImmersiveTownWorld } from "./types";
import type { TrafficSimulation } from "./traffic";
import { walkingRoadHeight, type WalkPoint } from "./walking";

export type OpeningChapterStage = "closed" | "repair" | "shuttle" | "divert";
export type OpeningChapterShot = "arrival" | "river" | "bakery" | "bridge";
export type OpeningChapterPointId = "bridge" | "maya" | "malik" | "nia";
export type OpeningChapterPoint = Readonly<{
  id: OpeningChapterPointId;
  label: string;
  position: Vector3;
  /** Safe player arrival beside the resident, not on top of their model. */
  approach: Vector3;
  radius: number;
}>;
export type OpeningChapterWorld = ReturnType<typeof createOpeningChapterWorld>;

/** Same populated scene, same fleet and south crossing. No independent loop. */
export function createOpeningChapterWorld(world: ImmersiveTownWorld) {
  const { scene } = world;
  const root = new TransformNode("opening-chapter", scene);
  const road = sampleRoadFrame(EAST_BRIDGE_PROGRESS);
  const closure = createBridgeTrafficClosure();
  closure.setClosed(false);
  const materials: StandardMaterial[] = [];
  const textures: DynamicTexture[] = [];
  const material = (name: string, color: string, glow = 0) => {
    const value = new StandardMaterial(`chapter-${name}`, scene);
    value.diffuseColor = Color3.FromHexString(color);
    value.emissiveColor = value.diffuseColor.scale(glow);
    value.specularColor = Color3.Black();
    materials.push(value);
    return value;
  };
  const amber = material("amber", "#EBC06A", 0.42);
  const ink = material("ink", "#26383A", 0.12);
  const cream = material("cream", "#F0E6CA", 0.3);
  const teal = material("teal", "#75C9BE", 0.5);
  const barriers = new TransformNode("east-bridge-closure-barriers", scene);
  barriers.parent = root;
  const box = (
    name: string,
    width: number,
    height: number,
    depth: number,
    parent: TransformNode,
    surface: StandardMaterial,
    x = 0,
    y = 0,
    z = 0,
  ) => {
    const mesh = MeshBuilder.CreateBox(name, { width, height, depth }, scene);
    mesh.parent = parent;
    mesh.position.set(x, y, z);
    mesh.material = surface;
    mesh.isPickable = false;
    return mesh;
  };
  const detourCrossings = new TransformNode("chapter-detour-crossings", scene);
  detourCrossings.parent = root;
  for (const crossing of CHAPTER_DETOUR_CROSSINGS) {
    const crossingFrame = sampleRoadFrame(crossing.progress);
    const crossingRoot = new TransformNode(crossing.id, scene);
    crossingRoot.parent = detourCrossings;
    crossingRoot.position.set(
      crossingFrame.center.x,
      renderedRoadHeight(crossingFrame.center.y) + 0.16,
      crossingFrame.center.z,
    );
    crossingRoot.rotation.y = Math.atan2(
      crossingFrame.tangent.x,
      crossingFrame.tangent.z,
    );
    for (let across = -4.6; across <= 4.6; across += 1.15)
      box(
        `${crossing.id}-${across}`,
        0.62,
        0.035,
        5.8,
        crossingRoot,
        cream,
        across,
      );
  }
  const sign = (
    name: string,
    text: string,
    position: Vector3,
    width: number,
    parent: TransformNode,
  ) => {
    const panel = MeshBuilder.CreatePlane(
      `chapter-sign-${name}`,
      { width, height: width * 0.22 },
      scene,
    );
    panel.parent = parent;
    panel.position.copyFrom(position);
    panel.billboardMode = Mesh.BILLBOARDMODE_ALL;
    panel.material = ink;
    panel.isPickable = false;
    // NullEngine tests have no canvas. Geometry/metadata stay testable there.
    if (typeof document !== "undefined") {
      const texture = new DynamicTexture(
        `chapter-sign-${name}`,
        { width: 768, height: 168 },
        scene,
        false,
      );
      texture.drawText(
        text,
        null,
        104,
        "600 48px sans-serif",
        "#F0E6CA",
        "#26383A",
        true,
      );
      const face = material(`sign-${name}`, "#FFFFFF", 1);
      face.diffuseTexture = texture;
      face.emissiveTexture = texture;
      face.disableLighting = true;
      face.backFaceCulling = false;
      panel.material = face;
      textures.push(texture);
    }
    panel.metadata = { chapterLabel: text };
    return panel;
  };
  for (const side of [-1, 1]) {
    const gate = new TransformNode(`east-bridge-gate-${side}`, scene);
    gate.parent = barriers;
    gate.position.set(
      road.center.x + road.tangent.x * side * 12.6,
      renderedRoadHeight(road.center.y) + 0.15,
      road.center.z + road.tangent.z * side * 12.6,
    );
    gate.rotation.y = Math.atan2(road.tangent.x, road.tangent.z);
    box(`chapter-gate-${side}`, 12.9, 0.55, 0.26, gate, amber, 0, 1.1);
    for (const x of [-5.6, -2.8, 0, 2.8, 5.6]) {
      box(`chapter-gate-foot-${side}-${x}`, 0.2, 1.4, 0.65, gate, ink, x, 0.65);
      box(
        `chapter-gate-stripe-${side}-${x}`,
        0.7,
        0.55,
        0.3,
        gate,
        cream,
        x + 0.8,
        1.1,
      );
    }
    sign(
      `closure-${side}`,
      "EAST BRIDGE · CLOSED",
      gate.position.add(new Vector3(0, 2.4, 0)),
      8,
      barriers,
    );
  }

  const reachable = (wanted: WalkPoint): Vector3 => {
    const nav = world.residents.navigation;
    const direct = nav.closestWalkablePoint(wanted, 2);
    if (direct)
      return new Vector3(
        direct.x,
        Math.max(0.75, walkingRoadHeight(direct) ?? 0),
        direct.z,
      );
    for (let radius = 3; radius <= 14; radius++)
      for (let index = 0; index < 24; index++) {
        const point = {
          x: wanted.x + Math.cos((index * Math.PI) / 12) * radius,
          z: wanted.z + Math.sin((index * Math.PI) / 12) * radius,
        };
        if (nav.isWalkable(point))
          return new Vector3(
            point.x,
            Math.max(0.75, walkingRoadHeight(point) ?? 0),
            point.z,
          );
      }
    throw new Error("No reachable opening chapter encounter point");
  };
  const atVenue = (id: string) => {
    const venue = world.venues.find((entry) => entry.venue.id === id);
    if (!venue) throw new Error(`Missing existing chapter venue: ${id}`);
    if (id === "cafe") {
      // The workshop sits directly across the bakery doorway's narrow gap.
      // Meet at the outer front corner, where a street-facing camera boom has
      // room; only this chapter actor moves, never the building or legacy cast.
      const lateral = new Vector3(-venue.outward.z, 0, venue.outward.x);
      for (const side of [1, -1]) {
        const corner = venue.door
          .add(venue.outward.scale(1.6))
          .add(lateral.scale(side * 6));
        const arrival = corner.add(venue.outward.scale(3.2));
        const cameraEnd = arrival.add(venue.outward.scale(4.5));
        if (world.residents.navigation.segmentIsWalkable(corner, cameraEnd))
          return reachable(corner);
      }
    }
    const routineEntrance = world.residents.life.destinations.find(
      (place) => place.id === id,
    )?.point;
    return reachable(
      routineEntrance ?? venue.door.add(venue.outward.scale(3.7)),
    );
  };
  const encounterPoints: readonly Omit<OpeningChapterPoint, "approach">[] = [
    {
      id: "bridge",
      label: "East Bridge · inspect",
      position: reachable({
        x: road.center.x - road.tangent.x * 20 + road.lateral.x * 8,
        z: road.center.z - road.tangent.z * 20 + road.lateral.z * 8,
      }),
      radius: 5.2,
    },
    {
      id: "maya",
      label: "Maya · bakery",
      position: atVenue("cafe"),
      radius: 5.2,
    },
    {
      id: "malik",
      label: "Malik · construction",
      position: atVenue("workshop"),
      radius: 5.2,
    },
    {
      id: "nia",
      label: "Nia · riverbank",
      position: reachable({ x: 3, z: 30 }),
      radius: 5.2,
    },
  ];
  const points: readonly OpeningChapterPoint[] = encounterPoints.map(
    (point) => ({
      ...point,
      approach: (() => {
        const venueId =
          point.id === "maya"
            ? "cafe"
            : point.id === "malik"
              ? "workshop"
              : null;
        const outward = world.venues.find(
          (venue) => venue.venue.id === venueId,
        )?.outward;
        if (outward) {
          // Put the player on the street-facing side. Looking toward the
          // resident then leaves the follow camera outside the shop/awning.
          const yaw = Math.atan2(outward.x, outward.z);
          for (const radius of [3.2, 2.5, 4, 2])
            for (const angle of [0, -Math.PI / 8, Math.PI / 8]) {
              const candidate = {
                x: point.position.x + Math.sin(yaw + angle) * radius,
                z: point.position.z + Math.cos(yaw + angle) * radius,
              };
              if (
                world.residents.navigation.segmentIsWalkable(
                  point.position,
                  candidate,
                )
              )
                return reachable(candidate);
            }
        }
        for (let index = 0; index < 24; index++) {
          const candidate = {
            x: point.position.x + Math.cos((index * Math.PI) / 12) * 2.5,
            z: point.position.z + Math.sin((index * Math.PI) / 12) * 2.5,
          };
          if (
            world.residents.navigation.segmentIsWalkable(
              point.position,
              candidate,
            )
          )
            return reachable(candidate);
        }
        return point.position.clone();
      })(),
    }),
  );
  const waypointLabels = new Map<OpeningChapterPointId, Mesh>();
  for (const point of points) {
    const marker = MeshBuilder.CreateCylinder(
      `chapter-point-${point.id}`,
      { diameter: 2.2, height: 0.12, tessellation: 24 },
      scene,
    );
    marker.parent = root;
    marker.position.copyFrom(point.position);
    marker.position.y += 0.07;
    marker.material = point.id === "bridge" ? amber : teal;
    marker.metadata = {
      kind: "opening-chapter-point",
      chapterPointId: point.id,
    };
    const label = sign(
      point.id,
      point.label,
      point.position.add(new Vector3(0, 3.4, 0)),
      7.5,
      root,
    );
    label.isPickable = true;
    label.metadata = {
      ...label.metadata,
      kind: "opening-chapter-point",
      chapterPointId: point.id,
    };
    waypointLabels.set(point.id, label);
  }
  const actors = points.map((point, index) => {
    const role = point.id === "bridge" ? undefined : point.id;
    const profile: TownCharacterProfile = {
      id: `chapter-${point.id === "bridge" ? "inspector" : point.id}`,
      age: "adult",
      activity: "idle",
      hair: index === 0 ? "short" : index === 1 ? "bun" : "coils",
      skin: ["#B78058", "#6F3F2A", "#825334", "#593923"][index]!,
      hairColor: "#282621",
      shirt:
        point.id === "bridge" || point.id === "malik"
          ? "#D5A34C"
          : point.id === "maya"
            ? "#D1B593"
            : "#4F7775",
      bottoms: "#344247",
      shoes: "#312F2B",
      x: point.position.x,
      z: point.position.z,
      rotation: Math.PI / 4,
      phase: index,
      ...(role ? { storyRole: role } : {}),
    };
    const actor = createTownCharacter(scene, root, null, profile);
    actor.root.metadata = {
      ...actor.root.metadata,
      chapterPointId: point.id,
      chapterSceneInstance: true,
    };
    for (const mesh of actor.root.getChildMeshes()) {
      mesh.metadata = {
        ...mesh.metadata,
        chapterPointId: point.id,
        kind: "opening-chapter-point",
      };
      mesh.isPickable = true;
    }
    return actor;
  });
  // A small work area remains on the safe bank, outside the closed deck.
  const work = new TransformNode("chapter-repair-work", scene);
  work.parent = root;
  work.position.copyFrom(points[0]!.position);
  box("chapter-tool-crate", 1.2, 0.7, 0.8, work, ink, -2.5, 0.35, 0.5);
  box("chapter-work-board", 1.3, 0.85, 0.15, work, amber, -2.5, 1.3, 0.5);
  const service = sign(
    "service",
    "ESSENTIAL DELIVERIES · SOUTH ROUTE",
    new Vector3(0, 4, 0),
    10,
    root,
  );
  const routeSign = sign(
    "diversion",
    "SOUTH CROSSING →",
    points[0]!.position.add(new Vector3(0, 2.5, 2.4)),
    7.5,
    root,
  );

  const cinematic = new UniversalCamera(
    "opening-chapter-camera",
    new Vector3(0, 30, -60),
    scene,
  );
  cinematic.inputs.clear();
  cinematic.minZ = 0.2;
  cinematic.maxZ = 320;
  cinematic.fov = 0.94;
  let active = false;
  let stage: OpeningChapterStage = "closed";
  let observed = false;
  let disposed = false;
  let elapsed = 0;
  let shot: OpeningChapterShot | null = null;
  let shotElapsed = 0;
  let reduced = false;
  let savedCamera: Camera | null = null;
  let attached = false;
  const suppressedCaptions = new Map<
    AbstractMesh,
    { enabled: boolean; visible: boolean; pickable: boolean }
  >();
  const suppressLegacyCaptions = () => {
    for (const mesh of scene.meshes) {
      if (
        !(active && mesh.metadata?.kind === "terra-house-help") &&
        !(shot && mesh.name === "resident-conversation-bubble")
      )
        continue;
      if (!suppressedCaptions.has(mesh))
        suppressedCaptions.set(mesh, {
          enabled: mesh.isEnabled(false),
          visible: mesh.isVisible,
          pickable: mesh.isPickable,
        });
      // Caption controllers may update enabled state during scene rendering.
      // Visibility is a separate temporary presentation override, not a change
      // to the house's upgrade state or the resident's conversation preference.
      mesh.setEnabled(false);
      mesh.isVisible = false;
      mesh.isPickable = false;
    }
  };
  const restoreLegacyCaptions = (includeHouseHelp: boolean) => {
    for (const [mesh, previous] of suppressedCaptions) {
      if (!includeHouseHelp && mesh.metadata?.kind === "terra-house-help")
        continue;
      if (!mesh.isDisposed()) {
        mesh.setEnabled(previous.enabled);
        mesh.isVisible = previous.visible;
        mesh.isPickable = previous.pickable;
      }
      suppressedCaptions.delete(mesh);
    }
  };
  const oldObstacles = scene.metadata?.openingChapterWalkObstacles;
  const oldCrossings = scene.metadata?.openingChapterCrossings;
  let crossingsActive = false;
  const shotPose = (id: OpeningChapterShot) => {
    const bakery = points[1]!.position;
    switch (id) {
      case "river":
        return {
          eye: new Vector3(-19, 23, 63),
          target: new Vector3(18, 9, -22),
          drift: new Vector3(3, -1, -6),
        };
      case "bakery":
        return {
          // Approach from the open east corner; the adjacent workshop blocks
          // the old south-west sightline into this tightly spaced shop row.
          eye: bakery.add(new Vector3(16, 11, -18)),
          target: bakery.add(new Vector3(0, 3, 0)),
          drift: new Vector3(-2, -1, 2),
        };
      case "bridge":
        return {
          eye: new Vector3(road.center.x - 24, 18, road.center.z - 24),
          target: new Vector3(road.center.x, 2, road.center.z),
          drift: new Vector3(3, -2, 2),
        };
      case "arrival":
        return {
          eye: new Vector3(-56, 47, -62),
          target: new Vector3(2, 4, 10),
          drift: new Vector3(4, -2, 3),
        };
    }
  };
  const applyShot = () => {
    if (!shot) return;
    const pose = shotPose(shot);
    const amount = reduced ? 0 : Math.min(1, shotElapsed / 9);
    cinematic.position.copyFrom(pose.eye).addInPlace(pose.drift.scale(amount));
    cinematic.setTarget(pose.target);
  };
  const clearShot = () => {
    if (!shot) return;
    shot = null;
    if (scene.activeCamera === cinematic)
      scene.activeCamera = savedCamera ?? world.camera;
    if (attached && !world.camera.isDisposed()) {
      const canvas = world.engine.getRenderingCanvas();
      if (canvas) world.camera.attachControl(canvas, true);
    }
    savedCamera = null;
    attached = false;
    restoreLegacyCaptions(!active);
  };
  const refresh = () => {
    root.setEnabled(active);
    if (active) suppressLegacyCaptions();
    else restoreLegacyCaptions(true);
    const isClosed = active && !(stage === "repair" && observed);
    const changed = closure.closed !== isClosed || crossingsActive !== active;
    crossingsActive = active;
    closure.setClosed(isClosed);
    scene.metadata ??= {};
    scene.metadata.openingChapterWalkObstacles = isClosed
      ? [EAST_BRIDGE_WALK_BOUNDS]
      : (oldObstacles ?? []);
    // Keep these safe pedestrian crossings after repair, so an in-progress
    // crossing is never revoked under a resident's feet by the outcome button.
    scene.metadata.openingChapterCrossings = active
      ? CHAPTER_DETOUR_CROSSINGS
      : (oldCrossings ?? []);
    detourCrossings.setEnabled(active);
    barriers.setEnabled(isClosed);
    work.setEnabled(isClosed);
    service.setEnabled(active && stage === "shuttle" && observed);
    routeSign.setEnabled(isClosed);
    if (changed) world.residents.refreshNavigation();
  };
  refresh();
  return {
    points,
    get active() {
      return active;
    },
    get trafficStops() {
      return closure.stops;
    },
    setActive(next: boolean) {
      if (disposed || next === active) return;
      active = next;
      if (!active) clearShot();
      refresh();
    },
    setStage(next: OpeningChapterStage, outcomeObserved = false) {
      if (disposed) return;
      stage = next;
      observed = outcomeObserved;
      refresh();
    },
    setShot(id: OpeningChapterShot, reducedMotion = false) {
      if (disposed || !active) return;
      if (!shot) {
        savedCamera = scene.activeCamera;
        attached = world.camera.inputs.attachedToElement;
        world.camera.detachControl();
      }
      shot = id;
      shotElapsed = 0;
      reduced = reducedMotion;
      scene.activeCamera = cinematic;
      suppressLegacyCaptions();
      applyShot();
    },
    clearShot,
    prepareTraffic: (simulation: TrafficSimulation) =>
      closure.prepare(simulation),
    routeTraffic: (simulation: TrafficSimulation) =>
      closure.route(simulation, world.residents.boardingVehicles),
    getVehicleTransforms: (simulation: TrafficSimulation) =>
      closure.transforms(simulation),
    update(dt: number) {
      if (disposed || !active) return;
      const cameraPosition = scene.activeCamera?.globalPosition;
      if (cameraPosition)
        for (const point of points) {
          const label = waypointLabels.get(point.id)!;
          label.isVisible =
            Math.hypot(
              cameraPosition.x - point.position.x,
              cameraPosition.z - point.position.z,
            ) >= 12;
        }
      const step = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
      if (!world.animation.paused) {
        elapsed += step;
        shotElapsed += step;
        applyShot();
        for (let index = 0; index < actors.length; index++) {
          const actor = actors[index]!;
          applyTownCharacterMotion(
            actor,
            elapsed,
            world.animation.reducedMotion,
          );
          actor.root.position.y = points[index]!.position.y;
        }
      }
      if (stage === "shuttle" && observed) {
        const bus = scene.getTransformNodeByName("traffic-sunny-bus");
        if (bus)
          service.position.copyFrom(bus.position).addInPlaceFromFloats(0, 4, 0);
      }
    },
    dispose() {
      if (disposed) return;
      clearShot();
      active = false;
      refresh();
      disposed = true;
      closure.dispose();
      cinematic.dispose();
      root.dispose(false);
      textures.forEach((texture) => texture.dispose());
      materials.forEach((surface) => surface.dispose());
      if (oldObstacles === undefined)
        delete scene.metadata.openingChapterWalkObstacles;
      else scene.metadata.openingChapterWalkObstacles = oldObstacles;
      if (oldCrossings === undefined)
        delete scene.metadata.openingChapterCrossings;
      else scene.metadata.openingChapterCrossings = oldCrossings;
    },
  };
}
