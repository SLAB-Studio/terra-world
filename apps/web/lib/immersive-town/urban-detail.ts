import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { TownMaterials } from "./materials";

export const URBAN_DETAIL_BUDGET = { meshes: 22, vertices: 8_000 } as const;
export const URBAN_DETAIL_STOREFRONTS = [
  "cafe",
  "bookshop",
  "library",
  "workshop",
] as const;

export type UrbanDetailFootprint = Readonly<{
  id: string;
  minimum: Vector3;
  maximum: Vector3;
}>;

/**
 * Human-scale shopfront pockets, anchored to the real building transforms.
 * No new assets, lights, shadows, collision shells or per-frame work. Keep
 * batches local to each storefront so an entire district is not always drawn.
 */
export function createUrbanDetail(scene: Scene, materials: TownMaterials) {
  const root = new TransformNode("rivergate-urban-detail", scene);
  const meshes: Mesh[] = [];
  const footprints: UrbanDetailFootprint[] = [];

  for (const id of URBAN_DETAIL_STOREFRONTS) {
    const building = scene.getTransformNodeByName(`downtown-${id}`);
    if (!building) continue;
    building.computeWorldMatrix(true);
    // Siblings, not venue children: registerTownVenues must never turn a chair
    // or planter into a clickable building surface.
    const pocket = new TransformNode(`urban-${id}`, scene);
    building.getWorldMatrix().decomposeToTransformNode(pocket);
    pocket.parent = root;
    pocket.computeWorldMatrix(true);
    const batches = new Map<StandardMaterial, Mesh[]>();
    let propParts: Mesh[] = [];
    let serial = 0;
    const part = (
      mesh: Mesh,
      material: StandardMaterial,
      x: number,
      y: number,
      z: number,
    ) => {
      mesh.position.set(x, y, z);
      mesh.material = material;
      mesh.isPickable = false;
      const batch = batches.get(material) ?? [];
      batch.push(mesh);
      batches.set(material, batch);
      propParts.push(mesh);
      return mesh;
    };
    const box = (
      material: StandardMaterial,
      x: number,
      y: number,
      z: number,
      width: number,
      height: number,
      depth: number,
    ) =>
      part(
        MeshBuilder.CreateBox(
          `urban-part-${id}-${serial++}`,
          { width, height, depth },
          scene,
        ),
        material,
        x,
        y,
        z,
      );
    const cylinder = (
      material: StandardMaterial,
      x: number,
      y: number,
      z: number,
      diameter: number,
      height: number,
    ) =>
      part(
        MeshBuilder.CreateCylinder(
          `urban-part-${id}-${serial++}`,
          { diameter, height, tessellation: 12 },
          scene,
        ),
        material,
        x,
        y,
        z,
      );
    const prop = (name: string, build: () => void) => {
      propParts = [];
      build();
      const minimum = new Vector3(Infinity, Infinity, Infinity);
      const maximum = new Vector3(-Infinity, -Infinity, -Infinity);
      for (const mesh of propParts) {
        mesh.computeWorldMatrix(true);
        for (const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld) {
          const point = Vector3.TransformCoordinates(
            corner,
            pocket.getWorldMatrix(),
          );
          minimum.minimizeInPlace(point);
          maximum.maximizeInPlace(point);
        }
      }
      footprints.push({ id: `${id}-${name}`, minimum, maximum });
    };

    // Window boxes occupy the existing foundation, not the centre doorway or
    // the boulevard. Low, asymmetric foliage reads as planting, not topiary cubes.
    for (const side of [-1, 1])
      prop(`window-planter-${side}`, () => {
        const x = side * 2.75;
        box(materials.clay, x, 0.37, -4.47, 1.25, 0.5, 0.55);
        box(materials.soil, x, 0.628, -4.47, 1.08, 0.024, 0.4);
        for (let stem = 0; stem < 3; stem++) {
          const leaf = part(
            MeshBuilder.CreateSphere(
              `urban-leaf-${id}-${serial++}`,
              { diameter: 0.5, segments: 4 },
              scene,
            ),
            materials.hedge,
            x + (stem - 1) * 0.34,
            0.79 + (stem % 2) * 0.06,
            -4.47,
          );
          leaf.scaling.set(0.9, 0.75 + (stem % 2) * 0.2, 0.78);
        }
        for (const edge of [-1, 1])
          box(materials.cream, x + edge * 0.6, 0.61, -4.47, 0.07, 0.08, 0.59);
      });

    if (id === "cafe") {
      // Tables/chairs flank a 3.6m-wide entry aisle. The compact footprint ends
      // before the neighbouring workshop's rear wall; no invented patio sprawl.
      for (const side of [-1, 1])
        prop(`bistro-table-${side}`, () => {
          const x = side * 2.75,
            z = -5.7;
          cylinder(materials.cream, x, 0.79, z, 0.72, 0.07);
          cylinder(materials.road, x, 0.43, z, 0.065, 0.7);
          cylinder(materials.road, x, 0.1, z, 0.38, 0.035);
          for (const end of [-1, 1]) {
            const chairX = x + end * 0.65;
            box(materials.bark, chairX, 0.47, z, 0.4, 0.055, 0.4);
            box(materials.bark, chairX + end * 0.17, 0.73, z, 0.055, 0.42, 0.4);
            for (const legX of [-1, 1])
              for (const legZ of [-1, 1])
                box(
                  materials.road,
                  chairX + legX * 0.15,
                  0.25,
                  z + legZ * 0.15,
                  0.035,
                  0.43,
                  0.035,
                );
          }
          cylinder(materials.cream, x - 0.14, 0.88, z, 0.09, 0.12);
          cylinder(materials.soil, x - 0.14, 0.943, z, 0.065, 0.006);
        });
      // The existing canopy remains structural. Its modest fabric valance is
      // above head height, with muted alternating bands from the shared palette.
      prop("awning-valance", () => {
        for (let stripe = 0; stripe < 14; stripe++)
          box(
            stripe % 2 ? materials.cream : materials.clay,
            -3.9 + stripe * 0.6,
            2.87,
            -5.57,
            0.6,
            0.24,
            0.05,
          );
      });
    }

    if (id === "bookshop")
      prop("display-case", () => {
        // Shallow, wall-hung book display rather than a freestanding path obstacle.
        box(materials.bark, -3.65, 1.55, -4.23, 0.52, 1.14, 0.2);
        for (let shelf = 0; shelf < 3; shelf++) {
          box(
            materials.cream,
            -3.65,
            1.11 + shelf * 0.36,
            -4.37,
            0.5,
            0.04,
            0.14,
          );
          for (let book = 0; book < 4; book++)
            box(
              book % 2 ? materials.clay : materials.cream,
              -3.81 + book * 0.11,
              1.24 + shelf * 0.36,
              -4.34,
              0.075,
              0.19 + (book % 2) * 0.04,
              0.12,
            );
        }
      });

    if (id === "workshop") {
      prop("cycle-stands", () => {
        // Side-wall bay, away from the workshop's south-facing entrance and
        // the neighbourhood houses behind it. Three recognizable Sheffield rails.
        for (const z of [-1.2, 0, 1.2]) {
          for (const end of [-1, 1])
            cylinder(materials.road, 4.9 + end * 0.35, 0.48, z, 0.055, 0.88);
          const rail = cylinder(materials.road, 4.9, 0.92, z, 0.055, 0.75);
          rail.rotation.z = Math.PI / 2;
        }
      });
      prop("service-cabinet", () => {
        box(materials.riverRoof, 4.18, 1.05, 2.8, 0.28, 1.1, 0.62);
        box(materials.cream, 4.33, 1.26, 2.8, 0.025, 0.11, 0.22);
        for (let vent = 0; vent < 4; vent++)
          box(materials.road, 4.33, 0.69 + vent * 0.07, 2.8, 0.025, 0.025, 0.4);
      });
    }

    for (const [material, parts] of batches) {
      parts.forEach((mesh) => mesh.computeWorldMatrix(true));
      const merged = Mesh.MergeMeshes(parts, true, true)!;
      merged.name = `urban-${id}-${material.name}`;
      merged.material = material;
      merged.parent = pocket;
      merged.isPickable = false;
      merged.receiveShadows = true;
      merged.metadata = { decoration: true, urbanDetail: true };
      merged.freezeWorldMatrix();
      meshes.push(merged);
    }
  }

  // Keep authored per-object bounds for clearance audits after material merging.
  root.metadata = { kind: "urban-detail", footprints };
  let disposed = false;
  return {
    root,
    meshes,
    footprints,
    dispose() {
      if (disposed) return;
      disposed = true;
      // Shared town materials/textures belong to the scene, never this layer.
      root.dispose(false, false);
    },
  };
}
