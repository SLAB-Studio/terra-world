import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import {
  createTownCharacter,
  type TownCharacterProfile,
} from "./characters-3d";
import type { TownMaterials } from "./materials";

/** Commercial buildings, not pretend homes: all existing homes remain playable. */
export const DOWNTOWN_BUILDINGS = [
  {
    id: "library",
    label: "CITY LIBRARY",
    x: -6.5,
    z: -15,
    height: 15,
    colour: "#BA795B",
  },
  {
    id: "science",
    label: "SCIENCE CENTRE",
    x: -6.5,
    z: -38,
    height: 27,
    colour: "#4D8295",
  },
  {
    id: "studios",
    label: "RIVER STUDIOS",
    x: -6.5,
    z: -50,
    height: 20,
    colour: "#6C8683",
  },
  {
    id: "hub",
    label: "CITY HUB",
    x: -6.5,
    z: -63,
    height: 31,
    colour: "#567597",
  },
  {
    id: "bookshop",
    label: "BOOKS & STORIES",
    x: -55,
    z: 10,
    height: 14,
    colour: "#C28D58",
  },
  {
    id: "arts",
    label: "ARTS CENTRE",
    x: -51,
    z: 23,
    height: 22,
    colour: "#7C829C",
  },
  {
    id: "cafe",
    label: "SUNSHINE CAFE",
    x: 64,
    z: -18,
    height: 13,
    colour: "#AC705D",
  },
  {
    id: "workshop",
    label: "MAKERS MARKET",
    x: 64,
    z: -29,
    height: 18,
    colour: "#57868B",
  },
] as const;

export function createMetropolis(
  scene: Scene,
  materials: TownMaterials,
  shadows: ShadowGenerator,
) {
  const root = new TransformNode("rivergate-downtown", scene);
  const litWindows = new StandardMaterial("downtown-lit-windows", scene);
  litWindows.diffuseColor = Color3.FromHexString("#87B6CB");
  litWindows.specularColor = Color3.FromHexString("#B8DCE5").scale(0.35);
  const sleepingWindows = new StandardMaterial("downtown-unlit-windows", scene);
  sleepingWindows.diffuseColor = Color3.FromHexString("#345367");
  sleepingWindows.specularColor = Color3.White().scale(0.3);
  const trim = new StandardMaterial("downtown-metal", scene);
  trim.diffuseColor = Color3.FromHexString("#374B59");
  trim.specularColor = Color3.White().scale(0.25);
  const pavement = new StandardMaterial("downtown-pavement", scene);
  pavement.diffuseColor = Color3.FromHexString("#C6C1AF");
  pavement.specularColor = Color3.Black();

  const box = (
    name: string,
    parent: TransformNode,
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    material: StandardMaterial,
    cast = false,
  ) => {
    const mesh = MeshBuilder.CreateBox(name, { width, height, depth }, scene);
    mesh.parent = parent;
    mesh.position.set(x, y, z);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    if (cast) shadows.addShadowCaster(mesh);
    return mesh;
  };

  DOWNTOWN_BUILDINGS.forEach((building, index) => {
    const block = new TransformNode(`downtown-${building.id}`, scene);
    block.parent = root;
    block.position.set(building.x, 0.75, building.z);
    // Riverfront shop doors face the pedestrian boulevard, not the canal.
    block.rotation.y = index < 4 ? Math.PI / 2 : index < 6 ? -Math.PI / 2 : 0;
    const facade = new StandardMaterial(
      `downtown-${building.id}-facade`,
      scene,
    );
    facade.diffuseColor = Color3.FromHexString(building.colour);
    facade.specularColor = Color3.White().scale(0.12);
    box(
      `downtown-${building.id}-foundation`,
      block,
      0,
      0.04,
      0,
      9.8,
      0.08,
      10,
      pavement,
    );
    const body = box(
      `downtown-${building.id}-body`,
      block,
      0,
      building.height / 2,
      0,
      8,
      building.height,
      8,
      facade,
      true,
    );
    body.metadata = { blocksWalking: true, buildingKind: "commercial" };
    box(
      `downtown-${building.id}-roof`,
      block,
      0,
      building.height + 0.18,
      0,
      8.5,
      0.36,
      8.5,
      trim,
      true,
    );
    // Setbacks, roof equipment and gardens give each silhouette a purpose.
    if (index % 2 === 1) {
      box(
        `downtown-${building.id}-penthouse`,
        block,
        0.6,
        building.height + 1.5,
        0.4,
        4.8,
        2.7,
        5,
        facade,
        true,
      );
      box(
        `downtown-${building.id}-crown`,
        block,
        0.6,
        building.height + 2.9,
        0.4,
        5.1,
        0.2,
        5.3,
        trim,
      );
    } else {
      box(
        `downtown-${building.id}-roof-garden`,
        block,
        0,
        building.height + 0.35,
        1.8,
        5.8,
        0.35,
        2.5,
        materials.hedge,
      );
      const solar = box(
        `downtown-${building.id}-solar`,
        block,
        0,
        building.height + 0.6,
        -1.5,
        5.5,
        0.15,
        2.2,
        sleepingWindows,
      );
      solar.rotation.x = -0.2;
    }
    const lit: Mesh[] = [],
      dark: Mesh[] = [],
      bands: Mesh[] = [];
    for (
      let floor = 0;
      floor < Math.floor((building.height - 3.5) / 2.8);
      floor++
    ) {
      const y = 4.5 + floor * 2.8;
      for (let side = 0; side < 4; side++) {
        for (let column = 0; column < 3; column++) {
          const across = -2.5 + column * 2.5;
          const warm = (floor * 7 + side * 3 + column + index) % 5 !== 0;
          const window = box(
            `office-window-${index}-${floor}-${side}-${column}`,
            block,
            side % 2 ? (side === 1 ? 4.03 : -4.03) : across,
            y,
            side % 2 ? across : side === 0 ? -4.03 : 4.03,
            side % 2 ? 0.08 : 1.65,
            1.5,
            side % 2 ? 1.65 : 0.08,
            warm ? litWindows : sleepingWindows,
          );
          (warm ? lit : dark).push(window);
        }
      }
      bands.push(
        box(
          `office-band-${index}-${floor}`,
          block,
          0,
          y + 1.15,
          0,
          8.15,
          0.13,
          8.15,
          trim,
        ),
      );
    }
    // Merge repeated geometry by material: hundreds of windows, only a few draws.
    for (const [suffix, parts] of [
      ["lit", lit],
      ["dark", dark],
      ["bands", bands],
    ] as const) {
      parts.forEach((mesh) => mesh.computeWorldMatrix(true));
      const merged = Mesh.MergeMeshes([...parts], true, true);
      if (merged) {
        merged.name = `downtown-${building.id}-${suffix}`;
        merged.isPickable = false;
      }
    }
    box(
      `shop-${building.id}-glass`,
      block,
      0,
      1.55,
      -4.08,
      6.8,
      2.5,
      0.12,
      litWindows,
    );
    box(
      `shop-${building.id}-door-frame`,
      block,
      0,
      1.45,
      -4.18,
      0.12,
      2.8,
      0.12,
      trim,
    );
    box(
      `shop-${building.id}-canopy`,
      block,
      0,
      3.1,
      -4.6,
      8.4,
      0.24,
      1.9,
      index % 2 ? materials.riverRoof : materials.orchardRoof,
      true,
    );
    const sign = box(
      `shop-${building.id}-sign`,
      block,
      0,
      3.65,
      -4.15,
      7.2,
      0.8,
      0.12,
      materials.cream,
    );
    if (typeof document !== "undefined") {
      const texture = new DynamicTexture(
        `shop-${building.id}-lettering`,
        { width: 768, height: 96 },
        scene,
        false,
      );
      texture.drawText(
        building.label,
        null,
        65,
        "bold 48px sans-serif",
        "#173747",
        "#FFF1CF",
        true,
      );
      const signMaterial = new StandardMaterial(
        `shop-${building.id}-sign-material`,
        scene,
      );
      signMaterial.diffuseTexture = texture;
      signMaterial.emissiveColor = Color3.White().scale(0.35);
      signMaterial.specularColor = Color3.Black();
      sign.material = signMaterial;
    }
  });

  box(
    "downtown-boulevard-foundation",
    root,
    -13.5,
    0.75,
    -36.5,
    2.6,
    0.08,
    59,
    pavement,
  );
  // Street furniture leaves the walking lanes and home approaches clear.
  for (const z of [-23, -33, -44, -56]) {
    box(
      `downtown-bench-${z}`,
      root,
      -10.4,
      1.28,
      z,
      0.8,
      0.25,
      2.6,
      materials.bark,
    );
    box(
      `downtown-bench-back-${z}`,
      root,
      -10,
      1.7,
      z,
      0.15,
      1,
      2.6,
      materials.bark,
    );
    for (const end of [-1, 1])
      box(
        `downtown-bench-leg-${z}-${end}`,
        root,
        -10.4,
        0.98,
        z + end,
        0.55,
        0.5,
        0.15,
        trim,
      );
    box(
      `downtown-planter-${z}`,
      root,
      -10.4,
      1.05,
      z + 2.4,
      1.1,
      0.55,
      1.1,
      materials.clay,
    );
    box(
      `downtown-shrub-${z}`,
      root,
      -10.4,
      1.5,
      z + 2.4,
      1.35,
      0.55,
      1.35,
      materials.hedge,
    );
  }
  const profiles: TownCharacterProfile[] = Array.from(
    { length: 12 },
    (_, index) => {
      const from = -62 + Math.floor(index / 2) * 8;
      const x = index % 2 ? -14.15 : -12.85;
      return {
        id: `downtown-resident-${index}`,
        age: "adult",
        activity: "walk",
        hair: (["coils", "bun", "short", "waves"] as const)[index % 4]!,
        skin: ["#6F3F2A", "#A9623D", "#DBA580", "#855339"][index % 4]!,
        hairColor: "#30241F",
        shirt: ["#D8A444", "#4A92C2", "#C27569", "#5C9277"][index % 4]!,
        bottoms: "#324B62",
        shoes: "#403631",
        x,
        z: from,
        rotation: 0,
        phase: index * 1.1,
        walkingRoute: {
          id: `downtown-stroll-${index}`,
          speed: 0.8 + (index % 3) * 0.08,
          drawPath: false,
          points: [
            { x, y: 0.79, z: from },
            { x, y: 0.79, z: from + 6 },
          ],
        },
      };
    },
  );
  return {
    root,
    litWindows,
    ambientActors: profiles.map((profile) =>
      createTownCharacter(scene, root, shadows, profile),
    ),
  };
}
