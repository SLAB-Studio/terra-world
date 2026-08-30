import type { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import type { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { TownMaterials } from "./materials";
import type { TownTimeOfDay } from "./types";
import { softenLightPool } from "./light-pool";

/** Presentation only: no simulation tick, power repair, camera reset or network call. */
export function createTimeOfDay(
  scene: Scene,
  ambient: HemisphericLight,
  sun: DirectionalLight,
  materials: TownMaterials,
  officeWindows: StandardMaterial,
  clouds: readonly TransformNode[],
) {
  const nightSky = new TransformNode("rivergate-night-sky", scene);
  const moonMaterial = new StandardMaterial("moonlight", scene);
  moonMaterial.disableLighting = true;
  moonMaterial.emissiveColor = Color3.FromHexString("#F7E5BB");
  moonMaterial.diffuseColor = Color3.Black();
  const moon = MeshBuilder.CreateSphere(
    "rivergate-moon",
    { diameter: 4.8, segments: 16 },
    scene,
  );
  moon.position.set(-45, 72, 82);
  moon.material = moonMaterial;
  moon.parent = nightSky;
  moon.isPickable = false;
  moon.applyFog = false;
  const stars: Mesh[] = [];
  for (let index = 0; index < 140; index++) {
    const azimuth = index * 2.399963;
    const height = 0.22 + ((index * 37) % 97) / 130;
    const radius = Math.sqrt(1 - height * height) * 165;
    const star = MeshBuilder.CreateSphere(
      `star-${index}`,
      { diameter: index % 9 === 0 ? 0.55 : 0.25, segments: 4 },
      scene,
    );
    star.position.set(
      Math.cos(azimuth) * radius,
      height * 165,
      Math.sin(azimuth) * radius,
    );
    star.material = moonMaterial;
    stars.push(star);
  }
  const starField = Mesh.MergeMeshes(stars, true, true);
  if (starField) {
    starField.name = "rivergate-stars";
    starField.parent = nightSky;
    starField.isPickable = false;
    starField.applyFog = false;
  }

  // Soft, layered light footprints are cheap enough for phones; only two actual
  // street point lights are retained, rather than adding a light per window.
  const pools = new TransformNode("streetlight-night-pools", scene);
  const poolMaterial = new StandardMaterial("streetlight-pool-material", scene);
  poolMaterial.disableLighting = true;
  poolMaterial.emissiveColor = Color3.FromHexString("#FFD382");
  poolMaterial.diffuseColor = Color3.Black();
  poolMaterial.alpha = 0.38;
  poolMaterial.disableDepthWrite = true;
  const poolParts: Mesh[] = [];
  scene.transformNodes
    .filter((node) => /^streetlight-\d+$/.test(node.name))
    .forEach((lamp) => {
      lamp.computeWorldMatrix(true);
      const position = lamp.getAbsolutePosition();
      {
        const disc = MeshBuilder.CreateDisc(
          `${lamp.name}-pool`,
          { radius: 4.5, tessellation: 32 },
          scene,
        );
        softenLightPool(disc);
        disc.rotation.x = Math.PI / 2;
        disc.position.set(position.x, position.y + 0.2, position.z);
        disc.material = poolMaterial;
        poolParts.push(disc);
      }
    });
  const mergedPools = Mesh.MergeMeshes(poolParts, true, true);
  if (mergedPools) {
    mergedPools.name = "streetlight-pools";
    mergedPools.parent = pools;
    mergedPools.isPickable = false;
    // MergeMeshes retains the vertex colours but not the alpha opt-in.
    mergedPools.hasVertexAlpha = true;
  }

  let current: TownTimeOfDay = "day";
  const day = {
    sky: scene.clearColor.clone(),
    fog: scene.fogColor.clone(),
    ambient: scene.ambientColor.clone(),
    sunColour: sun.diffuse.clone(),
    sunIntensity: sun.intensity,
    ambientColour: ambient.diffuse.clone(),
    ambientIntensity: ambient.intensity,
    ground: ambient.groundColor.clone(),
    window: materials.window.emissiveColor.clone(),
    offices: officeWindows.emissiveColor.clone(),
  };
  function setTimeOfDay(mode: TownTimeOfDay) {
    current = mode;
    const night = mode === "night";
    scene.metadata = { ...scene.metadata, timeOfDay: mode };
    scene.clearColor = night
      ? Color4.FromHexString("#141F2AFF")
      : day.sky.clone();
    scene.fogColor = night ? Color3.FromHexString("#1D2D37") : day.fog.clone();
    scene.ambientColor = night
      ? Color3.FromHexString("#40525A").scale(0.3)
      : day.ambient.clone();
    ambient.intensity = night ? 0.5 : day.ambientIntensity;
    ambient.diffuse = night
      ? Color3.FromHexString("#BAC7CA")
      : day.ambientColour.clone();
    ambient.groundColor = night
      ? Color3.FromHexString("#142438")
      : day.ground.clone();
    sun.intensity = night ? 0.32 : day.sunIntensity;
    sun.diffuse = night
      ? Color3.FromHexString("#ADBDC8")
      : day.sunColour.clone();
    materials.lamp.emissiveColor = night
      ? Color3.FromHexString("#FFD382").scale(1.2)
      : Color3.Black();
    materials.window.emissiveColor = night
      ? Color3.FromHexString("#EEC982").scale(0.8)
      : day.window.clone();
    officeWindows.emissiveColor = night
      ? Color3.FromHexString("#FFD78B").scale(0.85)
      : day.offices.clone();
    scene.lights
      .filter((light) => light.name.startsWith("streetlight-glow-"))
      .forEach((light) => {
        light.intensity = night ? 0.8 : 0;
      });
    nightSky.setEnabled(night);
    pools.setEnabled(night);
    clouds.forEach((cloud) => cloud.setEnabled(!night));
  }
  setTimeOfDay("day");
  return {
    setTimeOfDay,
    get current() {
      return current;
    },
  };
}
