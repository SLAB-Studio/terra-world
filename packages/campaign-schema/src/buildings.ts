import { z } from "zod";

import {
  FiniteNumberSchema,
  IdentifierSchema,
  MessageKeySchema,
  NonNegativeNumberSchema,
  UnitIntervalSchema,
} from "./primitives";
import { ConnectionTypeSchema, TerrainTypeSchema } from "./world";

export const BuildingCategorySchema = z.enum([
  "housing",
  "water",
  "energy",
  "service",
  "transport",
  "waste",
  "nature",
]);

export const ResourceKindSchema = z.enum([
  "raw-water",
  "clean-water",
  "electricity",
  "electricity-storage",
  "housing",
  "education",
  "healthcare",
  "transport",
  "waste",
  "waste-processing",
]);

export const TileOffsetSchema = z
  .object({
    dx: z.number().int().min(-8).max(8),
    dy: z.number().int().min(-8).max(8),
  })
  .strict();

export const RotationSchema = z.union([
  z.literal(0),
  z.literal(90),
  z.literal(180),
  z.literal(270),
]);

export const ResourceFlowSchema = z
  .object({
    resource: ResourceKindSchema,
    amount: NonNegativeNumberSchema,
    unit: z.enum(["units-per-turn", "capacity", "people"]),
  })
  .strict();

export const CityMetricSchema = z.enum([
  "population",
  "budget",
  "water",
  "energy",
  "nature",
  "community",
  "resilience",
  "pollution",
  "biodiversity",
]);

export const CityEffectSchema = z
  .object({
    metric: CityMetricSchema,
    amount: FiniteNumberSchema,
    timing: z.enum(["on-build", "per-turn", "during-event"]),
  })
  .strict();

export const CoverageDefinitionSchema = z
  .object({
    resource: z.enum([
      "water",
      "electricity",
      "education",
      "healthcare",
      "transport",
      "nature",
    ]),
    radius: z.number().int().positive().max(12),
    strength: UnitIntervalSchema,
  })
  .strict();

export const PlacementRuleSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("terrain-allowed"),
      terrains: z.array(TerrainTypeSchema).min(1),
    })
    .strict(),
  z
    .object({ type: z.literal("max-flood-risk"), maximum: UnitIntervalSchema })
    .strict(),
  z
    .object({
      type: z.literal("requires-adjacent-terrain"),
      terrain: TerrainTypeSchema,
      minimum: z.number().int().positive().max(4),
    })
    .strict(),
  z
    .object({
      type: z.literal("requires-adjacent-building"),
      buildingIds: z.array(IdentifierSchema).min(1),
      minimum: z.number().int().positive().max(4),
    })
    .strict(),
  z
    .object({
      type: z.literal("requires-connection"),
      connection: ConnectionTypeSchema,
    })
    .strict(),
]);

export const BuildingPrerequisiteSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("chapter-unlocked"),
      chapterId: IdentifierSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("building-present"),
      buildingId: IdentifierSchema,
      minimum: z.number().int().positive().max(100),
    })
    .strict(),
]);

export const BuildingDefinitionSchema = z
  .object({
    id: IdentifierSchema,
    nameKey: MessageKeySchema,
    category: BuildingCategorySchema,
    constructionCost: NonNegativeNumberSchema,
    maintenanceCost: NonNegativeNumberSchema,
    footprint: z.array(TileOffsetSchema).min(1).max(16),
    allowedRotations: z.array(RotationSchema).min(1),
    prerequisites: z.array(BuildingPrerequisiteSchema),
    placementRules: z.array(PlacementRuleSchema),
    inputs: z.array(ResourceFlowSchema),
    outputs: z.array(ResourceFlowSchema),
    effects: z.array(CityEffectSchema),
    coverage: CoverageDefinitionSchema.optional(),
  })
  .strict()
  .superRefine((building, context) => {
    const offsets = new Set<string>();
    for (const [index, offset] of building.footprint.entries()) {
      const key = `${offset.dx},${offset.dy}`;
      if (offsets.has(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["footprint", index],
          message: `Duplicate footprint offset: ${key}`,
        });
      }
      offsets.add(key);
    }

    if (!offsets.has("0,0")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["footprint"],
        message: "Building footprint must include its 0,0 anchor",
      });
    }
  });

export const BuildingCatalogueSchema = z
  .array(BuildingDefinitionSchema)
  .min(1)
  .superRefine((catalogue, context) => {
    const ids = new Set<string>();
    for (const [index, building] of catalogue.entries()) {
      if (ids.has(building.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "id"],
          message: `Duplicate building id: ${building.id}`,
        });
      }
      ids.add(building.id);
    }
  });

export type BuildingCategory = z.infer<typeof BuildingCategorySchema>;
export type ResourceKind = z.infer<typeof ResourceKindSchema>;
export type TileOffset = z.infer<typeof TileOffsetSchema>;
export type Rotation = z.infer<typeof RotationSchema>;
export type ResourceFlow = z.infer<typeof ResourceFlowSchema>;
export type CityMetric = z.infer<typeof CityMetricSchema>;
export type CityEffect = z.infer<typeof CityEffectSchema>;
export type CoverageDefinition = z.infer<typeof CoverageDefinitionSchema>;
export type PlacementRule = z.infer<typeof PlacementRuleSchema>;
export type BuildingPrerequisite = z.infer<typeof BuildingPrerequisiteSchema>;
export type BuildingDefinition = z.infer<typeof BuildingDefinitionSchema>;
