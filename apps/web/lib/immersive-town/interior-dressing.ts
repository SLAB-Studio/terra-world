import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { applyTownSurface } from "./materials";
import type { WalkBounds } from "./walking";

/** Lived-in detail stays off circulation routes; static parts batch by material. */
export function createInteriorDressing(scene: Scene, use: string, variant = 0) {
  const root = new TransformNode("interior-lived-in-details", scene);
  const obstacles: WalkBounds[] = [];
  const parts = new Map<StandardMaterial, Mesh[]>();
  const fixtures: string[] = [];
  const palette: Record<string, StandardMaterial> = {};
  for (const [key, colour] of Object.entries({
    oak: "#987553",
    dark: "#24313A",
    paper: "#E7E0CC",
    blue: "#557481",
    green: "#55775D",
    coral: "#AA6C57",
    brass: "#BAA478",
    ceramic: "#D4DBD6",
    fabric: "#698084",
    red: "#AD5F52",
  })) {
    const m = new StandardMaterial(`interior-detail-${key}`, scene);
    m.diffuseColor = Color3.FromHexString(colour);
    m.specularColor = Color3.White().scale(key === "brass" ? 0.28 : 0.07);
    palette[key] =
      key === "oak"
        ? applyTownSurface(scene, m, "wood")
        : key === "fabric"
          ? applyTownSurface(scene, m, "fabric")
          : m;
  }
  const mat = (key: string) => palette[key] ?? palette.dark!;
  const register = (mesh: Mesh, key: string) => {
    mesh.material = mat(key);
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    fixtures.push(mesh.name);
    const list = parts.get(mat(key)) ?? [];
    list.push(mesh);
    parts.set(mat(key), list);
    return mesh;
  };
  const box = (
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    key = "oak",
    solid = false,
  ) => {
    const mesh = MeshBuilder.CreateBox(
      name,
      { width: w, height: h, depth: d },
      scene,
    );
    mesh.position.set(x, y, z);
    if (solid)
      obstacles.push({
        minX: x - w / 2,
        maxX: x + w / 2,
        minZ: z - d / 2,
        maxZ: z + d / 2,
      });
    return register(mesh, key);
  };
  const cylinder = (
    name: string,
    x: number,
    y: number,
    z: number,
    diameter: number,
    height: number,
    key: string,
  ) => {
    const mesh = MeshBuilder.CreateCylinder(
      name,
      { diameter, height, tessellation: 14 },
      scene,
    );
    mesh.position.set(x, y, z);
    return register(mesh, key);
  };
  const orb = (
    name: string,
    x: number,
    y: number,
    z: number,
    diameter: number,
    key: string,
  ) => {
    const mesh = MeshBuilder.CreateSphere(
      name,
      { diameter, segments: 8 },
      scene,
    );
    mesh.position.set(x, y, z);
    return register(mesh, key);
  };
  const book = (x: number, y: number, z: number, key = "blue") => {
    box("book-cover", x, y, z, 0.5, 0.1, 0.68, key);
    box("book-pages", x, y + 0.02, z - 0.014, 0.45, 0.05, 0.65, "paper");
  };
  const mug = (x: number, y: number, z: number) => {
    cylinder("ceramic-mug", x, y + 0.13, z, 0.23, 0.26, "ceramic");
    cylinder("coffee", x, y + 0.264, z, 0.18, 0.012, "dark");
    const handle = MeshBuilder.CreateTorus(
      "mug-handle",
      { diameter: 0.19, thickness: 0.045, tessellation: 10 },
      scene,
    );
    handle.position.set(x + 0.15, y + 0.13, z);
    handle.rotation.x = Math.PI / 2;
    register(handle, "ceramic");
  };
  const picture = (x: number, y: number, z: number, width = 1.4) => {
    box("framed-print", x, y, z, width, 1.05, 0.08, "oak");
    box("print-mat", x, y, z - 0.05, width - 0.15, 0.9, 0.018, "paper");
    box(
      "print-landscape",
      x,
      y - 0.16,
      z - 0.065,
      width - 0.3,
      0.35,
      0.015,
      variant % 2 ? "blue" : "green",
    );
    orb(
      "print-sun",
      x + width * 0.2,
      y + 0.16,
      z - 0.075,
      0.22,
      "brass",
    ).scaling.z = 0.08;
  };
  const plant = (x: number, y: number, z: number, size = 1) => {
    cylinder(
      "houseplant-pot",
      x,
      y + 0.2 * size,
      z,
      0.48 * size,
      0.4 * size,
      "coral",
    );
    cylinder(
      "houseplant-stem",
      x,
      y + 0.65 * size,
      z,
      0.045 * size,
      size,
      "green",
    );
    for (let i = 0; i < 5; i++) {
      const leaf = orb(
        "houseplant-leaf",
        x + Math.sin(i * 2.4) * 0.23 * size,
        y + (0.5 + i * 0.14) * size,
        z + Math.cos(i * 2.4) * 0.23 * size,
        0.42 * size,
        "green",
      );
      leaf.scaling.set(0.65, 0.3, 1);
      leaf.rotation.y = i * 2.4;
    }
  };
  const deskObjects = (
    x: number,
    y: number,
    z: number,
    keyboardOffset = -0.7,
  ) => {
    box("keyboard", x, y, z + keyboardOffset, 1.05, 0.06, 0.36, "dark");
    for (let row = 0; row < 3; row++)
      for (let k = 0; k < 9; k++)
        box(
          "keyboard-key",
          x - 0.44 + k * 0.11,
          y + 0.04,
          z + keyboardOffset - 0.11 + row * 0.11,
          0.08,
          0.012,
          0.07,
          "ceramic",
        );
    box("mouse-pad", x + 0.8, y, z - 0.37, 0.5, 0.018, 0.45, "fabric");
    orb(
      "computer-mouse",
      x + 0.8,
      y + 0.06,
      z - 0.37,
      0.18,
      "dark",
    ).scaling.set(0.7, 0.5, 1);
    book(x - 1.3, y + 0.04, z);
    mug(x + 1.3, y, z + 0.05);
    cylinder("pen-cup", x - 1.6, y + 0.16, z + 0.4, 0.22, 0.3, "brass");
    for (let i = 0; i < 3; i++)
      cylinder(
        "pen",
        x - 1.66 + i * 0.06,
        y + 0.36,
        z + 0.4,
        0.027,
        0.34,
        "dark",
      );
  };
  const plate = (x: number, y: number, z: number) => {
    cylinder("dinner-plate", x, y, z, 0.62, 0.055, "ceramic");
    box("napkin", x + 0.5, y, z, 0.26, 0.035, 0.48, "paper");
    box("cutlery", x + 0.48, y + 0.03, z, 0.035, 0.025, 0.37, "brass");
  };
  let television: {
    screen: Mesh;
    material: StandardMaterial;
    texture: DynamicTexture | null;
  } | null = null;
  const tv = (x: number, y: number, z: number, w = 2.5) => {
    box("television-frame", x, y, z, w + 0.16, w * 0.57 + 0.12, 0.16, "dark");
    const screen = MeshBuilder.CreatePlane(
      "television-programme",
      { width: w, height: w * 0.57 },
      scene,
    );
    screen.position.set(x, y, z - 0.09);
    screen.parent = root;
    screen.isPickable = false;
    const material = new StandardMaterial("television-display", scene);
    material.disableLighting = true;
    material.emissiveColor = Color3.White();
    screen.material = material;
    const texture =
      typeof document !== "undefined"
        ? new DynamicTexture(
            "rivergate-nature-channel",
            { width: 384, height: 216 },
            scene,
            false,
          )
        : null;
    if (texture) material.diffuseTexture = texture;
    television = { screen, material, texture };
  };
  const pots: Mesh[] = [];
  const hob = (x: number, y: number, z: number) => {
    box("cooker-hob", x, y, z, 1.25, 0.08, 0.85, "dark");
    cylinder("saucepan", x, y + 0.22, z, 0.65, 0.4, "brass");
    box("saucepan-handle", x + 0.5, y + 0.26, z, 0.45, 0.1, 0.13, "dark");
    cylinder("soup", x, y + 0.43, z, 0.56, 0.015, "coral");
    box("chopping-board", x - 1.05, y, z, 0.65, 0.06, 0.55, "oak");
    for (let i = 0; i < 4; i++)
      orb("chopped-vegetables", x - 1.2 + i * 0.1, y + 0.07, z, 0.13, "green");
    for (let i = 0; i < 3; i++) {
      const steam = MeshBuilder.CreateSphere(
        `saucepan-steam-${i}`,
        { diameter: 0.15, segments: 6 },
        scene,
      );
      steam.position.set(x + (i - 1) * 0.12, y + 0.75 + i * 0.2, z);
      steam.parent = root;
      steam.isPickable = false;
      const mist = new StandardMaterial(`steam-${i}`, scene);
      mist.diffuseColor = Color3.FromHexString("#CBD5CA");
      mist.alpha = 0.16;
      mist.disableDepthWrite = true;
      steam.material = mist;
      pots.push(steam);
    }
  };

  if (use === "home") {
    tv(-4.35, 2.65, -0.29, 2.8);
    box("remote-control", -3.3, 1.23, -1.8, 0.19, 0.07, 0.43, "dark");
    book(-4.2, 1.24, -1.6, "coral");
    mug(-5.15, 1.2, -1.4);
    for (const x of [-5.5, -3.2]) {
      const pillow = orb("sofa-scatter-cushion", x, 1.94, -4.8, 0.65, "fabric");
      pillow.scaling.set(1, 0.8, 0.38);
    }
    box("folded-blanket", -5.15, 1.68, -4.3, 0.8, 0.1, 1.3, "blue");
    for (const x of [-7, -2]) picture(x, 3.25, -0.27, 1.05);
    box("curtain-rail", -4.2, 4.05, -5.76, 3.8, 0.06, 0.06, "brass");
    for (const x of [-5.8, -2.6])
      for (let i = 0; i < 4; i++)
        cylinder(
          "curtain-fold",
          x + i * 0.12,
          2.85,
          -5.7,
          0.17,
          2.35,
          "fabric",
        );
    box("kitchen-fridge", 7.25, 1.9, -0.85, 1.05, 2.9, 0.9, "ceramic", true);
    box("fridge-seal", 7.25, 2.38, -1.31, 1.03, 0.025, 0.035, "dark");
    for (const y of [1.7, 2.8])
      box("fridge-handle", 7.59, y, -1.35, 0.06, 0.5, 0.06, "brass");
    hob(6.4, 2.02, -4.85);
    for (const x of [1.8, 3, 5.4, 6.6]) {
      box("upper-kitchen-cabinet", x, 3.68, -5.65, 1.08, 1.02, 0.5, "ceramic");
      box("cabinet-pull", x + 0.32, 3.56, -5.36, 0.04, 0.3, 0.06, "brass");
    }
    plate(3.55, 1.67, -1.8);
    plate(4.95, 1.67, -1.8);
    mug(4.2, 1.67, -2.4);
    for (let i = 0; i < 4; i++)
      orb(
        "fruit-bowl-fruit",
        4.2 + Math.sin(i) * 0.24,
        1.77,
        -1.45 + Math.cos(i) * 0.18,
        0.25,
        i % 2 ? "coral" : "green",
      );
    box("washing-machine", 7.2, 1.12, 5.15, 1.15, 1.4, 1.15, "ceramic", true);
    const drum = cylinder("washer-window", 7.2, 1.14, 4.55, 0.76, 0.1, "dark");
    drum.rotation.x = Math.PI / 2;
    for (let i = 0; i < 3; i++)
      box(
        "folded-towel",
        7.2,
        1.85 + i * 0.09,
        5.1,
        0.8,
        0.08,
        0.62,
        i % 2 ? "fabric" : "paper",
      );
    cylinder("laundry-basket", 5.85, 0.78, 5.15, 0.8, 0.75, "oak");
    plant(-7.1, 0.4, 5.05, 0.65);
    box("garden-tools-shelf", -7.45, 2.6, 4.2, 0.55, 0.12, 2.4, "oak");
    for (let i = 0; i < 4; i++)
      cylinder("seed-pot", -7.4, 2.78, 3.4 + i * 0.5, 0.28, 0.3, "coral");
    picture(4.1, 3.3, 5.68, 2);
  } else {
    if (
      use !== "bus" &&
      use !== "dock" &&
      use !== "roof" &&
      use !== "playground" &&
      use !== "market"
    ) {
      for (const x of [-9.2, 9.2]) picture(x, 3.25, 8.85, 1.7);
      // Furnished edges leave the original two-metre central aisle intact.
      plant(10.35, 0, -7.3, 1.1);
      box("wall-clock-face", 9.2, 4.15, 8.81, 0.74, 0.74, 0.06, "paper");
      box("clock-hour-hand", 9.2, 4.24, 8.76, 0.035, 0.24, 0.02, "dark");
      box("clock-minute-hand", 9.34, 4.15, 8.76, 0.29, 0.035, 0.02, "dark");
      box("fire-extinguisher", 10.8, 1, -7.6, 0.24, 0.65, 0.24, "red");
    }
    if (use === "bank" || use === "lobby") {
      for (const x of use === "bank" ? [-6, 6] : [-6]) {
        deskObjects(x, 1.76, 2.5, 0.4);
        box(
          "service-payment-terminal",
          x + 1.5,
          1.92,
          1.96,
          0.36,
          0.35,
          0.36,
          "dark",
        );
        box(
          "payment-terminal-screen",
          x + 1.5,
          2.05,
          1.76,
          0.27,
          0.14,
          0.018,
          "blue",
        );
        for (let i = 0; i < 3; i++)
          box(
            "deposit-slip",
            x - 1.6,
            1.77 + i * 0.012,
            1.95 + i * 0.08,
            0.4,
            0.012,
            0.23,
            "paper",
          );
      }
      if (use === "bank") {
        box("bank-atm", 10.3, 1.25, -4.5, 0.85, 2.5, 1.6, "dark", true);
        box("atm-screen", 9.86, 1.82, -4.5, 0.028, 0.7, 0.95, "blue");
        box("atm-cash-slot", 9.83, 0.98, -4.5, 0.04, 0.08, 0.5, "brass");
        for (const z of [-2.5, -0.5])
          for (const x of [-7.6, -4.4])
            cylinder("queue-post", x, 0.7, z, 0.1, 1.4, "brass");
        for (const x of [-7.6, -4.4])
          box("queue-rope", x, 1.35, -1.5, 0.05, 0.05, 2, "coral");
        box("receipt-printer", 7.9, 1.95, 2.7, 0.6, 0.35, 0.45, "ceramic");
        box("printed-receipt", 7.9, 2.13, 2.49, 0.24, 0.02, 0.4, "paper");
      }
    } else if (use === "hub") {
      for (const x of [-6, 6]) for (const z of [-2, 4]) deskObjects(x, 1.39, z);
      for (const x of [-9.3, -7.8, 7.8, 9.3]) {
        box("filing-cabinet", x, 1.05, 8.25, 1.2, 2.1, 1, "blue", true);
        for (let y = 0.35; y < 2; y += 0.5) {
          box("filing-drawer-line", x, y, 7.73, 1.13, 0.02, 0.02, "dark");
          box("drawer-handle", x, y + 0.2, 7.7, 0.24, 0.04, 0.06, "brass");
        }
      }
    } else if (use === "apartments") {
      tv(-6, 2.6, -0.12, 2.7);
      box("remote-control", -6, 1.4, -5.1, 0.18, 0.06, 0.45, "dark");
      book(-6.7, 1.4, -5.2);
      mug(-5.25, 1.36, -5.1);
      hob(7.8, 1.36, 7.5);
      plate(5.25, 1.39, -3);
      plate(6.75, 1.39, -3);
      box("bedside-table", -8.25, 0.6, 5.5, 0.65, 1.2, 0.85, "oak", true);
      plant(-8.25, 1.2, 5.5, 0.55);
      book(-4, 0.13, 7.7);
      box("wardrobe", -8.6, 1.7, 8.15, 2.7, 3.4, 1.2, "oak", true);
      for (const x of [-8.85, -8.35])
        box("wardrobe-handle", x, 1.6, 7.5, 0.05, 0.6, 0.07, "brass");
    } else if (use === "library" || use === "bookshop") {
      for (const z of [-3, 3]) {
        book(5.4, 1.42, z);
        book(6.6, 1.45, z, "coral");
        mug(7.25, 1.36, z);
      }
      box(
        "library-return-trolley",
        -9.4,
        0.65,
        5.7,
        1.1,
        1.1,
        1.5,
        "oak",
        true,
      );
      for (let i = 0; i < 6; i++)
        book(-9.4, 1.25 + i * 0.1, 5.7, i % 2 ? "coral" : "blue");
    } else if (use === "cafe" || use === "market") {
      for (const x of [-6, 5.5])
        for (const z of [-3.5, 2]) {
          plate(x, 1.39, z);
          mug(x + 0.9, 1.36, z);
        }
      box("cafe-till", -3.4, 2.1, 6.8, 0.65, 0.55, 0.7, "dark");
      plate(4.7, 1.39, -2.92);
      box("diner-toast", 4.6, 1.45, -2.85, 0.2, 0.06, 0.22, "brass");
      box("card-reader", -3.5, 1.99, 6.05, 0.28, 0.2, 0.38, "blue");
      box("pastry-display-base", -5.3, 1.98, 6.6, 2.2, 0.1, 0.8, "ceramic");
      for (let i = 0; i < 5; i++) {
        cylinder(
          "paper-coffee-cup",
          -8 + i * 0.23,
          2.13,
          6.5,
          0.2,
          0.28,
          "paper",
        );
        orb("fresh-bread", -5.7 + i * 0.32, 2.16, 6.4, 0.3, "brass").scaling.z =
          1.5;
      }
    } else if (use === "clinic") {
      deskObjects(-6, 1.38, -3, 0.4);
      for (const z of [-2.5, 4]) {
        cylinder("sanitiser", 3.5, 1.62, z + 0.5, 0.15, 0.35, "blue");
        box("tissue-box", 3.6, 1.46, z + 0.2, 0.32, 0.17, 0.22, "paper");
      }
      book(-4.6, 1.39, -3);
    } else if (use === "school") {
      for (const x of [-7, -3.5, 3.5, 7])
        for (const z of [-3, 0.5, 4]) {
          book(x, 1.42, z);
          box("pencil-case", x + 0.6, 1.41, z, 0.4, 0.1, 0.15, "coral");
        }
      for (let i = 0; i < 5; i++)
        box(
          "school-backpack",
          -10,
          0.4,
          -5 + i * 1.1,
          0.35,
          0.7,
          0.6,
          i % 2 ? "blue" : "coral",
        );
    } else if (use === "science" || use === "workshop") {
      if (use === "science") {
        for (const [x, z] of [
          [-6, -3.2],
          [6, 2.8],
        ]) {
          box("sample-tray", x!, 1.43, z!, 0.8, 0.06, 0.4, "ceramic");
          cylinder("sample-beaker", x!, 1.55, z! + 0.12, 0.14, 0.2, "blue");
        }
      }
      for (const x of [-6, 6]) {
        book(x + 1.8, 1.44, use === "science" ? -2.5 : 0);
        for (let i = 0; i < 4; i++)
          cylinder(
            use === "science" ? "sample-vial" : "tool-pot",
            x - 1.5 + i * 0.4,
            1.6,
            use === "science" ? -2.5 : 0,
            0.15,
            0.35,
            i % 2 ? "blue" : "brass",
          );
      }
    } else if (use === "studios") {
      book(-4, 1.44, -1);
      mug(-7.8, 1.35, -1);
      box("music-stand", 7.5, 1, 1.5, 0.06, 2, 0.06, "dark");
      box("script-holder", 7.5, 2, 1.5, 0.9, 0.12, 0.7, "dark");
      box("recording-script", 7.5, 2.08, 1.5, 0.72, 0.02, 0.55, "paper");
    } else if (use === "roof" || use === "playground") {
      for (const x of [-7, 7]) {
        book(x, 1.4, 0);
        mug(x + 1, 1.35, 0);
      }
    }
  }

  for (const [material, meshes] of parts) {
    meshes.forEach((mesh) => mesh.computeWorldMatrix(true));
    const batch = Mesh.MergeMeshes(meshes, true, true)!;
    batch.name = `lived-in-batch-${material.name}`;
    batch.parent = root;
    batch.material = material;
    batch.isPickable = false;
    batch.receiveShadows = true;
  }
  root.metadata = { fixtures, staticBatches: parts.size, use };
  let powered = true,
    lastTV = -Infinity;
  const drawTV = (seconds: number, reducedMotion: boolean) => {
    if (
      !television ||
      (!reducedMotion && seconds - lastTV < 0.18) ||
      (reducedMotion && lastTV !== -Infinity)
    )
      return;
    lastTV = seconds;
    television.material.emissiveColor = powered
      ? Color3.White().scale(0.75)
      : Color3.FromHexString("#14222B");
    const ctx = television.texture?.getContext();
    if (!ctx) return;
    ctx.fillStyle = powered ? "#326A78" : "#111B22";
    ctx.fillRect(0, 0, 384, 216);
    if (powered) {
      ctx.fillStyle = "#A7C7C5";
      ctx.fillRect(0, 0, 384, 60);
      ctx.fillStyle = "#416C53";
      ctx.beginPath();
      ctx.moveTo(0, 60);
      ctx.lineTo(85, 16);
      ctx.lineTo(142, 63);
      ctx.lineTo(259, 23);
      ctx.lineTo(384, 67);
      ctx.fill();
      for (let i = 0; i < 5; i++) {
        const x = ((i * 80 + seconds * 8) % 440) - 30;
        ctx.fillStyle = i % 2 ? "#A9B98C" : "#D3B87D";
        ctx.save();
        ctx.translate(x, 104 + i * 15);
        ctx.scale(1, 0.47);
        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 16px sans-serif";
      ctx.fillText("RIVERGATE NATURE", 14, 26);
      ctx.fillStyle = "#152D36";
      ctx.fillRect(0, 188, 384, 28);
      ctx.fillStyle = "#E6EEE9";
      ctx.font = "12px sans-serif";
      ctx.fillText("LIFE ALONG THE RIVER", 14, 207);
    }
    television.texture?.update();
  };
  return {
    root,
    obstacles,
    fixtures,
    setPowered(value: boolean) {
      powered = value;
      lastTV = -Infinity;
      drawTV(0, true);
    },
    update(seconds: number, reducedMotion: boolean) {
      drawTV(seconds, reducedMotion);
      pots.forEach((steam, i) => {
        steam.setEnabled(powered);
        if (!reducedMotion) {
          steam.scaling.setAll(0.7 + ((seconds * 0.3 + i * 0.3) % 1));
          steam.visibility = 1 - ((seconds * 0.3 + i * 0.3) % 1);
        }
      });
    },
  };
}
