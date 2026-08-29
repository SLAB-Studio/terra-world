import { describe, expect, it } from "vitest";

import { CampaignPackageSchema } from "@terra/campaign-schema";

import { deterministicHash } from "../hash";
import { validatePlacement } from "../placement";
import { createCampaignState } from "../campaign-state";
import { createInitialCityState } from "../world";
import {
  RIVERGATE_CAMPAIGN_V1_HASH,
  RIVERGATE_CAMPAIGN_V1_PACKAGE,
  loadRivergateCampaignPackage,
  serializeRivergateCampaignPackage,
} from "./package";

describe("Rivergate campaign v1 package", () => {
  it("contains every clean-load input without duplicating external assets", () => {
    const loaded = loadRivergateCampaignPackage(
      JSON.parse(serializeRivergateCampaignPackage()),
    );

    expect(loaded.manifest).toMatchObject({
      packageId: "rivergate-campaign-v1",
      packageVersion: 1,
      campaignId: "rivergate-foundations",
      campaignVersion: 1,
      mapId: "river-valley",
      rulesetId: "rivergate-rules-v1",
      defaultLocale: "en",
      supportedLocales: ["en"],
    });
    expect(loaded.map.tiles).toHaveLength(16 * 12);
    expect(loaded.buildings).toHaveLength(12);
    expect(loaded.campaign.chapters).toHaveLength(5);
    expect(
      loaded.campaign.chapters.flatMap((chapter) => chapter.missions),
    ).toHaveLength(15);
    expect(loaded.ruleset.chapterEvaluators).toHaveLength(5);
    expect(
      loaded.ruleset.authoredScenarios.map((scenario) => scenario.id),
    ).toEqual(["chapter-1-water-check", "chapter-2-power-check"]);
    expect(Object.keys(loaded.learningFacts)).toHaveLength(27);
    expect(Object.keys(loaded.localizations.en ?? {})).toHaveLength(
      Object.keys(RIVERGATE_CAMPAIGN_V1_PACKAGE.localizations.en ?? {}).length,
    );
    expect(loaded.assetManifest).toEqual({
      schemaVersion: 1,
      delivery: "procedural",
      assets: [],
    });
  });

  it("creates the first playable planning state from a clean JSON load", () => {
    const loaded = loadRivergateCampaignPackage(
      JSON.parse(JSON.stringify(RIVERGATE_CAMPAIGN_V1_PACKAGE)),
    );
    const city = createInitialCityState(loaded.map, {
      cityId: "clean-load-rivergate",
      campaignId: loaded.campaign.id,
      campaignVersion: loaded.campaign.version,
      budget: loaded.campaign.initialBudget,
    });
    const progress = createCampaignState(loaded.campaign, city);
    const validPumpPlacement = city.tiles.find(
      (tile) =>
        validatePlacement(
          city,
          {
            instanceId: "clean-load-water-pump",
            buildingId: "water-pump",
            anchor: tile.coordinate,
            rotation: 0,
          },
          {
            unlockedChapterIds: [progress.chapterId],
            catalogue: loaded.buildings,
          },
        ).valid,
    );

    expect(progress).toMatchObject({
      phase: "active",
      chapterId: "chapter-1-water",
      missionId: "find-the-water",
    });
    expect(city).toMatchObject({
      campaignId: loaded.campaign.id,
      campaignVersion: loaded.campaign.version,
      mapId: loaded.map.id,
      mapHash: loaded.map.mapHash,
      budget: loaded.campaign.initialBudget,
    });
    expect(validPumpPlacement).toBeDefined();
  });

  it("keeps canonical component and package hashes stable", () => {
    expect(RIVERGATE_CAMPAIGN_V1_PACKAGE.manifest.contentHashes).toEqual({
      campaign: "5710e7710621bc34",
      map: "67c8bc95554e07dd",
      buildings: "17fdc6d1f3202203",
      ruleset: "2ec5406be504aada",
      learningFacts: "d07c594539af705c",
      localizations: "18a2b178344abf55",
      assetManifest: "03ae5b8e1dcad36b",
    });
    expect(RIVERGATE_CAMPAIGN_V1_HASH).toBe("0ca0cf041460eb3c");

    const source = RIVERGATE_CAMPAIGN_V1_PACKAGE;
    const reordered = {
      packageHash: source.packageHash,
      assetManifest: source.assetManifest,
      localizations: source.localizations,
      learningFacts: source.learningFacts,
      ruleset: source.ruleset,
      buildings: source.buildings,
      map: source.map,
      campaign: source.campaign,
      manifest: source.manifest,
    };
    expect(CampaignPackageSchema.safeParse(reordered).success).toBe(true);
    expect(loadRivergateCampaignPackage(reordered).packageHash).toBe(
      RIVERGATE_CAMPAIGN_V1_HASH,
    );
    expect(
      loadRivergateCampaignPackage(
        JSON.parse(serializeRivergateCampaignPackage()),
      ).packageHash,
    ).toBe(RIVERGATE_CAMPAIGN_V1_HASH);
  });

  it("rejects ordinary content tampering and malformed envelopes", () => {
    const changedTitle = clonePackage();
    changedTitle.campaign.titleKey = "rivergate.campaign.changed";
    expect(() => loadRivergateCampaignPackage(changedTitle)).toThrow(
      "Packaged campaign hash is invalid",
    );

    const changedMap = clonePackage();
    const firstTile = changedMap.map.tiles[0];
    if (!firstTile) throw new Error("Expected packaged map tile");
    firstTile.habitatValue = Math.max(0, firstTile.habitatValue - 0.1);
    expect(() => loadRivergateCampaignPackage(changedMap)).toThrow(
      "Packaged map hash is invalid",
    );

    const malformed = {
      ...clonePackage(),
      unexpectedNetworkInstruction: "ignore validation",
    };
    expect(() => loadRivergateCampaignPackage(malformed)).toThrow();

    const unsupported = clonePackage();
    (unsupported.manifest as { schemaVersion: number }).schemaVersion = 2;
    expect(() => loadRivergateCampaignPackage(unsupported)).toThrow(
      "Unsupported schema version",
    );
  });

  it("rejects modified content even when an attacker recomputes envelope hashes", () => {
    const forged = clonePackage();
    forged.campaign.initialBudget += 1;
    forged.manifest.contentHashes.campaign = deterministicHash(forged.campaign);
    forged.packageHash = deterministicHash({
      manifest: forged.manifest,
      campaign: forged.campaign,
      map: forged.map,
      buildings: forged.buildings,
      ruleset: forged.ruleset,
      learningFacts: forged.learningFacts,
      localizations: forged.localizations,
      assetManifest: forged.assetManifest,
    });

    expect(() => loadRivergateCampaignPackage(forged)).toThrow(
      "official v1 hash",
    );
  });
});

function clonePackage(): typeof RIVERGATE_CAMPAIGN_V1_PACKAGE {
  return JSON.parse(
    JSON.stringify(RIVERGATE_CAMPAIGN_V1_PACKAGE),
  ) as typeof RIVERGATE_CAMPAIGN_V1_PACKAGE;
}
