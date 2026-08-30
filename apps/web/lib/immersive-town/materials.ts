import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Scene } from "@babylonjs/core/scene";

export const TOWN_PALETTE = {
  bark: "#665444",
  bridge: "#B3ADA0",
  clay: "#936A55",
  cream: "#DCD5C5",
  flower: "#BBA262",
  grass: "#647358",
  grassDark: "#495C45",
  hedge: "#3C5142",
  lamp: "#F5D3A0",
  leaf: "#49644E",
  leafLight: "#6C7958",
  orchardRoof: "#795A4D",
  orchardWall: "#AE8C72",
  river: "#456E77",
  riverDeep: "#284A55",
  riverRoof: "#515E68",
  riverWall: "#B8BFBA",
  road: "#45494A",
  roadLine: "#D3CAB0",
  sky: "#BDC9CC",
  soil: "#665446",
  sunflowerRoof: "#71695B",
  sunflowerWall: "#C5B99F",
  white: "#DFDDD1",
} as const;

export type TownSurface =
  "brick" | "stone" | "slate" | "wood" | "grass" | "asphalt" | "fabric";
export const SURFACE_TEXTURE_SIZE = 128;
const SURFACE_CACHE = new WeakMap<Scene, Map<TownSurface, RawTexture>>();

/** Small deterministic material studies, generated once: no downloads or canvas. */
export function createSurfacePixels(kind: TownSurface): Uint8Array {
  const size = SURFACE_TEXTURE_SIZE;
  const pixels = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hash = ((x * 374761393) ^ (y * 668265263)) >>> 0;
      const grain =
        ((Math.imul(hash ^ (hash >>> 13), 1274126177) >>> 0) % 19) - 9;
      let value = 235 + grain;
      if (kind === "brick" || kind === "slate") {
        const course = Math.floor(y / 16);
        const joint = y % 16 < 1 || (x + (course % 2) * 16) % 32 < 1;
        const unit = Math.floor((x + (course % 2) * 16) / 32);
        value = joint
          ? kind === "brick"
            ? 188
            : 155
          : 226 + ((course * 11 + unit * 7) % 23) + grain * 0.45;
      } else if (kind === "wood") {
        const seam = x % 32 < 1 || (y + Math.floor(x / 32) * 37) % 128 < 1;
        value = seam
          ? 169
          : 229 + Math.sin(x * 1.4 + Math.sin(y * 0.1) * 0.7) * 9 + grain * 0.4;
      } else if (kind === "stone") {
        value =
          y % 32 < 1 || (x + (Math.floor(y / 32) % 2) * 32) % 64 < 1
            ? 190
            : 237 + grain * 0.7;
      } else if (kind === "grass") {
        value = 229 + grain * 1.7 + Math.sin(x * 0.24) * Math.cos(y * 0.17) * 8;
      } else if (kind === "fabric") {
        value = 235 + (x % 2 ? 5 : -5) + (y % 2 ? 3 : -3) + grain * 0.3;
      }
      const channel = Math.max(0, Math.min(255, Math.round(value)));
      pixels.fill(channel, (y * size + x) * 3, (y * size + x) * 3 + 3);
    }
  }
  return pixels;
}

export function applyTownSurface(
  scene: Scene,
  material: StandardMaterial,
  kind: TownSurface,
) {
  let cache = SURFACE_CACHE.get(scene);
  if (!cache) {
    cache = new Map();
    SURFACE_CACHE.set(scene, cache);
  }
  let texture = cache.get(kind);
  if (!texture) {
    texture = RawTexture.CreateRGBTexture(
      createSurfacePixels(kind),
      SURFACE_TEXTURE_SIZE,
      SURFACE_TEXTURE_SIZE,
      scene,
      true,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    texture.name = `rivergate-surface-${kind}`;
    texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.wrapV = Texture.WRAP_ADDRESSMODE;
    texture.uScale = kind === "grass" || kind === "asphalt" ? 12 : 2;
    texture.vScale = texture.uScale;
    texture.anisotropicFilteringLevel = 2;
    cache.set(kind, texture);
  }
  material.diffuseTexture = texture;
  material.specularColor = Color3.White().scale(
    kind === "slate" ? 0.09 : 0.025,
  );
  return material;
}

export type TownMaterials = Readonly<{
  bark: StandardMaterial;
  bridge: StandardMaterial;
  clay: StandardMaterial;
  cream: StandardMaterial;
  flower: StandardMaterial;
  grass: StandardMaterial;
  grassDark: StandardMaterial;
  hedge: StandardMaterial;
  lamp: StandardMaterial;
  leaf: StandardMaterial;
  leafLight: StandardMaterial;
  orchardRoof: StandardMaterial;
  orchardWall: StandardMaterial;
  river: StandardMaterial;
  riverBank: StandardMaterial;
  riverRoof: StandardMaterial;
  riverWall: StandardMaterial;
  road: StandardMaterial;
  roadLine: StandardMaterial;
  sky: StandardMaterial;
  soil: StandardMaterial;
  sunflowerRoof: StandardMaterial;
  sunflowerWall: StandardMaterial;
  white: StandardMaterial;
  window: StandardMaterial;
}>;

export function createTownMaterials(scene: Scene): TownMaterials {
  const make = (name: string, color: string, specularPower = 24) => {
    const material = new StandardMaterial(`town-material-${name}`, scene);
    material.diffuseColor = Color3.FromHexString(color);
    material.specularColor = Color3.White().scale(0.08);
    material.specularPower = specularPower;
    return material;
  };

  const river = make("river", TOWN_PALETTE.river, 96);
  river.alpha = 1;
  river.backFaceCulling = false;
  river.specularColor = Color3.FromHexString("#B2C1C4").scale(0.3);
  river.emissiveColor = Color3.FromHexString(TOWN_PALETTE.river).scale(0.025);

  const lamp = make("lamp", TOWN_PALETTE.lamp, 96);
  lamp.emissiveColor = Color3.FromHexString(TOWN_PALETTE.lamp).scale(0.72);

  const window = make("window", "#667D82", 72);
  window.emissiveColor = Color3.FromHexString("#DCC39C").scale(0.08);

  const sky = make("sky", TOWN_PALETTE.sky, 8);
  sky.disableLighting = true;
  sky.backFaceCulling = false;
  sky.fogEnabled = false;

  const materials: TownMaterials = {
    bark: make("bark", TOWN_PALETTE.bark),
    bridge: make("bridge", TOWN_PALETTE.bridge),
    clay: make("clay", TOWN_PALETTE.clay),
    cream: make("cream", TOWN_PALETTE.cream),
    flower: make("flower", TOWN_PALETTE.flower, 40),
    grass: make("grass", TOWN_PALETTE.grass),
    grassDark: make("grass-dark", TOWN_PALETTE.grassDark),
    hedge: make("hedge", TOWN_PALETTE.hedge),
    lamp,
    leaf: make("leaf", TOWN_PALETTE.leaf),
    leafLight: make("leaf-light", TOWN_PALETTE.leafLight),
    orchardRoof: make("orchard-roof", TOWN_PALETTE.orchardRoof),
    orchardWall: make("orchard-wall", TOWN_PALETTE.orchardWall),
    river,
    riverBank: make("river-bank", "#9D9B90"),
    riverRoof: make("river-roof", TOWN_PALETTE.riverRoof),
    riverWall: make("river-wall", TOWN_PALETTE.riverWall),
    road: make("road", TOWN_PALETTE.road),
    roadLine: make("road-line", TOWN_PALETTE.roadLine, 48),
    sky,
    soil: make("soil", TOWN_PALETTE.soil),
    sunflowerRoof: make("sunflower-roof", TOWN_PALETTE.sunflowerRoof),
    sunflowerWall: make("sunflower-wall", TOWN_PALETTE.sunflowerWall),
    white: make("white", TOWN_PALETTE.white, 36),
    window,
  };
  for (const key of ["bark"] as const)
    applyTownSurface(scene, materials[key], "wood");
  for (const key of [
    "bridge",
    "cream",
    "riverBank",
    "riverWall",
    "sunflowerWall",
  ] as const)
    applyTownSurface(scene, materials[key], "stone");
  for (const key of ["clay", "orchardWall"] as const)
    applyTownSurface(scene, materials[key], "brick");
  for (const key of ["orchardRoof", "riverRoof", "sunflowerRoof"] as const)
    applyTownSurface(scene, materials[key], "slate");
  for (const key of [
    "grass",
    "grassDark",
    "hedge",
    "leaf",
    "leafLight",
  ] as const)
    applyTownSurface(scene, materials[key], "grass");
  applyTownSurface(scene, materials.road, "asphalt");
  return materials;
}
