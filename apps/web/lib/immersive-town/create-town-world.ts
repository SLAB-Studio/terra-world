import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import type { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";

import { createTownAnimationController } from "./animation";
import { cameraPoseForPreset } from "./camera";
import { createTownCompounds } from "./compounds";
import { createTownEnvironment } from "./environment";
import { createTownMaterials, TOWN_PALETTE } from "./materials";
import { createTownDetails } from "./town-details";
import { createMetropolis } from "./metropolis";
import { createTimeOfDay } from "./time-of-day";
import { registerTownVenues } from "./venues";
import { createCityConversations } from "./conversations-3d";
import { upgradeCityTrees } from "./city-models";
import { addBuildingStreetDetail } from "./streetscape";
import type {
  CreateTownWorldOptions,
  ImmersiveTownWorld,
  TownHouseMetadata,
  TownQuality,
} from "./types";

/**
 * Builds an isolated Rivergate scene. The caller owns the Babylon Engine; this
 * module owns and disposes the Scene, camera, observers, lights, and meshes.
 */
export function createImmersiveTownWorld(
  engine: Engine,
  options: CreateTownWorldOptions = {},
): ImmersiveTownWorld {
  const scene = new Scene(engine);
  scene.clearColor = Color4.FromHexString(`${TOWN_PALETTE.sky}FF`);
  scene.ambientColor = Color3.FromHexString("#DCEED1").scale(0.28);
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogColor = Color3.FromHexString(TOWN_PALETTE.sky);
  scene.fogStart = 115;
  scene.fogEnd = 230;
  scene.imageProcessingConfiguration.contrast = 1.08;
  scene.imageProcessingConfiguration.exposure = 0.98;

  const welcomePose = cameraPoseForPreset(
    "welcome",
    options.cameraTarget ?? undefined,
  );
  const target = new Vector3(
    welcomePose.target.x,
    welcomePose.target.y,
    welcomePose.target.z,
  );
  const camera = new ArcRotateCamera(
    "rivergate-camera",
    welcomePose.alpha,
    welcomePose.beta,
    welcomePose.radius,
    target,
    scene,
  );
  camera.lowerRadiusLimit = 56;
  camera.upperRadiusLimit = 132;
  camera.lowerBetaLimit = 0.64;
  camera.upperBetaLimit = 1.34;
  camera.wheelPrecision = 48;
  camera.panningSensibility = 0;
  camera.minZ = 0.2;
  camera.maxZ = 320;
  camera.inertia = 0.72;

  const canvas = engine.getRenderingCanvas();
  if (options.attachCameraControls !== false && canvas !== null) {
    camera.attachControl(canvas, true);
  }

  const ambient = new HemisphericLight(
    "rivergate-ambient-light",
    new Vector3(0.2, 1, -0.1),
    scene,
  );
  ambient.intensity = 0.56;
  ambient.diffuse = Color3.FromHexString("#FFF5D6");
  ambient.groundColor = Color3.FromHexString("#315A46");
  ambient.specular = Color3.FromHexString("#D9F2ED").scale(0.36);

  const sun = new DirectionalLight(
    "rivergate-sun",
    new Vector3(-0.62, -1, 0.42),
    scene,
  );
  sun.position.set(54, 82, -48);
  sun.intensity = 1.18;
  sun.diffuse = Color3.FromHexString("#FFF0C2");
  sun.specular = Color3.FromHexString("#FFF9E8").scale(0.58);
  sun.autoCalcShadowZBounds = true;

  // Keep one bounded shadow allocation across quality changes. Performance
  // mode skips its render pass entirely; scene content and picking stay intact.
  const shadows = new ShadowGenerator(1024, sun);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
  shadows.bias = 0.0008;
  shadows.normalBias = 0.024;
  const shadowMap = shadows.getShadowMap();
  if (shadowMap) shadowMap.refreshRate = 2;
  let renderQuality: TownQuality = options.quality ?? "medium";
  scene.shadowsEnabled = renderQuality !== "low";

  const materials = createTownMaterials(scene);
  const environment = createTownEnvironment(scene, materials, shadows);
  const compoundWorld = createTownCompounds(scene, materials, shadows);
  const details = createTownDetails(scene, materials, shadows);
  const metropolis = createMetropolis(scene, materials, shadows);
  addBuildingStreetDetail(scene, materials);
  const disposeTreeModels = upgradeCityTrees(scene, shadows);
  const daylight = createTimeOfDay(
    scene,
    ambient,
    sun,
    materials,
    metropolis.litWindows,
    environment.cloudRoots,
  );
  daylight.setTimeOfDay("night");
  const houses = [
    ...compoundWorld.houses,
    ...details.houses,
    ...environment.houses,
  ];
  const conversations = createCityConversations(scene, [
    ...details.ambientActors,
    ...metropolis.ambientActors,
  ]);
  const animation = createTownAnimationController(
    scene,
    {
      treeCanopies: environment.treeCanopies,
      gardenNodes: compoundWorld.gardenNodes,
      cloudRoots: environment.cloudRoots,
      lampBulbs: environment.lampBulbs,
      riverMaterial: materials.river,
      ambientActors: [...details.ambientActors, ...metropolis.ambientActors],
      playgroundSpinners: details.playgroundSpinners,
      conversations,
    },
    options.reducedMotion ?? false,
  );

  const housesByMeshId = indexHouseMeshes(houses);
  const destinations = registerTownVenues(scene);
  const housesById = new Map(houses.map((house) => [house.id, house] as const));
  scene.metadata = {
    ...(typeof scene.metadata === "object" && scene.metadata !== null
      ? scene.metadata
      : {}),
    kind: "terra-immersive-town",
    houseCount: houses.length,
    compoundCount: compoundWorld.compounds.length,
  };

  let disposed = false;
  return {
    engine,
    scene,
    camera,
    compounds: compoundWorld.compounds,
    houses,
    venues: destinations.venues,
    getVenueFromMesh: destinations.getVenueFromMesh,
    animation,
    conversations,
    setRenderQuality(quality) {
      if (disposed || quality === renderQuality) return;
      renderQuality = quality;
      scene.shadowsEnabled = quality !== "low";
      shadowMap?.resetRefreshCounter();
    },
    get timeOfDay() {
      return daylight.current;
    },
    setTimeOfDay(mode) {
      if (!disposed) {
        daylight.setTimeOfDay(mode);
        shadowMap?.resetRefreshCounter();
      }
    },
    getHouseFromMesh(mesh) {
      if (mesh === null) return null;
      const indexedHouse = housesByMeshId.get(mesh.uniqueId);
      if (indexedHouse !== undefined) return indexedHouse;
      const metadata =
        typeof mesh.metadata === "object" && mesh.metadata !== null
          ? (mesh.metadata as Record<string, unknown>)
          : null;
      const houseId = metadata?.houseId;
      return typeof houseId === "string"
        ? (housesById.get(houseId) ?? null)
        : null;
    },
    render() {
      if (!disposed) scene.render();
    },
    resize() {
      if (!disposed) engine.resize();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      camera.detachControl();
      animation.dispose();
      conversations.dispose();
      disposeTreeModels();
      scene.dispose();
    },
  };
}

function indexHouseMeshes(houses: readonly TownHouseMetadata[]) {
  const byMeshId = new Map<number, TownHouseMetadata>();
  houses.forEach((house) => {
    house.meshes.forEach((mesh) => byMeshId.set(mesh.uniqueId, house));
  });
  return byMeshId;
}
