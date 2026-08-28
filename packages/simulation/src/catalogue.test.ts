import { describe, expect, it } from "vitest";

import { BuildingCatalogueSchema } from "@terra/campaign-schema";

import { BUILDING_CATALOGUE, BUILDING_IDS } from "./catalogue";

describe("MVP building catalogue", () => {
  it("contains exactly the twelve required unique building ids", () => {
    expect(BUILDING_CATALOGUE.map((building) => building.id)).toEqual(
      BUILDING_IDS,
    );
    expect(new Set(BUILDING_IDS).size).toBe(12);
  });

  it("passes the shared data schema", () => {
    expect(BuildingCatalogueSchema.safeParse(BUILDING_CATALOGUE).success).toBe(
      true,
    );
  });

  it.each(BUILDING_IDS)(
    "%s declares the complete simulation contract",
    (id) => {
      const building = BUILDING_CATALOGUE.find(
        (candidate) => candidate.id === id,
      );
      expect(building).toBeDefined();
      expect(building?.footprint.length).toBeGreaterThan(0);
      expect(building?.constructionCost).toBeGreaterThan(0);
      expect(building?.maintenanceCost).toBeGreaterThanOrEqual(0);
      expect(building?.prerequisites.length).toBeGreaterThan(0);
      expect(building?.placementRules.length).toBeGreaterThan(0);
      expect(building?.inputs).toBeDefined();
      expect(building?.outputs).toBeDefined();
      expect(building?.effects.length).toBeGreaterThan(0);
    },
  );
});
