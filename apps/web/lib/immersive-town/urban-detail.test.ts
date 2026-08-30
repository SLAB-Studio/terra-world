import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it, vi } from "vitest";
import { createBuildingTraversal } from "./building-traversal";
import { createTownWalker } from "./town-walker";
import { canWalkAt } from "./walking";
import { createImmersiveTownWorld } from "./create-town-world";
import { createTownMaterials } from "./materials";
import { DOWNTOWN_BUILDINGS } from "./metropolis";
import { PEDESTRIAN_ROUTES } from "./pedestrian-motion";
import { ROAD_HALF_WIDTH_METERS, sampleRoadFrame } from "./road";
import {
  createUrbanDetail,
  URBAN_DETAIL_BUDGET,
  URBAN_DETAIL_STOREFRONTS,
  type UrbanDetailFootprint,
} from "./urban-detail";

const intersectsPoint = (
  footprint: UrbanDetailFootprint,
  point: { x: number; z: number },
  clearance = 0,
) =>
  point.x >= footprint.minimum.x - clearance &&
  point.x <= footprint.maximum.x + clearance &&
  point.z >= footprint.minimum.z - clearance &&
  point.z <= footprint.maximum.z + clearance;

describe("bounded, human-scale storefront detail", () => {
  it.each([true, false])(
    "retains movement after visiting the cafe (reduced motion: %s)",
    (reduced) => {
      const engine = new NullEngine();
      const world = createImmersiveTownWorld(engine, {
        attachCameraControls: false,
        reducedMotion: true,
        quality: "low",
      });
      const street = createTownWalker(world, null, {
        isBlocked: () => false,
        onNearbyHouse: vi.fn(),
        onEnterHouse: vi.fn(),
      });
      const traversal = createBuildingTraversal(world, street, {
        isBlocked: () => false,
        reducedMotion: () => reduced,
        upgrades: () => [],
        onRepair: vi.fn(),
        onChange: vi.fn(),
        onRoom: vi.fn(),
        onNearby: vi.fn(),
        onError: vi.fn(),
        onLift: vi.fn(),
      });
      const tick = (frames: number) => {
        for (let i = 0; i < frames; i++) traversal.update(0.05);
      };
      try {
        const cafe = street.venueDoors.find((door) => door.id === "cafe")!;
        expect(canWalkAt(cafe.approach, street.obstacles)).toBe(true);
        expect(traversal.open("cafe")).toBe(true);
        tick(50);
        expect(traversal.phase).toBe("inside");
        traversal.leave();
        tick(40);
        expect(traversal.phase).toBe("outside");
        expect(canWalkAt(street.camera.position, street.obstacles)).toBe(true);
        const start = street.camera.position.clone();
        for (let i = 0; i < 9; i++) traversal.nudge("right");
        // Cover the same alley at the player's human walking speed (1.8 m/s),
        // rather than the former 6 m/s free-camera speed.
        for (let i = 0; i < 47; i++) traversal.nudge("back");
        expect(street.camera.position.subtract(start).length()).toBeGreaterThan(
          1,
        );
        expect(canWalkAt(street.camera.position, street.obstacles)).toBe(true);
        // Back now presses against the existing workshop's north wall. Turning
        // along the alley must allow the walker to leave, not trap it at the cafe.
        const facingWall = street.camera.position.clone();
        for (let i = 0; i < 4; i++) traversal.nudge("right");
        for (let i = 0; i < 47; i++) traversal.nudge("back");
        expect(
          street.camera.position.subtract(facingWall).length(),
        ).toBeGreaterThan(2);
        expect(canWalkAt(street.camera.position, street.obstacles)).toBe(true);
      } finally {
        traversal.dispose();
        street.dispose();
        world.dispose();
        engine.dispose();
      }
    },
  );
  it("merges by storefront/material with no new texture, light, observer or pick target", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    try {
      const materials = createTownMaterials(scene);
      DOWNTOWN_BUILDINGS.forEach((building, index) => {
        const root = new TransformNode(`downtown-${building.id}`, scene);
        root.position.set(building.x, 0.75, building.z);
        root.rotation.y =
          index < 4 ? Math.PI / 2 : index < 6 ? -Math.PI / 2 : 0;
      });
      const before = {
        materials: scene.materials.length,
        textures: scene.textures.length,
        lights: scene.lights.length,
        observers: scene.onBeforeRenderObservable.observers.length,
        nodes: scene.transformNodes.length,
      };
      const detail = createUrbanDetail(scene, materials);
      expect(detail.meshes.length).toBeGreaterThan(0);
      expect(detail.meshes.length).toBeLessThanOrEqual(
        URBAN_DETAIL_BUDGET.meshes,
      );
      expect(
        detail.meshes.reduce((n, mesh) => n + mesh.getTotalVertices(), 0),
      ).toBeLessThanOrEqual(URBAN_DETAIL_BUDGET.vertices);
      expect(scene.meshes).toHaveLength(detail.meshes.length);
      expect(scene.materials).toHaveLength(before.materials);
      expect(scene.textures).toHaveLength(before.textures);
      expect(scene.lights).toHaveLength(before.lights);
      expect(scene.onBeforeRenderObservable.observers).toHaveLength(
        before.observers,
      );
      for (const mesh of detail.meshes) {
        expect(mesh.isPickable).toBe(false);
        expect(mesh.isWorldMatrixFrozen).toBe(true);
        expect(mesh.metadata?.blocksWalking).not.toBe(true);
        expect(mesh.material?.alpha).toBe(1);
        expect(mesh.material?.needAlphaBlending()).toBeFalsy();
        expect(Object.values(materials)).toContain(mesh.material);
      }
      expect(
        new Set(detail.footprints.map((part) => part.id.split("-")[0])),
      ).toEqual(new Set(URBAN_DETAIL_STOREFRONTS));
      for (const id of URBAN_DETAIL_STOREFRONTS) {
        const parts = detail.footprints.filter((part) =>
          part.id.startsWith(`${id}-`),
        );
        const rendered = detail.meshes.filter((mesh) =>
          mesh.name.startsWith(`urban-${id}-`),
        );
        for (const axis of ["x", "y", "z"] as const) {
          const actualMin = Math.min(
            ...rendered.map(
              (mesh) => mesh.getBoundingInfo().boundingBox.minimumWorld[axis],
            ),
          );
          const actualMax = Math.max(
            ...rendered.map(
              (mesh) => mesh.getBoundingInfo().boundingBox.maximumWorld[axis],
            ),
          );
          expect(actualMin).toBeCloseTo(
            Math.min(...parts.map((part) => part.minimum[axis])),
            4,
          );
          expect(actualMax).toBeCloseTo(
            Math.max(...parts.map((part) => part.maximum[axis])),
            4,
          );
        }
      }
      detail.dispose();
      detail.dispose();
      expect(scene.meshes).toHaveLength(0);
      expect(scene.transformNodes).toHaveLength(before.nodes);
      expect(scene.materials).toHaveLength(before.materials);
      expect(scene.textures).toHaveLength(before.textures);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });

  it("does not fabricate storefronts when their real building roots are missing", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    try {
      const detail = createUrbanDetail(scene, createTownMaterials(scene));
      expect(detail.meshes).toHaveLength(0);
      expect(detail.footprints).toHaveLength(0);
      detail.dispose();
      expect(scene.transformNodes).toHaveLength(0);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });

  it("preserves the populated night city, doorway aisles, motor lanes and authored pedestrian routes", () => {
    const engine = new NullEngine();
    const world = createImmersiveTownWorld(engine, {
      attachCameraControls: false,
      reducedMotion: true,
      quality: "low",
    });
    try {
      expect(world.houses).toHaveLength(28);
      expect(world.venues).toHaveLength(18);
      expect(world.timeOfDay).toBe("night");
      const footprints = world.scene.getTransformNodeByName(
        "rivergate-urban-detail",
      )!.metadata.footprints as UrbanDetailFootprint[];
      expect(footprints.length).toBeGreaterThan(12);
      const groundProps = footprints.filter((part) => part.minimum.y < 3.05);
      const roads = Array.from(
        { length: 480 },
        (_, i) => sampleRoadFrame(i / 480).center,
      );
      for (const prop of groundProps) {
        expect(
          roads.some((point) => {
            const x = Math.max(
              prop.minimum.x,
              Math.min(prop.maximum.x, point.x),
            );
            const z = Math.max(
              prop.minimum.z,
              Math.min(prop.maximum.z, point.z),
            );
            return (
              Math.hypot(x - point.x, z - point.z) <
              ROAD_HALF_WIDTH_METERS + 0.25
            );
          }),
          `${prop.id}: motor lane`,
        ).toBe(false);
        for (const route of Object.values(PEDESTRIAN_ROUTES)) {
          const samples = route.points.slice(1).flatMap((to, i) => {
            const from = route.points[i]!;
            const count = Math.ceil(
              Math.hypot(to.x - from.x, to.z - from.z) / 0.2,
            );
            return Array.from({ length: count + 1 }, (_, step) => ({
              x: from.x + ((to.x - from.x) * step) / count,
              z: from.z + ((to.z - from.z) * step) / count,
            }));
          });
          expect(
            samples.some((point) => intersectsPoint(prop, point, 1)),
            `${prop.id}: ${route.id}`,
          ).toBe(false);
        }
        // The separately authored downtown walkers use these two boulevard lanes.
        for (const x of [-14.15, -12.85]) {
          const samples = Array.from({ length: 241 }, (_, i) => ({
            x,
            z: -62 + i * 0.2,
          }));
          expect(
            samples.some((point) => intersectsPoint(prop, point, 0.4)),
            `${prop.id}: boulevard`,
          ).toBe(false);
        }
        for (const venue of world.venues) {
          const samples = Array.from({ length: 25 }, (_, i) =>
            venue.door.add(venue.outward.scale(i * 0.2)),
          );
          expect(
            samples.some((point) => intersectsPoint(prop, point, 1.2)),
            `${prop.id}: ${venue.venue.id} doorway`,
          ).toBe(false);
        }
        for (const house of world.houses) {
          house.root.computeWorldMatrix(true);
          const doorMesh = house.meshes.find((mesh) =>
            mesh.name.endsWith("-door"),
          );
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
          expect(
            Array.from({ length: 25 }, (_, i) =>
              door.add(outward.scale(i * 0.2)),
            ).some((point) => intersectsPoint(prop, point, 0.8)),
            `${prop.id}: ${house.id} doorway`,
          ).toBe(false);
        }
      }
      for (const mesh of world.scene.meshes.filter(
        (mesh) => mesh.metadata?.urbanDetail,
      )) {
        expect(mesh.isPickable).toBe(false);
        expect(world.getVenueFromMesh(mesh)).toBeNull();
        expect(world.getHouseFromMesh(mesh)).toBeNull();
      }
      world.setTimeOfDay("day");
      world.setRenderQuality("medium");
      expect(
        world.scene.getTransformNodeByName("rivergate-urban-detail"),
      ).not.toBeNull();
    } finally {
      world.dispose();
      expect(engine.scenes).toHaveLength(0);
      engine.dispose();
    }
  });
});
