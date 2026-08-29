import { describe, expect, it } from "vitest";

import {
  neighborhoodHomeProfile,
  NEIGHBORHOOD_HOME_PROFILES,
  startingNeighborhoodUpgrades,
} from "./neighborhood-home-stories";

describe("Rivergate neighborhood home stories", () => {
  it("gives every background home a unique selectable story", () => {
    expect(NEIGHBORHOOD_HOME_PROFILES).toHaveLength(25);
    expect(
      new Set(NEIGHBORHOOD_HOME_PROFILES.map((home) => home.id)).size,
    ).toBe(NEIGHBORHOOD_HOME_PROFILES.length);
    expect(
      NEIGHBORHOOD_HOME_PROFILES.every(
        (home) => home.ownerName.length > 0 && home.problem.length > 20,
      ),
    ).toBe(true);
  });

  it("starts each side story with exactly its requested repair missing", () => {
    for (const home of NEIGHBORHOOD_HOME_PROFILES) {
      const upgrades = startingNeighborhoodUpgrades(home.need);
      expect(upgrades).toHaveLength(3);
      expect(upgrades).not.toContain(home.need);
    }
  });

  it("provides a stable fallback for future homes", () => {
    expect(neighborhoodHomeProfile("future-home")).toEqual(
      neighborhoodHomeProfile("future-home"),
    );
  });
});
