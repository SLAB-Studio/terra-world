import type { CityState, PlacedBuilding } from "@terra/campaign-schema";
import { describe, expect, it } from "vitest";

import {
  missionProgressKey,
  objectiveProgressKey,
  type CampaignProgressState,
} from "../campaign-state";
import { makeTestCity } from "../test-fixtures";
import { RIVERGATE_FOUNDATIONS_CAMPAIGN } from "./content";
import {
  adaptCityToStormEvaluation,
  advanceRivergateCampaignState,
  evaluateRivergateChapterGate,
  FINAL_STORM_EVENT_ID,
} from "./director";

const NO_EVENTS = { turn: 0, firedEventIds: [] } as const;

describe("Rivergate campaign director", () => {
  it("checks road access only for services designed to join the road network", () => {
    const snapshot = adaptCityToStormEvaluation(stormCity());

    // The riverside pump remains flood-critical, but its catalogue placement
    // rules do not make it a road-network participant. Counting it as an
    // emergency road destination would create an impossible readiness penalty.
    expect(snapshot.floodExposure.criticalServices).toBe(3);
    expect(snapshot.transport.emergencyDestinations).toBe(2);
  });

  it("blocks unequal care even when generic citywide objectives pass", () => {
    const city = careCity(false);
    const progress = progressAt(
      "chapter-3-care",
      "care-for-every-neighbourhood",
    );

    const gate = evaluateRivergateChapterGate(
      city,
      "chapter-3-care",
      NO_EVENTS,
    );
    const result = advanceRivergateCampaignState(
      RIVERGATE_FOUNDATIONS_CAMPAIGN,
      city,
      progress,
      NO_EVENTS,
    );

    expect(gate.complete).toBe(false);
    if (gate.chapterId !== "chapter-3-care") {
      throw new Error("Expected the Chapter 3 care gate");
    }
    expect(gate.evaluation.failures.map((failure) => failure.ruleId)).toContain(
      "care-is-fair",
    );
    expect(result).toMatchObject({
      ok: true,
      transition: { type: "none" },
      state: {
        chapterId: "chapter-3-care",
        missionId: "care-for-every-neighbourhood",
      },
      gate: { complete: false },
    });
  });

  it("advances balanced per-neighbourhood care and unlocks growth", () => {
    const city = careCity(true);
    const progress = progressAt(
      "chapter-3-care",
      "care-for-every-neighbourhood",
    );
    const result = advanceRivergateCampaignState(
      RIVERGATE_FOUNDATIONS_CAMPAIGN,
      city,
      progress,
      NO_EVENTS,
    );

    expect(result).toMatchObject({
      ok: true,
      transition: {
        type: "chapter-advanced",
        nextChapterId: "chapter-4-growth",
        nextChapterLocked: false,
      },
      state: {
        chapterId: "chapter-4-growth",
        missionId: "sort-the-growing-pile",
        phase: "active",
      },
      gate: { complete: true },
    });
  });

  it.each([
    { name: "roads-only", transportId: "road" },
    { name: "transit", transportId: "bus-stop" },
  ])("accepts and unlocks a $name growth plan", ({ transportId }) => {
    const city = growthCity(transportId);
    const progress = progressAt("chapter-4-growth", "make-room-for-rivergate");
    const result = advanceRivergateCampaignState(
      RIVERGATE_FOUNDATIONS_CAMPAIGN,
      city,
      progress,
      NO_EVENTS,
    );

    expect(result).toMatchObject({
      ok: true,
      transition: {
        type: "chapter-advanced",
        nextChapterId: "chapter-5-storm",
        nextChapterLocked: false,
      },
      state: { chapterId: "chapter-5-storm", phase: "active" },
      gate: { complete: true },
    });
    if (result.ok && result.gate?.chapterId === "chapter-4-growth") {
      expect(result.gate.evaluation.strategy).toBe(
        transportId === "bus-stop"
          ? "recycling-and-transit"
          : "recycling-and-roads",
      );
    }
  });

  it("does not accept a skipped storm turn without fired-event evidence", () => {
    const city = stormCity();
    const progress = progressAt("chapter-5-storm", "repair-together");
    const result = advanceRivergateCampaignState(
      RIVERGATE_FOUNDATIONS_CAMPAIGN,
      city,
      progress,
      NO_EVENTS,
    );

    expect(result).toMatchObject({
      ok: true,
      transition: { type: "none" },
      state: { phase: "active", missionId: "repair-together" },
      gate: {
        complete: false,
        eventEvidenceSatisfied: false,
        acceptableOutcome: true,
      },
    });
  });

  it("accepts the exact fired storm with a recoverable evaluation", () => {
    const city = stormCity();
    const progress = progressAt("chapter-5-storm", "repair-together");
    const result = advanceRivergateCampaignState(
      RIVERGATE_FOUNDATIONS_CAMPAIGN,
      city,
      progress,
      { turn: 15, firedEventIds: [FINAL_STORM_EVENT_ID] },
    );

    expect(result).toMatchObject({
      ok: true,
      transition: { type: "campaign-completed" },
      state: { phase: "completed" },
      gate: {
        complete: true,
        eventEvidenceSatisfied: true,
        acceptableOutcome: true,
      },
    });
  });

  it("completes the delayed repair mission from exact turn-15 event history", () => {
    const city = delayedStormCity();
    const result = advanceRivergateCampaignState(
      RIVERGATE_FOUNDATIONS_CAMPAIGN,
      city,
      progressAt("chapter-5-storm", "repair-together"),
      {
        turn: 16,
        firedEventIds: [],
        eventHistory: [
          { turn: 15, firedEventIds: [FINAL_STORM_EVENT_ID] },
          { turn: 16, firedEventIds: [] },
        ],
      },
    );

    expect(result).toMatchObject({
      ok: true,
      transition: { type: "campaign-completed" },
      state: { phase: "completed" },
      gate: { complete: true, eventEvidenceSatisfied: true },
    });
  });

  it.each([
    {
      name: "missing historical event",
      eventHistory: [{ turn: 16, firedEventIds: [] }],
    },
    {
      name: "wrong historical event",
      eventHistory: [
        { turn: 15, firedEventIds: ["not-the-river-storm"] },
        { turn: 16, firedEventIds: [] },
      ],
    },
  ])("rejects $name after the authored turn", ({ eventHistory }) => {
    const result = advanceRivergateCampaignState(
      RIVERGATE_FOUNDATIONS_CAMPAIGN,
      delayedStormCity(),
      progressAt("chapter-5-storm", "repair-together"),
      { turn: 16, firedEventIds: [], eventHistory },
    );

    expect(result).toMatchObject({
      ok: true,
      transition: { type: "none" },
      state: { phase: "active", missionId: "repair-together" },
      gate: { complete: false, eventEvidenceSatisfied: false },
    });
  });

  it("rejects storm evidence duplicated on a later turn", () => {
    const result = advanceRivergateCampaignState(
      RIVERGATE_FOUNDATIONS_CAMPAIGN,
      delayedStormCity(),
      progressAt("chapter-5-storm", "repair-together"),
      {
        turn: 16,
        firedEventIds: [FINAL_STORM_EVENT_ID],
        eventHistory: [
          { turn: 15, firedEventIds: [FINAL_STORM_EVENT_ID] },
          { turn: 16, firedEventIds: [FINAL_STORM_EVENT_ID] },
        ],
      },
    );

    expect(result).toMatchObject({
      ok: true,
      transition: { type: "none" },
      gate: { complete: false, eventEvidenceSatisfied: false },
    });
  });

  it("rejects a forged storm ID without matching turn history", () => {
    const city = stormCity({ actionLog: [] });
    const result = advanceRivergateCampaignState(
      RIVERGATE_FOUNDATIONS_CAMPAIGN,
      city,
      progressAt("chapter-5-storm", "repair-together"),
      { turn: 15, firedEventIds: [FINAL_STORM_EVENT_ID] },
    );

    expect(result).toMatchObject({
      ok: true,
      transition: { type: "none" },
      state: { phase: "active", missionId: "repair-together" },
      gate: {
        complete: false,
        eventEvidenceSatisfied: false,
        acceptableOutcome: true,
      },
    });
  });

  it("completes a hard-hit storm into the constructive rebuilding path", () => {
    const city = stormCity({
      budget: 0,
      buildings: [],
      population: 0,
      indicators: {
        water: 0,
        energy: 0,
        nature: 0,
        community: 80,
        resilience: 0,
      },
      resources: {
        water: { rawSupply: 0, treatedSupply: 0, demand: 0 },
        energy: { generation: 0, stored: 0, storageCapacity: 0, demand: 0 },
        waste: { generated: 0, processed: 0 },
        transport: { capacity: 0, demand: 0 },
        housingCapacity: 0,
        maintenanceDue: 0,
      },
    });
    const result = advanceRivergateCampaignState(
      RIVERGATE_FOUNDATIONS_CAMPAIGN,
      city,
      progressAt("chapter-5-storm", "repair-together"),
      { turn: 15, firedEventIds: [FINAL_STORM_EVENT_ID] },
    );

    expect(result).toMatchObject({
      ok: true,
      transition: { type: "campaign-completed" },
      state: { phase: "completed" },
      gate: {
        complete: true,
        eventEvidenceSatisfied: true,
        acceptableOutcome: false,
        evaluation: { outcomeBand: "hard-hit" },
      },
    });
  });

  it("is deterministic, JSON-safe, and does not mutate city, progress, or evidence", () => {
    const city = careCity(true);
    const progress = progressAt(
      "chapter-3-care",
      "care-for-every-neighbourhood",
    );
    const evidence = { turn: city.turn, firedEventIds: [] } as const;
    const before = structuredClone({ city, progress, evidence });

    const first = advanceRivergateCampaignState(
      RIVERGATE_FOUNDATIONS_CAMPAIGN,
      city,
      progress,
      evidence,
    );
    const transported = JSON.parse(JSON.stringify(first)) as typeof first;
    const second = advanceRivergateCampaignState(
      RIVERGATE_FOUNDATIONS_CAMPAIGN,
      city,
      progress,
      evidence,
    );

    expect(second).toEqual(first);
    expect(transported).toEqual(first);
    expect({ city, progress, evidence }).toEqual(before);
  });
});

function careCity(balanced: boolean): CityState {
  const serviceCoordinates = balanced
    ? { school: [3, 2] as const, clinic: [3, 3] as const }
    : { school: [1, 0] as const, clinic: [2, 0] as const };
  return cityWithBuildings(
    [
      ["home", 1, 1],
      ["home", 2, 1],
      ["home", 1, 4],
      ["home", 2, 4],
      ["road", 0, 1],
      ["road", 3, 1],
      ["road", 0, 4],
      ["road", 3, 4],
      ["school", ...serviceCoordinates.school],
      ["clinic", ...serviceCoordinates.clinic],
    ],
    {
      population: 32,
      budget: 500,
      indicators: {
        water: 80,
        energy: 80,
        nature: 70,
        community: 80,
        resilience: 75,
      },
      milestones: ["power-ready", "care-ready"],
    },
  );
}

function growthCity(transportId: string): CityState {
  return cityWithBuildings(
    [
      ["home", 1, 1],
      ["home", 2, 1],
      ["home", 4, 1],
      ["home", 1, 4],
      ["home", 2, 4],
      ["home", 4, 4],
      ["road", 0, 1],
      ["road", 3, 1],
      ["road", 0, 4],
      ["road", 3, 4],
      [transportId, 5, 4],
      ["school", 3, 2],
      ["clinic", 3, 3],
      ["recycling-centre", 6, 1],
    ],
    {
      population: 40,
      budget: 600,
      indicators: {
        water: 80,
        energy: 80,
        nature: 70,
        community: 80,
        resilience: 75,
      },
      resources: {
        water: { rawSupply: 30, treatedSupply: 30, demand: 20 },
        energy: { generation: 40, stored: 20, storageCapacity: 30, demand: 20 },
        waste: { generated: 10, processed: 10 },
        transport: { capacity: 50, demand: 12 },
        housingCapacity: 48,
        maintenanceDue: 120,
      },
      milestones: ["care-ready", "growth-ready"],
    },
  );
}

function stormCity(patch: Partial<CityState> = {}): CityState {
  return cityWithBuildings(
    [
      ["home", 1, 1],
      ["home", 2, 1],
      ["home", 1, 4],
      ["home", 2, 4],
      ["home", 5, 4],
      ["home", 6, 4],
      ["road", 0, 1],
      ["road", 3, 1],
      ["road", 0, 4],
      ["road", 3, 4],
      ["water-pump", 4, 1],
      ["water-treatment-plant", 4, 2],
      ["solar-array", 5, 1],
      ["battery", 5, 2],
      ["clinic", 4, 3],
      ["bus-stop", 4, 4],
      ["recycling-centre", 6, 1],
      ["wetland", 6, 2],
      ["community-park", 6, 3],
    ],
    {
      turn: 15,
      actionLog: [
        {
          type: "advance-turn",
          actionId: "verified-final-storm-turn",
          turn: 15,
          sequence: 0,
        },
      ],
      population: 32,
      budget: 1_000,
      indicators: {
        water: 85,
        energy: 85,
        nature: 85,
        community: 80,
        resilience: 85,
      },
      resources: {
        water: { rawSupply: 30, treatedSupply: 30, demand: 20 },
        energy: { generation: 40, stored: 30, storageCapacity: 30, demand: 20 },
        waste: { generated: 8, processed: 8 },
        transport: { capacity: 50, demand: 10 },
        housingCapacity: 32,
        maintenanceDue: 100,
      },
      milestones: ["growth-ready", "storm-ready"],
      ...patch,
    },
  );
}

function delayedStormCity(): CityState {
  return stormCity({
    turn: 16,
    actionLog: [
      {
        type: "advance-turn",
        actionId: "verified-final-storm-turn",
        turn: 15,
        sequence: 0,
      },
      {
        type: "advance-turn",
        actionId: "verified-repair-turn",
        turn: 16,
        sequence: 1,
      },
    ],
  });
}

function cityWithBuildings(
  entries: readonly (readonly [string, number, number])[],
  patch: Partial<CityState>,
): CityState {
  const base = makeTestCity();
  const buildings: PlacedBuilding[] = entries.map(
    ([definitionId, x, y], index) => ({
      instanceId: `${definitionId}-${index}`,
      definitionId,
      anchor: { x, y },
      rotation: 0,
      occupiedTileIds: [`tile-${x}-${y}`],
      placedTurn: 1,
    }),
  );
  const occupantByTile = new Map(
    buildings.flatMap((building) =>
      building.occupiedTileIds.map((tileId) => [tileId, building.instanceId]),
    ),
  );
  const tiles = base.tiles.map((tile) => ({
    ...tile,
    floodRisk: occupantByTile.has(tile.id) ? 0.1 : tile.floodRisk,
    occupantId: occupantByTile.get(tile.id) ?? null,
  }));
  return {
    ...base,
    ...patch,
    buildings: patch.buildings ?? buildings,
    tiles,
  };
}

function progressAt(
  chapterId: string,
  missionId: string,
): CampaignProgressState {
  const ordered = [...RIVERGATE_FOUNDATIONS_CAMPAIGN.chapters]
    .sort((left, right) => left.order - right.order)
    .flatMap((chapter) =>
      [...chapter.missions]
        .sort((left, right) => left.order - right.order)
        .map((mission) => ({ chapter, mission })),
    );
  const currentIndex = ordered.findIndex(
    ({ chapter, mission }) =>
      chapter.id === chapterId && mission.id === missionId,
  );
  const completed = ordered.slice(0, currentIndex);
  return {
    schemaVersion: 1,
    campaignId: RIVERGATE_FOUNDATIONS_CAMPAIGN.id,
    campaignVersion: RIVERGATE_FOUNDATIONS_CAMPAIGN.version,
    chapterId,
    missionId,
    phase: "active",
    completedMissionKeys: completed.map(({ chapter, mission }) =>
      missionProgressKey(chapter.id, mission.id),
    ),
    completedObjectiveKeys: completed.flatMap(({ chapter, mission }) =>
      mission.objectives
        .filter((objective) => objective.required)
        .map((objective) =>
          objectiveProgressKey(chapter.id, mission.id, objective.id),
        ),
    ),
  };
}
