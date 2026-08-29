import { describe, expect, it } from "vitest";

import {
  challengeStars,
  CHALLENGE_STAGES,
  copyChallengeSetup,
  isChallengeGoalComplete,
  isChallengeComplete,
  isChallengeUnlocked,
  nextChallengeId,
  TERRA_CHALLENGES,
} from "./catalog";

describe("Terra World challenge catalogue", () => {
  it("contains three sequential challenges in each of five stages", () => {
    expect(CHALLENGE_STAGES).toHaveLength(5);
    expect(TERRA_CHALLENGES).toHaveLength(15);
    for (const stage of CHALLENGE_STAGES) {
      expect(
        TERRA_CHALLENGES.filter((challenge) => challenge.stage === stage.id),
      ).toHaveLength(3);
    }
    expect(TERRA_CHALLENGES.map((challenge) => challenge.order)).toEqual(
      Array.from({ length: 15 }, (_, index) => index + 1),
    );
  });

  it("starts every challenge incomplete and completes after its authored goal", () => {
    for (const challenge of TERRA_CHALLENGES) {
      const town = copyChallengeSetup(challenge);
      expect(isChallengeComplete(challenge, town), challenge.id).toBe(false);
    }

    const first = TERRA_CHALLENGES[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    const town = copyChallengeSetup(first);
    town.sunny = [...town.sunny, "light"];
    expect(isChallengeComplete(first, town)).toBe(true);
  });

  it("unlocks in order and advances to the next challenge", () => {
    const first = TERRA_CHALLENGES[0];
    const second = TERRA_CHALLENGES[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first === undefined || second === undefined) return;

    expect(isChallengeUnlocked(first.id, [])).toBe(true);
    expect(isChallengeUnlocked(second.id, [])).toBe(false);
    expect(isChallengeUnlocked(second.id, [first.id])).toBe(true);
    expect(nextChallengeId(first.id)).toBe(second.id);
  });

  it("awards supportive move-and-hint stars without blocking completion", () => {
    const challenge = TERRA_CHALLENGES[0];
    expect(challenge).toBeDefined();
    if (challenge === undefined) return;

    expect(challengeStars({ challenge, moves: 1, hintsUsed: 0 })).toBe(3);
    expect(challengeStars({ challenge, moves: 2, hintsUsed: 1 })).toBe(2);
    expect(challengeStars({ challenge, moves: 8, hintsUsed: 3 })).toBe(1);
  });

  it("does not mistake optional town helpers for core challenge systems", () => {
    expect(
      isChallengeGoalComplete(
        {
          id: "three-core-systems",
          type: "each-house-upgrade-count",
          label: "Give every home three healthy systems",
          count: 3,
        },
        {
          sunny: ["light", "rain-tank", "bird-home"],
          bluebell: ["water", "compost", "bike-rack"],
          mango: ["garden", "shade-tree", "repair-kit"],
        },
      ),
    ).toBe(false);
  });
});
