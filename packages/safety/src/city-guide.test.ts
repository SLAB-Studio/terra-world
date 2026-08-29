import type {
  CauseEffect,
  CityState,
  Mission,
  TurnAction,
} from "@terra/campaign-schema";
import { describe, expect, it } from "vitest";

import {
  CITY_GUIDE_LIMITS,
  CityGuideRequestSchema,
  projectCityGuideRequest,
  SafeCityMemorySchema,
  SafeCityPersonalitySchema,
  serializeCityGuideRequest,
  type CityGuideProjectionInput,
} from "./city-guide";
import {
  assertNoProhibitedComputeData,
  scanProhibitedComputeData,
} from "./prohibited-data";

const action: TurnAction = {
  actionId: "action-1",
  type: "place-building",
  turn: 1,
  sequence: 0,
  buildingId: "home",
  instanceId: "home-1",
  anchor: { x: 0, y: 0 },
  rotation: 0,
};

const mission: Mission = {
  id: "welcome-first-home",
  titleKey: "rivergate.mission.home.title",
  briefingKey: "rivergate.mission.home.briefing",
  order: 1,
  allowedBuildingIds: ["road", "home"],
  objectives: [
    {
      id: "place-home",
      descriptionKey: "rivergate.mission.home.objective",
      required: true,
      condition: {
        type: "building-count",
        buildingId: "home",
        comparison: "gte",
        value: 1,
      },
    },
  ],
  learningFactKeys: ["rivergate.fact.connected-homes"],
};

const cause: CauseEffect = {
  code: "construction.committed",
  category: "construction",
  severity: "positive",
  phase: 1,
  sourceBuildingIds: ["home-1"],
  sourceTileIds: ["tile-0-0"],
  changes: [{ metric: "budget", before: 1_000, after: 900, delta: -100 }],
};

const before = makeCity();
const after = makeCity({
  turn: 1,
  budget: 900,
  population: 4,
  stage: "settlement",
  indicators: {
    water: 75,
    energy: 70,
    nature: 50,
    community: 30,
    resilience: 10,
  },
  buildings: [
    {
      instanceId: "home-1",
      definitionId: "home",
      anchor: { x: 0, y: 0 },
      rotation: 0,
      occupiedTileIds: ["tile-0-0"],
      placedTurn: 1,
    },
  ],
  tiles: [
    {
      ...before.tiles[0]!,
      occupantId: "home-1",
    },
  ],
  actionLog: [action],
});

const baseInput: CityGuideProjectionInput = {
  ageBand: "8-10",
  task: "explain",
  cityPersonality: {
    voice: "hopeful",
    pace: "brief",
    traits: ["kind-neighbour", "curious-builder"],
  },
  mission,
  before,
  action,
  after,
  causes: [cause],
  allowedFactKeys: ["rivergate.fact.connected-homes"],
  relevantMemories: [
    {
      milestoneId: "water-ready",
      earnedTurn: 2,
      factKey: "rivergate.memory.water-ready",
      causeCodes: ["milestone.water-ready"],
      trait: "careful-planner",
    },
  ],
};

describe("CityGuide request projection", () => {
  it("keeps only the verified facts needed by Compute", () => {
    const projected = projectCityGuideRequest({
      ...baseInput,
      childProfile: {
        childName: "Ari",
        preciseAge: 9,
        school: "Example School",
        location: "1 Private Road",
        rawChat: "My private message",
        wallet: "0x1111111111111111111111111111111111111111",
        behaviouralProfile: "impulsive",
      },
      arbitraryDatabaseRecord: { internalScore: 99 },
    } as CityGuideProjectionInput);

    expect(projected).toMatchInlineSnapshot(`
      {
        "action": {
          "anchor": {
            "x": 0,
            "y": 0,
          },
          "buildingId": "home",
          "rotation": 0,
          "turn": 1,
          "type": "place-building",
        },
        "after": {
          "budget": 900,
          "buildings": [
            {
              "buildingId": "home",
              "count": 1,
            },
          ],
          "indicators": {
            "community": 30,
            "energy": 70,
            "nature": 50,
            "resilience": 10,
            "water": 75,
          },
          "population": 4,
          "resources": {
            "energyDemand": 0,
            "energyGeneration": 0,
            "energyStorageCapacity": 0,
            "housingCapacity": 0,
            "maintenanceDue": 0,
            "rawWaterSupply": 0,
            "storedEnergy": 0,
            "transportCapacity": 0,
            "transportDemand": 0,
            "treatedWaterSupply": 0,
            "wasteGenerated": 0,
            "wasteProcessed": 0,
            "waterDemand": 0,
          },
          "stage": "settlement",
          "turn": 1,
        },
        "ageBand": "8-10",
        "allowedFactKeys": [
          "rivergate.fact.connected-homes",
        ],
        "before": {
          "budget": 1000,
          "buildings": [],
          "indicators": {
            "community": 0,
            "energy": 0,
            "nature": 50,
            "resilience": 0,
            "water": 0,
          },
          "population": 0,
          "resources": {
            "energyDemand": 0,
            "energyGeneration": 0,
            "energyStorageCapacity": 0,
            "housingCapacity": 0,
            "maintenanceDue": 0,
            "rawWaterSupply": 0,
            "storedEnergy": 0,
            "transportCapacity": 0,
            "transportDemand": 0,
            "treatedWaterSupply": 0,
            "wasteGenerated": 0,
            "wasteProcessed": 0,
            "waterDemand": 0,
          },
          "stage": "seed",
          "turn": 0,
        },
        "causes": [
          {
            "category": "construction",
            "changes": [
              {
                "after": 900,
                "before": 1000,
                "delta": -100,
                "metric": "budget",
              },
            ],
            "code": "construction.committed",
            "severity": "positive",
          },
        ],
        "cityPersonality": {
          "pace": "brief",
          "traits": [
            "kind-neighbour",
            "curious-builder",
          ],
          "voice": "hopeful",
        },
        "mission": {
          "allowedBuildingIds": [
            "road",
            "home",
          ],
          "briefingKey": "rivergate.mission.home.briefing",
          "missionId": "welcome-first-home",
          "objectiveConditions": [
            {
              "buildingId": "home",
              "comparison": "gte",
              "type": "building-count",
              "value": 1,
            },
          ],
          "objectiveKeys": [
            "rivergate.mission.home.objective",
          ],
          "titleKey": "rivergate.mission.home.title",
        },
        "relevantMemories": [
          {
            "causeCodes": [
              "milestone.water-ready",
            ],
            "earnedTurn": 2,
            "factKey": "rivergate.memory.water-ready",
            "milestoneId": "water-ready",
            "trait": "careful-planner",
          },
        ],
        "schemaVersion": 1,
        "task": "explain",
      }
    `);

    const serialized = serializeCityGuideRequest(projected);
    expect(scanProhibitedComputeData(JSON.parse(serialized))).toEqual([]);
    expect(serialized).not.toContain("turn-test-city");
    expect(serialized).not.toContain("turn-test-seed");
    expect(serialized).not.toContain("tile-0-0");
    expect(serialized).not.toContain("action-1");
    expect(serialized).not.toContain("home-1");
    expect(serialized).not.toContain("childProfile");
    expect(serialized).not.toContain("arbitraryDatabaseRecord");
  });

  it("rejects unverified actions, facts, and mismatched city snapshots", () => {
    expect(() =>
      projectCityGuideRequest({
        ...baseInput,
        action: { ...action, actionId: "not-in-log" },
      }),
    ).toThrow("not present in the verified after-state");

    expect(() =>
      projectCityGuideRequest({
        ...baseInput,
        allowedFactKeys: ["rivergate.fact.not-in-mission"],
      }),
    ).toThrow("not allowlisted by the mission");

    expect(() =>
      projectCityGuideRequest({
        ...baseInput,
        after: { ...after, cityId: "different-city" },
      }),
    ).toThrow("disagree on cityId");
  });

  it("rejects oversized collections instead of leaking or silently truncating", () => {
    expect(() =>
      projectCityGuideRequest({
        ...baseInput,
        relevantMemories: Array.from(
          { length: CITY_GUIDE_LIMITS.memories + 1 },
          (_, index) => ({
            milestoneId: `milestone-${index}`,
            earnedTurn: index,
            factKey: `rivergate.memory.fact-${index}`,
            causeCodes: [],
          }),
        ),
      }),
    ).toThrow();

    expect(() =>
      projectCityGuideRequest({
        ...baseInput,
        causes: Array.from(
          { length: CITY_GUIDE_LIMITS.causes + 1 },
          () => cause,
        ),
      }),
    ).toThrow();

    expect(() =>
      SafeCityPersonalitySchema.parse({
        voice: "calm",
        pace: "brief",
        traits: [
          "careful-planner",
          "curious-builder",
          "kind-neighbour",
          "nature-friend",
        ],
      }),
    ).toThrow();
  });

  it("makes free-form and PII-like memory values unrepresentable", () => {
    expect(() =>
      SafeCityMemorySchema.parse({
        milestoneId: "water-ready",
        earnedTurn: 2,
        factKey: "child@example.com",
        causeCodes: [],
      }),
    ).toThrow();

    expect(() =>
      SafeCityMemorySchema.parse({
        milestoneId: "water-ready",
        earnedTurn: 2,
        factKey: "rivergate.memory.water-ready",
        causeCodes: [],
        rawChat: "My name is Ari",
      }),
    ).toThrow();
  });

  it("keeps the final request schema strict and JSON-safe", () => {
    const request = projectCityGuideRequest(baseInput);
    expect(() =>
      CityGuideRequestSchema.parse({
        ...request,
        childName: "Ari",
      }),
    ).toThrow();
    expect(() =>
      CityGuideRequestSchema.parse({
        ...request,
        before: { ...request.before, budget: Number.NaN },
      }),
    ).toThrow();
    expect(JSON.parse(serializeCityGuideRequest(request))).toEqual(request);
  });
});

describe("prohibited Compute data scanner", () => {
  it("recursively finds prohibited keys and PII-like values", () => {
    const findings = scanProhibitedComputeData({
      nested: {
        childName: "Ari",
        notes: ["safe", "Email child@example.com"],
      },
      wallet: "0x1111111111111111111111111111111111111111",
    });

    expect(findings).toEqual(
      expect.arrayContaining([
        { path: "$.nested.childName", kind: "key", rule: "child-name" },
        {
          path: "$.nested.notes[1]",
          kind: "value",
          rule: "email-address",
        },
        { path: "$.wallet", kind: "key", rule: "wallet" },
        { path: "$.wallet", kind: "value", rule: "evm-wallet" },
      ]),
    );
    expect(() => assertNoProhibitedComputeData({ preciseAge: 9 })).toThrow(
      "precise-age",
    );
  });
});

function makeCity(patch: Partial<CityState> = {}): CityState {
  return {
    schemaVersion: 1,
    cityId: "turn-test-city",
    campaignId: "rivergate-foundations",
    campaignVersion: 1,
    seed: "turn-test-seed",
    mapId: "river-valley",
    mapHash: "0123456789abcdef",
    turn: 0,
    stage: "seed",
    population: 0,
    budget: 1_000,
    tiles: [
      {
        id: "tile-0-0",
        coordinate: { x: 0, y: 0 },
        terrain: "meadow",
        elevation: "middle",
        floodRisk: 0.1,
        habitatValue: 0.4,
        placeable: true,
        occupantId: null,
        connections: { road: false, water: false, electricity: false },
      },
    ],
    buildings: [],
    indicators: {
      water: 0,
      energy: 0,
      nature: 50,
      community: 0,
      resilience: 0,
    },
    resources: {
      water: { rawSupply: 0, treatedSupply: 0, demand: 0 },
      energy: {
        generation: 0,
        stored: 0,
        storageCapacity: 0,
        demand: 0,
      },
      waste: { generated: 0, processed: 0 },
      transport: { capacity: 0, demand: 0 },
      housingCapacity: 0,
      maintenanceDue: 0,
    },
    milestones: [],
    actionLog: [],
    ...patch,
  };
}
