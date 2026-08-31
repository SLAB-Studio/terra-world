import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@babylonjs/loaders/glTF/2.0/glTFLoader";
import "@babylonjs/loaders/glTF/glTFFileLoader";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import {
  createTownCharacter,
  applyTownCharacterMotion,
  RIVERGATE_CHARACTER_PROFILES,
} from "./characters-3d";
import {
  hasRealisticResident,
  residentJointPosition,
  updateRealisticResident,
} from "./realistic-residents";
import {
  residentAsset,
  residentModelFor,
  RESIDENT_MODELS,
  type ResidentDetail,
  type ResidentModelId,
} from "./resident-models";
import { PEDESTRIAN_ROUTES, samplePedestrianRoute } from "./pedestrian-motion";
import { createInteriorLife } from "./interior-life";
import { homeLifePlan, venueLifePlan } from "./interior-life-plan";
import { TOWN_VENUES } from "./venue-catalog";

const loader = vi.hoisted(() => vi.fn());
vi.mock("./resident-assets", () => ({ loadResidentAsset: loader }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  loader.mockReset();
});

function testWorld(profileId = "south-walker-kai") {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const parent = new TransformNode("population", scene);
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.spyOn(engine, "getRenderingCanvas").mockReturnValue(
    {} as HTMLCanvasElement,
  );
  const profile = RIVERGATE_CHARACTER_PROFILES.find(
    ({ id }) => id === profileId,
  )!;
  return { engine, scene, parent, profile };
}

function localAssets(containers: AssetContainer[]) {
  let serial: Promise<unknown> = Promise.resolve();
  loader.mockImplementation(
    (scene: Scene, id: ResidentModelId, detail: ResidentDetail) => {
      const request = serial.then(async () => {
        const bytes = readFileSync(
          new URL(
            `../../public${residentAsset(id, detail).url}`,
            import.meta.url,
          ),
        );
        const container = await LoadAssetContainerAsync(
          new Uint8Array(bytes),
          scene,
          {
            pluginExtension: ".glb",
            pluginOptions: {
              gltf: { skipMaterials: true, animationStartMode: 0 },
            },
          },
        );
        containers.push(container);
        return container;
      });
      serial = request.catch(() => {});
      return request;
    },
  );
}

function currentPose(root: TransformNode) {
  return new Map(
    root
      .getChildTransformNodes()
      .filter((node) => /:Bip\d+/.test(node.name))
      .map((node) => [
        node.name.slice(node.name.lastIndexOf(":") + 1),
        {
          rotation: node.rotationQuaternion?.clone() ?? Quaternion.Identity(),
          position: node.position.clone(),
        },
      ]),
  );
}

function rotationDifference(a: Quaternion, b: Quaternion) {
  return (
    2 *
    Math.acos(
      Math.min(1, Math.abs(Quaternion.Dot(a, b)) / (a.length() * b.length())),
    )
  );
}

describe("realistic resident lifecycle", () => {
  it("uses the authored run on the actual player and returns smoothly to idle", async () => {
    const { engine, scene, parent, profile } = testWorld();
    const containers: AssetContainer[] = [];
    localAssets(containers);
    const data = JSON.parse(
      readFileSync(
        new URL(
          "../../public/models/residents/player-run.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => data }),
    );
    try {
      const rig = createTownCharacter(scene, parent, null, {
        ...profile,
        id: "player-rivergate",
        x: 0,
        z: 0,
        age: "adult",
        hair: "short",
        activity: "idle",
      });
      new FreeCamera("player-observer", new Vector3(0, 2, 4), scene);
      scene.activeCamera!.getViewMatrix(true);
      await vi.waitFor(() => expect(hasRealisticResident(rig)).toBe(true));
      updateRealisticResident(rig, 0, false, 0, 0);
      await vi.waitFor(() =>
        expect(rig.root.metadata.modelDetail).toBe("near"),
      );
      let travelled = 0;
      let previous = currentPose(rig.root);
      for (let frame = 1; frame <= 200; frame++) {
        const speed = frame < 25 ? 1.8 : frame < 125 ? 3.6 : 0;
        travelled += speed * 0.04;
        updateRealisticResident(rig, frame * 0.04, false, speed, travelled);
        const current = currentPose(rig.root);
        for (const [name, pose] of current) {
          expect(
            rotationDifference(previous.get(name)!.rotation, pose.rotation),
            `${name} at ${frame}`,
          ).toBeLessThan(0.8);
        }
        previous = current;
      }
      expect(
        scene.animationGroups.filter((g) => g.name === "player-run"),
      ).toHaveLength(1);
      const idle = scene.animationGroups.find((g) =>
        g.name.endsWith("near:idle"),
      )!;
      expect(idle).toBeDefined();
      rig.root.dispose();
      expect(scene.animationGroups.some((g) => g.name === "player-run")).toBe(
        false,
      );
    } finally {
      scene.dispose();
      containers.forEach((c) => c.dispose());
      engine.dispose();
    }
  });
  it.each(RESIDENT_MODELS)(
    "smoothly stands, walks and sits again with the actual %s indoor skeleton",
    async (model) => {
      const profile = RIVERGATE_CHARACTER_PROFILES.find(
        (p) => residentModelFor(p) === model,
      )!;
      const { engine, scene, parent } = testWorld(profile.id);
      const containers: AssetContainer[] = [];
      localAssets(containers);
      try {
        const rig = createTownCharacter(scene, parent, null, {
          ...profile,
          activity: "idle",
        });
        rig.root.metadata.indoorPose = {
          activity: "read",
          floorY: 0.04,
          height: profile.age === "child" ? 1.5 : 2.1,
          seat: 0.84,
          seatWeight: 1,
          taskWeight: 1,
        };
        rig.root.position.set(3, 0.04, 3);
        rig.root.rotation.y = 0;
        new FreeCamera("indoor-walk-observer", new Vector3(3, 2, 7), scene);
        scene.activeCamera!.getViewMatrix(true);
        await vi.waitFor(() => expect(hasRealisticResident(rig)).toBe(true));
        updateRealisticResident(rig, 0, false, 0, 0);
        await vi.waitFor(() =>
          expect(rig.root.metadata.modelDetail).toBe("near"),
        );
        updateRealisticResident(rig, 0.04, false, 0, 0);
        updateRealisticResident(rig, 0.08, false, 0, 0);
        let previous = currentPose(rig.root),
          previousY = rig.root.position.y;
        let travelled = 0,
          walkingPose: Quaternion | undefined,
          walkRange = 0;
        for (let frame = 3; frame <= 220; frame++) {
          const seconds = frame * 0.04;
          const progress =
            seconds < 1
              ? 1
              : seconds < 2
                ? 2 - seconds
                : seconds < 6
                  ? 0
                  : seconds < 7
                    ? seconds - 6
                    : 1;
          const weight = progress * progress * (3 - 2 * progress);
          const speed = seconds >= 2.1 && seconds < 5.7 ? 0.8 : 0;
          travelled += speed * 0.04;
          Object.assign(rig.root.metadata.indoorPose, {
            seatWeight: weight,
            taskWeight: weight,
          });
          rig.root.metadata.routineMotion = {
            activity: speed ? "walk" : "idle",
            speed,
            travelled,
          };
          updateRealisticResident(rig, seconds, false, 0, 0);
          const current = currentPose(rig.root);
          for (const [name, value] of current)
            expect(
              rotationDifference(previous.get(name)!.rotation, value.rotation),
              `${model}/${name}/${seconds} blend`,
            ).toBeLessThan(0.5);
          expect(
            Math.abs(rig.root.position.y - previousY),
            `${model} height continuity`,
          ).toBeLessThan(0.09);
          expect(rig.root.position.asArray().every(Number.isFinite)).toBe(true);
          if (speed) {
            expect(rig.root.position.y).toBeCloseTo(0.04, 5);
            const thigh = [...current.entries()].find(([name]) =>
              name.endsWith("L Thigh"),
            )![1].rotation;
            walkingPose ??= thigh;
            walkRange = Math.max(
              walkRange,
              rotationDifference(walkingPose, thigh),
            );
          }
          previous = current;
          previousY = rig.root.position.y;
        }
        expect(
          walkRange,
          "seated override releases the walking gait",
        ).toBeGreaterThan(0.2);
        expect(residentJointPosition(rig, "Bip01 L Thigh")!.y).toBeCloseTo(
          0.93,
          1,
        );
      } finally {
        scene.dispose();
        containers.forEach((container) => container.dispose());
        engine.dispose();
      }
    },
  );
  it.each([
    "home",
    "apartments",
    "hub",
    "bank",
    "cafe",
    "clinic",
    "science",
    "workshop",
    "studios",
  ])(
    "keeps the real %s task hands in contact with their authored equipment through a cycle",
    async (use) => {
      const plans = TOWN_VENUES.flatMap((venue) =>
        venue.floors.map((_, i) => venueLifePlan(venue, i)),
      );
      const plan =
        use === "home" ? homeLifePlan() : plans.find((p) => p.use === use)!;
      // Isolate each real asset load; the test runner's dynamic-import mock is not
      // re-entrant. Production multi-person loading uses the scene asset queue.
      for (const taskPerson of plan.people.filter((p) => p.task)) {
        const { engine, scene } = testWorld();
        const containers: AssetContainer[] = [];
        localAssets(containers);
        try {
          const life = createInteriorLife(
            scene,
            { ...plan, people: [taskPerson] },
            () => false,
          );
          new FreeCamera("task-observer", new Vector3(0, 2, 0), scene);
          scene.activeCamera!.getViewMatrix(true);
          await vi.waitFor(() => {
            life.update(0.05);
            expect(
              life.loadedPeople,
              JSON.stringify(life.people.map(({ rig }) => rig.root.metadata)),
            ).toBe(life.people.length);
          });
          life.update(0.05);
          await vi.waitFor(() => {
            life.update(0.05);
            expect(
              life.people.every(
                ({ rig }) => rig.root.metadata.modelDetail === "near",
              ),
            ).toBe(true);
          });
          for (let frame = 0; frame < 100; frame++) {
            life.update(0.05);
            for (const { person, rig, prop } of life.people) {
              for (const [side, point] of [
                ["L", person.task!.left],
                ["R", person.task!.right],
              ] as const) {
                const hand = residentJointPosition(rig, `Bip01 ${side} Hand`)!;
                expect(
                  Vector3.Distance(hand, Vector3.FromArray(point)),
                  `${use}/${person.name}/${side} reaches equipment`,
                ).toBeLessThan(0.1);
              }
              if (person.prop === "spoon") {
                const tip = prop!.position.add(new Vector3(0, -0.2, 0));
                const pot =
                  use === "home"
                    ? new Vector3(6.4, 2.45, -4.85)
                    : new Vector3(7.8, 1.79, 7.5);
                expect(Math.hypot(tip.x - pot.x, tip.z - pot.z)).toBeLessThan(
                  0.27,
                );
                expect(tip.y).toBeLessThan(pot.y);
                expect(tip.y).toBeGreaterThan(pot.y - 0.3);
              }
            }
          }
        } finally {
          scene.dispose();
          containers.forEach((c) => c.dispose());
          engine.dispose();
        }
      }
    },
  );
  it.each(RESIDENT_MODELS)(
    "seats the real %s skeleton on furniture, bends knees forward and holds a stable task pose",
    async (model) => {
      const profile = RIVERGATE_CHARACTER_PROFILES.find(
        (p) => residentModelFor(p) === model,
      )!;
      const { engine, scene, parent } = testWorld(profile.id);
      const containers: AssetContainer[] = [];
      localAssets(containers);
      try {
        const rig = createTownCharacter(scene, parent, null, {
          ...profile,
          activity: "idle",
        });
        rig.root.position.set(3, 0.04, 2);
        rig.root.rotation.y = Math.PI;
        rig.root.metadata.indoorPose = {
          activity: "watch",
          floorY: 0.04,
          height: profile.age === "child" ? 1.5 : 2.1,
          seat: 0.84,
        };
        await vi.waitFor(() => expect(hasRealisticResident(rig)).toBe(true));
        new FreeCamera("nearby", new Vector3(3, 2, 7), scene);
        scene.activeCamera!.getViewMatrix(true);
        updateRealisticResident(rig, 0, false, 0, 0);
        await vi.waitFor(() =>
          expect(rig.root.metadata.modelDetail).toBe("near"),
        );
        const joints = new Map(
          rig.root
            .getChildTransformNodes()
            .map((n) => [
              n.name
                .slice(n.name.lastIndexOf(":") + 1)
                .replace(/^Bip\d+/, "Bip01"),
              n,
            ]),
        );
        const absolute = (name: string) => {
          const node = joints.get(name)!;
          node.computeWorldMatrix(true);
          return node.getAbsolutePosition().clone();
        };
        let previousY: number | undefined;
        for (let frame = 0; frame < 60; frame++) {
          updateRealisticResident(rig, frame * 0.05, false, 0, 0);
          const hip = absolute("Bip01 L Thigh"),
            knee = absolute("Bip01 L Calf"),
            ankle = absolute("Bip01 L Foot");
          expect(hip.y, `${model} seat height`).toBeCloseTo(0.93, 1);
          expect(
            knee.z - hip.z,
            `${model} knees face the television`,
          ).toBeGreaterThan(0.2);
          expect(knee.y - ankle.y, `${model} feet below knees`).toBeGreaterThan(
            0.2,
          );
          expect(Math.abs(rig.root.position.x - 3)).toBeLessThan(0.001);
          if (previousY !== undefined)
            expect(
              Math.abs(rig.root.position.y - previousY),
              `${model} no seat-height jitter`,
            ).toBeLessThan(0.025);
          previousY = rig.root.position.y;
        }
        rig.root.metadata.indoorPose.activity = "type";
        rig.root.metadata.indoorPose.task = {
          left: [3.2, 1.48, 2.5],
          right: [2.8, 1.48, 2.5],
        };
        let previousHand: Vector3 | undefined;
        for (let frame = 0; frame < 60; frame++) {
          updateRealisticResident(rig, 4 + frame * 0.05, false, 0, 0);
          const hand = absolute("Bip01 R Hand");
          expect(hand.asArray().every(Number.isFinite)).toBe(true);
          expect(hand.z).toBeGreaterThan(2.2);
          if (previousHand)
            expect(Vector3.Distance(hand, previousHand)).toBeLessThan(0.055);
          previousHand = hand;
          expect(absolute("Bip01 L Thigh").y).toBeCloseTo(0.93, 1);
        }
        updateRealisticResident(rig, 8, true, 0, 0);
        const frozen = rig.root.position.clone();
        updateRealisticResident(rig, 40, true, 0, 0);
        expect(rig.root.position.equals(frozen)).toBe(true);
      } finally {
        scene.dispose();
        containers.forEach((c) => c.dispose());
        engine.dispose();
      }
    },
  );
  it.each(RESIDENT_MODELS)(
    "keeps actual %s poses continuous through idle, walking, stopping and conversation",
    async (model) => {
      const profile = RIVERGATE_CHARACTER_PROFILES.find(
        (profile) => residentModelFor(profile) === model,
      )!;
      const { engine, scene, parent } = testWorld(profile.id);
      const containers: AssetContainer[] = [];
      localAssets(containers);
      try {
        const rig = createTownCharacter(scene, parent, null, {
          ...profile,
          activity: "idle",
        });
        await vi.waitFor(() => expect(hasRealisticResident(rig)).toBe(true));
        rig.root.position.set(7, 0.65, 3);
        rig.root.rotation.y = 0.8;
        new FreeCamera("nearby", new Vector3(7, 2, 7), scene);
        scene.activeCamera!.getViewMatrix(true);
        updateRealisticResident(rig, 0, false, 0, 0);
        await vi.waitFor(() =>
          expect(rig.root.metadata.modelDetail).toBe("near"),
        );
        let travelled = 0;
        let previous = currentPose(rig.root);
        let walkRange = 0;
        const restingThigh = previous.get(
          [...previous.keys()].find((name) => name.endsWith("L Thigh"))!,
        )!.rotation;
        for (let frame = 0; frame < 280; frame++) {
          const seconds = frame * 0.04;
          const activity =
            (seconds >= 1 && seconds < 3.5) || seconds >= 9
              ? "walk"
              : seconds >= 4.5
                ? "chat"
                : "idle";
          const speed = activity === "walk" ? 0.95 : 0;
          travelled += speed * 0.04;
          rig.root.metadata.routineMotion = { activity, speed, travelled };
          updateRealisticResident(rig, seconds, false, 0, 0);
          const pose = currentPose(rig.root);
          for (const [name, value] of pose) {
            const before = previous.get(name)!;
            expect(
              rotationDifference(before.rotation, value.rotation),
              `${model}/${activity}/${name} adjacent pose`,
            ).toBeLessThan(0.65);
            expect(
              Vector3.Distance(before.position, value.position),
              `${model}/${name} local position`,
            ).toBeLessThan(0.04);
            if (activity === "walk" && name.endsWith("L Thigh"))
              walkRange = Math.max(
                walkRange,
                rotationDifference(restingThigh, value.rotation),
              );
          }
          expect(rig.root.position.asArray()).toEqual([7, 0.65, 3]);
          expect(rig.root.rotation.y).toBe(0.8);
          previous = pose;
        }
        expect(
          walkRange,
          "an originally idle profile really walks when its routine moves",
        ).toBeGreaterThan(0.2);
        updateRealisticResident(rig, 12, true, 0, travelled);
        const frozen = currentPose(rig.root);
        updateRealisticResident(rig, 20, true, 2, travelled + 16);
        for (const [name, pose] of currentPose(rig.root))
          expect(
            rotationDifference(frozen.get(name)!.rotation, pose.rotation),
          ).toBeLessThan(0.0001);
      } finally {
        scene.dispose();
        containers.forEach((container) => container.dispose());
        engine.dispose();
      }
    },
  );

  it("copies the exact displayed pose and in-flight blend when near/far geometry swaps", async () => {
    const { engine, scene, parent, profile } = testWorld();
    const containers: AssetContainer[] = [];
    localAssets(containers);
    try {
      const rig = createTownCharacter(scene, parent, null, profile);
      await vi.waitFor(() => expect(hasRealisticResident(rig)).toBe(true));
      updateRealisticResident(rig, 1, false, 1, 1);
      updateRealisticResident(rig, 1.4, false, 1, 1.4);
      const camera = new FreeCamera(
        "moving-camera",
        rig.root.position.add(new Vector3(0, 2, 4)),
        scene,
      );
      camera.getViewMatrix(true);
      updateRealisticResident(rig, 1.6, false, 0, 1);
      const before = currentPose(rig.root);
      await vi.waitFor(() =>
        expect(rig.root.metadata.modelDetail).toBe("near"),
      );
      for (const [name, pose] of currentPose(rig.root)) {
        expect(
          rotationDifference(before.get(name)!.rotation, pose.rotation),
          name,
        ).toBeLessThan(0.0001);
        expect(
          Vector3.Distance(before.get(name)!.position, pose.position),
          name,
        ).toBeLessThan(0.0001);
      }
      updateRealisticResident(rig, 1.64, false, 0, 1);
      for (const [name, pose] of currentPose(rig.root))
        expect(
          rotationDifference(before.get(name)!.rotation, pose.rotation),
          `${name} continuing transition`,
        ).toBeLessThan(0.12);
    } finally {
      scene.dispose();
      containers.forEach((container) => container.dispose());
      engine.dispose();
    }
  });

  it.each(["south-walker-kai", "resident-malik"])(
    "swaps complete models, preserves anatomical facing and grounding: %s",
    async (profileId) => {
      const { engine, scene, parent, profile } = testWorld(profileId);
      const containers: AssetContainer[] = [];
      loader.mockImplementation(
        async (target: Scene, id: ResidentModelId, detail: ResidentDetail) => {
          const bytes = readFileSync(
            new URL(
              `../../public${residentAsset(id, detail).url}`,
              import.meta.url,
            ),
          );
          const container = await LoadAssetContainerAsync(
            new Uint8Array(bytes),
            target,
            {
              pluginExtension: ".glb",
              pluginOptions: {
                gltf: { skipMaterials: true, animationStartMode: 0 },
              },
            },
          );
          containers.push(container);
          return container;
        },
      );
      try {
        const rig = createTownCharacter(scene, parent, null, profile);
        const oldMeshes = rig.root.getChildMeshes();
        expect(oldMeshes.length).toBeGreaterThan(10);
        expect(rig.root.metadata.modelState).toBe("loading");
        await vi.waitFor(() => expect(hasRealisticResident(rig)).toBe(true));
        expect(oldMeshes.every((mesh) => mesh.isDisposed())).toBe(true);
        expect(
          rig.root
            .getChildMeshes()
            .filter((mesh) => mesh.getTotalVertices() > 0).length,
        ).toBeLessThanOrEqual(3);
        expect(scene.animationGroups.every((group) => !group.isPlaying)).toBe(
          true,
        );
        expect(
          rig.root.getChildMeshes().every((mesh) => !mesh.isPickable),
        ).toBe(true);
        for (const time of [1, 3, 6, 12]) {
          applyTownCharacterMotion(rig, time, false);
          const place = samplePedestrianRoute(
            PEDESTRIAN_ROUTES[profile.id]!,
            time,
            profile.phase,
          );
          expect(
            Vector3.Distance(
              rig.root.position,
              new Vector3(place.x, place.y, place.z),
            ),
          ).toBeLessThan(0.0001);
          expect(rig.root.rotation.y).toBe(place.yaw);
          if (place.speed > 0.1) {
            const nodes = rig.root.getChildTransformNodes();
            const toes = ["L", "R"].map((side) => {
              const foot = nodes.find((node) =>
                node.name.endsWith(` ${side} Foot`),
              )!;
              const toe = nodes.find((node) =>
                node.name.endsWith(` ${side} Toe0`),
              )!;
              foot.computeWorldMatrix(true);
              toe.computeWorldMatrix(true);
              return toe
                .getAbsolutePosition()
                .subtract(foot.getAbsolutePosition());
            });
            const forward = toes[0]!.add(toes[1]!);
            // The ankle-to-toe vector points down as well as forward. Compare
            // its pavement-plane heading, not the foot's vertical pitch.
            forward.y = 0;
            forward.normalize();
            const direction = new Vector3(
              -Math.sin(place.yaw),
              0,
              -Math.cos(place.yaw),
            );
            expect(
              Vector3.Dot(forward, direction),
              "anatomical toes face the travel direction",
            ).toBeGreaterThan(0.7);
          }
          const vertices = rig.root
            .getChildMeshes()
            .filter((mesh) => mesh.getTotalVertices() > 0)
            .flatMap((mesh) => {
              mesh.computeWorldMatrix(true);
              mesh.skeleton?.prepare();
              const data = mesh.getPositionData(true)!;
              const heights: number[] = [];
              for (let i = 0; i < data.length; i += 3)
                heights.push(
                  Vector3.TransformCoordinates(
                    Vector3.FromArray(data, i),
                    mesh.getWorldMatrix(),
                  ).y,
                );
              return heights;
            });
          expect(Math.min(...vertices)).toBeGreaterThan(place.y - 0.12);
          expect(Math.min(...vertices)).toBeLessThan(place.y + 0.12);
          expect(Math.max(...vertices) - place.y).toBeGreaterThan(
            profile.age === "child" ? 1.2 : 1.4,
          );
          expect(Math.max(...vertices) - place.y).toBeLessThan(2.15);
        }
        applyTownCharacterMotion(rig, 12, true);
        const skeleton = scene.skeletons.find((item) =>
          item.name.startsWith(profile.id),
        )!;
        skeleton.prepare(true);
        let recomputes = 0;
        const observer = skeleton.onBeforeComputeObservable.add(() => {
          recomputes++;
        });
        for (let frame = 0; frame < 60; frame++) {
          applyTownCharacterMotion(rig, 12, true);
          skeleton.prepare(true);
        }
        expect(
          recomputes,
          "stationary/reduced-motion people reuse bone matrices",
        ).toBe(0);
        skeleton.onBeforeComputeObservable.remove(observer);
        rig.root.dispose();
        expect(
          scene.animationGroups.filter((group) =>
            group.name.startsWith(profile.id),
          ),
        ).toHaveLength(0);
        expect(hasRealisticResident(rig)).toBe(false);
      } finally {
        containers.forEach((container) => container.dispose());
        scene.dispose();
        engine.dispose();
      }
    },
  );

  it("keeps the current people playable when a model request fails", async () => {
    const { engine, scene, parent, profile } = testWorld();
    loader.mockRejectedValue(new Error("offline"));
    try {
      const rig = createTownCharacter(scene, parent, null, profile);
      await vi.waitFor(() =>
        expect(rig.root.metadata.modelState).toBe("fallback"),
      );
      expect(hasRealisticResident(rig)).toBe(false);
      expect(rig.root.getChildMeshes().length).toBeGreaterThan(10);
      expect(() => applyTownCharacterMotion(rig, 4, false)).not.toThrow();
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });

  it("does not resurrect a resident when its model finishes after disposal", async () => {
    const { engine, scene, parent, profile } = testWorld();
    let resolve!: (container: AssetContainer) => void;
    loader.mockReturnValue(
      new Promise<AssetContainer>((done) => {
        resolve = done;
      }),
    );
    const container = new AssetContainer(scene);
    const instantiate = vi.spyOn(container, "instantiateModelsToScene");
    try {
      const rig = createTownCharacter(scene, parent, null, profile);
      await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce());
      rig.root.dispose();
      resolve(container);
      await Promise.resolve();
      await Promise.resolve();
      expect(instantiate).not.toHaveBeenCalled();
      expect(hasRealisticResident(rig)).toBe(false);
    } finally {
      container.dispose();
      scene.dispose();
      engine.dispose();
    }
  });
});
