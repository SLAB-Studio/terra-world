import { describe, expect, it } from "vitest";

import { CampaignSchema } from "@terra/campaign-schema";

import { BUILDING_CATALOGUE, BUILDING_IDS } from "../catalogue";
import { advanceCampaignState, createCampaignState } from "../campaign-state";
import { createInitialCityState, createRiverValleyWorld } from "../world";
import {
  CHAPTER_THREE_CARE,
  CHAPTER_THREE_CARE_MESSAGES,
} from "./chapter-3-care";
import {
  CHAPTER_FOUR_GROWTH,
  CHAPTER_FOUR_GROWTH_MESSAGES,
} from "./chapter-4-growth";
import {
  CHAPTER_FIVE_STORM,
  CHAPTER_FIVE_STORM_MESSAGES,
} from "./chapter-5-storm";
import {
  CHAPTER_ONE_SCENARIO,
  CHAPTER_ONE_WATER,
  CHAPTER_TWO_POWER,
  CHAPTER_TWO_SCENARIO,
  RIVERGATE_FOUNDATIONS_CAMPAIGN,
} from "./content";
import { RIVERGATE_EN_MESSAGES } from "./en";
import { RIVERGATE_CAUSE_CODES } from "./scenario-types";

describe("Rivergate foundations campaign content", () => {
  it("is campaign-schema valid and uses only the twelve catalogue ids", () => {
    expect(
      CampaignSchema.safeParse(RIVERGATE_FOUNDATIONS_CAMPAIGN).success,
    ).toBe(true);
    expect(RIVERGATE_FOUNDATIONS_CAMPAIGN.buildingIds).toEqual(BUILDING_IDS);

    const knownIds = new Set<string>(BUILDING_IDS);
    for (const chapter of RIVERGATE_FOUNDATIONS_CAMPAIGN.chapters) {
      for (const mission of chapter.missions) {
        expect(mission.allowedBuildingIds.every((id) => knownIds.has(id))).toBe(
          true,
        );
        for (const objective of mission.objectives) {
          if (objective.condition.type === "building-count") {
            expect(knownIds.has(objective.condition.buildingId)).toBe(true);
          }
        }
      }
    }
  });

  it("authors the required learning sequence and explicit scenario rules", () => {
    expect(CHAPTER_ONE_WATER.missions.map((mission) => mission.id)).toEqual([
      "find-the-water",
      "make-water-safe",
      "welcome-first-homes",
    ]);
    expect(CHAPTER_TWO_POWER.missions.map((mission) => mission.id)).toEqual([
      "catch-the-sun",
      "save-power-for-night",
      "protect-the-clinic-plan",
    ]);
    expect(CHAPTER_THREE_CARE.missions.map((mission) => mission.id)).toEqual([
      "plan-a-safe-walk",
      "open-a-school-for-everyone",
      "care-for-every-neighbourhood",
    ]);
    expect(CHAPTER_FOUR_GROWTH.missions.map((mission) => mission.id)).toEqual([
      "sort-the-growing-pile",
      "give-everyone-a-way-to-go",
      "make-room-for-rivergate",
    ]);
    expect(CHAPTER_FIVE_STORM.missions.map((mission) => mission.id)).toEqual([
      "make-room-for-rain",
      "keep-help-moving",
      "repair-together",
    ]);
    expect(CHAPTER_ONE_SCENARIO.rules.map((rule) => rule.type)).toEqual([
      "building-count",
      "building-count",
      "building-count",
      "treated-water-balance",
      "home-water-connections",
      "maximum-flood-exposure",
    ]);
    expect(CHAPTER_TWO_SCENARIO.rules.map((rule) => rule.type)).toEqual([
      "building-count",
      "day-generation-balance",
      "night-storage-balance",
      "reserved-clinic-load",
      "maintenance-affordable",
    ]);
  });

  it("orders all 15 missions when verified gate milestones are supplied", () => {
    const world = createRiverValleyWorld("rivergate-content-test", {
      width: 8,
      height: 6,
    });
    const initial = createInitialCityState(world, {
      cityId: "rivergate-content-city",
      campaignId: RIVERGATE_FOUNDATIONS_CAMPAIGN.id,
      campaignVersion: RIVERGATE_FOUNDATIONS_CAMPAIGN.version,
      budget: 1_000,
    });
    const definitionIds = [
      "water-pump",
      "water-treatment-plant",
      "home",
      "home",
      "home",
      "home",
      "home",
      "home",
      "solar-array",
      "battery",
      "road",
      "road",
      "school",
      "clinic",
      "recycling-centre",
      "bus-stop",
      "wetland",
    ] as const;
    const readyCity = {
      ...initial,
      turn: 15,
      population: 48,
      budget: 1_000,
      indicators: {
        ...initial.indicators,
        water: 100,
        energy: 100,
        nature: 85,
        community: 90,
        resilience: 90,
      },
      milestones: [
        "water-ready",
        "power-ready",
        "care-ready",
        "growth-ready",
        "storm-ready",
      ],
      actionLog: [
        {
          type: "advance-turn" as const,
          actionId: "verified-final-storm-turn",
          turn: 15,
          sequence: 0,
        },
      ],
      buildings: definitionIds.map((definitionId, index) => ({
        instanceId: `${definitionId}-${index}`,
        definitionId,
        anchor: world.tiles[index]?.coordinate ?? { x: index, y: 0 },
        rotation: 0 as const,
        occupiedTileIds: [world.tiles[index]?.id ?? `tile-${index}`],
        placedTurn: 1,
      })),
    };
    let progress = createCampaignState(
      RIVERGATE_FOUNDATIONS_CAMPAIGN,
      readyCity,
    );

    const missionCount = RIVERGATE_FOUNDATIONS_CAMPAIGN.chapters.reduce(
      (total, chapter) => total + chapter.missions.length,
      0,
    );
    for (let step = 0; step < missionCount; step += 1) {
      const result = advanceCampaignState(
        RIVERGATE_FOUNDATIONS_CAMPAIGN,
        readyCity,
        progress,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error.message);
      progress = result.state;
    }

    expect(progress.phase).toBe("completed");
    expect(progress.completedMissionKeys).toHaveLength(15);
    expect(progress.completedObjectiveKeys).toContain(
      "chapter-5-storm::repair-together::weather-the-final-storm",
    );
  });

  it("funds a conservative complete-campaign building and upkeep path", () => {
    const minimumPath = [
      "water-pump",
      "water-treatment-plant",
      "home",
      "home",
      "home",
      "home",
      "home",
      "home",
      "solar-array",
      "battery",
      "road",
      "road",
      "school",
      "clinic",
      "recycling-centre",
      "bus-stop",
      "wetland",
    ] as const;
    const catalogue = new Map(
      BUILDING_CATALOGUE.map((definition) => [definition.id, definition]),
    );
    const definitions = minimumPath.map((id) => {
      const definition = catalogue.get(id);
      if (!definition) throw new Error(`Missing building definition: ${id}`);
      return definition;
    });
    const construction = definitions.reduce(
      (total, definition) => total + definition.constructionCost,
      0,
    );
    const maintenancePerTurn = definitions.reduce(
      (total, definition) => total + definition.maintenanceCost,
      0,
    );
    const eventCosts = RIVERGATE_FOUNDATIONS_CAMPAIGN.events.reduce(
      (total, event) =>
        total +
        event.effects.reduce(
          (eventTotal, effect) =>
            effect.metric === "budget" && effect.amount < 0
              ? eventTotal - effect.amount
              : eventTotal,
          0,
        ),
      0,
    );

    expect(construction).toBe(2_550);
    expect(RIVERGATE_FOUNDATIONS_CAMPAIGN.initialBudget).toBeGreaterThanOrEqual(
      construction + maintenancePerTurn * 15 + eventCosts,
    );
  });

  it("keeps every player-facing field localization-keyed and translated", () => {
    const keys = collectContentKeys();
    for (const key of keys) {
      expect(key).toMatch(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/);
      expect(RIVERGATE_EN_MESSAGES[key], `Missing message: ${key}`).toEqual(
        expect.any(String),
      );
      expect(RIVERGATE_EN_MESSAGES[key]?.trim().length).toBeGreaterThan(0);
    }
    for (const messages of [
      CHAPTER_THREE_CARE_MESSAGES,
      CHAPTER_FOUR_GROWTH_MESSAGES,
      CHAPTER_FIVE_STORM_MESSAGES,
    ]) {
      for (const [key, value] of Object.entries(messages)) {
        expect(RIVERGATE_EN_MESSAGES[key], `Unmerged message: ${key}`).toBe(
          value,
        );
      }
    }
  });

  it("keeps facts concise, concrete, and free of child profile fields", () => {
    const factKeys = RIVERGATE_FOUNDATIONS_CAMPAIGN.chapters.flatMap(
      (chapter) =>
        chapter.missions.flatMap((mission) => mission.learningFactKeys),
    );
    for (const key of factKeys) {
      expect(RIVERGATE_EN_MESSAGES[key]?.length).toBeLessThanOrEqual(120);
    }

    const serialized = JSON.stringify({
      campaign: RIVERGATE_FOUNDATIONS_CAMPAIGN,
      scenarios: [CHAPTER_ONE_SCENARIO, CHAPTER_TWO_SCENARIO],
      messages: RIVERGATE_EN_MESSAGES,
    }).toLowerCase();
    for (const prohibitedField of [
      "childname",
      "child_name",
      "emailaddress",
      "homeaddress",
      "schoolname",
      "birthdate",
    ]) {
      expect(serialized).not.toContain(prohibitedField);
    }
  });

  it("uses only declared simulation cause/effect vocabulary", () => {
    const allowed = new Set<string>(RIVERGATE_CAUSE_CODES);
    for (const scenario of [CHAPTER_ONE_SCENARIO, CHAPTER_TWO_SCENARIO]) {
      expect(
        scenario.successCauseCodes.every((code) => allowed.has(code)),
      ).toBe(true);
      expect(scenario.rules.every((rule) => allowed.has(rule.causeCode))).toBe(
        true,
      );
    }
    expect(
      RIVERGATE_FOUNDATIONS_CAMPAIGN.events.map((event) => `event.${event.id}`),
    ).toEqual([
      "event.chapter-1-river-rain",
      "event.chapter-4-growth-surge",
      "event.chapter-5-river-storm",
    ]);
  });
});

function collectContentKeys(): string[] {
  const keys = [
    RIVERGATE_FOUNDATIONS_CAMPAIGN.titleKey,
    CHAPTER_ONE_SCENARIO.titleKey,
    CHAPTER_TWO_SCENARIO.titleKey,
  ];
  for (const chapter of RIVERGATE_FOUNDATIONS_CAMPAIGN.chapters) {
    keys.push(chapter.titleKey);
    for (const mission of chapter.missions) {
      keys.push(mission.titleKey, mission.briefingKey);
      keys.push(...mission.learningFactKeys);
      keys.push(
        ...mission.objectives.map((objective) => objective.descriptionKey),
      );
    }
  }
  for (const event of RIVERGATE_FOUNDATIONS_CAMPAIGN.events) {
    keys.push(event.titleKey);
  }
  for (const milestone of RIVERGATE_FOUNDATIONS_CAMPAIGN.milestones) {
    keys.push(milestone.titleKey);
  }
  for (const scenario of [CHAPTER_ONE_SCENARIO, CHAPTER_TWO_SCENARIO]) {
    for (const rule of scenario.rules) {
      keys.push(rule.explanationKey, rule.hintKey);
    }
  }
  return [...new Set(keys)];
}
