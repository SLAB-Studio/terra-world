import { z } from "zod";

import { CityMetricSchema } from "./buildings";
import {
  FiniteNumberSchema,
  IdentifierSchema,
  MessageKeySchema,
  NonNegativeNumberSchema,
  SchemaVersionSchema,
} from "./primitives";

export const ComparisonSchema = z.enum(["eq", "gte", "lte", "gt", "lt"]);

export const ProgressConditionSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("metric"),
      metric: CityMetricSchema,
      comparison: ComparisonSchema,
      value: FiniteNumberSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("building-count"),
      buildingId: IdentifierSchema,
      comparison: ComparisonSchema,
      value: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({ type: z.literal("event-completed"), eventId: IdentifierSchema })
    .strict(),
  z
    .object({
      type: z.literal("milestone-earned"),
      milestoneId: IdentifierSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("turn"),
      comparison: ComparisonSchema,
      value: z.number().int().nonnegative(),
    })
    .strict(),
]);

export const MissionObjectiveSchema = z
  .object({
    id: IdentifierSchema,
    descriptionKey: MessageKeySchema,
    required: z.boolean(),
    condition: ProgressConditionSchema,
  })
  .strict();

export const MissionSchema = z
  .object({
    id: IdentifierSchema,
    titleKey: MessageKeySchema,
    briefingKey: MessageKeySchema,
    order: z.number().int().positive(),
    allowedBuildingIds: z.array(IdentifierSchema),
    objectives: z.array(MissionObjectiveSchema).min(1),
    learningFactKeys: z.array(MessageKeySchema),
  })
  .strict();

export const ChapterSchema = z
  .object({
    id: IdentifierSchema,
    titleKey: MessageKeySchema,
    order: z.number().int().positive(),
    unlockConditions: z.array(ProgressConditionSchema),
    missions: z.array(MissionSchema).min(1),
  })
  .strict();

export const CampaignEventSchema = z
  .object({
    id: IdentifierSchema,
    titleKey: MessageKeySchema,
    kind: z.enum([
      "rain",
      "storm",
      "heatwave",
      "growth",
      "infrastructure-strain",
    ]),
    scheduledTurn: z.number().int().positive(),
    magnitude: z.number().int().min(1).max(5),
    effects: z.array(
      z
        .object({ metric: CityMetricSchema, amount: FiniteNumberSchema })
        .strict(),
    ),
  })
  .strict();

export const MilestoneSchema = z
  .object({
    id: IdentifierSchema,
    titleKey: MessageKeySchema,
    traitId: IdentifierSchema,
    conditions: z.array(ProgressConditionSchema).min(1),
  })
  .strict();

export const CampaignSchema = z
  .object({
    schemaVersion: SchemaVersionSchema,
    id: IdentifierSchema,
    version: z.number().int().positive(),
    titleKey: MessageKeySchema,
    mapId: IdentifierSchema,
    buildingIds: z.array(IdentifierSchema).min(1),
    initialBudget: NonNegativeNumberSchema,
    initialPopulation: z.number().int().nonnegative(),
    chapters: z.array(ChapterSchema).min(1),
    events: z.array(CampaignEventSchema),
    milestones: z.array(MilestoneSchema),
  })
  .strict()
  .superRefine((campaign, context) => {
    checkUnique(campaign.buildingIds, ["buildingIds"], "building id", context);
    checkUnique(
      campaign.chapters.map((chapter) => chapter.id),
      ["chapters"],
      "chapter id",
      context,
    );
    checkUnique(
      campaign.chapters.map((chapter) => String(chapter.order)),
      ["chapters"],
      "chapter order",
      context,
    );
    checkUnique(
      campaign.events.map((event) => event.id),
      ["events"],
      "event id",
      context,
    );
    checkUnique(
      campaign.milestones.map((milestone) => milestone.id),
      ["milestones"],
      "milestone id",
      context,
    );
  });

function checkUnique(
  values: readonly string[],
  path: (string | number)[],
  label: string,
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: `Duplicate ${label}: ${value}`,
      });
    }
    seen.add(value);
  }
}

export type ProgressCondition = z.infer<typeof ProgressConditionSchema>;
export type MissionObjective = z.infer<typeof MissionObjectiveSchema>;
export type Mission = z.infer<typeof MissionSchema>;
export type Chapter = z.infer<typeof ChapterSchema>;
export type CampaignEvent = z.infer<typeof CampaignEventSchema>;
export type Milestone = z.infer<typeof MilestoneSchema>;
export type Campaign = z.infer<typeof CampaignSchema>;
