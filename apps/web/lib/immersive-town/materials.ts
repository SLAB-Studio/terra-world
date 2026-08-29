import { Color3, Scene, StandardMaterial } from "@babylonjs/core";

export const TOWN_PALETTE = {
  bark: "#6B452B",
  bridge: "#D7B579",
  clay: "#B9624F",
  cream: "#FFF1CF",
  flower: "#F6C443",
  grass: "#6FAE65",
  grassDark: "#3F774C",
  hedge: "#2E6E47",
  lamp: "#FFD75B",
  leaf: "#4F965B",
  leafLight: "#79BC62",
  orchardRoof: "#D86B55",
  orchardWall: "#F4D8B2",
  river: "#2F9ED6",
  riverDeep: "#176A98",
  riverRoof: "#4787B7",
  riverWall: "#D9EEF0",
  road: "#46545A",
  roadLine: "#F6E6A7",
  sky: "#B9DCF0",
  soil: "#805B3E",
  sunflowerRoof: "#D99B2B",
  sunflowerWall: "#F8E3A4",
  white: "#FFF9E8",
} as const;

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
  river.specularColor = Color3.White().scale(0.46);
  river.emissiveColor = Color3.FromHexString(TOWN_PALETTE.river).scale(
    0.18,
  );

  const lamp = make("lamp", TOWN_PALETTE.lamp, 96);
  lamp.emissiveColor = Color3.FromHexString(TOWN_PALETTE.lamp).scale(0.72);

  const window = make("window", "#9FD5E5", 72);
  window.emissiveColor = Color3.FromHexString("#FCE7A4").scale(0.24);

  const sky = make("sky", TOWN_PALETTE.sky, 8);
  sky.disableLighting = true;
  sky.backFaceCulling = false;
  sky.fogEnabled = false;

  return {
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
    riverBank: make("river-bank", "#C3A46E"),
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
}
