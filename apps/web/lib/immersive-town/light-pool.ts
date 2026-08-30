import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";

/** Vertex alpha gives ground light a soft edge, without textures or postprocessing. */
export function softenLightPool(mesh: Mesh) {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind) ?? [];
  const radius = Math.max(...positions.map(Math.abs));
  const colours: number[] = [];
  for (let index = 0; index < positions.length; index += 3) {
    const distance = Math.hypot(positions[index]!, positions[index + 1]!);
    colours.push(1, 1, 1, Math.max(0, 1 - distance / radius));
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, colours);
  mesh.hasVertexAlpha = true;
}
