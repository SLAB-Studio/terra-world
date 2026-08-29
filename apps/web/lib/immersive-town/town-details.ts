import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

import type { TownMaterials } from "./materials";
import { renderedRoadHeight, sampleRoadFrame } from "./road";

export type TownDetails = Readonly<{
  root: TransformNode;
  ambientActors: readonly TransformNode[];
  playgroundSpinners: readonly TransformNode[];
}>;

type HomeStyle = Readonly<{
  wall: TownMaterials["cream"];
  roof: TownMaterials["clay"];
  accent: TownMaterials["flower"];
}>;

export function createTownDetails(
  scene: Scene,
  materials: TownMaterials,
  shadows: ShadowGenerator,
): TownDetails {
  const root = new TransformNode("rivergate-town-details", scene);
  const ambientActors: TransformNode[] = [];
  const playgroundSpinners: TransformNode[] = [];

  const homeStyles: readonly HomeStyle[] = [
    {
      wall: materials.orchardWall,
      roof: materials.orchardRoof,
      accent: materials.clay,
    },
    {
      wall: materials.riverWall,
      roof: materials.riverRoof,
      accent: materials.river,
    },
    {
      wall: materials.sunflowerWall,
      roof: materials.sunflowerRoof,
      accent: materials.flower,
    },
  ];
  const neighborhoodHomes = [
    [-66, -39, 0.08],
    [-52, -43, -0.07],
    [-19, -45, 0.05],
    [29, -45, -0.05],
    [45, -42, 0.07],
    [62, -38, -0.09],
    [-51, 68, Math.PI - 0.04],
    [-32, 68, Math.PI + 0.06],
    [31, 68, Math.PI - 0.06],
    [50, 67, Math.PI + 0.05],
  ] as const;
  neighborhoodHomes.forEach(([x, z, rotation], index) =>
    createNeighborhoodHome(
      scene,
      root,
      shadows,
      materials,
      index,
      new Vector3(x, 0.75, z),
      rotation,
      homeStyles[index % homeStyles.length] ?? homeStyles[0]!,
    ),
  );

  createSchool(scene, root, materials, shadows);
  createClinic(scene, root, materials, shadows);
  createMarket(scene, root, materials, shadows);
  playgroundSpinners.push(
    createPlayground(scene, root, materials, shadows),
  );
  createRoadsideLife(scene, root, materials, shadows);
  createRiverWalk(scene, root, materials, shadows);

  for (const [index, x, z, shirt] of [
    [0, 30, 20, materials.flower],
    [1, 34, 22, materials.riverRoof],
    [2, 39, 18, materials.clay],
    [3, 48, 14, materials.leaf],
    [4, 53, 17, materials.flower],
    [5, -3, 34, materials.riverRoof],
    [6, -6, 39, materials.clay],
    [7, -48, -34, materials.leafLight],
    [8, 25, -39, materials.flower],
    [9, 0, 48, materials.riverRoof],
  ] as const) {
    ambientActors.push(
      createTownsperson(scene, root, shadows, materials, index, x, z, shirt),
    );
  }
  createDog(scene, root, shadows, materials, "market-dog", 50, 12, 0.8);
  createDog(scene, root, shadows, materials, "river-dog", -4, 44, -0.65);

  return { root, ambientActors, playgroundSpinners };
}

function createNeighborhoodHome(
  scene: Scene,
  parent: TransformNode,
  shadows: ShadowGenerator,
  materials: TownMaterials,
  index: number,
  position: Vector3,
  rotation: number,
  style: HomeStyle,
) {
  const home = new TransformNode(`neighborhood-home-${index}`, scene);
  home.position.copyFrom(position);
  home.rotation.y = rotation;
  home.parent = parent;

  const foundation = MeshBuilder.CreateBox(
    `neighborhood-home-${index}-foundation`,
    { width: 7.8, height: 0.45, depth: 6.7 },
    scene,
  );
  foundation.position.y = 0.28;
  foundation.material = materials.bridge;
  finishProp(foundation, home, shadows, true);

  const walls = MeshBuilder.CreateBox(
    `neighborhood-home-${index}-walls`,
    { width: 6.9, height: 3.5, depth: 5.9 },
    scene,
  );
  walls.position.y = 2.2;
  walls.material = style.wall;
  finishProp(walls, home, shadows, true);

  for (const [side, x, angle] of [
    [-1, -1.95, 0.57],
    [1, 1.95, -0.57],
  ] as const) {
    const roof = MeshBuilder.CreateBox(
      `neighborhood-home-${index}-roof-${side}`,
      { width: 4.7, height: 0.48, depth: 6.8 },
      scene,
    );
    roof.position.set(x, 4.42, 0);
    roof.rotation.z = angle;
    roof.material = style.roof;
    finishProp(roof, home, shadows);
  }

  const door = MeshBuilder.CreateBox(
    `neighborhood-home-${index}-door`,
    { width: 1.2, height: 2.1, depth: 0.18 },
    scene,
  );
  door.position.set(0, 1.55, -3.03);
  door.material = style.accent;
  finishProp(door, home, shadows);

  for (const side of [-1, 1]) {
    const window = MeshBuilder.CreateBox(
      `neighborhood-home-${index}-window-${side}`,
      { width: 1.25, height: 1.1, depth: 0.17 },
      scene,
    );
    window.position.set(side * 2.05, 2.5, -3.04);
    window.material = materials.window;
    finishProp(window, home, shadows);
  }

  const hedge = MeshBuilder.CreateBox(
    `neighborhood-home-${index}-hedge`,
    { width: 6.8, height: 0.85, depth: 0.8 },
    scene,
  );
  hedge.position.set(0, 0.78, 3.25);
  hedge.material = materials.hedge;
  finishProp(hedge, home, shadows);
}

function createSchool(
  scene: Scene,
  parent: TransformNode,
  materials: TownMaterials,
  shadows: ShadowGenerator,
) {
  const school = new TransformNode("rivergate-school", scene);
  school.position.set(39, 0.75, 26);
  school.rotation.y = -0.08;
  school.parent = parent;

  const building = MeshBuilder.CreateBox(
    "school-main-building",
    { width: 16, height: 5.2, depth: 9.5 },
    scene,
  );
  building.position.y = 3;
  building.material = materials.sunflowerWall;
  finishProp(building, school, shadows, true);

  const roof = MeshBuilder.CreateBox(
    "school-roof",
    { width: 17, height: 0.6, depth: 10.5 },
    scene,
  );
  roof.position.y = 5.9;
  roof.material = materials.riverRoof;
  finishProp(roof, school, shadows);

  const entrance = MeshBuilder.CreateBox(
    "school-entrance",
    { width: 4.2, height: 4.1, depth: 1.5 },
    scene,
  );
  entrance.position.set(0, 2.45, -5.35);
  entrance.material = materials.clay;
  finishProp(entrance, school, shadows);

  for (const x of [-5.4, -2.1, 2.1, 5.4]) {
    const window = MeshBuilder.CreateBox(
      `school-window-${x}`,
      { width: 2.25, height: 1.8, depth: 0.2 },
      scene,
    );
    window.position.set(x, 3.25, -4.86);
    window.material = materials.window;
    finishProp(window, school, shadows);
  }

  const clock = MeshBuilder.CreateCylinder(
    "school-clock",
    { height: 0.2, diameter: 2.1, tessellation: 24 },
    scene,
  );
  clock.position.set(0, 5.25, -4.9);
  clock.rotation.x = Math.PI / 2;
  clock.material = materials.white;
  finishProp(clock, school, shadows);

  const flagPole = MeshBuilder.CreateCylinder(
    "school-flag-pole",
    { height: 8, diameter: 0.18, tessellation: 10 },
    scene,
  );
  flagPole.position.set(-10, 4.1, -1.5);
  flagPole.material = materials.bark;
  finishProp(flagPole, school, shadows);
  const flag = MeshBuilder.CreateBox(
    "school-flag",
    { width: 2.6, height: 1.45, depth: 0.12 },
    scene,
  );
  flag.position.set(-8.65, 7.15, -1.5);
  flag.material = materials.flower;
  finishProp(flag, school, shadows);
}

function createClinic(
  scene: Scene,
  parent: TransformNode,
  materials: TownMaterials,
  shadows: ShadowGenerator,
) {
  const clinic = new TransformNode("rivergate-clinic", scene);
  clinic.position.set(-3.5, 0.75, 24);
  clinic.parent = parent;
  const building = MeshBuilder.CreateBox(
    "clinic-building",
    { width: 11, height: 4.6, depth: 8.2 },
    scene,
  );
  building.position.y = 2.7;
  building.material = materials.riverWall;
  finishProp(building, clinic, shadows, true);
  const roof = MeshBuilder.CreateBox(
    "clinic-roof",
    { width: 12, height: 0.55, depth: 9.2 },
    scene,
  );
  roof.position.y = 5.3;
  roof.material = materials.riverRoof;
  finishProp(roof, clinic, shadows);
  const door = MeshBuilder.CreateBox(
    "clinic-door",
    { width: 2.4, height: 3, depth: 0.2 },
    scene,
  );
  door.position.set(0, 2, -4.22);
  door.material = materials.window;
  finishProp(door, clinic, shadows);
  for (const [suffix, width, height] of [
    ["horizontal", 3.4, 0.7],
    ["vertical", 0.7, 3.4],
  ] as const) {
    const cross = MeshBuilder.CreateBox(
      `clinic-cross-${suffix}`,
      { width, height, depth: 0.28 },
      scene,
    );
    cross.position.set(3.45, 3.15, -4.25);
    cross.material = materials.clay;
    finishProp(cross, clinic, shadows);
  }
}

function createMarket(
  scene: Scene,
  parent: TransformNode,
  materials: TownMaterials,
  shadows: ShadowGenerator,
) {
  const market = new TransformNode("rivergate-market", scene);
  market.position.set(53, 0.75, 12);
  market.rotation.y = 0.18;
  market.parent = parent;
  for (const [index, x, color] of [
    [0, -5, materials.clay],
    [1, 0, materials.flower],
    [2, 5, materials.riverRoof],
  ] as const) {
    const counter = MeshBuilder.CreateBox(
      `market-counter-${index}`,
      { width: 4.2, height: 1.3, depth: 2.2 },
      scene,
    );
    counter.position.set(x, 1, 0);
    counter.material = materials.bridge;
    finishProp(counter, market, shadows);
    const canopy = MeshBuilder.CreateBox(
      `market-canopy-${index}`,
      { width: 4.8, height: 0.35, depth: 3.5 },
      scene,
    );
    canopy.position.set(x, 4.1, 0);
    canopy.material = color;
    finishProp(canopy, market, shadows);
    for (const side of [-1, 1]) {
      const post = MeshBuilder.CreateCylinder(
        `market-post-${index}-${side}`,
        { height: 3.2, diameter: 0.18, tessellation: 8 },
        scene,
      );
      post.position.set(x + side * 1.85, 2.5, 0);
      post.material = materials.bark;
      finishProp(post, market, shadows);
    }
    for (const fruitIndex of [-1, 0, 1]) {
      const fruit = MeshBuilder.CreateSphere(
        `market-fruit-${index}-${fruitIndex}`,
        { diameter: 0.55, segments: 8 },
        scene,
      );
      fruit.position.set(x + fruitIndex * 0.85, 1.9, -0.5);
      fruit.material = fruitIndex === 0 ? materials.clay : materials.leafLight;
      finishProp(fruit, market, shadows);
    }
  }
}

function createPlayground(
  scene: Scene,
  parent: TransformNode,
  materials: TownMaterials,
  shadows: ShadowGenerator,
) {
  const playground = new TransformNode("rivergate-playground", scene);
  playground.position.set(23, 0.75, 25);
  playground.parent = parent;
  const sand = MeshBuilder.CreateCylinder(
    "playground-sand",
    { height: 0.3, diameter: 14, tessellation: 28 },
    scene,
  );
  sand.position.y = 0.2;
  sand.material = materials.bridge;
  finishProp(sand, playground, shadows, true);

  const slide = MeshBuilder.CreateBox(
    "playground-slide",
    { width: 2.4, height: 0.32, depth: 7 },
    scene,
  );
  slide.position.set(-3.3, 2.1, 0.5);
  slide.rotation.x = -0.43;
  slide.material = materials.riverRoof;
  finishProp(slide, playground, shadows);
  const platform = MeshBuilder.CreateBox(
    "playground-platform",
    { width: 3.4, height: 0.4, depth: 3.4 },
    scene,
  );
  platform.position.set(-3.3, 3.55, 3.1);
  platform.material = materials.flower;
  finishProp(platform, playground, shadows);
  for (const [x, z] of [
    [-4.5, 2],
    [-2.1, 2],
    [-4.5, 4.2],
    [-2.1, 4.2],
  ] as const) {
    const leg = MeshBuilder.CreateCylinder(
      `playground-platform-leg-${x}-${z}`,
      { height: 3.2, diameter: 0.25, tessellation: 8 },
      scene,
    );
    leg.position.set(x, 1.85, z);
    leg.material = materials.bark;
    finishProp(leg, playground, shadows);
  }

  const carousel = new TransformNode("playground-carousel", scene);
  carousel.position.set(3.4, 0.6, -0.4);
  carousel.parent = playground;
  const carouselDeck = MeshBuilder.CreateCylinder(
    "playground-carousel-deck",
    { height: 0.45, diameter: 5, tessellation: 20 },
    scene,
  );
  carouselDeck.material = materials.clay;
  finishProp(carouselDeck, carousel, shadows);
  const carouselPole = MeshBuilder.CreateCylinder(
    "playground-carousel-pole",
    { height: 2.2, diameter: 0.28, tessellation: 10 },
    scene,
  );
  carouselPole.position.y = 1.1;
  carouselPole.material = materials.bark;
  finishProp(carouselPole, carousel, shadows);
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const rail = MeshBuilder.CreateBox(
      `playground-carousel-rail-${angle}`,
      { width: 0.2, height: 0.2, depth: 2.1 },
      scene,
    );
    rail.position.set(Math.sin(angle) * 1.1, 1.3, Math.cos(angle) * 1.1);
    rail.rotation.y = angle;
    rail.material = materials.white;
    finishProp(rail, carousel, shadows);
  }
  return carousel;
}

function createRoadsideLife(
  scene: Scene,
  parent: TransformNode,
  materials: TownMaterials,
  shadows: ShadowGenerator,
) {
  for (const [index, progress, side] of [
    [0, 0.12, -1],
    [1, 0.48, 1],
    [2, 0.81, -1],
  ] as const) {
    const frame = sampleRoadFrame(progress);
    const stop = new TransformNode(`bus-stop-${index}`, scene);
    stop.position.set(
      frame.center.x + frame.lateral.x * side * 9.1,
      renderedRoadHeight(frame.center.y),
      frame.center.z + frame.lateral.z * side * 9.1,
    );
    stop.rotation.y = Math.atan2(frame.tangent.x, frame.tangent.z);
    stop.parent = parent;
    const bench = MeshBuilder.CreateBox(
      `bus-stop-bench-${index}`,
      { width: 4.2, height: 0.55, depth: 1.1 },
      scene,
    );
    bench.position.set(0, 1.25, 0);
    bench.material = materials.bridge;
    finishProp(bench, stop, shadows);
    const roof = MeshBuilder.CreateBox(
      `bus-stop-roof-${index}`,
      { width: 5.4, height: 0.35, depth: 2.7 },
      scene,
    );
    roof.position.y = 4.5;
    roof.material = materials.riverRoof;
    finishProp(roof, stop, shadows);
    for (const x of [-2.2, 2.2]) {
      const post = MeshBuilder.CreateCylinder(
        `bus-stop-post-${index}-${x}`,
        { height: 4.2, diameter: 0.2, tessellation: 8 },
        scene,
      );
      post.position.set(x, 2.3, 0.75);
      post.material = materials.bark;
      finishProp(post, stop, shadows);
    }
  }

  for (const [index, progress] of [0.275, 0.69].entries()) {
    const frame = sampleRoadFrame(progress);
    for (const stripe of [-3.4, -1.7, 0, 1.7, 3.4]) {
      const crossing = MeshBuilder.CreateBox(
        `crosswalk-${index}-${stripe}`,
        { width: 0.75, height: 0.1, depth: 8.2 },
        scene,
      );
      crossing.position.set(
        frame.center.x + frame.tangent.x * stripe,
        renderedRoadHeight(frame.center.y) + 0.2,
        frame.center.z + frame.tangent.z * stripe,
      );
      crossing.rotation.y = Math.atan2(frame.lateral.x, frame.lateral.z);
      crossing.material = materials.white;
      finishProp(crossing, parent, shadows);
    }
  }

  for (const [index, x, z] of [
    [0, -61, -25],
    [1, 61, -25],
    [2, -38, 49],
    [3, 40, 48],
  ] as const) {
    const hydrant = MeshBuilder.CreateCylinder(
      `fire-hydrant-${index}`,
      { height: 1.45, diameter: 0.78, tessellation: 12 },
      scene,
    );
    hydrant.position.set(x, 1.45, z);
    hydrant.material = materials.clay;
    finishProp(hydrant, parent, shadows);
    const cap = MeshBuilder.CreateSphere(
      `fire-hydrant-cap-${index}`,
      { diameter: 0.86, segments: 10 },
      scene,
    );
    cap.position.set(x, 2.18, z);
    cap.scaling.y = 0.45;
    cap.material = materials.flower;
    finishProp(cap, parent, shadows);
  }
}

function createRiverWalk(
  scene: Scene,
  parent: TransformNode,
  materials: TownMaterials,
  shadows: ShadowGenerator,
) {
  for (const [index, x, z, rotation] of [
    [0, -2.5, -20, 0],
    [1, 21.5, -7, Math.PI],
    [2, -1.5, 16, 0],
    [3, 22, 34, Math.PI],
    [4, 0, 50, 0],
  ] as const) {
    const bench = new TransformNode(`river-bench-${index}`, scene);
    bench.position.set(x, 0.75, z);
    bench.rotation.y = rotation;
    bench.parent = parent;
    const seat = MeshBuilder.CreateBox(
      `river-bench-seat-${index}`,
      { width: 3.8, height: 0.35, depth: 1.05 },
      scene,
    );
    seat.position.y = 1.25;
    seat.material = materials.bridge;
    finishProp(seat, bench, shadows);
    const back = MeshBuilder.CreateBox(
      `river-bench-back-${index}`,
      { width: 3.8, height: 1.5, depth: 0.3 },
      scene,
    );
    back.position.set(0, 2.05, 0.45);
    back.material = materials.bark;
    finishProp(back, bench, shadows);
  }

  for (const [index, x, z, color] of [
    [0, -3, -13, materials.hedge],
    [1, 21, 9, materials.riverRoof],
    [2, -2, 28, materials.hedge],
    [3, 21, 44, materials.riverRoof],
  ] as const) {
    const bin = MeshBuilder.CreateBox(
      `river-recycle-bin-${index}`,
      { width: 1.4, height: 2.2, depth: 1.4 },
      scene,
    );
    bin.position.set(x, 1.85, z);
    bin.material = color;
    finishProp(bin, parent, shadows);
    const lid = MeshBuilder.CreateBox(
      `river-recycle-bin-lid-${index}`,
      { width: 1.6, height: 0.22, depth: 1.6 },
      scene,
    );
    lid.position.set(x, 3, z);
    lid.material = materials.road;
    finishProp(lid, parent, shadows);
  }
}

function createTownsperson(
  scene: Scene,
  parent: TransformNode,
  shadows: ShadowGenerator,
  materials: TownMaterials,
  index: number,
  x: number,
  z: number,
  shirt: TownMaterials["flower"],
) {
  const person = new TransformNode(`townsperson-${index}`, scene);
  person.position.set(x, 0.75, z);
  person.rotation.y = index * 0.73;
  person.parent = parent;
  const body = MeshBuilder.CreateCylinder(
    `townsperson-body-${index}`,
    { height: 1.9, diameterTop: 0.75, diameterBottom: 1.05, tessellation: 10 },
    scene,
  );
  body.position.y = 1.45;
  body.material = shirt;
  finishProp(body, person, shadows);
  const head = MeshBuilder.CreateSphere(
    `townsperson-head-${index}`,
    { diameter: 0.92, segments: 10 },
    scene,
  );
  head.position.y = 2.88;
  head.material = index % 2 === 0 ? materials.bridge : materials.clay;
  finishProp(head, person, shadows);
  for (const side of [-1, 1]) {
    const leg = MeshBuilder.CreateCylinder(
      `townsperson-leg-${index}-${side}`,
      { height: 1.1, diameter: 0.26, tessellation: 8 },
      scene,
    );
    leg.position.set(side * 0.25, 0.25, 0);
    leg.material = materials.road;
    finishProp(leg, person, shadows);
  }
  return person;
}

function createDog(
  scene: Scene,
  parent: TransformNode,
  shadows: ShadowGenerator,
  materials: TownMaterials,
  id: string,
  x: number,
  z: number,
  rotation: number,
) {
  const dog = new TransformNode(id, scene);
  dog.position.set(x, 0.75, z);
  dog.rotation.y = rotation;
  dog.parent = parent;
  const body = MeshBuilder.CreateBox(
    `${id}-body`,
    { width: 1.6, height: 0.8, depth: 0.72 },
    scene,
  );
  body.position.y = 0.8;
  body.material = materials.bark;
  finishProp(body, dog, shadows);
  const head = MeshBuilder.CreateSphere(
    `${id}-head`,
    { diameter: 0.82, segments: 9 },
    scene,
  );
  head.position.set(0, 1.2, -0.75);
  head.material = materials.clay;
  finishProp(head, dog, shadows);
  for (const side of [-1, 1]) {
    const leg = MeshBuilder.CreateCylinder(
      `${id}-leg-${side}`,
      { height: 0.75, diameter: 0.22, tessellation: 8 },
      scene,
    );
    leg.position.set(side * 0.45, 0.25, 0);
    leg.material = materials.bark;
    finishProp(leg, dog, shadows);
  }
}

function finishProp(
  mesh: ReturnType<typeof MeshBuilder.CreateBox>,
  parent: TransformNode,
  shadows: ShadowGenerator,
  receivesShadows = false,
) {
  mesh.parent = parent;
  mesh.isPickable = false;
  mesh.receiveShadows = receivesShadows;
  shadows.addShadowCaster(mesh);
}
