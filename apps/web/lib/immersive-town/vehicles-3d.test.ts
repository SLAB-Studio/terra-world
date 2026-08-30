import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@babylonjs/loaders/glTF/2.0/glTFLoader";
import "@babylonjs/loaders/glTF/glTFFileLoader";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Ray } from "@babylonjs/core/Culling/ray";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { createVehicleFleet } from "./vehicles-3d";
import { applyBoardingDoor, findBoardingDoor } from "./vehicle-doors";
import { instantiateCityModel } from "./city-models";
import { createTrafficSimulation, getVehicleTransforms } from "./traffic";
import { sampleLane } from "./road";
import { RESIDENT_RIDE_STOPS } from "./resident-life";

const loader = vi.hoisted(() => vi.fn());
vi.mock("./resident-assets", () => ({ loadLocalSceneAsset: loader }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  loader.mockReset();
});

function setup() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.spyOn(engine, "getRenderingCanvas").mockReturnValue(
    {} as HTMLCanvasElement,
  );
  loader.mockImplementation((target: Scene, url: string) =>
    LoadAssetContainerAsync(
      new Uint8Array(
        readFileSync(new URL(`../../public${url}`, import.meta.url)),
      ),
      target,
      {
        pluginExtension: ".glb",
        pluginOptions: { gltf: { animationStartMode: 0 } },
      },
    ),
  );
  return { engine, scene };
}

describe("authentic boarding doors", () => {
  it.each(["crossover", "shuttlebus"] as const)(
    "opens %s toward resident pickup curbs in both travel directions",
    async (kind) => {
      const { scene, engine } = setup();
      try {
        const vehicle = new TransformNode("vehicle", scene);
        const model = await instantiateCityModel(scene, kind, "near", kind);
        model.root.parent = vehicle;
        model.root.rotation.y = Math.PI;
        const door = findBoardingDoor(model.root, vehicle)!;
        expect(door).not.toBeNull();
        for (const stop of RESIDENT_RIDE_STOPS) {
          const lane = sampleLane(stop.laneId, stop.progress);
          vehicle.position.set(lane.position.x, 0, lane.position.z);
          vehicle.rotation.y = lane.yawRadians;
          const curb = new Vector3(
            stop.curb.x - lane.position.x,
            0,
            stop.curb.z - lane.position.z,
          ).normalize();
          applyBoardingDoor(door, 0);
          const closed = door.node.getHierarchyBoundingVectors(true);
          const closedCenter = closed.min.add(closed.max).scaleInPlace(0.5);
          expect(
            Vector3.Dot(
              door.node.getAbsolutePosition().subtract(vehicle.position),
              curb,
            ),
          ).toBeGreaterThan(0.5);
          applyBoardingDoor(door, 1);
          const opened = door.node.getHierarchyBoundingVectors(true);
          const openCenter = opened.min.add(opened.max).scaleInPlace(0.5);
          expect(
            Vector3.Dot(openCenter.subtract(closedCenter), curb),
          ).toBeGreaterThan(0.2);
        }
      } finally {
        scene.dispose();
        engine.dispose();
      }
    },
  );
  it.each(["berry-car", "sunny-bus"])(
    "hinges %s at a fixed curbside pivot and keeps moving vehicles closed",
    async (id) => {
      const { scene, engine } = setup();
      const fleet = createVehicleFleet(scene, [id]);
      try {
        const root = scene.getTransformNodeByName(`traffic-${id}`)!;
        await vi.waitFor(() =>
          expect(root.metadata?.boardingDoorSupported).toBe(true),
        );
        const original = getVehicleTransforms(createTrafficSimulation()).find(
          (transform) => transform.id === id,
        )!;
        const stopped = {
          ...original,
          position: { x: 0, y: 0, z: 0 },
          yawRadians: 0,
          speedMetersPerSecond: 0,
        };
        fleet.sync([stopped], 0);
        const door = root
          .getDescendants()
          .find((node) =>
            /:BoardingDoorLeft$/.test(node.name),
          ) as TransformNode;
        const closedRotation = door.rotationQuaternion!.clone();
        door.computeWorldMatrix(true);
        const pivot = door.getAbsolutePosition().clone();
        expect(pivot.x).toBeLessThan(-0.5);
        const closedBounds = door.getHierarchyBoundingVectors(true);
        const body = root
          .getDescendants()
          .find((node) => /:body$/.test(node.name)) as TransformNode;
        const bodyMatrix = body.computeWorldMatrix(true).clone();
        fleet.setBoardingDoors([id]);
        fleet.sync([stopped], 0.1);
        expect(root.metadata.boardingDoorOpen).toBeGreaterThan(0);
        expect(root.metadata.boardingDoorOpen).toBeLessThan(1);
        for (let index = 2; index <= 8; index++)
          fleet.sync([stopped], index / 10);
        expect(root.metadata.boardingDoorOpen).toBe(1);
        const openBounds = door.getHierarchyBoundingVectors(true);
        expect(openBounds.min.x).toBeLessThan(closedBounds.min.x - 0.35);
        expect(
          door.getAbsolutePosition().equalsWithEpsilon(pivot, 0.00001),
        ).toBe(true);
        expect(body.computeWorldMatrix(true).equals(bodyMatrix)).toBe(true);
        fleet.setBoardingDoors([]);
        fleet.sync([stopped], 0.9);
        expect(root.metadata.boardingDoorOpen).toBeGreaterThan(0);
        expect(root.metadata.boardingDoorOpen).toBeLessThan(1);
        for (let index = 10; index <= 16; index++)
          fleet.sync([stopped], index / 10);
        expect(root.metadata.boardingDoorOpen).toBe(0);
        expect(
          door.rotationQuaternion!.equalsWithEpsilon(closedRotation, 0.00001),
        ).toBe(true);
        fleet.setBoardingDoors([id]);
        fleet.sync([{ ...stopped, speedMetersPerSecond: 5 }], 1.7);
        expect(root.metadata.boardingDoorOpen).toBe(0);
      } finally {
        fleet.dispose();
        scene.dispose();
        engine.dispose();
      }
    },
  );

  it.each(["near", "far"] as const)(
    "ships a genuine bus doorway at %s detail, with no closed coachwork behind it",
    async (detail) => {
      const { scene, engine } = setup();
      try {
        const model = await instantiateCityModel(
          scene,
          "shuttlebus",
          detail,
          detail,
        );
        const vehicle = new TransformNode("vehicle", scene);
        model.root.parent = vehicle;
        model.root.rotation.y = Math.PI;
        const door = findBoardingDoor(model.root, vehicle);
        expect(door).not.toBeNull();
        applyBoardingDoor(door, 1);
        // Fire through the middle of the passenger aperture. Any body hit must
        // be the far interior, never the near-side closed body cube.
        const ray = new Ray(new Vector3(-2, 1.3, 0.6), new Vector3(1, 0, 0), 4);
        const hits = model.meshes
          .filter((mesh) => !mesh.isDescendantOf(door!.node))
          .map((mesh) => {
            mesh.computeWorldMatrix(true);
            return ray.intersectsMesh(mesh, false);
          })
          .filter((hit) => hit.hit)
          .sort((a, b) => a.distance - b.distance);
        expect(hits.length).toBeGreaterThan(0);
        expect(hits[0]!.pickedPoint!.x).toBeGreaterThan(-0.1);
      } finally {
        scene.dispose();
        engine.dispose();
      }
    },
  );
});
