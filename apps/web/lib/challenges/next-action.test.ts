import { describe, expect, it } from "vitest";

import { challengeById } from "./catalog";
import { nextChallengeAction } from "./next-action";

describe("next challenge action", () => {
  it("points a new player to sunlight and Sunny House", () => {
    const challenge = challengeById("sunny-after-dark");
    expect(challenge).not.toBeNull();
    if (challenge === null) return;

    expect(nextChallengeAction(challenge, challenge.setup)).toEqual({
      houseId: "sunny",
      upgradeId: "light",
    });
  });

  it("moves through a whole-street goal one house at a time", () => {
    const challenge = challengeById("lights-across-the-street");
    expect(challenge).not.toBeNull();
    if (challenge === null) return;

    expect(
      nextChallengeAction(challenge, {
        ...challenge.setup,
        sunny: [...challenge.setup.sunny, "light"],
      }),
    ).toEqual({ houseId: "bluebell", upgradeId: "light" });
  });

  it("returns no action when the challenge is complete", () => {
    const challenge = challengeById("sunny-after-dark");
    expect(challenge).not.toBeNull();
    if (challenge === null) return;

    expect(
      nextChallengeAction(challenge, {
        ...challenge.setup,
        sunny: [...challenge.setup.sunny, "light"],
      }),
    ).toBeNull();
  });
});
