import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import CharacterWardrobePreview, {
  wardrobeMotionTarget,
  wardrobePreviewHardwareScalingLevel,
  wardrobePreviewSlotX,
  WARDROBE_PREVIEW_DETAIL,
  WARDROBE_PREVIEW_FRAMING,
} from "./CharacterWardrobePreview";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

describe("character wardrobe preview", () => {
  it("uses close-up assets and renders at native high-density resolution", () => {
    expect(WARDROBE_PREVIEW_DETAIL).toBe("near");
    expect(WARDROBE_PREVIEW_FRAMING).toEqual({
      fov: 0.54,
      mobileSlotX: 0.62,
      radius: 3.8,
      wideSlotX: 0.82,
      targetY: 0.9,
    });
    expect(wardrobePreviewSlotX(1)).toBe(0.62);
    expect(wardrobePreviewSlotX(1.65)).toBeCloseTo(0.72);
    expect(wardrobePreviewSlotX(2.4)).toBe(0.82);
    expect(wardrobePreviewHardwareScalingLevel(1)).toBe(1);
    expect(wardrobePreviewHardwareScalingLevel(1.5)).toBeCloseTo(2 / 3);
    expect(wardrobePreviewHardwareScalingLevel(2)).toBe(0.5);
    expect(wardrobePreviewHardwareScalingLevel(3)).toBe(0.5);
  });

  it("keeps randomized life motion on the whole character within safe bounds", () => {
    const left = wardrobeMotionTarget("player", () => 0);
    const right = wardrobeMotionTarget("leo", () => 1);
    expect(left).toEqual({ shift: -0.012, yaw: -0.07 });
    expect(right.shift).toBeCloseTo(0.03);
    expect(right.yaw).toBeCloseTo(0.16);
  });

  it("describes both selected outfits beside the live preview canvas", () => {
    const html = renderToStaticMarkup(
      createElement(CharacterWardrobePreview, {
        playerOutfit: "field",
        leoOutfit: "casual",
      }),
    );
    expect(html).toContain("Live wardrobe preview:");
    expect(html).toContain("Your engineer in Field gear");
    expect(html).toContain("Leo in Casual");
    expect(html).toContain('data-player-outfit="field"');
    expect(html).toContain('data-leo-outfit="casual"');
    expect(html).toContain("<canvas");
  });
});
