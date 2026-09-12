import { afterEach, describe, expect, it, vi } from "vitest";

import {
  engineerOutfitModelFor,
  getEngineerWardrobe,
  isEngineerOutfit,
  normalizeEngineerOutfit,
  normalizeEngineerWardrobe,
  setEngineerWardrobe,
  subscribeEngineerWardrobe,
} from "./engineer-wardrobe";

afterEach(() => {
  setEngineerWardrobe({ player: "engineer", leo: "engineer" });
});

describe("engineer wardrobe", () => {
  it("maps every independent outfit to the model shown in its preview", () => {
    expect(engineerOutfitModelFor("player", "engineer")).toBe(
      "engineer-worker",
    );
    expect(engineerOutfitModelFor("player", "field")).toBe("man-denim");
    expect(engineerOutfitModelFor("leo", "casual")).toBe("man-tee");
    expect(engineerOutfitModelFor("leo", "field")).toBe("man-jacket");
  });
  it("defaults both characters to the engineer outfit", () => {
    expect(getEngineerWardrobe()).toEqual({
      player: "engineer",
      leo: "engineer",
    });
  });

  it("updates player and Leo independently", () => {
    setEngineerWardrobe({ player: "casual", leo: "field" });
    setEngineerWardrobe({ player: "field" });

    expect(getEngineerWardrobe()).toEqual({ player: "field", leo: "field" });
  });

  it("notifies subscribers only when the wardrobe changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeEngineerWardrobe(listener);

    setEngineerWardrobe({ leo: "casual" });
    setEngineerWardrobe({ leo: "casual" });
    unsubscribe();
    setEngineerWardrobe({ leo: "field" });

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({
      player: "engineer",
      leo: "casual",
    });
  });

  it("recognises and normalizes outfit values", () => {
    expect(isEngineerOutfit("field")).toBe(true);
    expect(isEngineerOutfit("formal")).toBe(false);
    expect(normalizeEngineerOutfit("formal")).toBe("engineer");
    expect(normalizeEngineerWardrobe({ player: "casual" })).toEqual({
      player: "casual",
      leo: "engineer",
    });
  });
});
