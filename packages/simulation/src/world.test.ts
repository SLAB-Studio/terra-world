import { describe, expect, it, vi } from "vitest";

import {
  computeWorldMapHash,
  createInitialCityState,
  createRiverValleyWorld,
} from "./world";

describe("seeded river-valley world", () => {
  it("creates the same world and hash for the same seed without ambient randomness", () => {
    const ambientRandom = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Ambient randomness is forbidden");
    });

    const first = createRiverValleyWorld("rivergate-demo");
    const second = createRiverValleyWorld("rivergate-demo");

    expect(second).toEqual(first);
    expect(first.mapHash).toBe(computeWorldMapHash(first));
    expect(ambientRandom).not.toHaveBeenCalled();
    ambientRandom.mockRestore();
  });

  it("changes the generated layout when the scenario seed changes", () => {
    const first = createRiverValleyWorld("rivergate-a");
    const second = createRiverValleyWorld("rivergate-b");
    expect(second.mapHash).not.toBe(first.mapHash);
    expect(second.tiles).not.toEqual(first.tiles);
  });

  it("keeps a contiguous river crossing every row", () => {
    const map = createRiverValleyWorld("river-continuity", {
      width: 12,
      height: 9,
    });
    const riverByRow = Array.from({ length: map.height }, (_, y) =>
      map.tiles.filter(
        (tile) => tile.coordinate.y === y && tile.terrain === "river",
      ),
    );

    expect(riverByRow.every((row) => row.length === 1)).toBe(true);
    for (let y = 1; y < riverByRow.length; y += 1) {
      const previous = riverByRow[y - 1]?.[0];
      const current = riverByRow[y]?.[0];
      expect(previous).toBeDefined();
      expect(current).toBeDefined();
      if (previous !== undefined && current !== undefined) {
        expect(
          Math.abs(current.coordinate.x - previous.coordinate.x),
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  it("matches the checked-in deterministic map snapshot", () => {
    const map = createRiverValleyWorld("snapshot-seed", {
      width: 8,
      height: 6,
    });
    const terrainRows = Array.from({ length: map.height }, (_, y) =>
      map.tiles
        .filter((tile) => tile.coordinate.y === y)
        .map((tile) => tile.terrain[0])
        .join(""),
    );

    expect({ hash: map.mapHash, terrainRows }).toMatchSnapshot();
  });

  it("creates a validated initial city without sharing mutable tile objects", () => {
    const map = createRiverValleyWorld("initial-city");
    const city = createInitialCityState(map, {
      cityId: "rivergate",
      campaignId: "rivergate-campaign",
      campaignVersion: 1,
      budget: 1_000,
    });

    expect(city.tiles).toEqual(map.tiles);
    expect(city.tiles).not.toBe(map.tiles);
    expect(city.tiles[0]).not.toBe(map.tiles[0]);
    expect(() =>
      createInitialCityState(map, {
        cityId: "rivergate",
        campaignId: "rivergate-campaign",
        campaignVersion: 1,
        budget: -1,
      }),
    ).toThrow();
  });
});
