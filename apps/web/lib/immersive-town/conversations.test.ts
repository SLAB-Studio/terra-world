import { describe, expect, it } from "vitest";
import { CITY_CONVERSATIONS, sampleConversation } from "./conversations";
import { RIVERGATE_CHARACTER_PROFILES } from "./characters-3d";
import { createTownCharacter } from "./characters-3d";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { createCityConversations } from "./conversations-3d";
describe("Rivergate resident conversations", () => {
  it("uses existing nearby residents, not imaginary or moving participants", () => {
    for (const group of CITY_CONVERSATIONS) {
      const pair = group.participants.map((id) =>
        RIVERGATE_CHARACTER_PROFILES.find((p) => p.id === id)!,
      );
      expect(pair.every((p) => p && p.activity !== "walk")).toBe(true);
      expect(
        Math.hypot(pair[0]!.x - pair[1]!.x, pair[0]!.z - pair[1]!.z),
      ).toBeLessThan(4);
    }
  });
  it("alternates speaking turns and leaves quiet intervals", () => {
    const g = CITY_CONVERSATIONS[0]!;
    expect(sampleConversation(g, 0, false)?.speaker).toBe(g.participants[0]);
    expect(sampleConversation(g, 7, false)?.speaker).toBe(g.participants[1]);
    expect(sampleConversation(g, 14, false)?.speaker).toBe(g.participants[0]);
    expect(sampleConversation(g, 30, false)).toBeNull();
    expect(sampleConversation(g, 6.5, false)).toBeNull();
  });
  it("has distinct day/night dialogue and stable pause-safe sampling", () => {
    for (const g of CITY_CONVERSATIONS) {
      const time = 54 - g.offset;
      expect(sampleConversation(g, time, false)?.text).not.toBe(
        sampleConversation(g, time, true)?.text,
      );
      expect(sampleConversation(g, time, false)).toEqual(
        sampleConversation(g, time, false),
      );
      expect(g.day.every((text) => text.length < 100)).toBe(true);
      expect(g.night.every((text) => text.length < 100)).toBe(true);
    }
  });
  it("shows nearby dialogue only, changes with night, and supports quiet/reduced-motion modes", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const parent = new TransformNode("people", scene);
    const group = CITY_CONVERSATIONS[0]!;
    const actors = group.participants.map((id) =>
      createTownCharacter(
        scene,
        parent,
        null,
        RIVERGATE_CHARACTER_PROFILES.find((p) => p.id === id)!,
      ),
    );
    const camera = new UniversalCamera("walk", new Vector3(50, 2, 5), scene);
    scene.activeCamera = camera;
    camera.setTarget(new Vector3(50, 2, 15));
    camera.getViewMatrix(true);
    const conversations = createCityConversations(scene, actors);
    try {
      conversations.update(0, false);
      expect(conversations.current?.name).toBe("Amara");
      expect(actors[0]!.root.metadata.conversationPose.speaking).toBe(true);
      expect(actors[1]!.root.metadata.conversationPose.speaking).toBe(false);
      scene.metadata = { timeOfDay: "night" };
      conversations.update(0, true);
      expect(conversations.current?.text).toBe(group.night[0]);
      expect(actors[0]!.root.metadata.conversationPose.speaking).toBe(false);
      conversations.setEnabled(false);
      conversations.update(0, false);
      expect(conversations.current).toBeNull();
      conversations.setEnabled(true);
      camera.position.set(300, 2, 300);
      camera.getViewMatrix(true);
      conversations.update(0, false);
      expect(conversations.current).toBeNull();
    } finally {
      conversations.dispose();
      scene.dispose();
      engine.dispose();
    }
  });
});
