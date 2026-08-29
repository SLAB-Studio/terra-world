import {
  CHALLENGE_HOUSE_IDS,
  CHALLENGE_UPGRADE_IDS,
  completedGoalIds,
  type ChallengeHouseId,
  type ChallengeSetup,
  type ChallengeUpgradeId,
  type TerraChallenge,
} from "./catalog";

export type ChallengeNextAction = Readonly<{
  houseId: ChallengeHouseId;
  upgradeId: ChallengeUpgradeId;
}>;

type ChallengeTownState = Readonly<Record<ChallengeHouseId, readonly string[]>>;

export function nextChallengeAction(
  challenge: TerraChallenge,
  town: ChallengeTownState,
): ChallengeNextAction | null {
  const completed = new Set(
    completedGoalIds(challenge, town as ChallengeSetup),
  );

  for (const goal of challenge.goals) {
    if (completed.has(goal.id)) continue;

    if (goal.type === "house-has") {
      return { houseId: goal.houseId, upgradeId: goal.upgradeId };
    }

    if (goal.type === "all-houses-have") {
      const houseId = CHALLENGE_HOUSE_IDS.find(
        (candidate) => !town[candidate].includes(goal.upgradeId),
      );
      if (houseId !== undefined) return { houseId, upgradeId: goal.upgradeId };
    }

    if (goal.type === "house-healthy") {
      const upgradeId = firstMissingUpgrade(town[goal.houseId]);
      if (upgradeId !== null) return { houseId: goal.houseId, upgradeId };
    }

    if (goal.type === "healthy-house-count") {
      const houseId = CHALLENGE_HOUSE_IDS.find(
        (candidate) => firstMissingUpgrade(town[candidate]) !== null,
      );
      if (houseId !== undefined) {
        const upgradeId = firstMissingUpgrade(town[houseId]);
        if (upgradeId !== null) return { houseId, upgradeId };
      }
    }

    if (goal.type === "each-house-upgrade-count") {
      const houseId = CHALLENGE_HOUSE_IDS.find(
        (candidate) => town[candidate].length < goal.count,
      );
      if (houseId !== undefined) {
        const upgradeId = firstMissingUpgrade(town[houseId]);
        if (upgradeId !== null) return { houseId, upgradeId };
      }
    }
  }

  return null;
}

function firstMissingUpgrade(
  upgrades: readonly string[],
): ChallengeUpgradeId | null {
  return (
    CHALLENGE_UPGRADE_IDS.find((upgrade) => !upgrades.includes(upgrade)) ?? null
  );
}
