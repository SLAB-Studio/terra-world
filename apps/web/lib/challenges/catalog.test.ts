import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  challengeStars,
  CHALLENGE_HOUSE_IDS,
  CHALLENGE_PROGRESS_STORAGE_KEY,
  CHALLENGE_STAGES,
  CHALLENGE_UPGRADE_IDS,
  copyChallengeSetup,
  isChallengeGoalComplete,
  isChallengeComplete,
  isChallengeUnlocked,
  nextChallengeId,
  TERRA_CHALLENGES,
} from "./catalog";
import { nextChallengeAction } from "./next-action";

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

  it("opens with a resident's service request and an actionable inspection", () => {
    const first = TERRA_CHALLENGES[0];
    expect(first?.title).toBe("Sunny House Power Restoration");
    expect(first?.story).toContain("Ayo reports a power gap");
    expect(first?.story).toContain("Rivergate");
    expect(first?.instruction).toBe(
      "Inspect Sunny House and restore its solar power system.",
    );
    expect(CHALLENGE_STAGES[0]?.title).toBe("Service Assessment");
  });

  it("preserves the saved mission contract through the adult copy update", () => {
    const mechanics = {
      storageKey: CHALLENGE_PROGRESS_STORAGE_KEY,
      houseIds: CHALLENGE_HOUSE_IDS,
      upgradeIds: CHALLENGE_UPGRADE_IDS,
      stages: CHALLENGE_STAGES.map(({ id, colour }) => ({ id, colour })),
      missions: TERRA_CHALLENGES.map(
        ({ id, stage, order, parMoves, concepts, setup, goals }) => ({
          id,
          stage,
          order,
          parMoves,
          concepts,
          setup,
          goals: goals.map((goal) =>
            Object.fromEntries(
              Object.entries(goal).filter(([key]) => key !== "label"),
            ),
          ),
        }),
      ),
    };

    // Captured before the copy-only audience pivot; display text is excluded.
    expect(
      createHash("sha256").update(JSON.stringify(mechanics)).digest("hex"),
    ).toBe("7d09ecf825dd974c5c36f2412c693423ffaafa9ebcadc36e5ca9235bf9a68bd4");
  });

  it("keeps every mission solvable at its existing reference move count", () => {
    for (const challenge of TERRA_CHALLENGES) {
      const town = copyChallengeSetup(challenge);
      for (let move = 0; move < challenge.parMoves; move += 1) {
        expect(isChallengeComplete(challenge, town), challenge.id).toBe(false);
        const action = nextChallengeAction(challenge, town);
        expect(action, challenge.id).not.toBeNull();
        if (action === null)
          throw new Error(`No next action for ${challenge.id}`);
        town[action.houseId] = [...town[action.houseId], action.upgradeId];
      }
      expect(isChallengeComplete(challenge, town), challenge.id).toBe(true);
      expect(nextChallengeAction(challenge, town), challenge.id).toBeNull();
      expect(
        challengeStars({ challenge, moves: challenge.parMoves, hintsUsed: 0 }),
      ).toBe(3);
    }
  });

  it("keeps authored advice within the bounded hint format", () => {
    for (const challenge of TERRA_CHALLENGES) {
      expect(new Set(challenge.hints).size, challenge.id).toBe(3);
      for (const hint of challenge.hints) {
        expect(hint.length, challenge.id).toBeLessThanOrEqual(140);
        expect(
          hint.trim().split(/\s+/u).length,
          challenge.id,
        ).toBeLessThanOrEqual(16);
      }
    }
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
