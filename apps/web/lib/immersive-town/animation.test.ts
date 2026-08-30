import { afterEach, describe, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { createTownAnimationController } from "./animation";
import { CITY_CONVERSATIONS, sampleConversation } from "./conversations";

afterEach(() => vi.restoreAllMocks());
describe("dialogue clock accessibility", () => {
  it("advances reading turns with reduced motion while respecting game pause", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    vi.spyOn(engine, "getDeltaTime").mockReturnValue(50);
    const update = vi.fn();
    const controller = createTownAnimationController(
      scene,
      {
        ambientActors: [],
        treeCanopies: [],
        gardenNodes: [],
        cloudRoots: [],
        lampBulbs: [],
        playgroundSpinners: [],
        riverMaterial: new StandardMaterial("river", scene),
        conversations: { current: null, update, setEnabled() {}, dispose() {} },
      },
      true,
    );
    const frame = vi.fn();
    controller.subscribe(frame);
    const advance = (frames: number) => {
      for (let i = 0; i < frames; i++)
        scene.onBeforeRenderObservable.notifyObservers(scene);
    };
    try {
      advance(160);
      const [seconds, reduced] = update.mock.lastCall!;
      expect(seconds).toBeCloseTo(8);
      expect(reduced).toBe(true);
      expect(
        sampleConversation(CITY_CONVERSATIONS[0]!, seconds, false)?.name,
      ).toBe("Ben");
      expect(frame.mock.lastCall![0].elapsedSeconds).toBe(0);
      controller.setPaused(true);
      advance(100);
      expect(update).toHaveBeenCalledTimes(160);
      controller.setPaused(false);
      advance(150);
      expect(
        sampleConversation(
          CITY_CONVERSATIONS[0]!,
          update.mock.lastCall![0],
          false,
        )?.name,
      ).toBe("Amara");
      expect(update.mock.lastCall![1]).toBe(true);
    } finally {
      controller.dispose();
      scene.dispose();
      engine.dispose();
    }
  });
});
