import {
  CampaignSchema,
  ChapterSchema,
  type Campaign,
  type Chapter,
} from "@terra/campaign-schema";

import { BUILDING_IDS } from "../catalogue";
import type { ScenarioDefinition } from "./scenario-types";

export const CHAPTER_ONE_WATER: Chapter = ChapterSchema.parse({
  id: "chapter-1-water",
  titleKey: "rivergate.chapter-1.title",
  order: 1,
  unlockConditions: [],
  missions: [
    {
      id: "find-the-water",
      titleKey: "rivergate.chapter-1.mission-1.title",
      briefingKey: "rivergate.chapter-1.mission-1.briefing",
      order: 1,
      allowedBuildingIds: ["road", "water-pump"],
      objectives: [
        {
          id: "place-river-pump",
          descriptionKey: "rivergate.chapter-1.mission-1.objective.pump",
          required: true,
          condition: {
            type: "building-count",
            buildingId: "water-pump",
            comparison: "gte",
            value: 1,
          },
        },
      ],
      learningFactKeys: ["rivergate.chapter-1.fact.source"],
    },
    {
      id: "make-water-safe",
      titleKey: "rivergate.chapter-1.mission-2.title",
      briefingKey: "rivergate.chapter-1.mission-2.briefing",
      order: 2,
      allowedBuildingIds: ["road", "water-pump", "water-treatment-plant"],
      objectives: [
        {
          id: "build-treatment",
          descriptionKey: "rivergate.chapter-1.mission-2.objective.treatment",
          required: true,
          condition: {
            type: "building-count",
            buildingId: "water-treatment-plant",
            comparison: "gte",
            value: 1,
          },
        },
        {
          id: "reach-clean-water",
          descriptionKey: "rivergate.chapter-1.mission-2.objective.quality",
          required: true,
          condition: {
            type: "metric",
            metric: "water",
            comparison: "gte",
            value: 70,
          },
        },
      ],
      learningFactKeys: ["rivergate.chapter-1.fact.treatment"],
    },
    {
      id: "welcome-first-homes",
      titleKey: "rivergate.chapter-1.mission-3.title",
      briefingKey: "rivergate.chapter-1.mission-3.briefing",
      order: 3,
      allowedBuildingIds: [
        "home",
        "road",
        "water-pump",
        "water-treatment-plant",
        "community-park",
      ],
      objectives: [
        {
          id: "build-two-homes",
          descriptionKey: "rivergate.chapter-1.mission-3.objective.homes",
          required: true,
          condition: {
            type: "building-count",
            buildingId: "home",
            comparison: "gte",
            value: 2,
          },
        },
        {
          id: "keep-water-reliable",
          descriptionKey: "rivergate.chapter-1.mission-3.objective.reliable",
          required: true,
          condition: {
            type: "metric",
            metric: "water",
            comparison: "gte",
            value: 70,
          },
        },
        {
          id: "protect-the-budget",
          descriptionKey: "rivergate.chapter-1.mission-3.objective.budget",
          required: false,
          condition: {
            type: "metric",
            metric: "budget",
            comparison: "gte",
            value: 250,
          },
        },
      ],
      learningFactKeys: [
        "rivergate.chapter-1.fact.pipes",
        "rivergate.chapter-1.fact.flood-zone",
      ],
    },
  ],
});

export const CHAPTER_TWO_POWER: Chapter = ChapterSchema.parse({
  id: "chapter-2-power",
  titleKey: "rivergate.chapter-2.title",
  order: 2,
  unlockConditions: [{ type: "milestone-earned", milestoneId: "water-ready" }],
  missions: [
    {
      id: "catch-the-sun",
      titleKey: "rivergate.chapter-2.mission-1.title",
      briefingKey: "rivergate.chapter-2.mission-1.briefing",
      order: 1,
      allowedBuildingIds: ["road", "solar-array"],
      objectives: [
        {
          id: "build-solar",
          descriptionKey: "rivergate.chapter-2.mission-1.objective.solar",
          required: true,
          condition: {
            type: "building-count",
            buildingId: "solar-array",
            comparison: "gte",
            value: 1,
          },
        },
        {
          id: "meet-day-demand",
          descriptionKey: "rivergate.chapter-2.mission-1.objective.day",
          required: true,
          condition: {
            type: "metric",
            metric: "energy",
            comparison: "gte",
            value: 70,
          },
        },
      ],
      learningFactKeys: ["rivergate.chapter-2.fact.solar"],
    },
    {
      id: "save-power-for-night",
      titleKey: "rivergate.chapter-2.mission-2.title",
      briefingKey: "rivergate.chapter-2.mission-2.briefing",
      order: 2,
      allowedBuildingIds: ["road", "solar-array", "battery"],
      objectives: [
        {
          id: "build-battery",
          descriptionKey: "rivergate.chapter-2.mission-2.objective.battery",
          required: true,
          condition: {
            type: "building-count",
            buildingId: "battery",
            comparison: "gte",
            value: 1,
          },
        },
        {
          id: "hold-reliable-power",
          descriptionKey: "rivergate.chapter-2.mission-2.objective.reliable",
          required: true,
          condition: {
            type: "metric",
            metric: "energy",
            comparison: "gte",
            value: 70,
          },
        },
      ],
      learningFactKeys: [
        "rivergate.chapter-2.fact.storage",
        "rivergate.chapter-2.fact.day-night",
      ],
    },
    {
      id: "protect-the-clinic-plan",
      titleKey: "rivergate.chapter-2.mission-3.title",
      briefingKey: "rivergate.chapter-2.mission-3.briefing",
      order: 3,
      allowedBuildingIds: ["road", "solar-array", "battery"],
      objectives: [
        {
          id: "keep-night-power",
          descriptionKey: "rivergate.chapter-2.mission-3.objective.clinic",
          required: true,
          condition: {
            type: "metric",
            metric: "energy",
            comparison: "gte",
            value: 80,
          },
        },
        {
          id: "afford-maintenance",
          descriptionKey: "rivergate.chapter-2.mission-3.objective.maintenance",
          required: false,
          condition: {
            type: "metric",
            metric: "budget",
            comparison: "gte",
            value: 200,
          },
        },
      ],
      learningFactKeys: [
        "rivergate.chapter-2.fact.clinic",
        "rivergate.chapter-2.fact.maintenance",
      ],
    },
  ],
});

export const CHAPTER_ONE_SCENARIO: ScenarioDefinition = {
  id: "chapter-1-water-check",
  chapterId: "chapter-1-water",
  titleKey: "rivergate.chapter-1.scenario.title",
  successCauseCodes: [
    "construction.committed",
    "water.reliability-calculated",
    "community.population-change",
  ],
  rules: [
    {
      type: "building-count",
      id: "water-source-present",
      buildingId: "water-pump",
      minimum: 1,
      causeCode: "construction.committed",
      explanationKey: "rivergate.fallback.water.no-source",
      hintKey: "rivergate.hint.water.no-source",
    },
    {
      type: "building-count",
      id: "treatment-present",
      buildingId: "water-treatment-plant",
      minimum: 1,
      causeCode: "water.reliability-calculated",
      explanationKey: "rivergate.fallback.water.untreated",
      hintKey: "rivergate.hint.water.untreated",
    },
    {
      type: "building-count",
      id: "first-homes-present",
      buildingId: "home",
      minimum: 2,
      causeCode: "community.population-change",
      explanationKey: "rivergate.fallback.water.no-homes",
      hintKey: "rivergate.hint.water.no-homes",
    },
    {
      type: "treated-water-balance",
      id: "safe-water-for-demand",
      minimumQuality: 80,
      causeCode: "water.reliability-calculated",
      explanationKey: "rivergate.fallback.water.quality",
      hintKey: "rivergate.hint.water.quality",
    },
    {
      type: "home-water-connections",
      id: "pipes-reach-every-home",
      minimumConnectedHomes: 2,
      causeCode: "water.reliability-calculated",
      explanationKey: "rivergate.fallback.water.disconnected",
      hintKey: "rivergate.hint.water.disconnected",
    },
    {
      type: "maximum-flood-exposure",
      id: "treatment-above-flood-zone",
      buildingIds: ["water-treatment-plant"],
      maximumRisk: 0.4,
      causeCode: "event.chapter-1-river-rain",
      explanationKey: "rivergate.fallback.water.flood-zone",
      hintKey: "rivergate.hint.water.flood-zone",
    },
  ],
};

export const CHAPTER_TWO_SCENARIO: ScenarioDefinition = {
  id: "chapter-2-power-check",
  chapterId: "chapter-2-power",
  titleKey: "rivergate.chapter-2.scenario.title",
  successCauseCodes: [
    "construction.committed",
    "energy.reliability-calculated",
    "community.services-impact",
    "budget.maintenance-paid",
  ],
  rules: [
    {
      type: "building-count",
      id: "solar-present",
      buildingId: "solar-array",
      minimum: 1,
      causeCode: "construction.committed",
      explanationKey: "rivergate.fallback.energy.no-solar",
      hintKey: "rivergate.hint.energy.no-solar",
    },
    {
      type: "day-generation-balance",
      id: "day-demand-met",
      causeCode: "energy.reliability-calculated",
      explanationKey: "rivergate.fallback.energy.day-shortfall",
      hintKey: "rivergate.hint.energy.day-shortfall",
    },
    {
      type: "night-storage-balance",
      id: "night-demand-met",
      causeCode: "energy.reliability-calculated",
      explanationKey: "rivergate.fallback.energy.night-shortfall",
      hintKey: "rivergate.hint.energy.night-shortfall",
    },
    {
      type: "reserved-clinic-load",
      id: "clinic-reserve-met",
      buildingId: "clinic",
      requiredSupply: 4,
      causeCode: "community.services-impact",
      explanationKey: "rivergate.fallback.energy.clinic",
      hintKey: "rivergate.hint.energy.clinic",
    },
    {
      type: "maintenance-affordable",
      id: "maintenance-covered",
      causeCode: "budget.maintenance-shortfall",
      explanationKey: "rivergate.fallback.energy.maintenance",
      hintKey: "rivergate.hint.energy.maintenance",
    },
  ],
};

export const RIVERGATE_FOUNDATIONS_CAMPAIGN: Campaign = CampaignSchema.parse({
  schemaVersion: 1,
  id: "rivergate-foundations",
  version: 1,
  titleKey: "rivergate.campaign.title",
  mapId: "river-valley",
  buildingIds: BUILDING_IDS,
  initialBudget: 2_000,
  initialPopulation: 0,
  chapters: [CHAPTER_ONE_WATER, CHAPTER_TWO_POWER],
  events: [
    {
      id: "chapter-1-river-rain",
      titleKey: "rivergate.event.river-rain.title",
      kind: "rain",
      scheduledTurn: 3,
      magnitude: 3,
      effects: [
        { metric: "water", amount: -10 },
        { metric: "budget", amount: -20 },
      ],
    },
  ],
  milestones: [
    {
      id: "water-ready",
      titleKey: "rivergate.milestone.water-ready.title",
      traitId: "trait-water-wise",
      conditions: [
        {
          type: "building-count",
          buildingId: "water-pump",
          comparison: "gte",
          value: 1,
        },
        {
          type: "building-count",
          buildingId: "water-treatment-plant",
          comparison: "gte",
          value: 1,
        },
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
    },
    {
      id: "power-ready",
      titleKey: "rivergate.milestone.power-ready.title",
      traitId: "trait-energy-planner",
      conditions: [
        {
          type: "building-count",
          buildingId: "solar-array",
          comparison: "gte",
          value: 1,
        },
        {
          type: "building-count",
          buildingId: "battery",
          comparison: "gte",
          value: 1,
        },
        {
          type: "metric",
          metric: "energy",
          comparison: "gte",
          value: 80,
        },
      ],
    },
  ],
});
