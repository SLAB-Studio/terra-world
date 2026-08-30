import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { applyTownCharacterMotion, createTownCharacter } from "./characters-3d";
import {
  hasRealisticResident,
  residentJointPosition,
  updateRealisticResident,
} from "./realistic-residents";
import type { IndoorPose } from "./interior-resident-poses";
import type { InteriorLifePlan } from "./interior-life-plan";
import { createInteriorDressing } from "./interior-dressing";
import { interiorRoomAt } from "./interior-navigation";
import { createIndoorRoutines } from "./indoor-routines";
import { interiorRoutinePlan } from "./interior-routine-plans";
import type { WalkBounds, WalkPoint } from "./walking";

export type InteriorLife = ReturnType<typeof createInteriorLife>;

/** One visited-room cast; local routines and shared human animation, never AI per frame. */
export function createInteriorLife(
  scene: Scene,
  plan: InteriorLifePlan,
  isBlocked: () => boolean,
  shadows: ShadowGenerator | null = null,
  variant = 0,
) {
  const root = new TransformNode("interior-occupants", scene);
  const dressing = createInteriorDressing(scene, plan.use, variant);
  const floorY = plan.use === "home" ? 0.42 : 0.04;
  const paper = new StandardMaterial("held-book-and-receipt", scene);
  paper.diffuseColor = Color3.FromHexString("#D8D2BE");
  paper.specularColor = Color3.Black();
  const utensil = new StandardMaterial("held-kitchen-utensil", scene);
  utensil.diffuseColor = Color3.FromHexString("#957751");
  const people = plan.people.map((person, i) => {
    const rig = createTownCharacter(scene, root, shadows, {
      id: `indoor-${person.name.toLowerCase()}-${i}`,
      age: person.child ? "child" : "adult",
      activity: "idle",
      hair: person.woman ? "ponytail" : "short",
      skin: i % 2 ? "#9B6446" : "#704A36",
      hairColor: "#33251F",
      shirt: i % 2 ? "#718BA0" : "#9B7965",
      bottoms: "#384C58",
      shoes: "#302D2A",
      x: person.x,
      z: person.z,
      rotation: person.yaw,
      phase: i * 1.73,
    });
    const height = person.child
      ? plan.use === "home"
        ? 1.72
        : 1.5
      : plan.use === "home"
        ? 2.42
        : 2.1;
    const indoorPose: IndoorPose = {
      activity: person.activity,
      floorY,
      height,
      ...(person.seat !== undefined ? { seat: person.seat } : {}),
      ...(person.task ? { task: person.task } : {}),
    };
    rig.root.position.y = floorY;
    rig.root.metadata = {
      ...rig.root.metadata,
      indoorPose,
      indoorRole: person.role,
    };
    // A calm fallback is held in place while locally hosted human models load.
    if (person.seat !== undefined) {
      rig.leftHip.rotation.x = rig.rightHip.rotation.x = -Math.PI / 2;
      rig.leftKnee.rotation.x = rig.rightKnee.rotation.x = Math.PI / 2;
      rig.root.position.y =
        person.seat - rig.legDimensions.hipY * rig.root.scaling.y;
    }
    const prop =
      person.prop === "book"
        ? MeshBuilder.CreateBox(
            "resident-open-book",
            { width: 0.48, height: 0.025, depth: 0.31 },
            scene,
          )
        : person.prop === "spoon"
          ? MeshBuilder.CreateCylinder(
              "resident-stirring-spoon",
              {
                height: 0.4,
                diameterTop: 0.025,
                diameterBottom: 0.07,
                tessellation: 8,
              },
              scene,
            )
          : person.prop === "screwdriver" ||
              person.prop === "fork" ||
              person.prop === "sample"
            ? MeshBuilder.CreateCylinder(
                `resident-${person.prop}`,
                {
                  height: person.prop === "screwdriver" ? 0.3 : 0.2,
                  diameterTop: person.prop === "screwdriver" ? 0.075 : 0.035,
                  diameterBottom: person.prop === "sample" ? 0.08 : 0.02,
                  tessellation: 8,
                },
                scene,
              )
            : person.prop === "card"
              ? MeshBuilder.CreateBox(
                  "resident-payment-card-or-slip",
                  { width: 0.17, height: 0.012, depth: 0.1 },
                  scene,
                )
              : null;
    if (prop) {
      prop.parent = root;
      prop.material =
        person.prop === "book" || person.prop === "card" ? paper : utensil;
      prop.isPickable = false;
      prop.setEnabled(false);
      prop.rotation.y = person.yaw;
      if (person.prop === "book") prop.rotation.x = 0.28;
      if (person.prop === "fork") {
        for (let tooth = 0; tooth < 3; tooth++) {
          const tine = MeshBuilder.CreateBox(
            "fork-tine",
            { width: 0.012, height: 0.055, depth: 0.012 },
            scene,
          );
          tine.parent = prop;
          tine.position.set((tooth - 1) * 0.025, -0.12, 0);
          tine.material = utensil;
          tine.isPickable = false;
        }
      }
    }
    return { person, rig, prop };
  });
  const initialObstacles = [
    ...dressing.obstacles,
    ...plan.people
      .filter((person) => person.seat === undefined)
      .map((person) => ({
        minX: person.x - 0.28,
        maxX: person.x + 0.28,
        minZ: person.z - 0.28,
        maxZ: person.z + 0.28,
      })),
  ];
  let routines: ReturnType<typeof createIndoorRoutines> | null = null;
  let elapsed = 0,
    powered = true;
  const motion =
    typeof window !== "undefined"
      ? window.matchMedia?.("(prefers-reduced-motion: reduce)")
      : null;
  const update = (
    seconds: number,
    reducedMotion = motion?.matches ?? false,
  ) => {
    if (
      isBlocked() ||
      scene.isDisposed ||
      (typeof document !== "undefined" && document.hidden)
    )
      return;
    if (!reducedMotion)
      elapsed += Number.isFinite(seconds)
        ? Math.max(0, Math.min(0.05, seconds))
        : 0;
    dressing.update(elapsed, reducedMotion);
    routines?.update(seconds, false, reducedMotion);
    for (const [i, { rig, person, prop }] of people.entries()) {
      const state = routines?.residents[i];
      if (state) {
        rig.root.position.x = state.x;
        rig.root.position.z = state.z;
        rig.root.rotation.y = state.yaw;
        rig.root.metadata.routineMotion = state;
        Object.assign(rig.root.metadata.indoorPose, {
          taskWeight: state.taskWeight,
          seatWeight: state.seatWeight,
        });
        applyTownCharacterMotion(rig, elapsed, reducedMotion);
        if (!hasRealisticResident(rig)) {
          const weight = state.seatWeight;
          for (const hip of [rig.leftHip, rig.rightHip])
            hip.rotation.x += (-Math.PI / 2 - hip.rotation.x) * weight;
          for (const knee of [rig.leftKnee, rig.rightKnee])
            knee.rotation.x += (Math.PI / 2 - knee.rotation.x) * weight;
          rig.root.position.y =
            floorY +
            ((person.seat ?? floorY) -
              rig.legDimensions.hipY * rig.root.scaling.y -
              floorY) *
              weight;
        }
      } else updateRealisticResident(rig, elapsed, reducedMotion, 0, 0);
      if (prop) {
        const right = residentJointPosition(rig, "Bip01 R Hand");
        const left = residentJointPosition(rig, "Bip01 L Hand");
        const taskWeight = state?.taskWeight ?? 1;
        prop.setEnabled(!!right && !!left && taskWeight > 0.05);
        prop.visibility = taskWeight;
        if (right && left && taskWeight > 0.05) {
          prop.rotation.y = rig.root.rotation.y;
          prop.position.copyFrom(
            person.prop === "book" ? Vector3.Center(left, right) : right,
          );
          if (person.prop === "spoon") prop.position.y -= 0.17;
          if (person.prop === "screwdriver") prop.position.y -= 0.1;
          if (person.prop === "fork") prop.position.y -= 0.05;
        }
      }
    }
  };
  const observer = scene.onBeforeRenderObservable.add(() =>
    update(scene.getEngine().getDeltaTime() / 1000),
  );
  scene.onDisposeObservable.addOnce(() => {
    if (observer) scene.onBeforeRenderObservable.remove(observer);
  });
  root.metadata = {
    count: people.length,
    activities: plan.people.map((person) => person.role),
    localScriptedScene: true,
  };
  return {
    root,
    people,
    dressing,
    get obstacles() {
      return routines
        ? [...dressing.obstacles, ...routines.obstacles]
        : initialObstacles;
    },
    get routines() {
      return routines;
    },
    configureNavigation(
      obstacles: readonly WalkBounds[],
      bounds: WalkBounds,
      player: () => WalkPoint | null,
    ) {
      routines = createIndoorRoutines({
        obstacles: [...obstacles, ...dressing.obstacles],
        bounds,
        residents: interiorRoutinePlan(plan),
        player,
      });
    },
    update,
    setPowered(value: boolean) {
      powered = value;
      dressing.setPowered(value);
    },
    nearbyAt(point: WalkPoint) {
      const near = people
        .filter(
          ({ rig }) =>
            plan.use !== "home" ||
            interiorRoomAt(rig.root.position) === interiorRoomAt(point),
        )
        .map(({ person, rig }) => ({
          person,
          rig,
          distance: Math.hypot(
            point.x - rig.root.position.x,
            point.z - rig.root.position.z,
          ),
        }))
        .sort((a, b) => a.distance - b.distance)[0];
      if (!near || near.distance > 4.8) return null;
      const index = Math.floor(elapsed / 7) % near.person.lines.length;
      const routine = routines?.residents.find(
        (state) => state.id === near.rig.profile.id,
      );
      const away = routine && routine.phase !== "task";
      return {
        name: near.person.name,
        role: away ? routine.label : near.person.role,
        text: away
          ? ""
          : !powered && near.person.activity === "watch"
            ? "The TV has no power. Could we get it working?"
            : near.person.lines[index]!,
      };
    },
    get loadedPeople() {
      return people.filter(({ rig }) => hasRealisticResident(rig)).length;
    },
  };
}
