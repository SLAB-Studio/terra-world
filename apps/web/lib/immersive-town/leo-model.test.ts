import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { afterEach, describe, expect, it } from "vitest";
import { setEngineerWardrobe } from "../engineer-wardrobe";
import { createWalkingParty } from "./walking-party";

afterEach(() => {
  setEngineerWardrobe({ player: "engineer", leo: "engineer" });
});

describe("LEO human engineer presentation", () => {
  it("creates Leo as an adult human partner with distinct engineer metadata", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const pose = new UniversalCamera("logical-walker", Vector3.Zero(), scene);
    const party = createWalkingParty(scene, pose, {
      obstacles: () => [],
      canStand: () => true,
      groundHeight: () => 0,
    });
    try {
      expect(party.player.metadata.ageGroup).toBe("adult");
      expect(party.leo.metadata.ageGroup).toBe("adult");
      expect(party.leo.metadata.storyRole).toBe("leo");
      expect(party.leo.metadata.kind).toBe("engineer-companion");
      expect(party.player.metadata.outfit).toBe("engineer");
      expect(party.leo.metadata.outfit).toBe("engineer");
    } finally {
      party.dispose();
      scene.dispose();
      engine.dispose();
    }
  });

  it("uses the skinned worker model and changes outfits independently", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const pose = new UniversalCamera("logical-walker", Vector3.Zero(), scene);
    const party = createWalkingParty(scene, pose, {
      obstacles: () => [],
      canStand: () => true,
      groundHeight: () => 0,
    });
    try {
      expect(party.player.metadata.model).toBe("engineer-worker");
      expect(party.leo.metadata.model).toBe("engineer-worker");
      expect(
        scene.meshes.some((mesh) =>
          /(hard-hat|safety-vest|briefcase)/.test(mesh.name),
        ),
      ).toBe(false);

      setEngineerWardrobe({ player: "casual" });

      expect(party.player.metadata.outfit).toBe("casual");
      expect(party.leo.metadata.outfit).toBe("engineer");
      expect(party.player.metadata.model).toBe("man-casual");
      expect(party.leo.metadata.model).toBe("engineer-worker");

      setEngineerWardrobe({ leo: "field" });
      expect(party.leo.metadata.outfit).toBe("field");
      expect(party.leo.metadata.model).toBe("man-jacket");
    } finally {
      party.dispose();
      scene.dispose();
      engine.dispose();
    }
  });
});
