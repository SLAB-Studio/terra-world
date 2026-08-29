import { describe, expect, it } from "vitest";

import { SECONDARY_HOME_LAYOUT } from "./town-districts";

describe("Rivergate secondary district layout", () => {
  it("adds enough background homes for a visibly established town", () => {
    expect(SECONDARY_HOME_LAYOUT.length).toBeGreaterThanOrEqual(12);
    expect(new Set(SECONDARY_HOME_LAYOUT.map((home) => home.id)).size).toBe(
      SECONDARY_HOME_LAYOUT.length,
    );
  });

  it("keeps secondary homes inside the terrain and away from the central play area", () => {
    for (const home of SECONDARY_HOME_LAYOUT) {
      expect(Math.abs(home.x)).toBeLessThanOrEqual(72);
      expect(Math.abs(home.z)).toBeLessThanOrEqual(68);
      expect(Math.abs(home.x) > 55 || Math.abs(home.z) > 50).toBe(true);
      expect(home.scale).toBeGreaterThanOrEqual(0.8);
      expect(home.scale).toBeLessThanOrEqual(1);
    }
  });
});
