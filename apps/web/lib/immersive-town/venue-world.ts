import type { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import { createIndoorWalker } from "./interior-walker";
import { stepInterior } from "./interior-navigation";
import type { WalkBounds } from "./walking";
import type { TownVenue, VenueFloor } from "./venue-catalog";
import type { TownTimeOfDay } from "./types";
import { applyTownSurface } from "./materials";
import { createArchitecturalBatch } from "./geometry";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { createInteriorLife } from "./interior-life";
import { venueLifePlan } from "./interior-life-plan";
import { residentAppearanceSeed } from "./resident-models";

export const VENUE_LIMITS: WalkBounds = {
  minX: -10.8,
  maxX: 10.8,
  minZ: -9.85,
  maxZ: 8.3,
};
export const VENUE_START = { x: 0, z: -5.8, yaw: 0 };
type Zone = "floor" | "exit" | "lift" | "repair";

/** A furnished, full-height first-person floor. Only the visited floor is allocated. */
export function createVenueWorld(
  engine: Engine,
  venue: TownVenue,
  floorIndex: number,
  time: TownTimeOfDay,
  callbacks: {
    isBlocked?(): boolean;
    onNearby?(zone: Zone | null): void;
    onExit?(): void;
    onLift?(): void;
    onRepair?(): void;
  } = {},
) {
  const floor = venue.floors[floorIndex];
  if (!floor) throw new Error(`No floor ${floorIndex} in ${venue.id}`);
  const outdoor = Boolean(venue.outdoor || floor.use === "roof");
  const night = time === "night";
  const scene = new Scene(engine);
  scene.clearColor = Color4.FromHexString(night ? "#111F3AFF" : "#A5D4E7FF");
  scene.imageProcessingConfiguration.exposure = 0.95;
  scene.imageProcessingConfiguration.contrast = 1.08;
  const ambient = new HemisphericLight(
    "venue-ambient",
    new Vector3(0.3, 1, -0.2),
    scene,
  );
  ambient.intensity = outdoor && night ? 0.65 : 0.9;
  ambient.groundColor = Color3.FromHexString("#465468");
  const obstacles: WalkBounds[] = [];
  const material = (name: string, colour: string, glow = 0) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(colour);
    m.specularColor = Color3.White().scale(0.12);
    m.emissiveColor = m.diffuseColor.scale(glow);
    return m;
  };
  const wood = applyTownSurface(scene, material("warm-oak", "#987D60"), "wood");
  const dark = material("charcoal-metal", "#304451");
  const cream = material("plaster", "#CCCAC0");
  const teal = applyTownSurface(
    scene,
    material("teal-upholstery", "#607875"),
    "fabric",
  );
  const gold = material("brass", "#AE966C");
  const leaf = material("foliage", "#607357");
  const blue = material("blue-detail", "#667D91");
  const coral = material("coral-detail", "#A17866");
  const glass = material(
    "night-windows",
    night ? "#182C4D" : "#7FBDD6",
    night ? 0.12 : 0.2,
  );
  const glow = material("warm-light", "#FFE8AB", 0.6);
  const colours = [teal, gold, blue, coral, leaf];
  const accent = (index: number) =>
    colours[Math.floor(Math.abs(index)) % colours.length] ?? teal;
  let count = 0;
  const box = (
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: StandardMaterial,
    solid = false,
  ) => {
    const mesh = MeshBuilder.CreateBox(
      `${name}-${count++}`,
      { width: w, height: h, depth: d },
      scene,
    );
    mesh.position.set(x, y, z);
    mesh.material = mat;
    mesh.isPickable = false;
    if (solid)
      obstacles.push({
        minX: x - w / 2,
        maxX: x + w / 2,
        minZ: z - d / 2,
        maxZ: z + d / 2,
      });
    return mesh;
  };
  const sphere = (
    name: string,
    x: number,
    y: number,
    z: number,
    diameter: number,
    mat: StandardMaterial,
  ) => {
    const mesh = MeshBuilder.CreateSphere(
      `${name}-${count++}`,
      { diameter, segments: 12 },
      scene,
    );
    mesh.position.set(x, y, z);
    mesh.material = mat;
    mesh.isPickable = false;
    return mesh;
  };
  const sign = (text: string, x: number, y: number, z: number, width = 4.8) => {
    const mesh = MeshBuilder.CreatePlane(
      `sign-${text}`,
      { width, height: 0.7 },
      scene,
    );
    mesh.position.set(x, y, z);
    mesh.isPickable = false;
    const mat = material(`sign-${text}`, "#E9E6D8", 0.25);
    if (typeof document !== "undefined") {
      const texture = new DynamicTexture(
        `lettering-${text}`,
        { width: 768, height: 112 },
        scene,
        false,
      );
      texture.drawText(
        text,
        null,
        75,
        "bold 40px sans-serif",
        "#233F49",
        "#E9E6D8",
        true,
      );
      mat.diffuseTexture = texture;
    }
    mat.backFaceCulling = false;
    mesh.material = mat;
  };
  const plant = (x: number, z: number) => {
    box("planter", x, 0.45, z, 0.85, 0.9, 0.85, wood, true);
    box("stem", x, 1.15, z, 0.12, 1.1, 0.12, wood);
    sphere("leaves", x, 1.8, z, 1.25, leaf);
  };
  const chair = (x: number, z: number, mat = teal, facesPositiveZ = false) => {
    box("chair-seat", x, 0.72, z, 1, 0.22, 0.9, mat, true);
    box(
      "chair-back",
      x,
      1.25,
      z + (facesPositiveZ ? -0.38 : 0.38),
      1,
      0.9,
      0.14,
      mat,
    );
    for (const dx of [-0.36, 0.36])
      for (const dz of [-0.3, 0.3])
        box("chair-leg", x + dx, 0.35, z + dz, 0.1, 0.7, 0.1, dark);
  };
  const table = (x: number, z: number, w = 2.8, d = 1.4, mat = wood) => {
    box("table-top", x, 1.25, z, w, 0.2, d, mat, true);
    for (const dx of [-w / 2 + 0.2, w / 2 - 0.2])
      for (const dz of [-d / 2 + 0.2, d / 2 - 0.2])
        box("table-leg", x + dx, 0.6, z + dz, 0.16, 1.2, 0.16, dark);
  };
  const sofa = (x: number, z: number, facesPositiveZ = false) => {
    box("sofa-base", x, 0.6, z, 3, 0.75, 1.2, teal, true);
    box(
      "sofa-back",
      x,
      1.1,
      z + (facesPositiveZ ? -0.5 : 0.5),
      3,
      1.1,
      0.2,
      teal,
    );
    for (const dx of [-1.1, 0, 1.1])
      box(
        "sofa-cushion",
        x + dx,
        1.1,
        z + (facesPositiveZ ? -0.27 : 0.27),
        0.85,
        0.65,
        0.24,
        gold,
      );
  };
  const shelves = (x: number, z: number, books = true) => {
    box("shelf-frame", x, 1.7, z, 3, 3.4, 0.75, wood, true);
    for (let row = 0; row < 4; row++) {
      box(
        "shelf-shadow",
        x,
        0.55 + row * 0.75,
        z - 0.39,
        2.75,
        0.61,
        0.07,
        dark,
      );
      for (let b = 0; b < 8; b++)
        box(
          books ? "book" : "supply",
          x - 1.15 + b * 0.33,
          0.54 + row * 0.75,
          z - 0.45,
          0.21,
          books ? 0.42 + (b % 3) * 0.05 : 0.38,
          0.12,
          accent(b + row + floorIndex),
        );
    }
  };
  const screen = (x: number, y: number, z: number) => {
    box("monitor", x, y, z, 1.15, 0.75, 0.15, dark);
    box("monitor-display", x, y, z - 0.09, 1.01, 0.59, 0.03, blue);
    box("monitor-stand", x, y - 0.55, z, 0.1, 0.4, 0.1, dark);
  };

  box(
    "floor",
    0,
    -0.15,
    0,
    23,
    0.3,
    19,
    outdoor
      ? wood
      : applyTownSurface(scene, material("floor-stone", "#949C97"), "stone"),
  );
  // Narrow joints and a clear contrasting central route make the scale legible.
  for (let z = -9; z <= 9; z += 1.5)
    box("floor-joint", 0, 0.006, z, 22, 0.012, 0.025, dark);
  box(
    "clear-walkway",
    0,
    0.015,
    0,
    2.5,
    0.018,
    17,
    applyTownSurface(scene, material("runner", "#A6AEA1"), "fabric"),
  );
  if (!outdoor) {
    box("back-wall", 0, 2.5, 9.3, 23, 5, 0.3, cream);
    box("front-wall-left", -6.4, 2.5, -9.3, 10.2, 5, 0.3, cream, true);
    box("front-wall-right", 6.4, 2.5, -9.3, 10.2, 5, 0.3, cream, true);
    box("front-wall-lintel", 0, 4.25, -9.3, 2.6, 1.5, 0.3, cream);
    for (const x of [-11.4, 11.4]) {
      box("side-wall", x, 2.5, 0, 0.3, 5, 19, cream);
      for (const z of [-5, 0, 5]) {
        box("window-frame", x * 0.987, 2.8, z, 0.16, 2.8, 3.5, wood);
        box("window-glass", x * 0.976, 2.8, z, 0.08, 2.55, 3.22, glass);
        box("window-mullion", x * 0.97, 2.8, z, 0.08, 2.6, 0.06, gold);
        if (night)
          for (let i = 0; i < 5; i++)
            box(
              "distant-city-light",
              x * 0.967,
              2 + (i % 2) * 0.4,
              z - 1.2 + i * 0.6,
              0.025,
              0.13,
              0.14,
              glow,
            );
      }
    }
    box("ceiling", 0, 5.05, 0, 23, 0.18, 19, cream);
    const joineryRoot = new TransformNode("venue-architectural-joinery", scene);
    createArchitecturalBatch(
      "venue-skirting-and-ceiling-beams",
      [
        [-11.16, 0.15, 0, 0.1, 0.3, 18.4],
        [11.16, 0.15, 0, 0.1, 0.3, 18.4],
        [0, 0.15, 9.08, 22.2, 0.3, 0.1],
        [-11.1, 4.77, 0, 0.16, 0.17, 18.4],
        [11.1, 4.77, 0, 0.16, 0.17, 18.4],
        [0, 4.84, -4.7, 22.2, 0.22, 0.18],
        [0, 4.84, 4.7, 22.2, 0.22, 0.18],
      ],
      wood,
      joineryRoot,
      scene,
    );
    const hinge = new TransformNode("venue-entry-hinge", scene);
    hinge.position.set(-1.3, 1.7, -9.3);
    const door = box("exit-door", 1.3, 0, 0, 2.6, 3.4, 0.12, teal);
    door.parent = hinge;
    const handle = box("exit-handle", 2.2, 0, 0.13, 0.3, 0.1, 0.15, gold);
    handle.parent = hinge;
    sign("EXIT · BACK TO TOWN", 0, 3.65, -8.97, 3.5);
  } else {
    for (const x of [-11.2, 11.2])
      box("safety-rail", x, 0.7, 0, 0.2, 1.4, 18.5, dark);
    box("safety-rail-back", 0, 0.7, 9, 22.4, 1.4, 0.2, dark);
    for (const x of [-6.3, 6.3])
      box("safety-rail-entry", x, 0.7, -9, 9.8, 1.4, 0.2, dark, true);
    // A distant silhouette, not extra inaccessible gameplay buildings.
    for (let i = 0; i < 12; i++)
      box(
        "skyline-backdrop",
        -32 + i * 6,
        1 + (i % 4) * 2,
        40,
        4,
        6 + (i % 4) * 4,
        4,
        glass,
      );
  }
  for (const x of [-5, 5]) {
    const light = new PointLight(
      `ceiling-light-${x}`,
      new Vector3(x, 4.5, 0),
      scene,
    );
    light.diffuse = Color3.FromHexString("#FFE1AC");
    light.intensity = 0.48;
    light.range = 23;
    box("light-fitting", x, 4.72, 0, 2, 0.09, 1, glow);
    if (outdoor) box("lamp-post", x, 2.3, 0, 0.12, 4.6, 0.12, dark, true);
  }
  sign(venue.name.toUpperCase(), 0, 4.18, 8.94, 6.8);
  if (venue.floors.length > 1) {
    if (outdoor) {
      box("rooftop-lift-shaft", 0, 2, 10.5, 4.2, 4, 3.2, cream);
      box("rooftop-lift-cap", 0, 4.1, 10.5, 4.6, 0.2, 3.6, dark);
    }
    box("lift-surround", 0, 1.8, 9.01, 3, 3.6, 0.3, dark);
    box("lift-left-door", -0.64, 1.65, 8.82, 1.23, 3.2, 0.12, blue);
    box("lift-right-door", 0.64, 1.65, 8.82, 1.23, 3.2, 0.12, blue);
    box("lift-seam", 0, 1.65, 8.72, 0.05, 3.15, 0.04, dark);
    box("lift-button", 1.75, 1.7, 8.8, 0.25, 0.5, 0.12, glow);
    sign("LIFT · ALL FLOORS", 0, 3.62, 8.69, 3.2);
  }
  plant(-9.5, -7);
  plant(9.5, 7);

  const use: VenueFloor["use"] =
    floor.use === "lobby" && venue.kind !== "apartments" && venue.kind !== "hub"
      ? venue.kind
      : floor.use;
  if (use === "library" || use === "bookshop") {
    for (const x of [-7.8, -4]) for (const z of [-1.5, 4.5]) shelves(x, z);
    for (const z of [-3, 3]) {
      table(6, z, 4, 1.7);
      chair(4.8, z + 1.4);
      chair(7.2, z + 1.4, coral);
      box("open-book", 6, 1.41, z, 0.8, 0.06, 0.5, cream);
    }
    sign(
      use === "library" ? "READ · WONDER · DISCOVER" : "STORIES TO TAKE HOME",
      -6,
      3.7,
      7.9,
      5,
    );
  } else if (use === "cafe" || use === "market") {
    for (const x of [-6, 5.5])
      for (const z of [-3.5, 2]) {
        table(x, z, 2.8, 1.7);
        chair(x - 0.8, z + (x === 5.5 && z === -3.5 ? 1.02 : 1.5));
        chair(x + 0.8, z + 1.5, coral);
        sphere("fruit-bowl", x, 1.48, z, 0.4, gold);
      }
    box("service-counter", -5.5, 0.9, 6.8, 7, 1.8, 1.3, wood, true);
    box("counter-top", -5.5, 1.85, 6.8, 7.2, 0.14, 1.5, cream);
    if (use === "cafe") {
      box("espresso-machine", -7.5, 2.23, 6.8, 1.1, 0.75, 0.7, dark);
      for (let i = 0; i < 5; i++)
        sphere("pastry", -5 + i * 0.6, 2, 6.5, 0.32, gold);
      sign("FRESHLY MADE · LESS FOOD WASTE", -5.5, 3.5, 8.9, 6);
    } else {
      box("market-canopy", -5.5, 3.9, 6.8, 7.4, 0.25, 2.3, coral);
      for (let i = 0; i < 9; i++)
        sphere("fresh-produce", -8 + i * 0.6, 2.1, 6.5, 0.4, accent(i));
    }
  } else if (use === "school") {
    for (const x of [-7, -3.5, 3.5, 7])
      for (const z of [-3, 0.5, 4]) {
        table(x, z, 2.2, 1.15);
        chair(x, z - 1.25, accent(floorIndex + Math.abs(x)), true);
        box("exercise-book", x, 1.4, z, 0.6, 0.06, 0.45, blue);
      }
    box("classroom-board", -5.4, 2.8, 8.98, 7.6, 2.2, 0.14, teal);
    sign("OUR PLANET · OUR HOME", -5.4, 2.8, 8.87, 6.5);
    shelves(7, 7.8);
  } else if (use === "clinic") {
    table(-6, -3, 5, 1.5, teal);
    screen(-6, 1.95, -2.8);
    for (const x of [-8, -6, -4]) chair(x, 1.2, blue);
    sign("RECEPTION", -6, 3.5, 2.8, 4);
    // Two private exam bays, with open doorways facing the clear central aisle.
    for (const z of [-2.5, 4]) {
      box("exam-partition", 7.1, 1.6, z + 2.2, 7.8, 3.2, 0.18, cream, true);
      box("exam-bed-base", 7, 0.7, z, 2.2, 1.2, 3.2, dark, true);
      box("exam-mattress", 7, 1.38, z, 2.3, 0.25, 3.3, blue);
      box("exam-pillow", 7, 1.6, z + 1, 1.8, 0.2, 0.7, cream);
      table(3.5, z + 0.5, 1, 0.8, cream);
    }
  } else if (use === "science") {
    for (const x of [-6, 6])
      for (const z of [-2.5, 3.5]) {
        table(x, z, 5, 1.8, cream);
        box("microscope-base", x - 1, 1.43, z, 0.7, 0.12, 0.65, dark);
        box("microscope-column", x - 1, 1.8, z + 0.2, 0.15, 0.75, 0.16, dark);
        box("microscope-eyepiece", x - 1, 2.1, z, 0.2, 0.15, 0.6, blue);
        sphere("planet-model", x + 1, 1.95, z, 0.95, accent(floorIndex + 2));
      }
    sign("OBSERVE · ASK · EXPERIMENT", -5.8, 3.7, 8.9, 6);
  } else if (use === "studios") {
    table(-6, -1, 5.5, 2, dark);
    for (let i = 0; i < 10; i++) {
      box("mixing-fader", -8 + i * 0.45, 1.39, -1.65, 0.08, 0.06, 0.65, cream);
      box(
        "mixing-knob",
        -8 + i * 0.45,
        1.48,
        -1.65 + (i % 3) * 0.07,
        0.18,
        0.12,
        0.16,
        coral,
      );
    }
    screen(-6, 2, 0.3);
    chair(-6, -2.23, teal, true);
    for (const x of [-9, -3])
      box("speaker", x, 1.9, 3.5, 1.3, 2.8, 1, dark, true);
    box("recording-stage", 6, 0.1, 2.5, 7, 0.2, 7, wood);
    box("microphone-stand", 6, 1.3, 1, 0.12, 2.6, 0.12, dark, true);
    sphere("microphone", 6, 2.65, 1, 0.36, dark);
    for (let i = 0; i < 6; i++)
      box(
        "acoustic-panel",
        4 + (i % 3) * 2,
        1.5 + Math.floor(i / 3) * 1.7,
        9.05,
        1.6,
        1.35,
        0.25,
        i % 2 ? teal : dark,
      );
  } else if (use === "arts") {
    for (const x of [-7, -3.8, 3.8, 7]) {
      box("gallery-plinth", x, 0.7, 1.5, 1.6, 1.4, 1.6, cream, true);
      const sculpture = sphere(
        "sculpture",
        x,
        2,
        1.5,
        1.45,
        accent(x + floorIndex),
      );
      sculpture.scaling.set(0.7, 1.4, 0.7);
      box("picture-frame", x, 2.6, 8.99, 2.6, 2.8, 0.16, wood);
      box("painting", x, 2.6, 8.86, 2.3, 2.5, 0.08, blue);
      sphere("painted-sun", x + 0.5, 3.25, 8.76, 0.65, gold).scaling.z = 0.05;
      box("painted-landscape", x, 1.9, 8.76, 2.3, 0.95, 0.04, leaf);
    }
  } else if (use === "workshop") {
    for (const x of [-6, 6]) {
      table(x, 0, 6, 2);
      shelves(x, 7.5, false);
      box("vice", x - 1.5, 1.6, -0.75, 0.7, 0.5, 0.8, blue);
      for (let i = 0; i < 4; i++) {
        box("tool-handle", x - 1 + i * 0.75, 1.42, 0, 0.13, 0.12, 0.8, coral);
        box("tool-head", x - 1 + i * 0.75, 1.44, 0.45, 0.5, 0.2, 0.15, dark);
      }
    }
    sign("REPAIR · REUSE · REIMAGINE", -5.5, 3.8, 8.9, 6);
  } else if (use === "apartments") {
    // A central entrance hall connects living/dining, kitchen and sleeping areas.
    sofa(-6, -3, true);
    table(-6, -5, 2.6, 1.2);
    box("living-rug", -6, 0.025, -4, 6, 0.025, 5, coral);
    box("bed-base", -6, 0.5, 4.3, 3.5, 1, 4.2, wood, true);
    box("bed-duvet", -6, 1.05, 4.3, 3.5, 0.15, 4.1, blue);
    box("bed-pillow", -6, 1.24, 5.6, 2.4, 0.23, 0.8, cream);
    box("bedroom-divider", -6.8, 1.7, 0, 8.4, 3.4, 0.18, cream, true);
    table(6, -3, 3.5, 2);
    chair(5, -1.4);
    chair(7, -1.4);
    box("kitchen-cabinets", 7, 0.6, 7.8, 6, 1.2, 1.4, teal, true);
    box("worktop", 7, 1.24, 7.8, 6.2, 0.15, 1.5, cream);
    box("sink", 5.3, 1.34, 7.8, 1.2, 0.08, 0.8, dark);
    box("tap", 5.3, 1.65, 8.2, 0.1, 0.6, 0.1, gold);
    box("fridge", 3.3, 1.5, 7.7, 1.3, 3, 1.5, cream, true);
  } else if (use === "bank") {
    for (const x of [-6, 6]) {
      box("reception-desk", x, 0.85, 2.5, 6, 1.7, 1.6, wood, true);
      screen(x, 2.05, 2.7);
      sign(
        x < 0 ? "DEPOSITS · TELLER" : "CITY SERVICES · PAYMENTS",
        x,
        3.2,
        4.3,
        5.5,
      );
      shelves(x, 7.8, false);
    }
    sign("RIVERGATE COMMUNITY BANK · SIMULATED SERVICES", 0, 4.5, 8.85, 10);
  } else if (use === "hub" || use === "lobby") {
    if (use === "hub") {
      for (const x of [-6, 6])
        for (const z of [-2, 4]) {
          table(x, z, 4.6, 1.8);
          screen(x, 1.95, z + 0.4);
          chair(x, z - 1.3, teal, true);
        }
      sign("PLANNING A BETTER RIVERGATE", -5.5, 3.7, 8.9, 6);
    } else {
      box("reception-desk", -6, 0.85, 2.5, 6, 1.7, 1.6, wood, true);
      screen(-6, 2, 2.7);
      sofa(6, -2);
      sofa(6, 3);
      table(6, 0, 2.5, 1.2);
      sign(
        venue.kind === "apartments"
          ? "RESIDENTS · WELCOME HOME"
          : "WELCOME TO CITY HUB",
        -5.8,
        3.6,
        8.9,
        6,
      );
      if (venue.kind === "apartments")
        for (let i = 0; i < 12; i++)
          box(
            "mailbox",
            -8.5 + (i % 4) * 1,
            1 + Math.floor(i / 4) * 0.65,
            8.85,
            0.85,
            0.55,
            0.3,
            accent(i),
          );
    }
  } else if (use === "roof" || use === "playground") {
    for (const x of [-7, 7]) {
      plant(x, 4);
      plant(x, -3);
      table(x, 0, 3.6, 1.7);
      chair(x - 1, 1.5);
      chair(x + 1, 1.5);
    }
    if (use === "playground") {
      box("play-platform", -6, 1, 6, 3, 2, 2.8, teal, true);
      const slide = box("slide", -6, 0.9, 3.6, 1.4, 0.15, 3.5, gold);
      slide.rotation.x = -0.5;
      obstacles.push({ minX: -6.9, maxX: -5.1, minZ: 1.8, maxZ: 5.4 });
    }
  } else if (use === "bus") {
    box("shelter-roof", 0, 4.4, 3, 13, 0.25, 5, teal);
    for (const x of [-6, 6])
      box("shelter-post", x, 2.2, 3, 0.18, 4.4, 0.18, dark, true);
    for (const x of [-4, -2, 2, 4]) chair(x, 4.5, blue);
    sign("RIVER LOOP · SCHOOL · LIBRARY · MARKET", 0, 3.5, 5.3, 9);
  } else if (use === "dock") {
    box("river-water", 0, -0.5, 22, 90, 0.1, 25, blue);
    for (const x of [-7, 7]) {
      sofa(x, 3);
      box("life-ring-post", x, 1.5, 7.8, 0.18, 3, 0.18, wood, true);
      sphere("life-ring-marker", x, 2, 7.8, 1, coral);
    }
    sign("KEEP OUR RIVER CLEAN", 0, 3.5, 8.7, 5);
  }
  const apartmentReception = venue.kind === "apartments" && floorIndex === 0;
  const repairStatus = apartmentReception
    ? material("resident-repair-status", "#DDA665", 0.3)
    : null;
  if (apartmentReception && repairStatus) {
    sign("RESIDENT SERVICES · REPAIRS", -6, 2.6, 1.65, 5.5);
    sphere("resident-repair-indicator", -3.5, 1.9, 1.65, 0.28, repairStatus);
  }
  const life = createInteriorLife(
    scene,
    venueLifePlan(venue, floorIndex),
    () => callbacks.isBlocked?.() ?? false,
    null,
    residentAppearanceSeed(`${venue.id}:${floorIndex}`),
  );
  const currentObstacles = () => [...obstacles, ...life.obstacles];
  const walker = createIndoorWalker<Zone>(
    scene,
    engine.getRenderingCanvas() ?? null,
    currentObstacles,
    {
      starts: {
        floor: VENUE_START,
        exit: VENUE_START,
        lift: VENUE_START,
        repair: VENUE_START,
      },
      limits: VENUE_LIMITS,
      roomAt: () => "floor",
      nearbyAt: (p) =>
        Math.abs(p.x) < 2 && p.z < -6.7
          ? "exit"
          : Math.abs(p.x) < 2 && p.z > 6.5 && venue.floors.length > 1
            ? "lift"
            : apartmentReception && Math.hypot(p.x + 6, p.z - 0.6) < 1.7
              ? "repair"
              : null,
      step: (pose, input, seconds, bounds) =>
        stepInterior(pose, input, seconds, bounds, VENUE_LIMITS),
    },
    {
      isBlocked: () => callbacks.isBlocked?.() ?? false,
      onNearbyChange: (zone) => callbacks.onNearby?.(zone),
      onInteract: (zone) => {
        if (zone === "exit") callbacks.onExit?.();
        else if (zone === "lift") callbacks.onLift?.();
        else if (zone === "repair") callbacks.onRepair?.();
      },
    },
  );
  life.configureNavigation(obstacles, VENUE_LIMITS, () =>
    walker.active ? walker.camera.position : null,
  );
  walker.enter("floor");
  return {
    scene,
    walker,
    get obstacles() {
      return currentObstacles();
    },
    floor,
    life,
    setApartmentHealthy(healthy: boolean) {
      if (repairStatus) {
        repairStatus.diffuseColor = Color3.FromHexString(
          healthy ? "#8EB69A" : "#DDA665",
        );
        repairStatus.emissiveColor = repairStatus.diffuseColor.scale(0.3);
      }
    },
    enterDoor() {
      walker.startAt({ x: 0, z: -9.65, yaw: 0 });
    },
    setDoorOpen(amount: number) {
      const hinge = scene.getTransformNodeByName("venue-entry-hinge");
      if (hinge) hinge.rotation.y = -Math.max(0, Math.min(1, amount)) * 1.4;
    },
    dispose() {
      walker.dispose();
      scene.dispose();
    },
  };
}

export type VenueWorld = ReturnType<typeof createVenueWorld>;
