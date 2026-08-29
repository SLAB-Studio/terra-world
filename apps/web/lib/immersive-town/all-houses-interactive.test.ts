import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { describe, expect, it } from "vitest";

import { createImmersiveTownWorld } from "./create-town-world";

describe("Rivergate interactive homes", () => {
  it("registers every visible house with a pickable 3D surface", () => {
    const engine = new NullEngine();
    const world = createImmersiveTownWorld(engine, {
      attachCameraControls: false,
      quality: "low",
      reducedMotion: true,
    });

    expect(world.houses).toHaveLength(28);
    expect(new Set(world.houses.map((house) => house.id)).size).toBe(
      world.houses.length,
    );
    for (const house of world.houses) {
      expect(house.pickMesh.isPickable).toBe(true);
      expect(world.getHouseFromMesh(house.pickMesh)?.id).toBe(house.id);
    }

    world.dispose();
    engine.dispose();
  });
});
