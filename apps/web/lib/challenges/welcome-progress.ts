import { challengeById, TERRA_CHALLENGES } from "./catalog";

export type ChallengeWelcomeProgress = Readonly<{
  activeTitle: string;
  stage: 1 | 2 | 3 | 4 | 5;
  completedCount: number;
  totalCount: number;
  leavesEarned: number;
}>;

export function readChallengeWelcomeProgress(
  serialized: string | null,
): ChallengeWelcomeProgress | null {
  if (serialized === null) return null;
  try {
    const value = JSON.parse(serialized) as unknown;
    if (!isRecord(value) || value.schemaVersion !== 1) return null;
    if (typeof value.activeChallengeId !== "string") return null;
    const active = challengeById(value.activeChallengeId);
    if (active === null) return null;

    const completedIds = Array.isArray(value.completedIds)
      ? value.completedIds.filter(
          (id): id is string =>
            typeof id === "string" && challengeById(id) !== null,
        )
      : [];
    const uniqueCompleted = new Set(completedIds);
    const leavesEarned = isRecord(value.bestStars)
      ? Object.entries(value.bestStars).reduce((total, [id, stars]) => {
          if (
            challengeById(id) === null ||
            typeof stars !== "number" ||
            !Number.isInteger(stars) ||
            stars < 1 ||
            stars > 3
          )
            return total;
          return total + stars;
        }, 0)
      : 0;

    return {
      activeTitle: active.title,
      stage: active.stage,
      completedCount: uniqueCompleted.size,
      totalCount: TERRA_CHALLENGES.length,
      leavesEarned,
    };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
