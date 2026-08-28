import {
  BuildingCatalogueSchema,
  type BuildingDefinition,
  type CoverageDefinition,
} from "@terra/campaign-schema";

export const BUILDING_IDS = [
  "home",
  "road",
  "water-pump",
  "water-treatment-plant",
  "solar-array",
  "battery",
  "school",
  "clinic",
  "bus-stop",
  "recycling-centre",
  "wetland",
  "community-park",
] as const;

export type BuildingId = (typeof BUILDING_IDS)[number];

const oneTile = [{ dx: 0, dy: 0 }];
const allRotations = [0, 90, 180, 270];
const fixedRotation = [0];

const rawCatalogue = [
  {
    id: "home",
    nameKey: "building.home.name",
    category: "housing",
    constructionCost: 120,
    maintenanceCost: 8,
    footprint: oneTile,
    allowedRotations: fixedRotation,
    prerequisites: [{ type: "chapter-unlocked", chapterId: "chapter-1-water" }],
    placementRules: [
      { type: "terrain-allowed", terrains: ["meadow", "forest"] },
      { type: "max-flood-risk", maximum: 0.45 },
      { type: "requires-connection", connection: "road" },
    ],
    inputs: [
      { resource: "clean-water", amount: 2, unit: "units-per-turn" },
      { resource: "electricity", amount: 1, unit: "units-per-turn" },
    ],
    outputs: [{ resource: "housing", amount: 8, unit: "people" }],
    effects: [{ metric: "community", amount: 2, timing: "on-build" }],
  },
  {
    id: "road",
    nameKey: "building.road.name",
    category: "transport",
    constructionCost: 20,
    maintenanceCost: 1,
    footprint: oneTile,
    allowedRotations: allRotations,
    prerequisites: [{ type: "chapter-unlocked", chapterId: "chapter-1-water" }],
    placementRules: [
      {
        type: "terrain-allowed",
        terrains: ["floodplain", "meadow", "forest", "hillside"],
      },
      { type: "max-flood-risk", maximum: 0.75 },
    ],
    inputs: [],
    outputs: [{ resource: "transport", amount: 10, unit: "capacity" }],
    effects: [{ metric: "resilience", amount: 0.5, timing: "per-turn" }],
    coverage: { resource: "transport", radius: 1, strength: 1 },
  },
  {
    id: "water-pump",
    nameKey: "building.water-pump.name",
    category: "water",
    constructionCost: 180,
    maintenanceCost: 12,
    footprint: oneTile,
    allowedRotations: fixedRotation,
    prerequisites: [{ type: "chapter-unlocked", chapterId: "chapter-1-water" }],
    placementRules: [
      { type: "terrain-allowed", terrains: ["floodplain", "wetland"] },
      { type: "max-flood-risk", maximum: 0.95 },
      { type: "requires-adjacent-terrain", terrain: "river", minimum: 1 },
    ],
    inputs: [{ resource: "electricity", amount: 2, unit: "units-per-turn" }],
    outputs: [{ resource: "raw-water", amount: 24, unit: "units-per-turn" }],
    effects: [{ metric: "water", amount: 12, timing: "per-turn" }],
    coverage: { resource: "water", radius: 3, strength: 0.75 },
  },
  {
    id: "water-treatment-plant",
    nameKey: "building.water-treatment-plant.name",
    category: "water",
    constructionCost: 260,
    maintenanceCost: 20,
    footprint: [
      { dx: 0, dy: 0 },
      { dx: 1, dy: 0 },
    ],
    allowedRotations: allRotations,
    prerequisites: [
      { type: "chapter-unlocked", chapterId: "chapter-1-water" },
      { type: "building-present", buildingId: "water-pump", minimum: 1 },
    ],
    placementRules: [
      { type: "terrain-allowed", terrains: ["meadow"] },
      { type: "max-flood-risk", maximum: 0.4 },
      { type: "requires-connection", connection: "road" },
    ],
    inputs: [
      { resource: "raw-water", amount: 18, unit: "units-per-turn" },
      { resource: "electricity", amount: 3, unit: "units-per-turn" },
    ],
    outputs: [{ resource: "clean-water", amount: 16, unit: "units-per-turn" }],
    effects: [
      { metric: "water", amount: 18, timing: "per-turn" },
      { metric: "pollution", amount: 1, timing: "per-turn" },
    ],
    coverage: { resource: "water", radius: 5, strength: 1 },
  },
  {
    id: "solar-array",
    nameKey: "building.solar-array.name",
    category: "energy",
    constructionCost: 220,
    maintenanceCost: 10,
    footprint: [
      { dx: 0, dy: 0 },
      { dx: 1, dy: 0 },
    ],
    allowedRotations: allRotations,
    prerequisites: [{ type: "chapter-unlocked", chapterId: "chapter-2-power" }],
    placementRules: [
      { type: "terrain-allowed", terrains: ["meadow", "hillside"] },
      { type: "max-flood-risk", maximum: 0.3 },
    ],
    inputs: [],
    outputs: [{ resource: "electricity", amount: 20, unit: "units-per-turn" }],
    effects: [
      { metric: "energy", amount: 18, timing: "per-turn" },
      { metric: "pollution", amount: -2, timing: "per-turn" },
    ],
    coverage: { resource: "electricity", radius: 5, strength: 1 },
  },
  {
    id: "battery",
    nameKey: "building.battery.name",
    category: "energy",
    constructionCost: 170,
    maintenanceCost: 8,
    footprint: oneTile,
    allowedRotations: fixedRotation,
    prerequisites: [
      { type: "chapter-unlocked", chapterId: "chapter-2-power" },
      { type: "building-present", buildingId: "solar-array", minimum: 1 },
    ],
    placementRules: [
      { type: "terrain-allowed", terrains: ["meadow", "hillside"] },
      { type: "max-flood-risk", maximum: 0.35 },
      { type: "requires-connection", connection: "road" },
    ],
    inputs: [{ resource: "electricity", amount: 10, unit: "units-per-turn" }],
    outputs: [
      { resource: "electricity-storage", amount: 30, unit: "capacity" },
    ],
    effects: [{ metric: "resilience", amount: 8, timing: "during-event" }],
  },
  {
    id: "school",
    nameKey: "building.school.name",
    category: "service",
    constructionCost: 240,
    maintenanceCost: 18,
    footprint: [
      { dx: 0, dy: 0 },
      { dx: 1, dy: 0 },
    ],
    allowedRotations: allRotations,
    prerequisites: [{ type: "chapter-unlocked", chapterId: "chapter-3-care" }],
    placementRules: [
      { type: "terrain-allowed", terrains: ["meadow"] },
      { type: "max-flood-risk", maximum: 0.35 },
      { type: "requires-connection", connection: "road" },
      { type: "requires-connection", connection: "water" },
      { type: "requires-connection", connection: "electricity" },
    ],
    inputs: [
      { resource: "clean-water", amount: 3, unit: "units-per-turn" },
      { resource: "electricity", amount: 2, unit: "units-per-turn" },
    ],
    outputs: [{ resource: "education", amount: 40, unit: "people" }],
    effects: [{ metric: "community", amount: 12, timing: "per-turn" }],
    coverage: { resource: "education", radius: 4, strength: 1 },
  },
  {
    id: "clinic",
    nameKey: "building.clinic.name",
    category: "service",
    constructionCost: 280,
    maintenanceCost: 24,
    footprint: oneTile,
    allowedRotations: fixedRotation,
    prerequisites: [{ type: "chapter-unlocked", chapterId: "chapter-3-care" }],
    placementRules: [
      { type: "terrain-allowed", terrains: ["meadow"] },
      { type: "max-flood-risk", maximum: 0.3 },
      { type: "requires-connection", connection: "road" },
      { type: "requires-connection", connection: "water" },
      { type: "requires-connection", connection: "electricity" },
    ],
    inputs: [
      { resource: "clean-water", amount: 4, unit: "units-per-turn" },
      { resource: "electricity", amount: 4, unit: "units-per-turn" },
    ],
    outputs: [{ resource: "healthcare", amount: 35, unit: "people" }],
    effects: [
      { metric: "community", amount: 14, timing: "per-turn" },
      { metric: "resilience", amount: 6, timing: "during-event" },
    ],
    coverage: { resource: "healthcare", radius: 4, strength: 1 },
  },
  {
    id: "bus-stop",
    nameKey: "building.bus-stop.name",
    category: "transport",
    constructionCost: 90,
    maintenanceCost: 5,
    footprint: oneTile,
    allowedRotations: fixedRotation,
    prerequisites: [
      { type: "chapter-unlocked", chapterId: "chapter-4-growth" },
    ],
    placementRules: [
      { type: "terrain-allowed", terrains: ["meadow", "floodplain"] },
      { type: "max-flood-risk", maximum: 0.65 },
      { type: "requires-adjacent-building", buildingIds: ["road"], minimum: 1 },
    ],
    inputs: [{ resource: "electricity", amount: 1, unit: "units-per-turn" }],
    outputs: [{ resource: "transport", amount: 25, unit: "capacity" }],
    effects: [
      { metric: "community", amount: 5, timing: "per-turn" },
      { metric: "pollution", amount: -1, timing: "per-turn" },
    ],
    coverage: { resource: "transport", radius: 4, strength: 0.9 },
  },
  {
    id: "recycling-centre",
    nameKey: "building.recycling-centre.name",
    category: "waste",
    constructionCost: 210,
    maintenanceCost: 16,
    footprint: [
      { dx: 0, dy: 0 },
      { dx: 1, dy: 0 },
    ],
    allowedRotations: allRotations,
    prerequisites: [
      { type: "chapter-unlocked", chapterId: "chapter-4-growth" },
    ],
    placementRules: [
      { type: "terrain-allowed", terrains: ["meadow", "hillside"] },
      { type: "max-flood-risk", maximum: 0.35 },
      { type: "requires-connection", connection: "road" },
    ],
    inputs: [
      { resource: "waste", amount: 16, unit: "units-per-turn" },
      { resource: "electricity", amount: 2, unit: "units-per-turn" },
    ],
    outputs: [
      { resource: "waste-processing", amount: 16, unit: "units-per-turn" },
    ],
    effects: [
      { metric: "pollution", amount: -6, timing: "per-turn" },
      { metric: "nature", amount: 3, timing: "per-turn" },
    ],
  },
  {
    id: "wetland",
    nameKey: "building.wetland.name",
    category: "nature",
    constructionCost: 140,
    maintenanceCost: 4,
    footprint: [
      { dx: 0, dy: 0 },
      { dx: 1, dy: 0 },
    ],
    allowedRotations: allRotations,
    prerequisites: [{ type: "chapter-unlocked", chapterId: "chapter-5-storm" }],
    placementRules: [
      { type: "terrain-allowed", terrains: ["floodplain", "wetland"] },
      { type: "max-flood-risk", maximum: 1 },
      { type: "requires-adjacent-terrain", terrain: "river", minimum: 1 },
    ],
    inputs: [],
    outputs: [],
    effects: [
      { metric: "nature", amount: 14, timing: "per-turn" },
      { metric: "biodiversity", amount: 10, timing: "per-turn" },
      { metric: "resilience", amount: 16, timing: "during-event" },
    ],
    coverage: { resource: "nature", radius: 3, strength: 1 },
  },
  {
    id: "community-park",
    nameKey: "building.community-park.name",
    category: "nature",
    constructionCost: 110,
    maintenanceCost: 6,
    footprint: oneTile,
    allowedRotations: fixedRotation,
    prerequisites: [{ type: "chapter-unlocked", chapterId: "chapter-1-water" }],
    placementRules: [
      { type: "terrain-allowed", terrains: ["meadow", "floodplain", "forest"] },
      { type: "max-flood-risk", maximum: 0.7 },
    ],
    inputs: [],
    outputs: [],
    effects: [
      { metric: "nature", amount: 8, timing: "per-turn" },
      { metric: "community", amount: 5, timing: "per-turn" },
      { metric: "biodiversity", amount: 4, timing: "per-turn" },
    ],
    coverage: { resource: "nature", radius: 2, strength: 0.8 },
  },
];

export const BUILDING_CATALOGUE: readonly BuildingDefinition[] = Object.freeze(
  BuildingCatalogueSchema.parse(rawCatalogue),
);

const catalogueById = new Map(
  BUILDING_CATALOGUE.map((definition) => [definition.id, definition]),
);

export function getBuildingDefinition(
  id: string,
): BuildingDefinition | undefined {
  return catalogueById.get(id);
}

export function getBuildingCoverage(
  id: string,
): CoverageDefinition | undefined {
  return getBuildingDefinition(id)?.coverage;
}
