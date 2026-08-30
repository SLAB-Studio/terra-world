import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

/** One tiny shared contact mask grounds both hero characters even on low graphics. */
export function createPartyContactShadows(scene: Scene, parent: TransformNode) {
  if (
    !scene.getEngine().getRenderingCanvas() ||
    typeof document === "undefined"
  )
    return [];
  const texture = new DynamicTexture("party-contact-mask", 64, scene, false);
  const ctx = texture.getContext();
  const gradient = ctx.createRadialGradient(32, 32, 5, 32, 32, 30);
  gradient.addColorStop(0, "rgba(0,0,0,0.3)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.clearRect(0, 0, 64, 64);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  texture.hasAlpha = true;
  texture.update();
  const mat = new StandardMaterial("party-contact", scene);
  mat.diffuseTexture = texture;
  mat.useAlphaFromDiffuseTexture = true;
  mat.disableLighting = true;
  mat.emissiveColor = Color3.Black();
  mat.specularColor = Color3.Black();
  mat.zOffset = -1;
  const shadows = [0.85, 0.7].map((width, i) => {
    const mesh = MeshBuilder.CreateGround(
      `party-contact-${i}`,
      { width, height: i === 0 ? 0.65 : 1.05 },
      scene,
    );
    mesh.material = mat;
    mesh.parent = parent;
    mesh.isPickable = false;
    return mesh;
  });
  parent.onDisposeObservable.addOnce(() => {
    mat.dispose();
    texture.dispose();
  });
  return shadows;
}
