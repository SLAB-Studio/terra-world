import { z } from "zod";

import { CityMetricSchema, RotationSchema } from "./buildings";
import {
  CoordinateSchema,
  FiniteNumberSchema,
  IdentifierSchema,
  MessageKeySchema,
  NonNegativeNumberSchema,
  PercentageSchema,
  SchemaVersionSchema,
} from "./primitives";
import { TileStateSchema } from "./world";

export const CityStageSchema = z.enum([
  "seed",
  "settlement",
  "town",
  "city",
  "resilient-city",
]);

export const PlacedBuildingSchema = z
  .object({
    instanceId: IdentifierSchema,
    definitionId: IdentifierSchema,
    anchor: CoordinateSchema,
    rotation: RotationSchema,
    occupiedTileIds: z.array(IdentifierSchema).min(1),
    placedTurn: z.number().int().nonnegative(),
  })
  .strict();

export const ResourceStateSchema = z
  .object({
    water: z
      .object({
        rawSupply: NonNegativeNumberSchema,
        treatedSupply: NonNegativeNumberSchema,
        demand: NonNegativeNumberSchema,
      })
      .strict(),
    energy: z
      .object({
        generation: NonNegativeNumberSchema,
        stored: NonNegativeNumberSchema,
        storageCapacity: NonNegativeNumberSchema,
        demand: NonNegativeNumberSchema,
      })
      .strict(),
    waste: z
      .object({
        generated: NonNegativeNumberSchema,
        processed: NonNegativeNumberSchema,
      })
      .strict(),
    transport: z
      .object({
        capacity: NonNegativeNumberSchema,
        demand: NonNegativeNumberSchema,
      })
      .strict(),
    housingCapacity: NonNegativeNumberSchema,
    maintenanceDue: NonNegativeNumberSchema,
  })
  .strict();

const TurnActionBaseSchema = z.object({
  actionId: IdentifierSchema,
  turn: z.number().int().nonnegative(),
  sequence: z.number().int().nonnegative(),
});

export const TurnActionSchema = z.discriminatedUnion("type", [
  TurnActionBaseSchema.extend({
    type: z.literal("place-building"),
    buildingId: IdentifierSchema,
    instanceId: IdentifierSchema,
    anchor: CoordinateSchema,
    rotation: RotationSchema,
  }).strict(),
  TurnActionBaseSchema.extend({
    type: z.literal("remove-building"),
    instanceId: IdentifierSchema,
  }).strict(),
  TurnActionBaseSchema.extend({ type: z.literal("advance-turn") }).strict(),
]);

export const ActionLogSchema = z
  .array(TurnActionSchema)
  .superRefine((actions, context) => {
    const actionIds = new Set<string>();
    let previousSequence = -1;
    for (const [index, action] of actions.entries()) {
      if (actionIds.has(action.actionId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "actionId"],
          message: `Duplicate action id: ${action.actionId}`,
        });
      }
      actionIds.add(action.actionId);

      if (action.sequence <= previousSequence) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "sequence"],
          message: "Action sequence must be strictly increasing",
        });
      }
      previousSequence = action.sequence;
    }
  });

export const CauseEffectSchema = z
  .object({
    code: MessageKeySchema,
    category: z.enum([
      "construction",
      "water",
      "energy",
      "nature",
      "community",
      "budget",
      "event",
    ]),
    severity: z.enum(["positive", "neutral", "warning", "critical"]),
    phase: z.number().int().nonnegative(),
    sourceBuildingIds: z.array(IdentifierSchema),
    sourceTileIds: z.array(IdentifierSchema),
    changes: z.array(
      z
        .object({
          metric: CityMetricSchema,
          before: FiniteNumberSchema,
          after: FiniteNumberSchema,
          delta: FiniteNumberSchema,
        })
        .strict()
        .superRefine((change, context) => {
          if (Math.abs(change.after - change.before - change.delta) > 1e-9) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["delta"],
              message: "Cause/effect delta must equal after minus before",
            });
          }
        }),
    ),
  })
  .strict();

export const CityStateSchema = z
  .object({
    schemaVersion: SchemaVersionSchema,
    cityId: IdentifierSchema,
    campaignId: IdentifierSchema,
    campaignVersion: z.number().int().positive(),
    seed: z.string().min(1).max(120),
    mapId: IdentifierSchema,
    mapHash: z.string().regex(/^[a-f0-9]{16}$/),
    turn: z.number().int().nonnegative(),
    stage: CityStageSchema,
    population: z.number().int().nonnegative(),
    budget: NonNegativeNumberSchema,
    tiles: z.array(TileStateSchema).min(1),
    buildings: z.array(PlacedBuildingSchema),
    indicators: z
      .object({
        water: PercentageSchema,
        energy: PercentageSchema,
        nature: PercentageSchema,
        community: PercentageSchema,
        resilience: PercentageSchema,
      })
      .strict(),
    resources: ResourceStateSchema,
    milestones: z.array(IdentifierSchema),
    actionLog: ActionLogSchema,
  })
  .strict()
  .superRefine((city, context) => {
    const tileIds = new Set(city.tiles.map((tile) => tile.id));
    const buildingIds = new Set<string>();
    for (const [index, building] of city.buildings.entries()) {
      if (buildingIds.has(building.instanceId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["buildings", index, "instanceId"],
          message: `Duplicate building instance id: ${building.instanceId}`,
        });
      }
      buildingIds.add(building.instanceId);
      for (const tileId of building.occupiedTileIds) {
        if (!tileIds.has(tileId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["buildings", index, "occupiedTileIds"],
            message: `Building references unknown tile: ${tileId}`,
          });
        }
      }
    }

    for (const [index, tile] of city.tiles.entries()) {
      if (tile.occupantId !== null && !buildingIds.has(tile.occupantId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["tiles", index, "occupantId"],
          message: `Tile references unknown building: ${tile.occupantId}`,
        });
      }
    }
  });

export type CityStage = z.infer<typeof CityStageSchema>;
export type PlacedBuilding = z.infer<typeof PlacedBuildingSchema>;
export type ResourceState = z.infer<typeof ResourceStateSchema>;
export type TurnAction = z.infer<typeof TurnActionSchema>;
export type CauseEffect = z.infer<typeof CauseEffectSchema>;
export type CityState = z.infer<typeof CityStateSchema>;
