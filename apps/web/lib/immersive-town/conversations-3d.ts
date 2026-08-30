import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import "@babylonjs/core/Culling/ray";
import type { Scene } from "@babylonjs/core/scene";
import type { TownCharacterRig } from "./characters-3d";
import {
  CITY_CONVERSATIONS,
  sampleConversation,
  type ConversationLine,
} from "./conversations";

export type NearbyConversation = ConversationLine & { place: string };
export function createCityConversations(
  scene: Scene,
  actors: readonly TownCharacterRig[],
) {
  const people = new Map(actors.map((actor) => [actor.profile.id, actor]));
  const groups = CITY_CONVERSATIONS.filter((group) =>
    group.participants.every((id) => people.has(id)),
  );
  let enabled = true;
  let current: NearbyConversation | null = null;
  let lastText = "";
  const canvas = scene.getEngine().getRenderingCanvas();
  const texture =
    canvas && typeof window !== "undefined"
      ? new DynamicTexture(
          "resident-conversation",
          { width: 768, height: 256 },
          scene,
          false,
        )
      : null;
  const bubble = texture
    ? MeshBuilder.CreatePlane(
        "resident-conversation-bubble",
        { width: 1, height: 1 },
        scene,
      )
    : null;
  if (texture && bubble) {
    texture.hasAlpha = true;
    const material = new StandardMaterial(
      "resident-conversation-caption",
      scene,
    );
    material.diffuseTexture = texture;
    material.opacityTexture = texture;
    material.disableLighting = true;
    material.emissiveColor = Color3.White();
    material.backFaceCulling = false;
    bubble.material = material;
    bubble.isPickable = false;
    bubble.billboardMode = Mesh.BILLBOARDMODE_ALL;
    bubble.setEnabled(false);
  }
  return {
    get current() {
      return current;
    },
    setEnabled(value: boolean) {
      enabled = value;
      if (!value) {
        current = null;
        bubble?.setEnabled(false);
      }
    },
    update(seconds: number, reduced: boolean) {
      const camera = scene.activeCamera;
      let nearest = Infinity;
      let selected: NearbyConversation | null = null;
      let position: Vector3 | null = null;
      for (const actor of actors)
        if (actor.root.metadata) delete actor.root.metadata.conversationPose;
      for (const group of groups) {
        const pair = group.participants.map((id) => people.get(id)!);
        const canChat =
          pair.every(
            (actor) =>
              actor.root.isEnabled() &&
              (!actor.root.metadata?.residentRoutine ||
                actor.root.metadata.residentRoutine === "idle"),
          ) &&
          Vector3.Distance(pair[0]!.root.position, pair[1]!.root.position) <
            3.5;
        const line =
          enabled && canChat
            ? sampleConversation(
                group,
                seconds,
                scene.metadata?.timeOfDay === "night",
              )
            : null;
        if (!canChat || !enabled) continue;
        pair.forEach((actor, index) => {
          const other = pair[1 - index]!;
          const dx = other.root.position.x - actor.root.position.x;
          const dz = other.root.position.z - actor.root.position.z;
          actor.root.metadata = {
            ...actor.root.metadata,
            conversationPose: {
              yaw: Math.atan2(-dx, -dz),
              speaking: !reduced && line?.speaker === actor.profile.id,
            },
          };
        });
        if (!line || !camera) continue;
        const speaker = people.get(line.speaker)!;
        const anchor = speaker.root
          .getAbsolutePosition()
          .add(new Vector3(0, 2.8, 0));
        const distance = Vector3.Distance(camera.globalPosition, anchor);
        const limit = camera.getClassName() === "ArcRotateCamera" ? 95 : 28;
        const forward = camera.getForwardRay().direction;
        if (
          distance >= limit ||
          distance >= nearest ||
          Vector3.Dot(forward, anchor.subtract(camera.globalPosition)) <= 0
        )
          continue;
        nearest = distance;
        selected = { ...line, place: group.place };
        position = anchor;
      }
      current = selected;
      bubble?.setEnabled(Boolean(selected));
      if (!selected || !texture || !bubble || !position) return;
      bubble.position.copyFrom(position);
      const width = Math.max(3.8, Math.min(12, nearest * 0.15));
      bubble.scaling.set(width, width / 3, 1);
      // The caption stays attached to the speaker and uses the normal depth test.
      const key = `${selected.name}:${selected.text}`;
      if (key === lastText) return;
      lastText = key;
      const ctx = texture.getContext() as CanvasRenderingContext2D;
      ctx.clearRect(0, 0, 768, 256);
      ctx.fillStyle = "#18252c";
      ctx.beginPath();
      if (typeof ctx.roundRect === "function")
        ctx.roundRect(2, 2, 764, 231, 24);
      else ctx.rect(2, 2, 764, 231);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(368, 230);
      ctx.lineTo(384, 256);
      ctx.lineTo(400, 230);
      ctx.fill();
      ctx.fillStyle = "#ddbd8e";
      ctx.font = "600 29px sans-serif";
      ctx.fillText(selected.name, 32, 47);
      ctx.fillStyle = "#f4f1e9";
      ctx.font = "32px sans-serif";
      let row = "",
        y = 100;
      for (const word of selected.text.split(" ")) {
        const next = row ? `${row} ${word}` : word;
        if (ctx.measureText(next).width > 702 && row) {
          ctx.fillText(row, 32, y);
          y += 43;
          row = word;
        } else row = next;
      }
      ctx.fillText(row, 32, y);
      texture.update();
    },
    dispose() {
      bubble?.dispose(false, true);
      groups.forEach((g) =>
        g.participants.forEach((id) => {
          const p = people.get(id);
          if (p?.root.metadata) delete p.root.metadata.conversationPose;
        }),
      );
      current = null;
    },
  };
}
