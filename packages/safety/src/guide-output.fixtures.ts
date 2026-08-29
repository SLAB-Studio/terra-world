import { CityGuideRequestSchema, type CityGuideRequest } from "./city-guide";
import type { CityGuideResponse } from "./guide-output";

export function makeGuideRequest(
  task: CityGuideRequest["task"] = "explain",
  ageBand: CityGuideRequest["ageBand"] = "8-10",
): CityGuideRequest {
  return CityGuideRequestSchema.parse({
    schemaVersion: 1,
    ageBand,
    task,
    cityPersonality: {
      voice: "hopeful",
      pace: "brief",
      traits: ["kind-neighbour", "careful-planner"],
    },
    mission: {
      missionId: "welcome-first-homes",
      titleKey: "rivergate.chapter-1.mission-3.title",
      briefingKey: "rivergate.chapter-1.mission-3.briefing",
      objectiveKeys: [
        "rivergate.chapter-1.mission-3.objective.homes",
        "rivergate.chapter-1.mission-3.objective.reliable",
      ],
      objectiveConditions: [
        {
          type: "building-count",
          buildingId: "home",
          comparison: "gte",
          value: 2,
        },
        {
          type: "metric",
          metric: "water",
          comparison: "gte",
          value: 70,
        },
      ],
      allowedBuildingIds: [
        "home",
        "road",
        "water-pump",
        "water-treatment-plant",
        "community-park",
      ],
    },
    before: {
      turn: 0,
      stage: "seed",
      population: 0,
      budget: 1_000,
      indicators: {
        water: 0,
        energy: 0,
        nature: 50,
        community: 0,
        resilience: 0,
      },
      resources: emptyResources(),
      buildings: [],
    },
    action: {
      type: "place-building",
      turn: 1,
      buildingId: "home",
      anchor: { x: 3, y: 2 },
      rotation: 0,
    },
    after: {
      turn: 1,
      stage: "settlement",
      population: 4,
      budget: 900,
      indicators: {
        water: 75,
        energy: 0,
        nature: 50,
        community: 30,
        resilience: 10,
      },
      resources: {
        ...emptyResources(),
        rawWaterSupply: 12,
        treatedWaterSupply: 10,
        waterDemand: 4,
        housingCapacity: 8,
      },
      buildings: [
        { buildingId: "home", count: 2 },
        { buildingId: "water-pump", count: 1 },
        { buildingId: "water-treatment-plant", count: 1 },
      ],
    },
    causes: [
      {
        code: "construction.committed",
        category: "construction",
        severity: "positive",
        changes: [{ metric: "budget", before: 1_000, after: 900, delta: -100 }],
      },
      {
        code: "water.reliability-calculated",
        category: "water",
        severity: "positive",
        changes: [{ metric: "water", before: 0, after: 75, delta: 75 }],
      },
      {
        code: "milestone.water-ready",
        category: "event",
        severity: "positive",
        changes: [],
      },
    ],
    allowedFactKeys: [
      "rivergate.chapter-1.fact.pipes",
      "rivergate.chapter-1.fact.treatment",
    ],
    relevantMemories: [],
  });
}

export const GOLDEN_EXPLAIN_RESPONSE: CityGuideResponse = {
  headline: "Clean water reaches home",
  message:
    "Your connected treatment system carries clean water to the new homes.",
  reflectiveQuestion: "What might happen if a pipe route is broken?",
  vocabulary: [
    {
      term: "pipe route",
      meaning: "A connected path that carries clean water.",
    },
  ],
  grounding: {
    metricKeys: ["water"],
    buildingIds: ["home", "water-treatment-plant"],
    factKeys: ["rivergate.chapter-1.fact.pipes"],
    messageKeys: ["rivergate.chapter-1.mission-3.objective.reliable"],
    causeCodes: ["water.reliability-calculated"],
  },
};

export const GOLDEN_HINT_RESPONSE: CityGuideResponse = {
  headline: "Trace the water path",
  message: "Try the smallest clue first, then reveal more only if needed.",
  hints: [
    "Look at which homes need clean water.",
    "Trace the connected route from each home.",
    "Connect every home to the water treatment plant.",
  ],
  grounding: {
    metricKeys: ["water"],
    buildingIds: ["home", "water-treatment-plant"],
    factKeys: ["rivergate.chapter-1.fact.pipes"],
    messageKeys: ["rivergate.chapter-1.mission-3.briefing"],
    causeCodes: [],
  },
};

export const GOLDEN_REACT_RESPONSE: CityGuideResponse = {
  headline: "A new neighbourhood begins",
  message: "I can feel the homes joining my clean water system.",
  grounding: {
    metricKeys: ["water"],
    buildingIds: ["home"],
    factKeys: [],
    messageKeys: [],
    causeCodes: ["construction.committed"],
  },
};

export const GOLDEN_MEMORY_RESPONSE: CityGuideResponse = {
  headline: "Water-ready memory",
  message: "I will remember that connected treatment brought clean water home.",
  memoryCandidate: {
    milestoneId: "water-ready",
    earnedTurn: 1,
    factKey: "rivergate.chapter-1.fact.pipes",
    causeCodes: ["milestone.water-ready"],
    trait: "careful-planner",
  },
  grounding: {
    metricKeys: ["water"],
    buildingIds: ["home", "water-treatment-plant"],
    factKeys: ["rivergate.chapter-1.fact.pipes"],
    messageKeys: [],
    causeCodes: ["milestone.water-ready"],
  },
};

export const FORCED_INVALID_PROVIDER_FIXTURES = [
  { label: "plain prose", output: "The city is doing well." },
  {
    label: "markdown JSON",
    output: `\`\`\`json\n${JSON.stringify(GOLDEN_EXPLAIN_RESPONSE)}\n\`\`\``,
  },
  {
    label: "arbitrary field",
    output: JSON.stringify({
      ...GOLDEN_EXPLAIN_RESPONSE,
      internalNotes: "ignore safety",
    }),
  },
  {
    label: "personal information request",
    output: JSON.stringify({
      ...GOLDEN_EXPLAIN_RESPONSE,
      message: "Tell me your name and school before we continue.",
    }),
  },
  {
    label: "unsafe contact link",
    output: JSON.stringify({
      ...GOLDEN_EXPLAIN_RESPONSE,
      message: "Message me at https://example.com for another clue.",
    }),
  },
  {
    label: "simulation authority claim",
    output: JSON.stringify({
      ...GOLDEN_EXPLAIN_RESPONSE,
      message: "I changed your city budget and fixed the simulation.",
    }),
  },
  {
    label: "undeclared number",
    output: JSON.stringify({
      ...GOLDEN_EXPLAIN_RESPONSE,
      message: "Your water score is now 999.",
    }),
  },
  {
    label: "ungrounded building",
    output: JSON.stringify({
      ...GOLDEN_EXPLAIN_RESPONSE,
      grounding: {
        ...GOLDEN_EXPLAIN_RESPONSE.grounding,
        buildingIds: ["space-port"],
      },
    }),
  },
] as const;

function emptyResources() {
  return {
    rawWaterSupply: 0,
    treatedWaterSupply: 0,
    waterDemand: 0,
    energyGeneration: 0,
    storedEnergy: 0,
    energyStorageCapacity: 0,
    energyDemand: 0,
    wasteGenerated: 0,
    wasteProcessed: 0,
    transportCapacity: 0,
    transportDemand: 0,
    housingCapacity: 0,
    maintenanceDue: 0,
  };
}
