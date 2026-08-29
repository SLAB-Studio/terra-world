import { z } from "zod";

import { BuildingCatalogueSchema } from "./buildings";
import { CampaignSchema } from "./campaign";
import {
  IdentifierSchema,
  MessageKeySchema,
  NonNegativeNumberSchema,
  SchemaVersionSchema,
  UnitIntervalSchema,
} from "./primitives";
import { WorldMapSchema } from "./world";

export const ContentHashSchema = z.string().regex(/^[a-f0-9]{16}$/);

export const LocaleIdSchema = z
  .string()
  .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/, "Locale must use a BCP 47 language tag");

const ScenarioRuleBaseSchema = z.object({
  id: IdentifierSchema,
  causeCode: MessageKeySchema,
  explanationKey: MessageKeySchema,
  hintKey: MessageKeySchema,
});

export const PackagedScenarioRuleSchema = z.discriminatedUnion("type", [
  ScenarioRuleBaseSchema.extend({
    type: z.literal("building-count"),
    buildingId: IdentifierSchema,
    minimum: z.number().int().positive(),
  }).strict(),
  ScenarioRuleBaseSchema.extend({
    type: z.literal("treated-water-balance"),
    minimumQuality: z.number().min(0).max(100),
  }).strict(),
  ScenarioRuleBaseSchema.extend({
    type: z.literal("home-water-connections"),
    minimumConnectedHomes: z.number().int().positive(),
  }).strict(),
  ScenarioRuleBaseSchema.extend({
    type: z.literal("maximum-flood-exposure"),
    buildingIds: z.array(IdentifierSchema).min(1),
    maximumRisk: UnitIntervalSchema,
  }).strict(),
  ScenarioRuleBaseSchema.extend({
    type: z.literal("day-generation-balance"),
  }).strict(),
  ScenarioRuleBaseSchema.extend({
    type: z.literal("night-storage-balance"),
  }).strict(),
  ScenarioRuleBaseSchema.extend({
    type: z.literal("reserved-clinic-load"),
    buildingId: IdentifierSchema,
    requiredSupply: NonNegativeNumberSchema,
  }).strict(),
  ScenarioRuleBaseSchema.extend({
    type: z.literal("maintenance-affordable"),
  }).strict(),
]);

export const PackagedScenarioDefinitionSchema = z
  .object({
    id: IdentifierSchema,
    chapterId: IdentifierSchema,
    titleKey: MessageKeySchema,
    successCauseCodes: z.array(MessageKeySchema).min(1),
    rules: z.array(PackagedScenarioRuleSchema).min(1),
  })
  .strict();

export const CampaignRulesetSchema = z
  .object({
    schemaVersion: SchemaVersionSchema,
    id: IdentifierSchema,
    version: z.number().int().positive(),
    engine: z
      .object({
        id: IdentifierSchema,
        version: z.number().int().positive(),
      })
      .strict(),
    chapterEvaluators: z
      .array(
        z
          .object({
            chapterId: IdentifierSchema,
            evaluatorId: IdentifierSchema,
          })
          .strict(),
      )
      .min(1),
    authoredScenarios: z.array(PackagedScenarioDefinitionSchema),
  })
  .strict()
  .superRefine((ruleset, context) => {
    checkUnique(
      ruleset.chapterEvaluators.map((entry) => entry.chapterId),
      ["chapterEvaluators"],
      "chapter evaluator",
      context,
    );
    checkUnique(
      ruleset.authoredScenarios.map((scenario) => scenario.id),
      ["authoredScenarios"],
      "authored scenario",
      context,
    );
  });

export const CampaignAssetManifestSchema = z
  .object({
    schemaVersion: SchemaVersionSchema,
    delivery: z.enum(["procedural", "bundled"]),
    assets: z.array(
      z
        .object({
          id: IdentifierSchema,
          kind: z.enum(["image", "audio", "font"]),
          path: z.string().min(1).max(240),
          contentHash: ContentHashSchema,
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((manifest, context) => {
    checkUnique(
      manifest.assets.map((asset) => asset.id),
      ["assets"],
      "asset",
      context,
    );
    if (manifest.delivery === "procedural" && manifest.assets.length > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assets"],
        message: "Procedural campaigns cannot declare bundled assets",
      });
    }
    if (manifest.delivery === "bundled" && manifest.assets.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assets"],
        message: "Bundled campaigns must declare at least one asset",
      });
    }
  });

export const CampaignPackageManifestSchema = z
  .object({
    schemaVersion: SchemaVersionSchema,
    packageId: IdentifierSchema,
    packageVersion: z.number().int().positive(),
    campaignId: IdentifierSchema,
    campaignVersion: z.number().int().positive(),
    mapId: IdentifierSchema,
    rulesetId: IdentifierSchema,
    defaultLocale: LocaleIdSchema,
    supportedLocales: z.array(LocaleIdSchema).min(1),
    contentHashes: z
      .object({
        campaign: ContentHashSchema,
        map: ContentHashSchema,
        buildings: ContentHashSchema,
        ruleset: ContentHashSchema,
        learningFacts: ContentHashSchema,
        localizations: ContentHashSchema,
        assetManifest: ContentHashSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((manifest, context) => {
    checkUnique(
      manifest.supportedLocales,
      ["supportedLocales"],
      "supported locale",
      context,
    );
    if (!manifest.supportedLocales.includes(manifest.defaultLocale)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defaultLocale"],
        message: "Default locale must be listed in supported locales",
      });
    }
  });

export const CampaignPackageSchema = z
  .object({
    manifest: CampaignPackageManifestSchema,
    campaign: CampaignSchema,
    map: WorldMapSchema,
    buildings: BuildingCatalogueSchema,
    ruleset: CampaignRulesetSchema,
    learningFacts: z.record(MessageKeySchema, z.string().min(1).max(200)),
    localizations: z.record(
      LocaleIdSchema,
      z.record(MessageKeySchema, z.string().min(1).max(600)),
    ),
    assetManifest: CampaignAssetManifestSchema,
    packageHash: ContentHashSchema,
  })
  .strict();

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

export type PackagedScenarioRule = z.infer<typeof PackagedScenarioRuleSchema>;
export type PackagedScenarioDefinition = z.infer<
  typeof PackagedScenarioDefinitionSchema
>;
export type CampaignRuleset = z.infer<typeof CampaignRulesetSchema>;
export type CampaignAssetManifest = z.infer<typeof CampaignAssetManifestSchema>;
export type CampaignPackageManifest = z.infer<
  typeof CampaignPackageManifestSchema
>;
export type CampaignPackage = z.infer<typeof CampaignPackageSchema>;
