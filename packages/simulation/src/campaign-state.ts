import type {
  Campaign,
  Chapter,
  CityState,
  Mission,
  MissionObjective,
} from "@terra/campaign-schema";

import { evaluateProgressCondition } from "./progression";

export const CAMPAIGN_PROGRESS_SCHEMA_VERSION = 1 as const;

export type CampaignProgressPhase = "locked" | "active" | "completed";

/**
 * A compact, JSON-safe campaign cursor. Composite keys make mission and
 * objective progress unambiguous even when content authors reuse local ids.
 */
export type CampaignProgressState = {
  readonly schemaVersion: typeof CAMPAIGN_PROGRESS_SCHEMA_VERSION;
  readonly campaignId: string;
  readonly campaignVersion: number;
  readonly chapterId: string;
  readonly missionId: string;
  readonly phase: CampaignProgressPhase;
  readonly completedMissionKeys: readonly string[];
  readonly completedObjectiveKeys: readonly string[];
};

export type ObjectiveProgress = {
  readonly key: string;
  readonly objective: MissionObjective;
  readonly completed: boolean;
};

export type CurrentMissionView = {
  readonly chapter: Chapter;
  readonly mission: Mission;
  readonly objectives: readonly ObjectiveProgress[];
  readonly requiredComplete: boolean;
  readonly optionalCompleted: number;
  readonly optionalTotal: number;
};

export type CampaignTransition =
  | { readonly type: "none" }
  | { readonly type: "chapter-unlocked"; readonly chapterId: string }
  | {
      readonly type: "mission-advanced";
      readonly completedMissionKey: string;
      readonly nextMissionId: string;
    }
  | {
      readonly type: "chapter-advanced";
      readonly completedMissionKey: string;
      readonly nextChapterId: string;
      readonly nextChapterLocked: boolean;
    }
  | {
      readonly type: "campaign-completed";
      readonly completedMissionKey: string;
    };

export type CampaignStateErrorCode =
  | "invalid-save"
  | "campaign-mismatch"
  | "unknown-position"
  | "non-sequential-progress"
  | "invalid-objective-progress";

export type CampaignStateError = {
  readonly code: CampaignStateErrorCode;
  readonly message: string;
};

export type CampaignStateResult =
  | {
      readonly ok: true;
      readonly state: CampaignProgressState;
      readonly normalized: boolean;
    }
  | { readonly ok: false; readonly error: CampaignStateError };

export type AdvanceCampaignResult =
  | {
      readonly ok: true;
      readonly state: CampaignProgressState;
      readonly transition: CampaignTransition;
    }
  | { readonly ok: false; readonly error: CampaignStateError };

type OrderedMission = {
  readonly chapter: Chapter;
  readonly mission: Mission;
  readonly chapterIndex: number;
  readonly missionIndex: number;
  readonly missionKey: string;
};

export function missionProgressKey(
  chapterId: string,
  missionId: string,
): string {
  return `${chapterId}::${missionId}`;
}

export function objectiveProgressKey(
  chapterId: string,
  missionId: string,
  objectiveId: string,
): string {
  return `${missionProgressKey(chapterId, missionId)}::${objectiveId}`;
}

export function createCampaignState(
  campaign: Campaign,
  city: CityState,
): CampaignProgressState {
  const ordered = orderCampaign(campaign);
  const first = ordered[0];
  if (first === undefined) {
    throw new Error("A campaign must contain at least one mission");
  }

  return {
    schemaVersion: CAMPAIGN_PROGRESS_SCHEMA_VERSION,
    campaignId: campaign.id,
    campaignVersion: campaign.version,
    chapterId: first.chapter.id,
    missionId: first.mission.id,
    phase: isChapterUnlocked(first.chapter, campaign, city)
      ? "active"
      : "locked",
    completedMissionKeys: [],
    completedObjectiveKeys: [],
  };
}

/**
 * Validates an untrusted persisted cursor, rejects skipped foundations, and
 * canonicalises duplicate/out-of-order arrays plus a stale lock phase.
 */
export function restoreCampaignState(
  campaign: Campaign,
  city: CityState,
  saved: unknown,
): CampaignStateResult {
  const parsed = readSavedState(saved);
  if (!parsed.ok) return parsed;
  const candidate = parsed.state;

  if (
    candidate.campaignId !== campaign.id ||
    candidate.campaignVersion !== campaign.version
  ) {
    return failure(
      "campaign-mismatch",
      "Saved progress belongs to a different campaign or campaign version",
    );
  }

  const ordered = orderCampaign(campaign);
  const byMissionKey = new Map(
    ordered.map((entry) => [entry.missionKey, entry] as const),
  );
  const currentKey = missionProgressKey(
    candidate.chapterId,
    candidate.missionId,
  );
  const current = byMissionKey.get(currentKey);
  if (current === undefined) {
    return failure(
      "unknown-position",
      "Saved progress points to an unknown chapter or mission",
    );
  }

  const completedSet = new Set(candidate.completedMissionKeys);
  if ([...completedSet].some((key) => !byMissionKey.has(key))) {
    return failure(
      "non-sequential-progress",
      "Saved progress contains an unknown completed mission",
    );
  }

  const completedCount = ordered.findIndex(
    (entry) => !completedSet.has(entry.missionKey),
  );
  const prefixLength = completedCount === -1 ? ordered.length : completedCount;
  if (
    completedSet.size !== prefixLength ||
    ordered
      .slice(0, prefixLength)
      .some((entry) => !completedSet.has(entry.missionKey))
  ) {
    return failure(
      "non-sequential-progress",
      "Required missions must be completed in campaign order",
    );
  }

  const expectedCurrent = ordered[Math.min(prefixLength, ordered.length - 1)];
  if (expectedCurrent?.missionKey !== currentKey) {
    return failure(
      "non-sequential-progress",
      "Saved cursor does not match the first incomplete mission",
    );
  }
  if ((prefixLength === ordered.length) !== (candidate.phase === "completed")) {
    return failure(
      "non-sequential-progress",
      "Saved completion phase does not match completed missions",
    );
  }

  const objectiveOrder = ordered.flatMap((entry) =>
    entry.mission.objectives.map((objective) =>
      objectiveProgressKey(entry.chapter.id, entry.mission.id, objective.id),
    ),
  );
  const knownObjectives = new Set(objectiveOrder);
  const completedObjectiveSet = new Set(candidate.completedObjectiveKeys);
  if ([...completedObjectiveSet].some((key) => !knownObjectives.has(key))) {
    return failure(
      "invalid-objective-progress",
      "Saved progress contains an unknown objective",
    );
  }

  const allowedMissionKeys = new Set([
    ...ordered.slice(0, prefixLength).map((entry) => entry.missionKey),
    currentKey,
  ]);
  for (const objectiveKey of completedObjectiveSet) {
    const owner = ordered.find((entry) =>
      objectiveKey.startsWith(`${entry.missionKey}::`),
    );
    if (owner === undefined || !allowedMissionKeys.has(owner.missionKey)) {
      return failure(
        "invalid-objective-progress",
        "Saved progress contains objective progress from a future mission",
      );
    }
  }

  for (const entry of ordered.slice(0, prefixLength)) {
    const missingFoundation = entry.mission.objectives.some(
      (objective) =>
        objective.required &&
        !completedObjectiveSet.has(
          objectiveProgressKey(
            entry.chapter.id,
            entry.mission.id,
            objective.id,
          ),
        ),
    );
    if (missingFoundation) {
      return failure(
        "non-sequential-progress",
        "A completed mission is missing a required objective",
      );
    }
  }

  const completedMissionKeys = ordered
    .map((entry) => entry.missionKey)
    .filter((key) => completedSet.has(key));
  const completedObjectiveKeys = objectiveOrder.filter((key) =>
    completedObjectiveSet.has(key),
  );
  const phase =
    candidate.phase === "completed"
      ? "completed"
      : isChapterUnlocked(current.chapter, campaign, city)
        ? "active"
        : "locked";
  const state: CampaignProgressState = {
    ...candidate,
    phase,
    completedMissionKeys,
    completedObjectiveKeys,
  };

  return {
    ok: true,
    state,
    normalized: JSON.stringify(state) !== JSON.stringify(candidate),
  };
}

export function getCurrentMissionView(
  campaign: Campaign,
  city: CityState,
  state: CampaignProgressState,
): CurrentMissionView | null {
  const current = findCurrent(campaign, state);
  if (current === undefined) return null;
  const completed = new Set(state.completedObjectiveKeys);
  const objectives = current.mission.objectives.map((objective) => {
    const key = objectiveProgressKey(
      current.chapter.id,
      current.mission.id,
      objective.id,
    );
    return {
      key,
      objective,
      completed:
        completed.has(key) ||
        evaluateProgressCondition(city, objective.condition, campaign.events),
    };
  });
  const optional = objectives.filter(({ objective }) => !objective.required);

  return {
    chapter: current.chapter,
    mission: current.mission,
    objectives,
    requiredComplete: objectives
      .filter(({ objective }) => objective.required)
      .every(({ completed: isCompleted }) => isCompleted),
    optionalCompleted: optional.filter(({ completed: isCompleted }) =>
      Boolean(isCompleted),
    ).length,
    optionalTotal: optional.length,
  };
}

/** Advances no more than one mission boundary per call. */
export function advanceCampaignState(
  campaign: Campaign,
  city: CityState,
  state: CampaignProgressState,
): AdvanceCampaignResult {
  const wasLocked = state.phase === "locked";
  const restored = restoreCampaignState(campaign, city, state);
  if (!restored.ok) return restored;
  const currentState = restored.state;
  if (currentState.phase === "completed") {
    return { ok: true, state: currentState, transition: { type: "none" } };
  }

  const current = findCurrent(campaign, currentState);
  if (current === undefined) {
    return failure(
      "unknown-position",
      "Campaign cursor does not point to a known mission",
    );
  }
  if (wasLocked && currentState.phase === "active") {
    return {
      ok: true,
      state: currentState,
      transition: {
        type: "chapter-unlocked",
        chapterId: current.chapter.id,
      },
    };
  }
  if (currentState.phase === "locked") {
    if (!isChapterUnlocked(current.chapter, campaign, city)) {
      return { ok: true, state: currentState, transition: { type: "none" } };
    }
    return {
      ok: true,
      state: { ...currentState, phase: "active" },
      transition: {
        type: "chapter-unlocked",
        chapterId: current.chapter.id,
      },
    };
  }

  const view = getCurrentMissionView(campaign, city, currentState);
  if (view === null) {
    return failure("unknown-position", "Current mission cannot be resolved");
  }
  const newlyCompletedObjectiveKeys = view.objectives
    .filter(({ completed }) => completed)
    .map(({ key }) => key);
  const completedObjectiveSet = new Set([
    ...currentState.completedObjectiveKeys,
    ...newlyCompletedObjectiveKeys,
  ]);
  const objectiveOrder = orderCampaign(campaign).flatMap((entry) =>
    entry.mission.objectives.map((objective) =>
      objectiveProgressKey(entry.chapter.id, entry.mission.id, objective.id),
    ),
  );
  const completedObjectiveKeys = objectiveOrder.filter((key) =>
    completedObjectiveSet.has(key),
  );
  if (!view.requiredComplete) {
    return {
      ok: true,
      state: { ...currentState, completedObjectiveKeys },
      transition: { type: "none" },
    };
  }

  const ordered = orderCampaign(campaign);
  const currentIndex = ordered.findIndex(
    (entry) => entry.missionKey === current.missionKey,
  );
  const completedMissionKeys = [
    ...currentState.completedMissionKeys,
    current.missionKey,
  ];
  const next = ordered[currentIndex + 1];
  if (next === undefined) {
    return {
      ok: true,
      state: {
        ...currentState,
        phase: "completed",
        completedMissionKeys,
        completedObjectiveKeys,
      },
      transition: {
        type: "campaign-completed",
        completedMissionKey: current.missionKey,
      },
    };
  }

  const nextChapterLocked = !isChapterUnlocked(next.chapter, campaign, city);
  const nextState: CampaignProgressState = {
    ...currentState,
    chapterId: next.chapter.id,
    missionId: next.mission.id,
    phase: nextChapterLocked ? "locked" : "active",
    completedMissionKeys,
    completedObjectiveKeys,
  };
  if (next.chapter.id === current.chapter.id) {
    return {
      ok: true,
      state: nextState,
      transition: {
        type: "mission-advanced",
        completedMissionKey: current.missionKey,
        nextMissionId: next.mission.id,
      },
    };
  }
  return {
    ok: true,
    state: nextState,
    transition: {
      type: "chapter-advanced",
      completedMissionKey: current.missionKey,
      nextChapterId: next.chapter.id,
      nextChapterLocked,
    },
  };
}

function orderCampaign(campaign: Campaign): readonly OrderedMission[] {
  const chapters = [...campaign.chapters].sort(
    (left, right) =>
      left.order - right.order || left.id.localeCompare(right.id),
  );
  return chapters.flatMap((chapter, chapterIndex) =>
    [...chapter.missions]
      .sort(
        (left, right) =>
          left.order - right.order || left.id.localeCompare(right.id),
      )
      .map((mission, missionIndex) => ({
        chapter,
        mission,
        chapterIndex,
        missionIndex,
        missionKey: missionProgressKey(chapter.id, mission.id),
      })),
  );
}

function findCurrent(
  campaign: Campaign,
  state: CampaignProgressState,
): OrderedMission | undefined {
  const key = missionProgressKey(state.chapterId, state.missionId);
  return orderCampaign(campaign).find((entry) => entry.missionKey === key);
}

function isChapterUnlocked(
  chapter: Chapter,
  campaign: Campaign,
  city: CityState,
): boolean {
  return chapter.unlockConditions.every((condition) =>
    evaluateProgressCondition(city, condition, campaign.events),
  );
}

function readSavedState(saved: unknown): CampaignStateResult {
  if (!isRecord(saved)) {
    return failure("invalid-save", "Saved campaign progress must be an object");
  }
  const requiredStrings = ["campaignId", "chapterId", "missionId"] as const;
  if (requiredStrings.some((key) => typeof saved[key] !== "string")) {
    return failure("invalid-save", "Saved campaign identifiers are invalid");
  }
  if (
    saved.schemaVersion !== CAMPAIGN_PROGRESS_SCHEMA_VERSION ||
    typeof saved.campaignVersion !== "number" ||
    !Number.isInteger(saved.campaignVersion) ||
    saved.campaignVersion <= 0 ||
    (saved.phase !== "locked" &&
      saved.phase !== "active" &&
      saved.phase !== "completed") ||
    !isStringArray(saved.completedMissionKeys) ||
    !isStringArray(saved.completedObjectiveKeys)
  ) {
    return failure(
      "invalid-save",
      "Saved campaign progress has invalid fields",
    );
  }

  return {
    ok: true,
    normalized: false,
    state: {
      schemaVersion: CAMPAIGN_PROGRESS_SCHEMA_VERSION,
      campaignId: saved.campaignId as string,
      campaignVersion: saved.campaignVersion,
      chapterId: saved.chapterId as string,
      missionId: saved.missionId as string,
      phase: saved.phase,
      completedMissionKeys: [...saved.completedMissionKeys],
      completedObjectiveKeys: [...saved.completedObjectiveKeys],
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function failure(
  code: CampaignStateErrorCode,
  message: string,
): { readonly ok: false; readonly error: CampaignStateError } {
  return { ok: false, error: { code, message } };
}
