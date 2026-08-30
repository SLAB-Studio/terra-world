import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@babylonjs/loaders/glTF/2.0/glTFLoader";
import "@babylonjs/loaders/glTF/glTFFileLoader";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Ray } from "@babylonjs/core/Culling/ray";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
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

function wheelVertices(wheel: TransformNode): Vector3[] {
  const meshes = wheel instanceof Mesh ? [wheel] : wheel.getChildMeshes();
  return meshes.flatMap((mesh) => {
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind) ?? [];
    const world = mesh.computeWorldMatrix(true);
    const points: Vector3[] = [];
    for (let index = 0; index < positions.length; index += 3)
      points.push(
        Vector3.TransformCoordinates(
          Vector3.FromArray(positions, index),
          world,
        ),
      );
    return points;
  });
}

describe("stable rolling wheels", () => {
  it.each(["near", "far"] as const)(
    "exports straight, narrow car tyres at %s detail, not baked steering poses",
    async (detail) => {
      const { scene, engine } = setup();
      try {
        const model = await instantiateCityModel(
          scene,
          "crossover",
          detail,
          detail,
        );
        const wheels = model.root
          .getDescendants()
          .filter((node) =>
            /:Wheel(Front|Rear)[LR]$/.test(node.name),
          ) as TransformNode[];
        expect(wheels).toHaveLength(4);
        for (const wheel of wheels) {
          const points = wheelVertices(wheel);
          const width =
            Math.max(...points.map((p) => p.x)) -
            Math.min(...points.map((p) => p.x));
          // A turned tyre is twice as wide and cones when spun around X.
          expect(width, wheel.name).toBeLessThan(0.25);
        }
      } finally {
        scene.dispose();
        engine.dispose();
      }
    },
  );

  it.each([
    ["berry-car", "near", 0],
    ["berry-car", "far", Math.PI],
    ["sunny-bus", "near", Math.PI],
    ["sunny-bus", "far", 0],
    ["offline-car", "fallback", 0],
  ] as const)(
    "%s at %s detail (heading %s) rolls on fixed axles and stops with the vehicle",
    async (id, detail, yaw) => {
      const { scene, engine } = setup();
      if (id === "offline-car") loader.mockRejectedValue(new Error("offline"));
      const fleet = createVehicleFleet(scene, [id]);
      try {
        const root = scene.getTransformNodeByName(`traffic-${id}`)!;
        if (id !== "offline-car")
          await vi.waitFor(() => expect(root.metadata?.cityModel).toBeTruthy());
        const transform = {
          ...getVehicleTransforms(createTrafficSimulation())[0]!,
          id,
          position: { x: 0, y: 0, z: 0 },
          yawRadians: yaw,
          speedMetersPerSecond: 0,
        };
        if (detail === "near")
          new FreeCamera("near-car", new Vector3(0, 3, 0), scene);
        fleet.sync([transform], 0);
        if (detail === "near")
          await vi.waitFor(() =>
            expect(root.metadata?.modelDetail).toBe("near"),
          );
        const wheels = root
          .getDescendants()
          .filter(
            (node) =>
              /:Wheel(Front|Rear)[LR]$/.test(node.name) ||
              node.name.startsWith(`${id}-wheel-`),
          ) as TransformNode[];
        expect(wheels).toHaveLength(4);
        const initial = wheels.map((wheel) => {
          const points = wheelVertices(wheel);
          const hub = wheel.getAbsolutePosition().clone();
          const belowHub = hub.add(new Vector3(0, -0.3, 0));
          return {
            hub,
            minY: Math.min(...points.map((p) => p.y)),
            contact: Vector3.TransformCoordinates(
              belowHub,
              wheel.getWorldMatrix().clone().invert(),
            ),
          };
        });
        // With a fixed body, the tread at the bottom must move BACKWARD as
        // the vehicle travels forward (+Z). This catches mirrored GLB axes.
        fleet.sync([{ ...transform, speedMetersPerSecond: 1 }], 0.01);
        wheels.forEach((wheel, index) => {
          const contact = Vector3.TransformCoordinates(
            initial[index]!.contact,
            wheel.computeWorldMatrix(true),
          );
          const forward = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
          expect(
            Vector3.Dot(contact.subtract(initial[index]!.hub), forward),
            wheel.name,
          ).toBeLessThan(-0.001);
        });
        for (let frame = 2; frame < 42; frame++) {
          fleet.sync([{ ...transform, speedMetersPerSecond: 1 }], frame * 0.1);
          wheels.forEach((wheel, index) => {
            const points = wheelVertices(wheel);
            expect(
              Vector3.Distance(
                wheel.getAbsolutePosition(),
                initial[index]!.hub,
              ),
              wheel.name,
            ).toBeLessThan(0.00001);
            expect(
              Math.abs(
                Math.min(...points.map((p) => p.y)) - initial[index]!.minY,
              ),
              wheel.name,
              // Allow the existing low-poly silhouette (under 3.5 cm), but no
              // tilted wheel orbit, hub movement or asymmetric far-LOD collapse.
            ).toBeLessThan(0.035);
          });
        }
        const stopped = wheels.map((wheel) =>
          wheel.computeWorldMatrix(true).clone(),
        );
        fleet.sync([transform], 5);
        wheels.forEach((wheel, index) =>
          expect(wheel.computeWorldMatrix(true).equals(stopped[index]!)).toBe(
            true,
          ),
        );
      } finally {
        fleet.dispose();
        scene.dispose();
        engine.dispose();
      }
    },
  );

  it.each(["berry-car", "sunny-bus"])(
    "preserves %s wheel phase immediately through near/far swaps",
    async (id) => {
      const { scene, engine } = setup();
      const fleet = createVehicleFleet(scene, [id]);
      try {
        const root = scene.getTransformNodeByName(`traffic-${id}`)!;
        await vi.waitFor(() => expect(root.metadata?.modelDetail).toBe("far"));
        const transform = {
          ...getVehicleTransforms(createTrafficSimulation())[0]!,
          id,
          position: { x: 0, y: 0, z: 0 },
          yawRadians: 0,
          speedMetersPerSecond: 5,
        };
        fleet.sync([transform], 0);
        fleet.sync([transform], 0.1);
        const wheels = () =>
          root
            .getDescendants()
            .filter((node) =>
              /:Wheel(Front|Rear)[LR]$/.test(node.name),
            ) as TransformNode[];
        const phase = wheels()[0]!.rotationQuaternion!.clone();
        const camera = new FreeCamera(
          "detail-check",
          new Vector3(0, 3, 0),
          scene,
        );
        fleet.sync([{ ...transform, speedMetersPerSecond: 0 }], 0.2);
        await vi.waitFor(() => expect(root.metadata?.modelDetail).toBe("near"));
        expect(
          wheels().every((wheel) =>
            wheel.rotationQuaternion!.equalsWithEpsilon(phase),
          ),
        ).toBe(true);
        camera.position.set(100, 3, 100);
        camera.getViewMatrix(true);
        fleet.sync([{ ...transform, speedMetersPerSecond: 0 }], 0.3);
        await vi.waitFor(() => expect(root.metadata?.modelDetail).toBe("far"));
        expect(
          wheels().every((wheel) =>
            wheel.rotationQuaternion!.equalsWithEpsilon(phase),
          ),
        ).toBe(true);
      } finally {
        fleet.dispose();
        scene.dispose();
        engine.dispose();
      }
    },
  );
});

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
