import { describe, expect, it } from "vitest";

import {
  CampaignSchema,
  CauseEffectSchema,
  CityStateSchema,
  type CityState,
  SCHEMA_VERSION,
  WorldMapSchema,
} from "./index";

const tile = {
  id: "tile-0-0",
  coordinate: { x: 0, y: 0 },
  terrain: "meadow" as const,
  elevation: "middle" as const,
  floodRisk: 0.1,
  habitatValue: 0.4,
  placeable: true,
  occupantId: null,
  connections: { road: false, water: false, electricity: false },
};

const validCity: CityState = {
  schemaVersion: SCHEMA_VERSION,
  cityId: "rivergate",
  campaignId: "rivergate-campaign",
  campaignVersion: 1,
  seed: "fixture-seed",
  mapId: "river-valley",
  mapHash: "0123456789abcdef",
  turn: 0,
  stage: "seed",
  population: 0,
  budget: 1_000,
  tiles: [tile],
  buildings: [],
  indicators: { water: 0, energy: 0, nature: 50, community: 0, resilience: 0 },
  resources: {
    water: { rawSupply: 0, treatedSupply: 0, demand: 0 },
    energy: { generation: 0, stored: 0, storageCapacity: 0, demand: 0 },
    waste: { generated: 0, processed: 0 },
    transport: { capacity: 0, demand: 0 },
    housingCapacity: 0,
    maintenanceDue: 0,
  },
  milestones: [],
  actionLog: [],
};

describe("shared schemas", () => {
  it("parses a valid city fixture at numeric boundaries", () => {
    expect(CityStateSchema.parse(validCity)).toEqual(validCity);
  });

  it("rejects missing fields with a useful path", () => {
    const malformed = { ...validCity } as Record<string, unknown>;
    delete malformed.resources;
    const result = CityStateSchema.safeParse(malformed);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["resources"]);
      expect(result.error.issues[0]?.message).toContain("Required");
    }
  });

  it("rejects unsupported schema versions with an understandable error", () => {
    const result = CityStateSchema.safeParse({
      ...validCity,
      schemaVersion: 2,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Unsupported schema version; expected 1",
      );
    }
  });

  it("rejects child personal data because state contracts are strict", () => {
    expect(
      CityStateSchema.safeParse({ ...validCity, childName: "not-allowed" })
        .success,
    ).toBe(false);
  });

  it("checks map cardinality and coordinates", () => {
    const result = WorldMapSchema.safeParse({
      schemaVersion: 1,
      id: "map",
      seed: "seed",
      width: 5,
      height: 5,
      mapHash: "0123456789abcdef",
      tiles: [tile],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          issue.message.includes("exactly 25"),
        ),
      ).toBe(true);
    }
  });

  it("validates campaign, event, milestone, chapter, and mission structure", () => {
    const result = CampaignSchema.safeParse({
      schemaVersion: 1,
      id: "rivergate-campaign",
      version: 1,
      titleKey: "campaign.rivergate.title",
      mapId: "river-valley",
      buildingIds: ["home", "road"],
      initialBudget: 1000,
      initialPopulation: 0,
      chapters: [
        {
          id: "chapter-1-water",
          titleKey: "chapter.water.title",
          order: 1,
          unlockConditions: [],
          missions: [
            {
              id: "mission-first-home",
              titleKey: "mission.first-home.title",
              briefingKey: "mission.first-home.briefing",
              order: 1,
              allowedBuildingIds: ["home", "road"],
              objectives: [
                {
                  id: "objective-home",
                  descriptionKey: "objective.home.description",
                  required: true,
                  condition: {
                    type: "building-count",
                    buildingId: "home",
                    comparison: "gte",
                    value: 1,
                  },
                },
              ],
              learningFactKeys: ["fact.water-access"],
            },
          ],
        },
      ],
      events: [
        {
          id: "event-storm",
          titleKey: "event.storm.title",
          kind: "storm",
          scheduledTurn: 10,
          magnitude: 5,
          effects: [{ metric: "resilience", amount: -20 }],
        },
      ],
      milestones: [
        {
          id: "milestone-settlement",
          titleKey: "milestone.settlement.title",
          traitId: "trait-founder",
          conditions: [
            {
              type: "metric",
              metric: "population",
              comparison: "gte",
              value: 10,
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("validates structured cause/effect arithmetic", () => {
    const result = CauseEffectSchema.safeParse({
      code: "water.supply-increased",
      category: "water",
      severity: "positive",
      phase: 1,
      sourceBuildingIds: ["pump-1"],
      sourceTileIds: ["tile-0-0"],
      changes: [{ metric: "water", before: 10, after: 30, delta: 19 }],
    });
    expect(result.success).toBe(false);
  });
});
