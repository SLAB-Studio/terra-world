import {
  RIVERGATE_CAMPAIGN_V1_HASH,
  RIVERGATE_CAMPAIGN_V1_PACKAGE,
  canonicalStringify,
  createInitialCityState,
  replayCity,
  type ReplayDocument,
} from "@terra/simulation";
import {
  ActionLogSchema,
  CityStateSchema,
  type CityState,
  type TurnAction,
} from "@terra/campaign-schema";

export type RegisteredCampaign = Readonly<{
  campaignId: string;
  campaignVersion: number;
  packageHash: string;
  rulesetHash: string;
}>;

export type CampaignRunVerificationInput = Readonly<{
  schemaVersion: 1;
  campaign: RegisteredCampaign;
  initialState: CityState;
  actionLog: readonly TurnAction[];
  claimedFinalState: CityState;
  salt: string;
}>;

export type VerifiedCampaignRun = Readonly<{
  schemaVersion: 1;
  replayStatus: "verified";
  campaign: RegisteredCampaign;
  turnsReplayed: number;
  actionLogHash: string;
  finalStateHash: string;
  runCommitment: string;
}>;

export type RunVerificationFailureCode =
  "invalid_request" | "campaign_not_registered" | "replay_rejected";

export class RunVerificationError extends Error {
  public constructor(public readonly code: RunVerificationFailureCode) {
    super(code);
    this.name = "RunVerificationError";
  }
}

const SALT = /^0x[0-9a-fA-F]{64}$/u;
const HASH_16 = /^[0-9a-f]{16}$/u;
const MAXIMUM_ACTIONS = 500;
const RIVERGATE_CHAPTER_IDS =
  RIVERGATE_CAMPAIGN_V1_PACKAGE.campaign.chapters.map((chapter) => chapter.id);

/**
 * Rebuilds Rivergate from its registered package rather than trusting the
 * browser's claimed seed, map, budget, ruleset, state, or hashes.
 */
export async function verifyRivergateCampaignRun(
  value: unknown,
): Promise<VerifiedCampaignRun> {
  const input = parseInput(value);
  const registered = registeredRivergateCampaign();
  if (canonicalStringify(input.campaign) !== canonicalStringify(registered)) {
    throw new RunVerificationError("campaign_not_registered");
  }

  const packageValue = RIVERGATE_CAMPAIGN_V1_PACKAGE;
  const expectedInitial = createInitialCityState(packageValue.map, {
    cityId: input.initialState.cityId,
    campaignId: packageValue.campaign.id,
    campaignVersion: packageValue.campaign.version,
    budget: packageValue.campaign.initialBudget,
  });
  if (
    canonicalStringify(input.initialState) !==
    canonicalStringify(expectedInitial)
  ) {
    throw new RunVerificationError("replay_rejected");
  }

  let replay: ReturnType<typeof replayCity>;
  try {
    replay = replayCity(
      {
        initialState: expectedInitial,
        actionLog: input.actionLog,
      } satisfies ReplayDocument,
      {
        unlockedChapterIds: RIVERGATE_CHAPTER_IDS,
        catalogue: packageValue.buildings,
        progression: {
          events: packageValue.campaign.events,
          milestones: packageValue.campaign.milestones,
        },
      },
    );
  } catch {
    throw new RunVerificationError("replay_rejected");
  }
  if (
    canonicalStringify(replay.state) !==
    canonicalStringify(input.claimedFinalState)
  ) {
    throw new RunVerificationError("replay_rejected");
  }

  const runCommitment = await sha256Commitment({
    domain: "terra-world-run-v1",
    campaignId: registered.campaignId,
    campaignVersion: registered.campaignVersion,
    packageHash: registered.packageHash,
    rulesetHash: registered.rulesetHash,
    actionLogHash: replay.actionLogHash,
    finalStateHash: replay.finalStateHash,
    salt: input.salt.toLowerCase(),
  });
  return Object.freeze({
    schemaVersion: 1 as const,
    replayStatus: "verified" as const,
    campaign: registered,
    turnsReplayed: replay.turnsReplayed,
    actionLogHash: replay.actionLogHash,
    finalStateHash: replay.finalStateHash,
    runCommitment,
  });
}

export function registeredRivergateCampaign(): RegisteredCampaign {
  const packageValue = RIVERGATE_CAMPAIGN_V1_PACKAGE;
  return Object.freeze({
    campaignId: packageValue.campaign.id,
    campaignVersion: packageValue.campaign.version,
    packageHash: RIVERGATE_CAMPAIGN_V1_HASH,
    rulesetHash: packageValue.manifest.contentHashes.ruleset,
  });
}

function parseInput(value: unknown): CampaignRunVerificationInput {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "schemaVersion",
      "campaign",
      "initialState",
      "actionLog",
      "claimedFinalState",
      "salt",
    ]) ||
    value.schemaVersion !== 1 ||
    typeof value.salt !== "string" ||
    !SALT.test(value.salt) ||
    !isRegisteredCampaign(value.campaign)
  ) {
    throw new RunVerificationError("invalid_request");
  }
  const initialState = CityStateSchema.safeParse(value.initialState);
  const actionLog = ActionLogSchema.safeParse(value.actionLog);
  const claimedFinalState = CityStateSchema.safeParse(value.claimedFinalState);
  if (
    !initialState.success ||
    !actionLog.success ||
    actionLog.data.length > MAXIMUM_ACTIONS ||
    !claimedFinalState.success
  ) {
    throw new RunVerificationError("invalid_request");
  }
  return {
    schemaVersion: 1,
    campaign: value.campaign,
    initialState: initialState.data,
    actionLog: actionLog.data,
    claimedFinalState: claimedFinalState.data,
    salt: value.salt,
  };
}

function isRegisteredCampaign(value: unknown): value is RegisteredCampaign {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "campaignId",
      "campaignVersion",
      "packageHash",
      "rulesetHash",
    ]) &&
    typeof value.campaignId === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value.campaignId) &&
    Number.isSafeInteger(value.campaignVersion) &&
    Number(value.campaignVersion) > 0 &&
    typeof value.packageHash === "string" &&
    HASH_16.test(value.packageHash) &&
    typeof value.rulesetHash === "string" &&
    HASH_16.test(value.rulesetHash)
  );
}

async function sha256Commitment(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalStringify(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `0x${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
