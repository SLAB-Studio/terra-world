import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import "@babylonjs/core/Meshes/instancedMesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

import type { TownMaterials } from "./materials";
import { neighborhoodHomeProfile } from "./neighborhood-home-stories";
import type { TownHouseMetadata } from "./types";

type SecondaryHomeStyleId = "orchard" | "river" | "sunflower";

export type SecondaryHomePlacement = Readonly<{
  id: string;
  x: number;
  z: number;
  rotation: number;
  scale: number;
  style: SecondaryHomeStyleId;
}>;

/**
 * Static, non-playable homes around Rivergate's perimeter. They make the town
 * feel established from the welcome camera without competing with the three
 * large interactive compounds in the centre.
 */
export const SECONDARY_HOME_LAYOUT: readonly SecondaryHomePlacement[] = [
  {
    id: "south-west-1",
    x: -70,
    z: -54,
    rotation: 0.08,
    scale: 0.92,
    style: "river",
  },
  {
    id: "south-west-2",
    x: -57,
    z: -58,
    rotation: -0.06,
    scale: 0.86,
    style: "orchard",
  },
  {
    id: "south-west-3",
    x: -44,
    z: -55,
    rotation: 0.04,
    scale: 0.9,
    style: "sunflower",
  },
  {
    id: "south-west-4",
    x: -31,
    z: -59,
    rotation: -0.08,
    scale: 0.84,
    style: "river",
  },
  {
    id: "south-west-5",
    x: -18,
    z: -56,
    rotation: 0.05,
    scale: 0.88,
    style: "orchard",
  },
  {
    id: "south-east-1",
    x: 28,
    z: -58,
    rotation: -0.05,
    scale: 0.88,
    style: "sunflower",
  },
  {
    id: "south-east-2",
    x: 41,
    z: -55,
    rotation: 0.06,
    scale: 0.84,
    style: "river",
  },
  {
    id: "south-east-3",
    x: 54,
    z: -59,
    rotation: -0.04,
    scale: 0.9,
    style: "orchard",
  },
  {
    id: "south-east-4",
    x: 67,
    z: -54,
    rotation: 0.08,
    scale: 0.92,
    style: "sunflower",
  },
  {
    id: "north-west-infill",
    x: -65,
    z: 64,
    rotation: Math.PI - 0.05,
    scale: 0.84,
    style: "sunflower",
  },
  {
    id: "north-centre-west",
    x: -17,
    z: 68,
    rotation: Math.PI + 0.04,
    scale: 0.86,
    style: "river",
  },
  {
    id: "north-centre-east",
    x: 16,
    z: 68,
    rotation: Math.PI - 0.04,
    scale: 0.86,
    style: "orchard",
  },
  {
    id: "north-east-infill",
    x: 65,
    z: 63,
    rotation: Math.PI + 0.05,
    scale: 0.84,
    style: "river",
  },
] as const;

export type TownDistricts = Readonly<{
  root: TransformNode;
  houses: readonly TownHouseMetadata[];
  buildingCount: number;
  streetFurnitureCount: number;
  treeCanopies: readonly TransformNode[];
}>;

type HomeStyle = Readonly<{
  wall: StandardMaterial;
  roof: StandardMaterial;
  accent: StandardMaterial;
}>;

export function createTownDistricts(
  scene: Scene,
  materials: TownMaterials,
  shadows: ShadowGenerator,
): TownDistricts {
  const root = new TransformNode("rivergate-established-districts", scene);
  const styles: Readonly<Record<SecondaryHomeStyleId, HomeStyle>> = {
    orchard: {
      wall: materials.orchardWall,
      roof: materials.orchardRoof,
      accent: materials.clay,
    },
    river: {
      wall: materials.riverWall,
      roof: materials.riverRoof,
      accent: materials.river,
    },
    sunflower: {
      wall: materials.sunflowerWall,
      roof: materials.sunflowerRoof,
      accent: materials.flower,
    },
  };

  const houses = createInstancedHomes(scene, root, materials, shadows, styles);
  houses.push(
    createApartment(
      scene,
      root,
      materials,
      shadows,
      "west",
      -72,
      45,
      0.08,
      styles.orchard,
    ),
  );
  houses.push(
    createApartment(
      scene,
      root,
      materials,
      shadows,
      "east",
      72,
      43,
      -0.08,
      styles.river,
    ),
  );

  const treeCanopies = createDistrictTrees(scene, root, materials, shadows);
  createRiverPromenade(scene, root, materials, shadows);
  const streetFurnitureCount = createCivicContext(
    scene,
    root,
    materials,
    shadows,
  );

  return {
    root,
    houses,
    buildingCount: SECONDARY_HOME_LAYOUT.length + 2,
    streetFurnitureCount,
    treeCanopies,
  };
}

function createInstancedHomes(
  scene: Scene,
  parent: TransformNode,
  materials: TownMaterials,
  shadows: ShadowGenerator,
  styles: Readonly<Record<SecondaryHomeStyleId, HomeStyle>>,
): TownHouseMetadata[] {
  const houses: TownHouseMetadata[] = [];
  for (const styleId of ["orchard", "river", "sunflower"] as const) {
    const placements = SECONDARY_HOME_LAYOUT.filter(
      (placement) => placement.style === styleId,
    );
    const first = placements[0];
    if (first === undefined) continue;

    const sourceRoot = createHomeRoot(scene, parent, first);
    const sources = createHomeParts(
      scene,
      sourceRoot,
      materials,
      shadows,
      `district-home-${styleId}-source`,
      styles[styleId],
    );
    houses.push(
      registerInteractiveHome(
        first,
        sourceRoot,
        sources,
        sources[1] ?? sources[0]!,
      ),
    );

    placements.slice(1).forEach((placement) => {
      const instanceRoot = createHomeRoot(scene, parent, placement);
      const instances = sources.map((source, partIndex) => {
        const instance = source.createInstance(
          `district-home-${placement.id}-part-${partIndex}`,
        );
        instance.parent = instanceRoot;
        instance.receiveShadows = source.receiveShadows;
        if (partIndex <= 3) shadows.addShadowCaster(instance);
        return instance;
      });
      houses.push(
        registerInteractiveHome(
          placement,
          instanceRoot,
          instances,
          instances[1] ?? instances[0]!,
        ),
      );
    });
  }
  return houses;
}

function registerInteractiveHome(
  placement: SecondaryHomePlacement,
  root: TransformNode,
  meshes: readonly AbstractMesh[],
  pickMesh: AbstractMesh,
): TownHouseMetadata {
  const id = `district-home-${placement.id}`;
  const profile = neighborhoodHomeProfile(id);
  root.computeWorldMatrix(true);
  meshes.forEach((mesh) => {
    mesh.isPickable = true;
    mesh.metadata = {
      ...(typeof mesh.metadata === "object" && mesh.metadata !== null
        ? mesh.metadata
        : {}),
      kind: "terra-house",
      houseId: id,
      compoundId: "rivergate-neighborhood",
      displayName: profile.displayName,
    };
  });
  return {
    id,
    compoundId: "rivergate-neighborhood",
    displayName: profile.displayName,
    root,
    pickMesh,
    meshes,
    worldPosition: root.getAbsolutePosition().clone(),
  };
}

function createHomeRoot(
  scene: Scene,
  parent: TransformNode,
  placement: SecondaryHomePlacement,
) {
  const root = new TransformNode(`district-home-${placement.id}`, scene);
  root.position.set(placement.x, 0.75, placement.z);
  root.rotation.y = placement.rotation;
  root.scaling.setAll(placement.scale);
  root.parent = parent;
  return root;
}

function createHomeParts(
  scene: Scene,
  parent: TransformNode,
  materials: TownMaterials,
  shadows: ShadowGenerator,
  id: string,
  style: HomeStyle,
) {
  const parts: Mesh[] = [];
  const add = (mesh: Mesh, castShadow = false, receiveShadows = false) => {
    mesh.parent = parent;
    mesh.isPickable = false;
    mesh.receiveShadows = receiveShadows;
    if (castShadow) shadows.addShadowCaster(mesh);
    parts.push(mesh);
  };

  const foundation = MeshBuilder.CreateBox(
    `${id}-foundation`,
    { width: 8.4, height: 0.45, depth: 7 },
    scene,
  );
  foundation.position.y = 0.3;
  foundation.material = materials.bridge;
  add(foundation, true, true);

  const walls = MeshBuilder.CreateBox(
    `${id}-walls`,
    { width: 7.5, height: 3.7, depth: 6.1 },
    scene,
  );
  walls.position.y = 2.35;
  walls.material = style.wall;
  add(walls, true, true);

  for (const [side, x, angle] of [
    [-1, -2.15, 0.56],
    [1, 2.15, -0.56],
  ] as const) {
    const roof = MeshBuilder.CreateBox(
      `${id}-roof-${side}`,
      { width: 5, height: 0.5, depth: 7.1 },
      scene,
    );
    roof.position.set(x, 4.7, 0);
    roof.rotation.z = angle;
    roof.material = style.roof;
    add(roof, true);
  }

  const door = MeshBuilder.CreateBox(
    `${id}-door`,
    { width: 1.25, height: 2.2, depth: 0.18 },
    scene,
  );
  door.position.set(0, 1.55, -3.14);
  door.material = style.accent;
  add(door);

  for (const side of [-1, 1]) {
    const window = MeshBuilder.CreateBox(
      `${id}-window-${side}`,
      { width: 1.35, height: 1.2, depth: 0.16 },
      scene,
    );
    window.position.set(side * 2.2, 2.55, -3.15);
    window.material = materials.window;
    add(window);
  }

  return parts;
}

function createApartment(
  scene: Scene,
  parent: TransformNode,
  materials: TownMaterials,
  shadows: ShadowGenerator,
  id: string,
  x: number,
  z: number,
  rotation: number,
  style: HomeStyle,
): TownHouseMetadata {
  const houseId = `district-apartments-${id}`;
  const profile = neighborhoodHomeProfile(houseId);
  const root = new TransformNode(houseId, scene);
  root.position.set(x, 0.75, z);
  root.rotation.y = rotation;
  root.parent = parent;

  const base = MeshBuilder.CreateBox(
    `district-apartments-${id}-base`,
    { width: 12.5, height: 0.55, depth: 8.8 },
    scene,
  );
  base.position.y = 0.32;
  base.material = materials.bridge;
  finishStatic(base, root, shadows, true, true);

  const building = MeshBuilder.CreateBox(
    `district-apartments-${id}-building`,
    { width: 11.5, height: 8.4, depth: 7.8 },
    scene,
  );
  building.position.y = 4.75;
  building.material = style.wall;
  finishStatic(building, root, shadows, true, true);

  const frontDoor = MeshBuilder.CreateBox(
    `${houseId}-door`,
    { width: 2.3, height: 2.9, depth: 0.18 },
    scene,
  );
  frontDoor.position.set(0, 2, -4.02);
  frontDoor.material = materials.window;
  finishStatic(frontDoor, root, shadows, true);

  const roof = MeshBuilder.CreateBox(
    `district-apartments-${id}-roof`,
    { width: 12.3, height: 0.6, depth: 8.6 },
    scene,
  );
  roof.position.y = 9.2;
  roof.material = style.roof;
  finishStatic(roof, root, shadows, true);

  for (const floor of [2.7, 5.4, 8.05]) {
    for (const column of [-3.5, 0, 3.5]) {
      const window = MeshBuilder.CreateBox(
        `district-apartments-${id}-window-${floor}-${column}`,
        { width: 1.7, height: 1.35, depth: 0.18 },
        scene,
      );
      window.position.set(column, floor, -4.02);
      window.material = materials.window;
      finishStatic(window, root, shadows);
    }
  }

  for (const floor of [3.65, 6.35]) {
    const balcony = MeshBuilder.CreateBox(
      `district-apartments-${id}-balcony-${floor}`,
      { width: 4.3, height: 0.28, depth: 1.35 },
      scene,
    );
    balcony.position.set(0, floor, -4.45);
    balcony.material = materials.bridge;
    finishStatic(balcony, root, shadows, true);
  }

  root.computeWorldMatrix(true);
  const meshes = root.getChildMeshes();
  meshes.forEach((mesh) => {
    mesh.isPickable = true;
    mesh.metadata = {
      ...(typeof mesh.metadata === "object" && mesh.metadata !== null
        ? mesh.metadata
        : {}),
      kind: "terra-house",
      houseId,
      compoundId: "rivergate-neighborhood",
      displayName: profile.displayName,
    };
  });
  building.metadata = {
    ...building.metadata,
    interactionRole: "house-pick-surface",
  };
  return {
    id: houseId,
    compoundId: "rivergate-neighborhood",
    displayName: profile.displayName,
    root,
    pickMesh: building,
    meshes,
    worldPosition: root.getAbsolutePosition().clone(),
  };
}

function createDistrictTrees(
  scene: Scene,
  parent: TransformNode,
  materials: TownMaterials,
  shadows: ShadowGenerator,
) {
  const canopies: TransformNode[] = [];
  for (const [index, x, z, scale] of [
    [0, -64, -45, 0.72],
    [1, -50, -48, 0.66],
    [2, -37, -46, 0.74],
    [3, -24, -48, 0.68],
    [4, 35, -47, 0.7],
    [5, 48, -48, 0.65],
    [6, 61, -45, 0.72],
  ] as const) {
    const tree = new TransformNode(`district-tree-${index}`, scene);
    tree.position.set(x, 0.75, z);
    tree.scaling.setAll(scale);
    tree.parent = parent;

    const trunk = MeshBuilder.CreateCylinder(
      `district-tree-${index}-trunk`,
      { height: 4.2, diameterTop: 0.62, diameterBottom: 0.94, tessellation: 8 },
      scene,
    );
    trunk.position.y = 2.1;
    trunk.material = materials.bark;
    finishStatic(trunk, tree, shadows, true);

    const canopy = new TransformNode(`district-tree-${index}-canopy`, scene);
    canopy.position.y = 5;
    canopy.parent = tree;
    for (const [lob, px, py, diameter, material] of [
      [0, -0.75, 0, 3.5, materials.leaf],
      [1, 0.75, 0.08, 3.3, materials.leafLight],
      [2, 0, 1, 3.6, materials.leaf],
    ] as const) {
      const sphere = MeshBuilder.CreateSphere(
        `district-tree-${index}-canopy-${lob}`,
        { diameter, segments: 8 },
        scene,
      );
      sphere.position.set(px, py, 0);
      sphere.scaling.y = 0.82;
      sphere.material = material;
      finishStatic(sphere, canopy, shadows, true);
    }
    canopies.push(canopy);
  }
  return canopies;
}

function createRiverPromenade(
  scene: Scene,
  parent: TransformNode,
  materials: TownMaterials,
  shadows: ShadowGenerator,
) {
  const sampleCount = 36;
  for (const side of [-1, 1]) {
    const inner: Vector3[] = [];
    const outer: Vector3[] = [];
    for (let index = 0; index <= sampleCount; index += 1) {
      const t = index / sampleCount;
      const previous = riverPoint(Math.max(0, t - 0.01));
      const next = riverPoint(Math.min(1, t + 0.01));
      const tangent = next.subtract(previous).normalize();
      const lateral = new Vector3(-tangent.z, 0, tangent.x);
      const centre = riverPoint(t).add(lateral.scale(side * 8.35));
      inner.push(centre.add(lateral.scale(-1.05)).add(new Vector3(0, 1.07, 0)));
      outer.push(centre.add(lateral.scale(1.05)).add(new Vector3(0, 1.07, 0)));
    }
    const path = MeshBuilder.CreateRibbon(
      `river-promenade-${side}`,
      { pathArray: [inner, outer], sideOrientation: Mesh.DOUBLESIDE },
      scene,
    );
    path.material = materials.bridge;
    finishStatic(path, parent, shadows, false, true);
  }

  const railParts: Mesh[] = [];
  for (const side of [-1, 1]) {
    for (const z of [-49, -35, -21, -7, 7, 21, 35, 49]) {
      const t = (z + 70) / 140;
      const point = riverPoint(t);
      const previous = riverPoint(Math.max(0, t - 0.01));
      const next = riverPoint(Math.min(1, t + 0.01));
      const tangent = next.subtract(previous).normalize();
      const lateral = new Vector3(-tangent.z, 0, tangent.x);
      const centre = point.add(lateral.scale(side * 7.48));
      const rail = MeshBuilder.CreateBox(
        `river-promenade-rail-${side}-${z}`,
        { width: 0.18, height: 0.22, depth: 8.4 },
        scene,
      );
      rail.position.copyFrom(centre.add(new Vector3(0, 2.05, 0)));
      rail.rotation.y = Math.atan2(tangent.x, tangent.z);
      rail.material = materials.white;
      rail.parent = parent;
      rail.isPickable = false;
      railParts.push(rail);

      for (const offset of [-3.6, 0, 3.6]) {
        const post = MeshBuilder.CreateBox(
          `river-promenade-post-${side}-${z}-${offset}`,
          { width: 0.24, height: 1.65, depth: 0.24 },
          scene,
        );
        post.position.copyFrom(
          centre.add(tangent.scale(offset)).add(new Vector3(0, 1.55, 0)),
        );
        post.material = materials.white;
        post.parent = parent;
        post.isPickable = false;
        railParts.push(post);
      }
    }
  }
  const rails = Mesh.MergeMeshes(railParts, true, true, undefined, false, true);
  if (rails !== null) {
    rails.name = "river-promenade-rails-merged";
    rails.parent = parent;
    rails.receiveShadows = true;
    shadows.addShadowCaster(rails);
  }

  const dock = new TransformNode("rivergate-community-dock", scene);
  dock.position.set(20, 0.85, 41);
  dock.parent = parent;
  const deck = MeshBuilder.CreateBox(
    "rivergate-community-dock-deck",
    { width: 7.5, height: 0.35, depth: 5.5 },
    scene,
  );
  deck.position.y = 0.4;
  deck.material = materials.bridge;
  finishStatic(deck, dock, shadows, true, true);
  for (const x of [-3.1, 3.1]) {
    for (const z of [-2.1, 2.1]) {
      const post = MeshBuilder.CreateCylinder(
        `rivergate-community-dock-post-${x}-${z}`,
        { height: 2.1, diameter: 0.28, tessellation: 8 },
        scene,
      );
      post.position.set(x, 0.4, z);
      post.material = materials.bark;
      finishStatic(post, dock, shadows, true);
    }
  }
}

function createCivicContext(
  scene: Scene,
  parent: TransformNode,
  materials: TownMaterials,
  shadows: ShadowGenerator,
) {
  createWayfindingSign(
    scene,
    parent,
    materials,
    shadows,
    "school",
    29,
    18,
    materials.flower,
  );
  createWayfindingSign(
    scene,
    parent,
    materials,
    shadows,
    "clinic",
    -12,
    18,
    materials.clay,
  );
  createWayfindingSign(
    scene,
    parent,
    materials,
    shadows,
    "market",
    62,
    7,
    materials.riverRoof,
  );

  createBikeRack(scene, parent, materials, shadows, 46, 20);
  createBench(
    scene,
    parent,
    materials,
    shadows,
    "clinic-waiting",
    -12,
    23,
    Math.PI / 2,
  );
  createBench(
    scene,
    parent,
    materials,
    shadows,
    "market-rest",
    61,
    20,
    -Math.PI / 2,
  );

  for (const [index, x, z] of [
    [0, -12.5, 28],
    [1, -9.5, 30],
    [2, -6.5, 31],
  ] as const) {
    createPlanter(
      scene,
      parent,
      materials,
      shadows,
      `clinic-herbs-${index}`,
      x,
      z,
    );
  }
  for (const [index, x, z] of [
    [0, 59.5, 14.5],
    [1, 62, 15.5],
    [2, 60.5, 17.5],
    [3, 63, 18],
  ] as const) {
    const crate = MeshBuilder.CreateBox(
      `market-produce-crate-${index}`,
      { width: 1.6, height: 1.05, depth: 1.35 },
      scene,
    );
    crate.position.set(x, 1.3, z);
    crate.rotation.y = index * 0.24;
    crate.material = index % 2 === 0 ? materials.bridge : materials.bark;
    finishStatic(crate, parent, shadows, true);
  }

  return 3 + 1 + 2 + 3 + 4;
}

function createWayfindingSign(
  scene: Scene,
  parent: TransformNode,
  materials: TownMaterials,
  shadows: ShadowGenerator,
  id: "school" | "clinic" | "market",
  x: number,
  z: number,
  boardMaterial: StandardMaterial,
) {
  const root = new TransformNode(`wayfinding-${id}`, scene);
  root.position.set(x, 0.75, z);
  root.parent = parent;

  const pole = MeshBuilder.CreateCylinder(
    `wayfinding-${id}-pole`,
    { height: 4.8, diameter: 0.24, tessellation: 8 },
    scene,
  );
  pole.position.y = 2.45;
  pole.material = materials.bark;
  finishStatic(pole, root, shadows, true);

  const board = MeshBuilder.CreateBox(
    `wayfinding-${id}-board`,
    { width: 3.5, height: 1.9, depth: 0.24 },
    scene,
  );
  board.position.y = 4.2;
  board.material = boardMaterial;
  finishStatic(board, root, shadows, true);

  if (id === "clinic") {
    for (const [suffix, width, height] of [
      ["horizontal", 1.9, 0.4],
      ["vertical", 0.4, 1.4],
    ] as const) {
      const mark = MeshBuilder.CreateBox(
        `wayfinding-${id}-mark-${suffix}`,
        { width, height, depth: 0.12 },
        scene,
      );
      mark.position.set(0, 4.2, -0.18);
      mark.material = materials.white;
      finishStatic(mark, root, shadows);
    }
  } else {
    for (const [index, offset] of [-0.75, 0, 0.75].entries()) {
      const mark = MeshBuilder.CreateBox(
        `wayfinding-${id}-mark-${index}`,
        { width: 0.46, height: id === "school" ? 0.95 : 1.15, depth: 0.12 },
        scene,
      );
      mark.position.set(offset, 4.2, -0.18);
      mark.material = index % 2 === 0 ? materials.white : materials.cream;
      finishStatic(mark, root, shadows);
    }
  }
}

function createBikeRack(
  scene: Scene,
  parent: TransformNode,
  materials: TownMaterials,
  shadows: ShadowGenerator,
  x: number,
  z: number,
) {
  const rack = new TransformNode("school-bike-rack", scene);
  rack.position.set(x, 0.75, z);
  rack.parent = parent;
  for (const [index, offset] of [-1.8, -0.9, 0, 0.9, 1.8].entries()) {
    const hoop = MeshBuilder.CreateTorus(
      `school-bike-rack-hoop-${index}`,
      { diameter: 1.25, thickness: 0.14, tessellation: 12 },
      scene,
    );
    hoop.position.set(offset, 0.72, 0);
    hoop.rotation.x = Math.PI / 2;
    hoop.material = materials.white;
    finishStatic(hoop, rack, shadows, true);
  }
}

function createBench(
  scene: Scene,
  parent: TransformNode,
  materials: TownMaterials,
  shadows: ShadowGenerator,
  id: string,
  x: number,
  z: number,
  rotation: number,
) {
  const root = new TransformNode(`${id}-bench`, scene);
  root.position.set(x, 0.75, z);
  root.rotation.y = rotation;
  root.parent = parent;
  const seat = MeshBuilder.CreateBox(
    `${id}-bench-seat`,
    { width: 3.6, height: 0.28, depth: 1 },
    scene,
  );
  seat.position.y = 1;
  seat.material = materials.bridge;
  finishStatic(seat, root, shadows, true);
  const back = MeshBuilder.CreateBox(
    `${id}-bench-back`,
    { width: 3.6, height: 1.15, depth: 0.25 },
    scene,
  );
  back.position.set(0, 1.65, 0.42);
  back.material = materials.bark;
  finishStatic(back, root, shadows, true);
}

function createPlanter(
  scene: Scene,
  parent: TransformNode,
  materials: TownMaterials,
  shadows: ShadowGenerator,
  id: string,
  x: number,
  z: number,
) {
  const box = MeshBuilder.CreateBox(
    `${id}-box`,
    { width: 2.5, height: 0.75, depth: 1.6 },
    scene,
  );
  box.position.set(x, 1.1, z);
  box.material = materials.bridge;
  finishStatic(box, parent, shadows, true);
  const plants = MeshBuilder.CreateSphere(
    `${id}-plants`,
    { diameter: 1.55, segments: 8 },
    scene,
  );
  plants.position.set(x, 1.75, z);
  plants.scaling.set(1.3, 0.5, 0.8);
  plants.material = materials.leafLight;
  finishStatic(plants, parent, shadows, true);
}

function riverPoint(t: number) {
  const z = -70 + t * 140;
  const x = 12 + Math.sin(t * Math.PI * 2 - Math.PI / 2) * 3.4;
  return new Vector3(x, 0, z);
}

function finishStatic(
  mesh: Mesh,
  parent: TransformNode,
  shadows: ShadowGenerator,
  castsShadow = false,
  receivesShadows = false,
) {
  mesh.parent = parent;
  mesh.isPickable = false;
  mesh.receiveShadows = receivesShadows;
  if (castsShadow) shadows.addShadowCaster(mesh);
}
