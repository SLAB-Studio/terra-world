import { describe, expect, it } from "vitest";

import {
  RIVERGATE_CAMPAIGN_V1_PACKAGE,
  createInitialCityState,
  createPlanningSession,
  materializePlanningState,
  networkSnapshotForCity,
  placeProvisional,
  replayCity,
  simulateTurn,
  validatePlacement,
  type PlacementRequest,
} from "@terra/simulation";
import type { CityState } from "@terra/campaign-schema";

import {
  RunVerificationError,
  registeredRivergateCampaign,
  verifyRivergateCampaignRun,
} from "./verify-server";

const SALT = `0x${"a".repeat(64)}`;
const CHAPTER_IDS = RIVERGATE_CAMPAIGN_V1_PACKAGE.campaign.chapters.map(
  (chapter) => chapter.id,
);

describe("Rivergate server replay verification", () => {
  it("replays a registered run and returns a stable anonymous commitment", async () => {
    const fixture = createRun();

    const first = await verifyRivergateCampaignRun({
      schemaVersion: 1,
      campaign: registeredRivergateCampaign(),
      ...fixture,
      salt: SALT,
    });
    const second = await verifyRivergateCampaignRun({
      schemaVersion: 1,
      campaign: registeredRivergateCampaign(),
      ...fixture,
      salt: SALT,
    });

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      schemaVersion: 1,
      replayStatus: "verified",
      turnsReplayed: 1,
      campaign: {
        campaignId: "rivergate-foundations",
        campaignVersion: 1,
      },
    });
    expect(first.actionLogHash).toMatch(/^[a-f0-9]{16}$/u);
    expect(first.finalStateHash).toMatch(/^[a-f0-9]{16}$/u);
    expect(first.runCommitment).toMatch(/^0x[a-f0-9]{64}$/u);
    expect(JSON.stringify(first)).not.toContain(fixture.initialState.cityId);
    expect(JSON.stringify(first)).not.toContain(SALT);
  });

  it("changes the commitment when the secret salt changes", async () => {
    const fixture = createRun();
    const first = await verifyRivergateCampaignRun({
      schemaVersion: 1,
      campaign: registeredRivergateCampaign(),
      ...fixture,
      salt: SALT,
    });
    const second = await verifyRivergateCampaignRun({
      schemaVersion: 1,
      campaign: registeredRivergateCampaign(),
      ...fixture,
      salt: `0x${"b".repeat(64)}`,
    });

    expect(second.runCommitment).not.toBe(first.runCommitment);
  });

  it.each([
    [
      "campaign version",
      (input: ReturnType<typeof createInput>) => ({
        ...input,
        campaign: { ...input.campaign, campaignVersion: 2 },
      }),
    ],
    [
      "package hash",
      (input: ReturnType<typeof createInput>) => ({
        ...input,
        campaign: { ...input.campaign, packageHash: "f".repeat(16) },
      }),
    ],
    [
      "ruleset hash",
      (input: ReturnType<typeof createInput>) => ({
        ...input,
        campaign: { ...input.campaign, rulesetHash: "e".repeat(16) },
      }),
    ],
    [
      "seed",
      (input: ReturnType<typeof createInput>) => ({
        ...input,
        initialState: { ...input.initialState, seed: "forged-seed" },
      }),
    ],
    [
      "map hash",
      (input: ReturnType<typeof createInput>) => ({
        ...input,
        initialState: { ...input.initialState, mapHash: "0".repeat(16) },
      }),
    ],
    [
      "starting budget",
      (input: ReturnType<typeof createInput>) => ({
        ...input,
        initialState: {
          ...input.initialState,
          budget: input.initialState.budget + 1,
        },
      }),
    ],
    [
      "claimed final state",
      (input: ReturnType<typeof createInput>) => ({
        ...input,
        claimedFinalState: {
          ...input.claimedFinalState,
          budget: input.claimedFinalState.budget + 1,
        },
      }),
    ],
    [
      "action order",
      (input: ReturnType<typeof createInput>) => ({
        ...input,
        actionLog: [...input.actionLog].reverse(),
      }),
    ],
  ])("rejects a modified %s", async (_label, mutate) => {
    await expect(
      verifyRivergateCampaignRun(mutate(createInput())),
    ).rejects.toBeInstanceOf(RunVerificationError);
  });

  it("keeps the request strict and rejects profile or malformed salt fields", async () => {
    await expect(
      verifyRivergateCampaignRun({
        ...createInput(),
        childName: "never accept",
      }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    await expect(
      verifyRivergateCampaignRun({ ...createInput(), salt: "predictable" }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });
});

function createInput() {
  return {
    schemaVersion: 1 as const,
    campaign: registeredRivergateCampaign(),
    ...createRun(),
    salt: SALT,
  };
}

function createRun(): {
  initialState: CityState;
  actionLog: CityState["actionLog"];
  claimedFinalState: CityState;
} {
  const packageValue = RIVERGATE_CAMPAIGN_V1_PACKAGE;
  const initialState = createInitialCityState(packageValue.map, {
    cityId: "server-replay-city",
    campaignId: packageValue.campaign.id,
    campaignVersion: packageValue.campaign.version,
    budget: packageValue.campaign.initialBudget,
  });
  const placement = findRoadPlacement(initialState);
  const planned = placeProvisional(
    createPlanningSession(initialState),
    placement,
    {
      unlockedChapterIds: CHAPTER_IDS,
      catalogue: packageValue.buildings,
    },
  );
  if (!planned.accepted) throw new Error("Expected valid replay fixture");
  const finalState = simulateTurn({
    city: initialState,
    planning: planned.session,
    network: networkSnapshotForCity(
      materializePlanningState(planned.session, packageValue.buildings),
      packageValue.buildings,
    ),
    catalogue: packageValue.buildings,
    progression: {
      events: packageValue.campaign.events,
      milestones: packageValue.campaign.milestones,
    },
  }).state;
  const replay = replayCity(
    { initialState, actionLog: finalState.actionLog },
    {
      unlockedChapterIds: CHAPTER_IDS,
      catalogue: packageValue.buildings,
      progression: {
        events: packageValue.campaign.events,
        milestones: packageValue.campaign.milestones,
      },
    },
  );
  return {
    initialState,
    actionLog: replay.state.actionLog,
    claimedFinalState: replay.state,
  };
}

function findRoadPlacement(city: CityState): PlacementRequest {
  const packageValue = RIVERGATE_CAMPAIGN_V1_PACKAGE;
  for (const tile of city.tiles) {
    const request: PlacementRequest = {
      instanceId: "server-replay-road",
      buildingId: "road",
      anchor: tile.coordinate,
      rotation: 0,
    };
    if (
      validatePlacement(city, request, {
        unlockedChapterIds: CHAPTER_IDS,
        catalogue: packageValue.buildings,
      }).valid
    ) {
      return request;
    }
  }
  throw new Error("No valid road placement");
}
