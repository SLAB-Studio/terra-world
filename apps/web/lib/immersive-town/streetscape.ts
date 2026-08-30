import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { createArchitecturalBatch, type ArchitecturalBox } from "./geometry";
import type { TownMaterials } from "./materials";
import {
  renderedRoadHeight,
  ROAD_HALF_WIDTH_METERS,
  sampleRoadFrame,
} from "./road";

/** Paint, kerbs and street hardware follow exactly the existing driving spline. */
export function addRoadDetail(
  scene: Scene,
  root: TransformNode,
  materials: TownMaterials,
) {
  const edging: Mesh[] = [];
  const drains: Mesh[] = [];
  const markings: Mesh[] = [];
  for (const side of [-1, 1]) {
    const paths: [Vector3[], Vector3[]] = [[], []];
    for (let i = 0; i < 240; i++) {
      const frame = sampleRoadFrame(i / 240);
      const y = renderedRoadHeight(frame.center.y) + 0.126;
      for (const edge of [0, 1] as const) {
        const offset =
          side * (ROAD_HALF_WIDTH_METERS - 0.38 + (edge - 0.5) * 0.1);
        paths[edge].push(
          new Vector3(
            frame.center.x + frame.lateral.x * offset,
            y,
            frame.center.z + frame.lateral.z * offset,
          ),
        );
      }
    }
    const line = MeshBuilder.CreateRibbon(
      `road-edge-line-${side}`,
      { pathArray: paths, closePath: true, sideOrientation: Mesh.DOUBLESIDE },
      scene,
    );
    line.material = materials.white;
    line.parent = root;
    line.isPickable = false;
    markings.push(line);
  }
  for (let i = 0; i < 90; i++) {
    const frame = sampleRoadFrame((i + 0.2) / 90);
    const angle = Math.atan2(frame.tangent.x, frame.tangent.z);
    for (const side of [-1, 1]) {
      const offset = side * (ROAD_HALF_WIDTH_METERS + 0.12);
      const kerb = MeshBuilder.CreateBox(
        `road-kerb-${i}-${side}`,
        { width: 0.2, height: 0.17, depth: 3.9 },
        scene,
      );
      kerb.position.set(
        frame.center.x + frame.lateral.x * offset,
        renderedRoadHeight(frame.center.y) + 0.08,
        frame.center.z + frame.lateral.z * offset,
      );
      kerb.rotation.y = angle;
      kerb.material = materials.bridge;
      edging.push(kerb);
      if (i % 6 === 0) {
        for (let slat = 0; slat < 6; slat++) {
          const grate = MeshBuilder.CreateBox(
            `storm-drain-${i}-${side}-${slat}`,
            { width: 0.36, height: 0.02, depth: 0.035 },
            scene,
          );
          const pos = kerb.position
            .add(
              new Vector3(
                frame.lateral.x * side * -0.32,
                0,
                frame.lateral.z * side * -0.32,
              ),
            )
            .add(
              new Vector3(
                frame.tangent.x * (slat - 2.5) * 0.075,
                0.066,
                frame.tangent.z * (slat - 2.5) * 0.075,
              ),
            );
          grate.position.copyFrom(pos);
          grate.rotation.y = angle;
          grate.material = materials.road;
          drains.push(grate);
        }
      }
    }
  }
  for (const [name, parts] of [
    ["continuous-kerb-stones", edging],
    ["street-storm-drains", drains],
  ] as const) {
    const mesh = Mesh.MergeMeshes([...parts], true, true)!;
    mesh.name = name;
    mesh.parent = root;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
  }
  const road = scene.getMeshByName("road-continuous-asphalt");
  if (road) {
    const positions = road.getVerticesData("position");
    if (positions) {
      const uv: number[] = [];
      for (let i = 0; i < positions.length; i += 3)
        uv.push(positions[i]! / 3, positions[i + 2]! / 3);
      road.setVerticesData("uv", uv);
    }
  }
  return markings;
}

/** Reusable roof equipment and entrance joinery, not replacement collision shells. */
export function addBuildingStreetDetail(
  scene: Scene,
  materials: TownMaterials,
) {
  const roots = scene.transformNodes.filter((root) =>
    /^downtown-(library|science|studios|hub|bookshop|arts|cafe|workshop)$/.test(
      root.name,
    ),
  );
  roots.forEach((root, index) => {
    const roof = scene.getMeshByName(`${root.name}-roof`);
    if (!roof) return;
    const y = roof.position.y + 0.2;
    const metal: ArchitecturalBox[] = [
      [-2.2, y + 0.38, 2.1, 1.35, 0.75, 1.4],
      [-0.6, y + 0.3, 2.1, 1.25, 0.6, 1.2],
      [2.6, y + 0.2, 1.4, 0.7, 0.4, 0.8],
    ];
    // Mechanical grilles are baked into one material batch, not separate draws.
    for (let slat = 0; slat < 7; slat++)
      metal.push([-2.2, y + 0.14 + slat * 0.07, 1.38, 1.12, 0.025, 0.025]);
    for (const side of [-1, 1]) {
      metal.push([side * 3.4, 1.45, -4.18, 0.07, 2.65, 0.1]);
      metal.push([side * 3.4, 2.8, -4.85, 0.08, 0.06, 1.4]);
    }
    createArchitecturalBatch(
      `${root.name}-street-metalwork`,
      metal,
      materials.road,
      root,
      scene,
    );
    const porch = createArchitecturalBatch(
      `${root.name}-entrance-canopy`,
      [[0, 2.86, -4.6, 7, 0.12, 1.25]],
      index % 2 ? materials.riverRoof : materials.orchardRoof,
      root,
      scene,
    );
    porch.metadata = { decoration: true };
  });
}
