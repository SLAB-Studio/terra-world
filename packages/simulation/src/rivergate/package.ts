import {
  BuildingCatalogueSchema,
  CampaignAssetManifestSchema,
  CampaignPackageSchema,
  CampaignRulesetSchema,
  type CampaignPackage,
  type CampaignRuleset,
} from "@terra/campaign-schema";

import { BUILDING_CATALOGUE, BUILDING_IDS } from "../catalogue";
import { canonicalStringify, deterministicHash } from "../hash";
import { computeWorldMapHash, createRiverValleyWorld } from "../world";
import {
  CHAPTER_ONE_SCENARIO,
  CHAPTER_TWO_SCENARIO,
  RIVERGATE_FOUNDATIONS_CAMPAIGN,
} from "./content";
import { RIVERGATE_EN_MESSAGES } from "./en";

export const RIVERGATE_CAMPAIGN_PACKAGE_ID = "rivergate-campaign-v1";
export const RIVERGATE_CAMPAIGN_PACKAGE_VERSION = 1;
export const RIVERGATE_CAMPAIGN_MAP_SEED = "rivergate-phase-two";

const RIVERGATE_RULESET: CampaignRuleset = CampaignRulesetSchema.parse({
  schemaVersion: 1,
  id: "rivergate-rules-v1",
  version: 1,
  engine: { id: "terra-deterministic-simulation", version: 1 },
  chapterEvaluators: [
    {
      chapterId: "chapter-1-water",
      evaluatorId: "rivergate-scenario-v1",
    },
    {
      chapterId: "chapter-2-power",
      evaluatorId: "rivergate-scenario-v1",
    },
    { chapterId: "chapter-3-care", evaluatorId: "rivergate-care-v1" },
    { chapterId: "chapter-4-growth", evaluatorId: "rivergate-growth-v1" },
    { chapterId: "chapter-5-storm", evaluatorId: "rivergate-storm-v1" },
  ],
  authoredScenarios: [CHAPTER_ONE_SCENARIO, CHAPTER_TWO_SCENARIO],
});

const RIVERGATE_ASSET_MANIFEST = CampaignAssetManifestSchema.parse({
  schemaVersion: 1,
  delivery: "procedural",
  assets: [],
});

/**
 * Official, JSON-only Rivergate v1 package assembled from the gameplay
 * sources of truth. The MVP renders its functional art procedurally, so the
 * asset manifest is intentionally empty instead of claiming files that do not
 * exist.
 */
export const RIVERGATE_CAMPAIGN_V1_PACKAGE = createRivergateCampaignPackage();

/** Stable local trust anchor; 0G Storage will anchor the same package later. */
export const RIVERGATE_CAMPAIGN_V1_HASH =
  RIVERGATE_CAMPAIGN_V1_PACKAGE.packageHash;

export function loadRivergateCampaignPackage(input: unknown): CampaignPackage {
  const campaignPackage = CampaignPackageSchema.parse(input);
  validatePackageIntegrity(campaignPackage);

  if (campaignPackage.packageHash !== RIVERGATE_CAMPAIGN_V1_HASH) {
    throw new Error("Rivergate package does not match the official v1 hash");
  }

  return campaignPackage;
}

export function serializeRivergateCampaignPackage(): string {
  return canonicalStringify(RIVERGATE_CAMPAIGN_V1_PACKAGE);
}

function createRivergateCampaignPackage(): CampaignPackage {
  const map = createRiverValleyWorld(RIVERGATE_CAMPAIGN_MAP_SEED, {
    id: RIVERGATE_FOUNDATIONS_CAMPAIGN.mapId,
    width: 16,
    height: 12,
  });
  const learningFacts = collectLearningFacts();
  const localizations = {
    en: {
      ...createBuildingMessages(),
      ...RIVERGATE_EN_MESSAGES,
    },
  };

  const sections = {
    campaign: RIVERGATE_FOUNDATIONS_CAMPAIGN,
    map,
    buildings: BuildingCatalogueSchema.parse(BUILDING_CATALOGUE),
    ruleset: RIVERGATE_RULESET,
    learningFacts,
    localizations,
    assetManifest: RIVERGATE_ASSET_MANIFEST,
  };
  const manifest = {
    schemaVersion: 1 as const,
    packageId: RIVERGATE_CAMPAIGN_PACKAGE_ID,
    packageVersion: RIVERGATE_CAMPAIGN_PACKAGE_VERSION,
    campaignId: sections.campaign.id,
    campaignVersion: sections.campaign.version,
    mapId: sections.map.id,
    rulesetId: sections.ruleset.id,
    defaultLocale: "en",
    supportedLocales: ["en"],
    contentHashes: hashSections(sections),
  };
  const unsignedPackage = { manifest, ...sections };
  const campaignPackage = CampaignPackageSchema.parse({
    ...unsignedPackage,
    packageHash: deterministicHash(unsignedPackage),
  });

  validatePackageIntegrity(campaignPackage);
  return campaignPackage;
}

function validatePackageIntegrity(campaignPackage: CampaignPackage): void {
  const { manifest } = campaignPackage;
  if (
    manifest.packageId !== RIVERGATE_CAMPAIGN_PACKAGE_ID ||
    manifest.packageVersion !== RIVERGATE_CAMPAIGN_PACKAGE_VERSION
  ) {
    throw new Error("Unsupported Rivergate campaign package version");
  }
  if (
    manifest.campaignId !== campaignPackage.campaign.id ||
    manifest.campaignVersion !== campaignPackage.campaign.version
  ) {
    throw new Error("Campaign manifest does not match packaged campaign");
  }
  if (
    manifest.mapId !== campaignPackage.map.id ||
    campaignPackage.campaign.mapId !== campaignPackage.map.id
  ) {
    throw new Error("Campaign manifest does not match packaged map");
  }
  if (manifest.rulesetId !== campaignPackage.ruleset.id) {
    throw new Error("Campaign manifest does not match packaged ruleset");
  }
  if (
    computeWorldMapHash(campaignPackage.map) !== campaignPackage.map.mapHash
  ) {
    throw new Error("Packaged map hash is invalid");
  }

  const sectionHashes = hashSections(campaignPackage);
  for (const section of Object.keys(sectionHashes) as Array<
    keyof typeof sectionHashes
  >) {
    if (manifest.contentHashes[section] !== sectionHashes[section]) {
      throw new Error(`Packaged ${section} hash is invalid`);
    }
  }

  const unsignedPackage = unsignedCampaignPackage(campaignPackage);
  if (deterministicHash(unsignedPackage) !== campaignPackage.packageHash) {
    throw new Error("Rivergate package hash is invalid");
  }

  validateCampaignCompleteness(campaignPackage);
}

function unsignedCampaignPackage(campaignPackage: CampaignPackage) {
  return {
    manifest: campaignPackage.manifest,
    campaign: campaignPackage.campaign,
    map: campaignPackage.map,
    buildings: campaignPackage.buildings,
    ruleset: campaignPackage.ruleset,
    learningFacts: campaignPackage.learningFacts,
    localizations: campaignPackage.localizations,
    assetManifest: campaignPackage.assetManifest,
  };
}

function validateCampaignCompleteness(campaignPackage: CampaignPackage): void {
  const {
    campaign,
    buildings,
    ruleset,
    learningFacts,
    localizations,
    manifest,
  } = campaignPackage;
  const buildingIds = buildings.map((building) => building.id);
  assertExactSequence(buildingIds, campaign.buildingIds, "building catalogue");
  assertExactSequence(
    buildingIds,
    BUILDING_IDS,
    "Rivergate building catalogue",
  );

  const chapters = [...campaign.chapters].sort(
    (left, right) => left.order - right.order,
  );
  assertExactSequence(
    ruleset.chapterEvaluators.map((entry) => entry.chapterId),
    chapters.map((chapter) => chapter.id),
    "chapter evaluators",
  );
  if (chapters.length !== 5) {
    throw new Error("Rivergate v1 must contain all five chapters");
  }
  const missions = chapters.flatMap((chapter) => chapter.missions);
  if (missions.length !== 15) {
    throw new Error("Rivergate v1 must contain all fifteen missions");
  }

  const knownBuildingIds = new Set(buildingIds);
  for (const chapter of chapters) {
    assertUnique(
      chapter.missions.map((mission) => mission.id),
      `missions in ${chapter.id}`,
    );
    assertExactSequence(
      [...chapter.missions]
        .sort((left, right) => left.order - right.order)
        .map((mission) => mission.order),
      chapter.missions.map((_mission, index) => index + 1),
      `mission order in ${chapter.id}`,
    );
    for (const mission of chapter.missions) {
      for (const buildingId of mission.allowedBuildingIds) {
        if (!knownBuildingIds.has(buildingId)) {
          throw new Error(`Mission references unknown building: ${buildingId}`);
        }
      }
      for (const objective of mission.objectives) {
        if (
          objective.condition.type === "building-count" &&
          !knownBuildingIds.has(objective.condition.buildingId)
        ) {
          throw new Error(
            `Objective references unknown building: ${objective.condition.buildingId}`,
          );
        }
      }
    }
  }

  assertExactSequence(
    Object.keys(localizations).sort(),
    [...manifest.supportedLocales].sort(),
    "localizations",
  );
  const defaultMessages = localizations[manifest.defaultLocale];
  if (!defaultMessages) {
    throw new Error("Rivergate default localization is missing");
  }
  for (const key of collectRequiredMessageKeys(campaignPackage)) {
    if (!defaultMessages[key]?.trim()) {
      throw new Error(`Rivergate localization is missing: ${key}`);
    }
  }

  const expectedFactKeys = collectLearningFactKeys(campaignPackage);
  assertExactSequence(
    Object.keys(learningFacts).sort(),
    [...expectedFactKeys].sort(),
    "learning facts",
  );
  for (const key of expectedFactKeys) {
    if (learningFacts[key] !== defaultMessages[key]) {
      throw new Error(`Learning fact does not match localization: ${key}`);
    }
  }

  const expectedScenarioChapters = new Set([
    "chapter-1-water",
    "chapter-2-power",
  ]);
  assertExactSequence(
    ruleset.authoredScenarios.map((scenario) => scenario.chapterId).sort(),
    [...expectedScenarioChapters].sort(),
    "authored scenarios",
  );
  for (const scenario of ruleset.authoredScenarios) {
    if (
      !campaign.chapters.some((chapter) => chapter.id === scenario.chapterId)
    ) {
      throw new Error(
        `Scenario references unknown chapter: ${scenario.chapterId}`,
      );
    }
    for (const rule of scenario.rules) {
      const referencedIds =
        rule.type === "building-count" || rule.type === "reserved-clinic-load"
          ? [rule.buildingId]
          : rule.type === "maximum-flood-exposure"
            ? rule.buildingIds
            : [];
      for (const buildingId of referencedIds) {
        if (!knownBuildingIds.has(buildingId)) {
          throw new Error(
            `Scenario references unknown building: ${buildingId}`,
          );
        }
      }
    }
  }
}

function hashSections(
  sections: Pick<
    CampaignPackage,
    | "campaign"
    | "map"
    | "buildings"
    | "ruleset"
    | "learningFacts"
    | "localizations"
    | "assetManifest"
  >,
): CampaignPackage["manifest"]["contentHashes"] {
  return {
    campaign: deterministicHash(sections.campaign),
    map: deterministicHash(sections.map),
    buildings: deterministicHash(sections.buildings),
    ruleset: deterministicHash(sections.ruleset),
    learningFacts: deterministicHash(sections.learningFacts),
    localizations: deterministicHash(sections.localizations),
    assetManifest: deterministicHash(sections.assetManifest),
  };
}

function collectLearningFacts(): Record<string, string> {
  return Object.fromEntries(
    collectLearningFactKeys({
      campaign: RIVERGATE_FOUNDATIONS_CAMPAIGN,
    }).map((key) => {
      const message = RIVERGATE_EN_MESSAGES[key];
      if (!message) throw new Error(`Missing Rivergate learning fact: ${key}`);
      return [key, message];
    }),
  );
}

function createBuildingMessages(): Record<string, string> {
  return Object.fromEntries(
    BUILDING_CATALOGUE.map((building) => [
      building.nameKey,
      building.id
        .split("-")
        .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
        .join(" "),
    ]),
  );
}

function collectLearningFactKeys(
  value: Pick<CampaignPackage, "campaign">,
): string[] {
  return [
    ...new Set(
      value.campaign.chapters.flatMap((chapter) =>
        chapter.missions.flatMap((mission) => mission.learningFactKeys),
      ),
    ),
  ].sort();
}

function collectRequiredMessageKeys(
  campaignPackage: CampaignPackage,
): string[] {
  const keys = [campaignPackage.campaign.titleKey];
  for (const building of campaignPackage.buildings) keys.push(building.nameKey);
  for (const chapter of campaignPackage.campaign.chapters) {
    keys.push(chapter.titleKey);
    for (const mission of chapter.missions) {
      keys.push(mission.titleKey, mission.briefingKey);
      keys.push(...mission.learningFactKeys);
      keys.push(
        ...mission.objectives.map((objective) => objective.descriptionKey),
      );
    }
  }
  for (const event of campaignPackage.campaign.events)
    keys.push(event.titleKey);
  for (const milestone of campaignPackage.campaign.milestones) {
    keys.push(milestone.titleKey);
  }
  for (const scenario of campaignPackage.ruleset.authoredScenarios) {
    keys.push(scenario.titleKey);
    for (const rule of scenario.rules) {
      keys.push(rule.explanationKey, rule.hintKey);
    }
  }
  return [...new Set(keys)].sort();
}

function assertExactSequence<T>(
  actual: readonly T[],
  expected: readonly T[],
  label: string,
): void {
  if (
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    throw new Error(`Rivergate package has incomplete or reordered ${label}`);
  }
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`Rivergate package has duplicate ${label}`);
  }
}
