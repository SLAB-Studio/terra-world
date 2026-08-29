import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

export type TownCharacterAge = "adult" | "child";
export type TownCharacterActivity = "chat" | "idle" | "play" | "walk" | "wave";
export type TownCharacterHair =
  "bun" | "coils" | "curls" | "ponytail" | "short" | "waves";

export type TownCharacterProfile = Readonly<{
  id: string;
  age: TownCharacterAge;
  activity: TownCharacterActivity;
  hair: TownCharacterHair;
  skin: string;
  hairColor: string;
  shirt: string;
  bottoms: string;
  shoes: string;
  x: number;
  z: number;
  rotation: number;
  phase: number;
  pathRadius?: number;
  glasses?: boolean;
  accent?: string;
  storyRole?: "leo" | "malik" | "maya" | "mr-sam" | "nia";
}>;

export type TownCharacterRig = Readonly<{
  root: TransformNode;
  profile: TownCharacterProfile;
  baseY: number;
  leftShoulder: TransformNode;
  rightShoulder: TransformNode;
  leftElbow: TransformNode;
  rightElbow: TransformNode;
  leftHip: TransformNode;
  rightHip: TransformNode;
  leftKnee: TransformNode;
  rightKnee: TransformNode;
  torso: TransformNode;
  head: TransformNode;
}>;

export type TownCharacterMotion = Readonly<{
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  yaw: number;
  torsoPitch: number;
  headYaw: number;
  leftArm: number;
  rightArm: number;
  leftElbow: number;
  rightElbow: number;
  leftLeg: number;
  rightLeg: number;
  leftKnee: number;
  rightKnee: number;
}>;

const MATERIAL_CACHE = new WeakMap<Scene, Map<string, StandardMaterial>>();

/**
 * A small, authored Rivergate crowd. Locations and phases are explicit so the
 * same town always opens with the same residents, poses, and social groups.
 */
export const RIVERGATE_CHARACTER_PROFILES: readonly TownCharacterProfile[] = [
  {
    id: "playground-maya",
    age: "child",
    activity: "play",
    hair: "coils",
    skin: "#6F3F2A",
    hairColor: "#24140F",
    shirt: "#F6C443",
    bottoms: "#315F87",
    shoes: "#FFF3D8",
    x: 30,
    z: 20,
    rotation: -0.55,
    phase: 0.2,
    storyRole: "maya",
  },
  {
    id: "playground-noah",
    age: "child",
    activity: "play",
    hair: "curls",
    skin: "#A9623D",
    hairColor: "#42281C",
    shirt: "#4A92C2",
    bottoms: "#2F5E4A",
    shoes: "#EED9BA",
    x: 34,
    z: 22,
    rotation: 2.35,
    phase: 1.7,
  },
  {
    id: "school-anya",
    age: "child",
    activity: "wave",
    hair: "ponytail",
    skin: "#D7A078",
    hairColor: "#352117",
    shirt: "#D86B55",
    bottoms: "#53437E",
    shoes: "#FFF8E9",
    x: 39,
    z: 18,
    rotation: 0.28,
    phase: 2.4,
  },
  {
    id: "market-amara",
    age: "adult",
    activity: "chat",
    hair: "bun",
    skin: "#70412E",
    hairColor: "#20120E",
    shirt: "#4F965B",
    bottoms: "#553C48",
    shoes: "#2F2524",
    x: 48,
    z: 14,
    rotation: -1.25,
    phase: 0.7,
    glasses: true,
  },
  {
    id: "market-ben",
    age: "adult",
    activity: "chat",
    hair: "short",
    skin: "#E1B18B",
    hairColor: "#6A3D24",
    shirt: "#E49B35",
    bottoms: "#355D75",
    shoes: "#483127",
    x: 53,
    z: 17,
    rotation: 1.92,
    phase: 2.1,
  },
  {
    id: "clinic-zoe",
    age: "adult",
    activity: "wave",
    hair: "waves",
    skin: "#B87852",
    hairColor: "#2A1914",
    shirt: "#5A9EC1",
    bottoms: "#E4E7DF",
    shoes: "#40505B",
    x: -3,
    z: 34,
    rotation: 0.22,
    phase: 1.1,
  },
  {
    id: "clinic-eli",
    age: "child",
    activity: "idle",
    hair: "curls",
    skin: "#C98D67",
    hairColor: "#5B321E",
    shirt: "#79BC62",
    bottoms: "#48708A",
    shoes: "#F3E7D0",
    x: -6,
    z: 39,
    rotation: -2.65,
    phase: 3.2,
  },
  {
    id: "south-walker-kai",
    age: "adult",
    activity: "walk",
    hair: "coils",
    skin: "#55301F",
    hairColor: "#170E0B",
    shirt: "#70AC79",
    bottoms: "#394D5B",
    shoes: "#2B2521",
    x: -48,
    z: -34,
    rotation: 0.4,
    phase: 0.1,
    pathRadius: 2.1,
  },
  {
    id: "south-walker-lina",
    age: "adult",
    activity: "walk",
    hair: "ponytail",
    skin: "#F0C6A2",
    hairColor: "#B66B35",
    shirt: "#C86874",
    bottoms: "#46566C",
    shoes: "#3A2A25",
    x: 25,
    z: -39,
    rotation: -0.3,
    phase: 2.8,
    pathRadius: 1.8,
  },
  {
    id: "river-walker-omar",
    age: "adult",
    activity: "walk",
    hair: "short",
    skin: "#9D6547",
    hairColor: "#241713",
    shirt: "#477FAB",
    bottoms: "#685343",
    shoes: "#2A2524",
    x: 0,
    z: 48,
    rotation: 0.6,
    phase: 4.2,
    pathRadius: 2.5,
  },
  {
    id: "guide-leo",
    age: "adult",
    activity: "wave",
    hair: "curls",
    skin: "#8C553B",
    hairColor: "#24150F",
    shirt: "#D86B55",
    bottoms: "#315F67",
    shoes: "#F6E6C9",
    accent: "#F6C443",
    x: -18,
    z: 14,
    rotation: -0.72,
    phase: 0.45,
    storyRole: "leo",
  },
  {
    id: "resident-malik",
    age: "child",
    activity: "walk",
    hair: "coils",
    skin: "#5B331F",
    hairColor: "#160D09",
    shirt: "#55A2B8",
    bottoms: "#D99B2B",
    shoes: "#F8E9CB",
    x: 8,
    z: 6,
    rotation: 1.2,
    phase: 1.35,
    pathRadius: 1.5,
    storyRole: "malik",
  },
  {
    id: "resident-nia",
    age: "child",
    activity: "play",
    hair: "ponytail",
    skin: "#75432C",
    hairColor: "#1D100C",
    shirt: "#79BC62",
    bottoms: "#684A82",
    shoes: "#FFF4DC",
    x: -18,
    z: 35,
    rotation: 2.2,
    phase: 2.65,
    storyRole: "nia",
  },
  {
    id: "resident-mr-sam",
    age: "adult",
    activity: "chat",
    hair: "short",
    skin: "#7A4931",
    hairColor: "#D7D1C7",
    shirt: "#A96C4C",
    bottoms: "#425D52",
    shoes: "#302821",
    accent: "#E8D7B8",
    x: 3.5,
    z: 47,
    rotation: -0.35,
    phase: 4.6,
    glasses: true,
    storyRole: "mr-sam",
  },
  {
    id: "school-teacher-sana",
    age: "adult",
    activity: "chat",
    hair: "bun",
    skin: "#8C553B",
    hairColor: "#23130F",
    shirt: "#A86FA4",
    bottoms: "#405D58",
    shoes: "#302824",
    x: 42,
    z: 31,
    rotation: 2.6,
    phase: 3.7,
  },
  {
    id: "school-parent-jules",
    age: "adult",
    activity: "chat",
    hair: "waves",
    skin: "#E7B894",
    hairColor: "#6A4A36",
    shirt: "#D5724F",
    bottoms: "#425A72",
    shoes: "#473A30",
    x: 45,
    z: 32.5,
    rotation: -0.5,
    phase: 5.1,
  },
  {
    id: "river-reader-iman",
    age: "adult",
    activity: "idle",
    hair: "coils",
    skin: "#633824",
    hairColor: "#160D0A",
    shirt: "#DCA83A",
    bottoms: "#615174",
    shoes: "#30251F",
    x: 18,
    z: 42,
    rotation: 2.9,
    phase: 1.8,
    glasses: true,
  },
  {
    id: "river-child-tomi",
    age: "child",
    activity: "wave",
    hair: "coils",
    skin: "#75432C",
    hairColor: "#1A0E0B",
    shirt: "#EF805E",
    bottoms: "#3B7183",
    shoes: "#F7E4C6",
    x: 14.5,
    z: 43,
    rotation: -1.35,
    phase: 4.7,
  },
  {
    id: "north-walker-mei",
    age: "adult",
    activity: "walk",
    hair: "ponytail",
    skin: "#D5A17E",
    hairColor: "#211714",
    shirt: "#6C91C2",
    bottoms: "#4D554D",
    shoes: "#322824",
    x: -31,
    z: 61,
    rotation: 1.1,
    phase: 3.4,
    pathRadius: 2.2,
  },
  {
    id: "north-child-ada",
    age: "child",
    activity: "play",
    hair: "bun",
    skin: "#B56F4D",
    hairColor: "#322018",
    shirt: "#F1B93D",
    bottoms: "#41735B",
    shoes: "#FFF3DD",
    x: -27,
    z: 62.5,
    rotation: -1.6,
    phase: 5.5,
  },
] as const;

export function createRivergatePopulation(
  scene: Scene,
  parent: TransformNode,
  shadows: ShadowGenerator,
): readonly TownCharacterRig[] {
  return RIVERGATE_CHARACTER_PROFILES.map((profile) =>
    createTownCharacter(scene, parent, shadows, profile),
  );
}

export function createTownCharacter(
  scene: Scene,
  parent: TransformNode,
  shadows: ShadowGenerator | null,
  profile: TownCharacterProfile,
): TownCharacterRig {
  const root = new TransformNode(`character-${profile.id}`, scene);
  root.position.set(profile.x, 0.75, profile.z);
  root.rotation.y = profile.rotation;
  root.parent = parent;
  root.metadata = {
    ...(typeof root.metadata === "object" && root.metadata !== null
      ? root.metadata
      : {}),
    kind: profile.storyRole === "leo" ? "town-companion" : "town-resident",
    storyRole: profile.storyRole ?? null,
    characterId: profile.id,
    ageGroup: profile.age,
  };

  const dimensions =
    profile.age === "child"
      ? {
          hipY: 1.14,
          upperLeg: 0.53,
          lowerLeg: 0.53,
          torso: 0.88,
          shoulderY: 1.92,
          upperArm: 0.43,
          lowerArm: 0.42,
          headY: 2.46,
          head: 0.57,
          shoulderWidth: 0.68,
          foot: 0.43,
        }
      : {
          hipY: 1.48,
          upperLeg: 0.7,
          lowerLeg: 0.69,
          torso: 1.16,
          shoulderY: 2.53,
          upperArm: 0.56,
          lowerArm: 0.55,
          headY: 3.23,
          head: 0.62,
          shoulderWidth: 0.84,
          foot: 0.5,
        };

  const skin = material(scene, profile.skin, 0.2);
  const hair = material(scene, profile.hairColor, 0.08);
  const shirt = material(scene, profile.shirt, 0.13);
  const bottoms = material(scene, profile.bottoms, 0.1);
  const shoes = material(scene, profile.shoes, 0.12);
  const eye = material(scene, "#241A17", 0.15);
  const mouth = material(scene, "#7D3E39", 0.08);
  const white = material(scene, "#FFF8EC", 0.12);

  const torso = new TransformNode(`${profile.id}-torso-rig`, scene);
  torso.parent = root;
  const chest = MeshBuilder.CreateCylinder(
    `${profile.id}-torso`,
    {
      height: dimensions.torso,
      diameterTop: dimensions.shoulderWidth * 1.12,
      diameterBottom: dimensions.shoulderWidth * 0.82,
      tessellation: 14,
    },
    scene,
  );
  chest.position.y = dimensions.hipY + dimensions.torso * 0.52;
  chest.material = shirt;
  finishCharacterMesh(chest, torso, shadows, true);

  if (profile.accent !== undefined) {
    const accent = material(scene, profile.accent, 0.14);
    const collar = MeshBuilder.CreateTorus(
      `${profile.id}-scarf-collar`,
      {
        diameter: dimensions.shoulderWidth * 0.62,
        thickness: dimensions.shoulderWidth * 0.12,
        tessellation: 14,
      },
      scene,
    );
    collar.position.y = dimensions.headY - dimensions.head * 0.68;
    collar.material = accent;
    finishCharacterMesh(collar, torso, shadows);
    const scarf = MeshBuilder.CreateBox(
      `${profile.id}-scarf-tail`,
      {
        width: dimensions.shoulderWidth * 0.16,
        height: dimensions.torso * 0.48,
        depth: dimensions.shoulderWidth * 0.07,
      },
      scene,
    );
    scarf.position.set(
      -dimensions.shoulderWidth * 0.14,
      dimensions.hipY + dimensions.torso * 0.72,
      -dimensions.shoulderWidth * 0.48,
    );
    scarf.rotation.z = -0.08;
    scarf.material = accent;
    finishCharacterMesh(scarf, torso, shadows);
  }

  const hips = MeshBuilder.CreateCylinder(
    `${profile.id}-hips`,
    {
      height: profile.age === "child" ? 0.34 : 0.42,
      diameterTop: dimensions.shoulderWidth * 0.76,
      diameterBottom: dimensions.shoulderWidth * 0.8,
      tessellation: 14,
    },
    scene,
  );
  hips.position.y = dimensions.hipY + 0.08;
  hips.material = bottoms;
  finishCharacterMesh(hips, torso, shadows);

  const neck = MeshBuilder.CreateCylinder(
    `${profile.id}-neck`,
    {
      height: dimensions.head * 0.32,
      diameter: dimensions.head * 0.35,
      tessellation: 12,
    },
    scene,
  );
  neck.position.y = dimensions.headY - dimensions.head * 0.53;
  neck.material = skin;
  finishCharacterMesh(neck, torso, shadows);

  const head = new TransformNode(`${profile.id}-head-rig`, scene);
  head.position.y = dimensions.headY;
  head.parent = root;
  const face = MeshBuilder.CreateSphere(
    `${profile.id}-head`,
    { diameter: dimensions.head, segments: 14 },
    scene,
  );
  face.scaling.y = 1.12;
  face.material = skin;
  finishCharacterMesh(face, head, shadows, true);
  createFace(
    scene,
    head,
    dimensions.head,
    skin,
    eye,
    mouth,
    white,
    shadows,
    profile,
  );
  createHair(
    scene,
    head,
    dimensions.head,
    hair,
    shadows,
    profile.hair,
    profile.id,
  );

  const leftShoulder = createArm(
    scene,
    root,
    shadows,
    profile.id,
    "left",
    -1,
    dimensions,
    shirt,
    skin,
  );
  const rightShoulder = createArm(
    scene,
    root,
    shadows,
    profile.id,
    "right",
    1,
    dimensions,
    shirt,
    skin,
  );
  const leftLeg = createLeg(
    scene,
    root,
    shadows,
    profile.id,
    "left",
    -1,
    dimensions,
    bottoms,
    shoes,
  );
  const rightLeg = createLeg(
    scene,
    root,
    shadows,
    profile.id,
    "right",
    1,
    dimensions,
    bottoms,
    shoes,
  );

  const rig: TownCharacterRig = {
    root,
    profile,
    baseY: root.position.y,
    leftShoulder: leftShoulder.shoulder,
    rightShoulder: rightShoulder.shoulder,
    leftElbow: leftShoulder.elbow,
    rightElbow: rightShoulder.elbow,
    leftHip: leftLeg.hip,
    rightHip: rightLeg.hip,
    leftKnee: leftLeg.knee,
    rightKnee: rightLeg.knee,
    torso,
    head,
  };
  applyTownCharacterMotion(rig, 0, true);
  return rig;
}

export function applyTownCharacterMotion(
  rig: TownCharacterRig,
  elapsedSeconds: number,
  reducedMotion: boolean,
) {
  const motion = sampleTownCharacterMotion(
    rig.profile.activity,
    elapsedSeconds,
    rig.profile.phase,
    reducedMotion,
    rig.profile.pathRadius ?? 0,
  );
  rig.root.position.set(
    rig.profile.x + motion.offsetX,
    rig.baseY + motion.offsetY,
    rig.profile.z + motion.offsetZ,
  );
  rig.root.rotation.y = rig.profile.rotation + motion.yaw;
  rig.torso.rotation.x = motion.torsoPitch;
  rig.head.rotation.y = motion.headYaw;
  rig.leftShoulder.rotation.x = motion.leftArm;
  rig.rightShoulder.rotation.x = motion.rightArm;
  rig.leftElbow.rotation.x = motion.leftElbow;
  rig.rightElbow.rotation.x = motion.rightElbow;
  rig.leftHip.rotation.x = motion.leftLeg;
  rig.rightHip.rotation.x = motion.rightLeg;
  rig.leftKnee.rotation.x = motion.leftKnee;
  rig.rightKnee.rotation.x = motion.rightKnee;
}

export function sampleTownCharacterMotion(
  activity: TownCharacterActivity,
  elapsedSeconds: number,
  phase: number,
  reducedMotion: boolean,
  pathRadius = 0,
): TownCharacterMotion {
  const quiet = {
    offsetX: 0,
    offsetY: 0,
    offsetZ: 0,
    yaw: 0,
    torsoPitch: 0,
    headYaw: 0,
    leftArm: 0.06,
    rightArm: -0.06,
    leftElbow: -0.08,
    rightElbow: -0.08,
    leftLeg: 0,
    rightLeg: 0,
    leftKnee: 0.04,
    rightKnee: 0.04,
  } as const;

  if (reducedMotion) {
    if (activity === "wave") {
      return {
        ...quiet,
        rightArm: -2.25,
        rightElbow: -0.72,
        headYaw: -0.12,
      };
    }
    if (activity === "chat") {
      return { ...quiet, leftArm: -0.42, leftElbow: -0.5, headYaw: 0.12 };
    }
    if (activity === "play") {
      return { ...quiet, leftArm: -0.35, rightArm: 0.35 };
    }
    return quiet;
  }

  if (activity === "walk") {
    const loop = elapsedSeconds * 0.46 + phase;
    const stride = Math.sin(elapsedSeconds * 4.4 + phase * 2);
    return {
      ...quiet,
      offsetX: Math.sin(loop) * pathRadius,
      offsetY: Math.abs(stride) * 0.045,
      offsetZ: Math.cos(loop) * pathRadius,
      yaw: loop + Math.PI / 2,
      torsoPitch: 0.055,
      headYaw: Math.sin(loop * 0.7) * 0.1,
      leftArm: stride * 0.62,
      rightArm: -stride * 0.62,
      leftElbow: -0.18 - Math.max(0, -stride) * 0.16,
      rightElbow: -0.18 - Math.max(0, stride) * 0.16,
      leftLeg: -stride * 0.58,
      rightLeg: stride * 0.58,
      leftKnee: Math.max(0, stride) * 0.48,
      rightKnee: Math.max(0, -stride) * 0.48,
    };
  }

  if (activity === "chat") {
    const gesture = Math.sin(elapsedSeconds * 1.65 + phase);
    const response = Math.sin(elapsedSeconds * 1.15 + phase + 1.4);
    return {
      ...quiet,
      offsetY: Math.max(0, response) * 0.018,
      torsoPitch: Math.sin(elapsedSeconds * 0.72 + phase) * 0.018,
      headYaw: response * 0.15,
      leftArm: -0.28 - Math.max(0, gesture) * 0.5,
      rightArm: 0.16 + Math.min(0, gesture) * 0.34,
      leftElbow: -0.35 - Math.max(0, gesture) * 0.38,
      rightElbow: -0.2,
    };
  }

  if (activity === "wave") {
    const wave = Math.sin(elapsedSeconds * 3.6 + phase);
    return {
      ...quiet,
      offsetY: Math.max(0, Math.sin(elapsedSeconds * 1.8 + phase)) * 0.025,
      torsoPitch: -0.025,
      headYaw: -0.12 + Math.sin(elapsedSeconds * 0.8 + phase) * 0.07,
      leftArm: 0.12,
      rightArm: -2.2 + wave * 0.16,
      rightElbow: -0.72 + wave * 0.24,
    };
  }

  if (activity === "play") {
    const beat = Math.sin(elapsedSeconds * 2.8 + phase);
    const skip = Math.max(0, beat);
    return {
      ...quiet,
      offsetY: skip * skip * 0.11,
      torsoPitch: beat * 0.045,
      headYaw: Math.sin(elapsedSeconds * 1.25 + phase) * 0.15,
      leftArm: -beat * 0.62 - 0.18,
      rightArm: beat * 0.62 + 0.18,
      leftElbow: -0.28,
      rightElbow: -0.28,
      leftLeg: beat * 0.22,
      rightLeg: -beat * 0.22,
      leftKnee: skip * 0.3,
      rightKnee: Math.max(0, -beat) * 0.3,
    };
  }

  const breath = Math.sin(elapsedSeconds * 1.25 + phase);
  return {
    ...quiet,
    offsetY: breath * 0.012,
    torsoPitch: breath * 0.009,
    headYaw: Math.sin(elapsedSeconds * 0.58 + phase) * 0.1,
    leftArm: 0.06 + breath * 0.025,
    rightArm: -0.06 - breath * 0.025,
  };
}

function createArm(
  scene: Scene,
  root: TransformNode,
  shadows: ShadowGenerator | null,
  id: string,
  label: "left" | "right",
  side: -1 | 1,
  dimensions: Readonly<{
    shoulderY: number;
    shoulderWidth: number;
    upperArm: number;
    lowerArm: number;
  }>,
  shirt: StandardMaterial,
  skin: StandardMaterial,
) {
  const shoulder = new TransformNode(`${id}-${label}-shoulder`, scene);
  shoulder.position.set(
    side * dimensions.shoulderWidth * 0.58,
    dimensions.shoulderY,
    0,
  );
  shoulder.rotation.z = side * 0.1;
  shoulder.parent = root;
  const sleeve = MeshBuilder.CreateCylinder(
    `${id}-${label}-sleeve`,
    {
      height: dimensions.upperArm * 0.48,
      diameterTop: dimensions.shoulderWidth * 0.3,
      diameterBottom: dimensions.shoulderWidth * 0.24,
      tessellation: 10,
    },
    scene,
  );
  sleeve.position.y = -dimensions.upperArm * 0.24;
  sleeve.material = shirt;
  finishCharacterMesh(sleeve, shoulder, shadows);

  const upper = MeshBuilder.CreateCylinder(
    `${id}-${label}-upper-arm`,
    {
      height: dimensions.upperArm * 0.58,
      diameter: dimensions.shoulderWidth * 0.21,
      tessellation: 10,
    },
    scene,
  );
  upper.position.y = -dimensions.upperArm * 0.7;
  upper.material = skin;
  finishCharacterMesh(upper, shoulder, shadows);

  const elbow = new TransformNode(`${id}-${label}-elbow`, scene);
  elbow.position.y = -dimensions.upperArm;
  elbow.parent = shoulder;
  const forearm = MeshBuilder.CreateCylinder(
    `${id}-${label}-forearm`,
    {
      height: dimensions.lowerArm,
      diameterTop: dimensions.shoulderWidth * 0.2,
      diameterBottom: dimensions.shoulderWidth * 0.16,
      tessellation: 10,
    },
    scene,
  );
  forearm.position.y = -dimensions.lowerArm * 0.5;
  forearm.material = skin;
  finishCharacterMesh(forearm, elbow, shadows);
  const hand = MeshBuilder.CreateSphere(
    `${id}-${label}-hand`,
    { diameter: dimensions.shoulderWidth * 0.21, segments: 10 },
    scene,
  );
  hand.position.y = -dimensions.lowerArm;
  hand.scaling.y = 1.18;
  hand.material = skin;
  finishCharacterMesh(hand, elbow, shadows);
  return { shoulder, elbow };
}

function createLeg(
  scene: Scene,
  root: TransformNode,
  shadows: ShadowGenerator | null,
  id: string,
  label: "left" | "right",
  side: -1 | 1,
  dimensions: Readonly<{
    hipY: number;
    shoulderWidth: number;
    upperLeg: number;
    lowerLeg: number;
    foot: number;
  }>,
  bottoms: StandardMaterial,
  shoes: StandardMaterial,
) {
  const hip = new TransformNode(`${id}-${label}-hip`, scene);
  hip.position.set(side * dimensions.shoulderWidth * 0.22, dimensions.hipY, 0);
  hip.parent = root;
  const thigh = MeshBuilder.CreateCylinder(
    `${id}-${label}-thigh`,
    {
      height: dimensions.upperLeg,
      diameterTop: dimensions.shoulderWidth * 0.28,
      diameterBottom: dimensions.shoulderWidth * 0.23,
      tessellation: 11,
    },
    scene,
  );
  thigh.position.y = -dimensions.upperLeg * 0.5;
  thigh.material = bottoms;
  finishCharacterMesh(thigh, hip, shadows, true);
  const knee = new TransformNode(`${id}-${label}-knee`, scene);
  knee.position.y = -dimensions.upperLeg;
  knee.parent = hip;
  const lower = MeshBuilder.CreateCylinder(
    `${id}-${label}-lower-leg`,
    {
      height: dimensions.lowerLeg,
      diameterTop: dimensions.shoulderWidth * 0.22,
      diameterBottom: dimensions.shoulderWidth * 0.17,
      tessellation: 10,
    },
    scene,
  );
  lower.position.y = -dimensions.lowerLeg * 0.5;
  lower.material = bottoms;
  finishCharacterMesh(lower, knee, shadows, true);
  const shoe = MeshBuilder.CreateBox(
    `${id}-${label}-shoe`,
    {
      width: dimensions.shoulderWidth * 0.23,
      height: dimensions.shoulderWidth * 0.18,
      depth: dimensions.foot,
    },
    scene,
  );
  shoe.position.set(0, -dimensions.lowerLeg, -dimensions.foot * 0.22);
  shoe.material = shoes;
  finishCharacterMesh(shoe, knee, shadows);
  return { hip, knee };
}

function createFace(
  scene: Scene,
  parent: TransformNode,
  headSize: number,
  skin: StandardMaterial,
  eye: StandardMaterial,
  mouth: StandardMaterial,
  white: StandardMaterial,
  shadows: ShadowGenerator | null,
  profile: TownCharacterProfile,
) {
  for (const side of [-1, 1] as const) {
    const eyeWhite = MeshBuilder.CreateSphere(
      `${profile.id}-eye-white-${side}`,
      { diameter: headSize * 0.14, segments: 8 },
      scene,
    );
    eyeWhite.position.set(
      side * headSize * 0.18,
      headSize * 0.08,
      -headSize * 0.47,
    );
    eyeWhite.scaling.y = 1.18;
    eyeWhite.scaling.z = 0.35;
    eyeWhite.material = white;
    finishCharacterMesh(eyeWhite, parent, shadows);
    const pupil = MeshBuilder.CreateSphere(
      `${profile.id}-eye-${side}`,
      { diameter: headSize * 0.07, segments: 8 },
      scene,
    );
    pupil.position.set(
      side * headSize * 0.18,
      headSize * 0.08,
      -headSize * 0.515,
    );
    pupil.scaling.z = 0.28;
    pupil.material = eye;
    finishCharacterMesh(pupil, parent, shadows);
  }
  const nose = MeshBuilder.CreateSphere(
    `${profile.id}-nose`,
    { diameter: headSize * 0.13, segments: 8 },
    scene,
  );
  nose.position.set(0, -headSize * 0.035, -headSize * 0.525);
  nose.scaling.set(0.72, 0.82, 0.5);
  nose.material = skin;
  finishCharacterMesh(nose, parent, shadows);
  const smile = MeshBuilder.CreateBox(
    `${profile.id}-smile`,
    {
      width: headSize * 0.2,
      height: headSize * 0.035,
      depth: headSize * 0.025,
    },
    scene,
  );
  smile.position.set(0, -headSize * 0.18, -headSize * 0.51);
  smile.rotation.z = -0.05;
  smile.material = mouth;
  finishCharacterMesh(smile, parent, shadows);

  if (profile.glasses) {
    for (const side of [-1, 1] as const) {
      const lens = MeshBuilder.CreateTorus(
        `${profile.id}-glasses-${side}`,
        {
          diameter: headSize * 0.23,
          thickness: headSize * 0.025,
          tessellation: 12,
        },
        scene,
      );
      lens.position.set(
        side * headSize * 0.17,
        headSize * 0.08,
        -headSize * 0.535,
      );
      lens.rotation.x = Math.PI / 2;
      lens.material = eye;
      finishCharacterMesh(lens, parent, shadows);
    }
    const bridge = MeshBuilder.CreateBox(
      `${profile.id}-glasses-bridge`,
      {
        width: headSize * 0.13,
        height: headSize * 0.025,
        depth: headSize * 0.025,
      },
      scene,
    );
    bridge.position.set(0, headSize * 0.08, -headSize * 0.54);
    bridge.material = eye;
    finishCharacterMesh(bridge, parent, shadows);
  }
}

function createHair(
  scene: Scene,
  parent: TransformNode,
  headSize: number,
  hair: StandardMaterial,
  shadows: ShadowGenerator | null,
  style: TownCharacterHair,
  id: string,
) {
  const cap = MeshBuilder.CreateSphere(
    `${id}-hair-cap`,
    { diameter: headSize * 1.03, segments: 12 },
    scene,
  );
  cap.position.set(0, headSize * 0.2, headSize * 0.06);
  cap.scaling.set(1.03, 0.72, 1.03);
  cap.material = hair;
  finishCharacterMesh(cap, parent, shadows);

  const addHairSphere = (
    suffix: string,
    x: number,
    y: number,
    z: number,
    diameter: number,
  ) => {
    const piece = MeshBuilder.CreateSphere(
      `${id}-hair-${suffix}`,
      { diameter, segments: 9 },
      scene,
    );
    piece.position.set(x, y, z);
    piece.material = hair;
    finishCharacterMesh(piece, parent, shadows);
  };

  if (style === "bun") {
    addHairSphere("bun", 0, headSize * 0.46, headSize * 0.18, headSize * 0.42);
  } else if (style === "ponytail") {
    addHairSphere(
      "tail-top",
      0,
      headSize * 0.22,
      headSize * 0.43,
      headSize * 0.36,
    );
    addHairSphere(
      "tail-bottom",
      0,
      -headSize * 0.05,
      headSize * 0.5,
      headSize * 0.3,
    );
  } else if (style === "curls" || style === "coils") {
    const diameter = headSize * (style === "coils" ? 0.27 : 0.31);
    for (const [index, [x, y, z]] of (
      [
        [-0.33, 0.29, 0.04],
        [0, 0.38, 0.06],
        [0.33, 0.29, 0.04],
        [-0.4, 0.08, 0.14],
        [0.4, 0.08, 0.14],
        [-0.27, 0.18, 0.3],
        [0.27, 0.18, 0.3],
      ] as const
    ).entries()) {
      addHairSphere(
        `curl-${index}`,
        x * headSize,
        y * headSize,
        z * headSize,
        diameter,
      );
    }
  } else if (style === "waves") {
    addHairSphere(
      "wave-left",
      -headSize * 0.38,
      0,
      headSize * 0.08,
      headSize * 0.3,
    );
    addHairSphere(
      "wave-right",
      headSize * 0.38,
      0,
      headSize * 0.08,
      headSize * 0.3,
    );
  }
}

function material(
  scene: Scene,
  color: string,
  specularStrength: number,
): StandardMaterial {
  let cache = MATERIAL_CACHE.get(scene);
  if (cache === undefined) {
    cache = new Map();
    MATERIAL_CACHE.set(scene, cache);
  }
  const key = `${color}-${specularStrength}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const next = new StandardMaterial(`character-material-${key}`, scene);
  next.diffuseColor = Color3.FromHexString(color);
  next.specularColor = Color3.White().scale(specularStrength);
  next.specularPower = 36;
  cache.set(key, next);
  return next;
}

function finishCharacterMesh(
  mesh: ReturnType<typeof MeshBuilder.CreateBox>,
  parent: TransformNode,
  shadows: ShadowGenerator | null,
  castsShadow = false,
) {
  mesh.parent = parent;
  mesh.isPickable = false;
  mesh.receiveShadows = false;
  if (castsShadow) shadows?.addShadowCaster(mesh);
}
