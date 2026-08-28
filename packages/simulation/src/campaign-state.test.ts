import { describe, expect, it } from "vitest";

import type { Campaign, Chapter } from "@terra/campaign-schema";

import {
  advanceCampaignState,
  createCampaignState,
  getCurrentMissionView,
  missionProgressKey,
  objectiveProgressKey,
  restoreCampaignState,
  type CampaignProgressState,
} from "./campaign-state";
import { makeTestCity } from "./test-fixtures";

const chapter = (
  order: number,
  unlockTurn: number,
  requiredTurn: number,
  includeOptional = false,
): Chapter => ({
  id: `chapter-${order}`,
  titleKey: `chapter.${order}.title`,
  order,
  unlockConditions:
    unlockTurn === 0
      ? []
      : [{ type: "turn", comparison: "gte", value: unlockTurn }],
  missions: [
    {
      id: `mission-${order}`,
      titleKey: `mission.${order}.title`,
      briefingKey: `mission.${order}.briefing`,
      order: 1,
      allowedBuildingIds: ["home"],
      objectives: [
        {
          id: "foundation",
          descriptionKey: `mission.${order}.objective.foundation`,
          required: true,
          condition: {
            type: "turn",
            comparison: "gte",
            value: requiredTurn,
          },
        },
        ...(includeOptional
          ? [
              {
                id: "stretch",
                descriptionKey: `mission.${order}.objective.stretch`,
                required: false,
                condition: {
                  type: "metric" as const,
                  metric: "nature" as const,
                  comparison: "gte" as const,
                  value: 80,
                },
              },
            ]
          : []),
      ],
      learningFactKeys: [`mission.${order}.fact`],
    },
  ],
});

const CAMPAIGN: Campaign = {
  schemaVersion: 1,
  id: "rivergate",
  version: 1,
  titleKey: "campaign.rivergate.title",
  mapId: "river-valley",
  buildingIds: ["home"],
  initialBudget: 2_000,
  initialPopulation: 0,
  chapters: [
    chapter(1, 0, 1, true),
    chapter(2, 2, 2),
    chapter(3, 3, 3),
    chapter(4, 4, 4),
    chapter(5, 5, 5),
  ],
  events: [],
  milestones: [],
};

function expectSuccess<T extends { readonly ok: boolean }>(
  result: T,
): asserts result is Extract<T, { readonly ok: true }> {
  expect(result.ok).toBe(true);
}

describe("five-chapter campaign progression", () => {
  it("crosses every chapter boundary in order and completes the campaign", () => {
    let state = createCampaignState(CAMPAIGN, makeTestCity({ turn: 0 }));
    expect(state).toMatchObject({
      chapterId: "chapter-1",
      missionId: "mission-1",
      phase: "active",
    });

    for (let order = 1; order <= 5; order += 1) {
      const result = advanceCampaignState(
        CAMPAIGN,
        makeTestCity({ turn: Math.min(order + 1, 5) }),
        state,
      );
      expectSuccess(result);
      state = result.state;

      if (order < 5) {
        expect(result.transition).toEqual({
          type: "chapter-advanced",
          completedMissionKey: `chapter-${order}::mission-${order}`,
          nextChapterId: `chapter-${order + 1}`,
          nextChapterLocked: false,
        });
        expect(state).toMatchObject({
          chapterId: `chapter-${order + 1}`,
          missionId: `mission-${order + 1}`,
          phase: "active",
        });
      } else {
        expect(result.transition.type).toBe("campaign-completed");
        expect(state.phase).toBe("completed");
      }
    }

    expect(state.completedMissionKeys).toEqual(
      [1, 2, 3, 4, 5].map((order) =>
        missionProgressKey(`chapter-${order}`, `mission-${order}`),
      ),
    );
  });

  it("locks the next chapter until its explicit unlock rule passes", () => {
    const initial = createCampaignState(CAMPAIGN, makeTestCity({ turn: 1 }));
    const completedFirst = advanceCampaignState(
      CAMPAIGN,
      makeTestCity({ turn: 1 }),
      initial,
    );
    expectSuccess(completedFirst);
    expect(completedFirst.state).toMatchObject({
      chapterId: "chapter-2",
      missionId: "mission-2",
      phase: "locked",
    });

    const stillLocked = advanceCampaignState(
      CAMPAIGN,
      makeTestCity({ turn: 1 }),
      completedFirst.state,
    );
    expectSuccess(stillLocked);
    expect(stillLocked.transition.type).toBe("none");
    expect(stillLocked.state.phase).toBe("locked");

    const unlocked = advanceCampaignState(
      CAMPAIGN,
      makeTestCity({ turn: 2 }),
      completedFirst.state,
    );
    expectSuccess(unlocked);
    expect(unlocked.transition).toEqual({
      type: "chapter-unlocked",
      chapterId: "chapter-2",
    });
    expect(unlocked.state.phase).toBe("active");
  });

  it("persists optional objectives without requiring them for progression", () => {
    const city = makeTestCity({
      turn: 1,
      indicators: {
        water: 50,
        energy: 50,
        nature: 25,
        community: 50,
        resilience: 25,
      },
    });
    const state = createCampaignState(CAMPAIGN, city);
    const view = getCurrentMissionView(CAMPAIGN, city, state);
    expect(view).toMatchObject({
      requiredComplete: true,
      optionalCompleted: 0,
      optionalTotal: 1,
    });

    const result = advanceCampaignState(CAMPAIGN, city, state);
    expectSuccess(result);
    expect(result.state.chapterId).toBe("chapter-2");
    expect(result.state.completedObjectiveKeys).toContain(
      objectiveProgressKey("chapter-1", "mission-1", "foundation"),
    );
    expect(result.state.completedObjectiveKeys).not.toContain(
      objectiveProgressKey("chapter-1", "mission-1", "stretch"),
    );
  });

  it("retains an optional objective once earned even if the metric regresses", () => {
    const strongCity = makeTestCity({
      turn: 0,
      indicators: {
        water: 50,
        energy: 50,
        nature: 85,
        community: 50,
        resilience: 25,
      },
    });
    const initial = createCampaignState(CAMPAIGN, strongCity);
    const recorded = advanceCampaignState(CAMPAIGN, strongCity, initial);
    expectSuccess(recorded);
    const optionalKey = objectiveProgressKey(
      "chapter-1",
      "mission-1",
      "stretch",
    );
    expect(recorded.state.completedObjectiveKeys).toContain(optionalKey);

    const regressed = makeTestCity({
      turn: 0,
      indicators: {
        water: 50,
        energy: 50,
        nature: 10,
        community: 50,
        resilience: 25,
      },
    });
    expect(
      getCurrentMissionView(CAMPAIGN, regressed, recorded.state)?.objectives,
    ).toContainEqual(
      expect.objectContaining({ key: optionalKey, completed: true }),
    );
  });
});

describe("safe campaign resume", () => {
  function chapterTwoState(): CampaignProgressState {
    const first = createCampaignState(CAMPAIGN, makeTestCity({ turn: 1 }));
    const advanced = advanceCampaignState(
      CAMPAIGN,
      makeTestCity({ turn: 1 }),
      first,
    );
    expectSuccess(advanced);
    return advanced.state;
  }

  it("round-trips through JSON to the identical mission cursor", () => {
    const state = chapterTwoState();
    const json = JSON.stringify(state);
    const restored = restoreCampaignState(
      CAMPAIGN,
      makeTestCity({ turn: 1 }),
      JSON.parse(json) as unknown,
    );
    expectSuccess(restored);
    expect(restored.normalized).toBe(false);
    expect(restored.state).toEqual(state);
  });

  it("canonicalises duplicated and reordered progress from a stale save", () => {
    const state = chapterTwoState();
    const requiredKey = objectiveProgressKey(
      "chapter-1",
      "mission-1",
      "foundation",
    );
    const restored = restoreCampaignState(CAMPAIGN, makeTestCity({ turn: 2 }), {
      ...state,
      phase: "locked",
      completedMissionKeys: [
        ...state.completedMissionKeys,
        ...state.completedMissionKeys,
      ],
      completedObjectiveKeys: [requiredKey, requiredKey],
    });
    expectSuccess(restored);
    expect(restored.normalized).toBe(true);
    expect(restored.state.phase).toBe("active");
    expect(restored.state.completedMissionKeys).toEqual([
      "chapter-1::mission-1",
    ]);
    expect(restored.state.completedObjectiveKeys).toEqual([requiredKey]);
  });

  it("rejects a forged cursor that skips required foundations", () => {
    const forged = {
      ...createCampaignState(CAMPAIGN, makeTestCity({ turn: 5 })),
      chapterId: "chapter-5",
      missionId: "mission-5",
      completedMissionKeys: ["chapter-4::mission-4"],
    };
    const restored = restoreCampaignState(
      CAMPAIGN,
      makeTestCity({ turn: 5 }),
      forged,
    );
    expect(restored).toEqual({
      ok: false,
      error: {
        code: "non-sequential-progress",
        message: "Required missions must be completed in campaign order",
      },
    });
  });

  it("rejects stale campaign versions and unknown objective progress", () => {
    const state = createCampaignState(CAMPAIGN, makeTestCity());
    expect(
      restoreCampaignState(CAMPAIGN, makeTestCity(), {
        ...state,
        campaignVersion: 99,
      }),
    ).toMatchObject({ ok: false, error: { code: "campaign-mismatch" } });
    expect(
      restoreCampaignState(CAMPAIGN, makeTestCity(), {
        ...state,
        completedObjectiveKeys: ["chapter-99::mission-99::future"],
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid-objective-progress" },
    });
  });

  it("rejects completed missions that omit a required objective", () => {
    const state = chapterTwoState();
    const restored = restoreCampaignState(CAMPAIGN, makeTestCity({ turn: 2 }), {
      ...state,
      completedObjectiveKeys: [],
    });
    expect(restored).toMatchObject({
      ok: false,
      error: { code: "non-sequential-progress" },
    });
  });
});
