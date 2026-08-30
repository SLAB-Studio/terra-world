import { describe, expect, it } from "vitest";

import { readChallengeWelcomeProgress } from "./welcome-progress";

describe("challenge welcome progress", () => {
  it("summarises a valid local adventure save", () => {
    const result = readChallengeWelcomeProgress(
      JSON.stringify({
        schemaVersion: 1,
        activeChallengeId: "mango-tidy-up",
        completedIds: ["sunny-after-dark", "bluebell-thirst"],
        bestStars: {
          "sunny-after-dark": 3,
          "bluebell-thirst": 2,
        },
      }),
    );

    expect(result).toEqual({
      activeTitle: "Mango Recycling Provision",
      stage: 1,
      completedCount: 2,
      totalCount: 15,
      leavesEarned: 5,
    });
  });

  it("ignores duplicate, unknown, and invalid progress values", () => {
    const result = readChallengeWelcomeProgress(
      JSON.stringify({
        schemaVersion: 1,
        activeChallengeId: "sunny-after-dark",
        completedIds: ["sunny-after-dark", "sunny-after-dark", "invented"],
        bestStars: { "sunny-after-dark": 4, invented: 3 },
      }),
    );

    expect(result?.completedCount).toBe(1);
    expect(result?.leavesEarned).toBe(0);
  });

  it("rejects malformed and unknown saves", () => {
    expect(readChallengeWelcomeProgress("not-json")).toBeNull();
    expect(
      readChallengeWelcomeProgress(
        JSON.stringify({ schemaVersion: 1, activeChallengeId: "invented" }),
      ),
    ).toBeNull();
  });
});
