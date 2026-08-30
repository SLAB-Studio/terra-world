import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { createHouseFacadeDetails } from "./geometry";
import {
  applyTownSurface,
  createSurfacePixels,
  createTownMaterials,
  SURFACE_TEXTURE_SIZE,
  type TownSurface,
} from "./materials";

describe("grounded low-cost city materials", () => {
  it("generates distinct deterministic surface grain within a sub-megabyte texture budget", () => {
    const surfaces: TownSurface[] = [
      "brick",
      "stone",
      "slate",
      "wood",
      "grass",
      "asphalt",
      "fabric",
    ];
    const hashes = surfaces.map((kind) => {
      const pixels = createSurfacePixels(kind);
      expect(pixels).toEqual(createSurfacePixels(kind));
      expect(pixels.length).toBe(SURFACE_TEXTURE_SIZE ** 2 * 3);
      expect(new Set(pixels).size).toBeGreaterThan(10);
      return pixels.reduce(
        (hash, value, index) => (Math.imul(hash, 31) + value + index) >>> 0,
        0,
      );
    });
    expect(new Set(hashes).size).toBe(surfaces.length);
    expect(
      (SURFACE_TEXTURE_SIZE ** 2 * 3 * surfaces.length * 4) / 3,
    ).toBeLessThan(500_000);
  });

  it("shares surface GPU textures across materials and never needs a browser canvas", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    try {
      const materials = createTownMaterials(scene);
      const extra = new StandardMaterial("extra-stone", scene);
      const textureCount = scene.textures.length;
      applyTownSurface(scene, extra, "stone");
      expect(extra.diffuseTexture).toBe(materials.bridge.diffuseTexture);
      expect(materials.orchardRoof.diffuseTexture).toBe(
        materials.riverRoof.diffuseTexture,
      );
      expect(scene.textures.length).toBe(textureCount);
      expect(textureCount).toBeLessThanOrEqual(6);
      expect(extra.diffuseTexture?.getSize().width).toBe(128);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });

  it("bakes home architectural detail into four local batches without creating collision barriers", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    try {
      const materials = createTownMaterials(scene);
      const root = new TransformNode("test-house", scene);
      root.position.set(38, 0.75, -20);
      root.rotation.y = 0.4;
      const detail = createHouseFacadeDetails(
        scene,
        root,
        materials,
        materials.orchardWall,
        {
          width: 8.2,
          depth: 7.2,
          eaves: 5.28,
          ridge: 7.87,
          windowX: 2.45,
          windowY: 3.45,
          windowWidth: 1.48,
          windowHeight: 1.45,
          doorTop: 3.77,
        },
      );
      expect(detail).toHaveLength(4);
      expect(scene.meshes).toHaveLength(4);
      expect(
        detail.reduce(
          (vertices, mesh) => vertices + mesh.getTotalVertices(),
          0,
        ),
      ).toBeLessThan(1400);
      for (const mesh of detail) {
        expect(mesh.parent).toBe(root);
        expect(mesh.isPickable).toBe(false);
        expect(mesh.metadata?.blocksWalking).not.toBe(true);
        mesh.computeWorldMatrix(true);
        const bounds = mesh.getBoundingInfo().boundingBox;
        expect(bounds.minimumWorld.x).toBeGreaterThan(30);
        expect(bounds.maximumWorld.x).toBeLessThan(46);
      }
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
});
