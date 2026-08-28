import type {
  ActionLogSave,
  CampaignCacheEntry,
  CitySave,
  DeviceSettings,
  LocalProfile,
  StoredAction,
  StoredCityState,
  SyncQueueEntry,
} from "./types";

const IDENTIFIER = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const PROHIBITED_KEYS = new Set([
  "name",
  "childname",
  "displayname",
  "firstname",
  "lastname",
  "legalname",
  "birthdate",
  "dateofbirth",
  "age",
  "preciseage",
  "school",
  "classroom",
  "location",
  "address",
  "username",
  "chat",
  "messages",
  "conversationhistory",
  "behaviouralprofile",
  "behavioralprofile",
]);

type UnknownRecord = Record<string, unknown>;

export function assertValidProfile(value: LocalProfile): void {
  assertIdentifier(value.profileId, "profileId");
  assertFiniteTimestamp(value.createdAt, "createdAt");
  assertFiniteTimestamp(value.updatedAt, "updatedAt");
  if (value.updatedAt < value.createdAt)
    throw new TypeError("Profile updatedAt cannot precede createdAt");
  if (value.avatarId !== undefined)
    assertIdentifier(value.avatarId, "avatarId");
  if (
    value.colourTheme !== undefined &&
    !["sunrise", "river", "forest"].includes(value.colourTheme)
  ) {
    throw new TypeError("Profile colourTheme is not supported");
  }
  assertJsonSafeWithoutPersonalData(value);
}

export function assertValidCitySave(value: CitySave): void {
  assertIdentifier(value.cityId, "cityId");
  assertFiniteTimestamp(value.committedAt, "committedAt");
  const state = value.state;
  if (!isStoredCityState(state) || state.cityId !== value.cityId) {
    throw new TypeError(
      "City save must contain a matching deterministic city state",
    );
  }
  assertJsonSafeWithoutPersonalData(value);
}

export function assertValidCampaignCache(value: CampaignCacheEntry): void {
  assertIdentifier(value.campaignId, "campaignId");
  assertPositiveInteger(value.version, "version");
  assertFiniteTimestamp(value.verifiedAt, "verifiedAt");
  if (!isObject(value.pack))
    throw new TypeError("Campaign cache pack must be an object");
  if (
    value.storageRoot !== undefined &&
    (typeof value.storageRoot !== "string" || value.storageRoot.length > 256)
  ) {
    throw new TypeError("Campaign cache storageRoot is invalid");
  }
  assertJsonSafeWithoutPersonalData(value);
}

export function assertValidActionLog(value: ActionLogSave): void {
  assertIdentifier(value.cityId, "cityId");
  assertFiniteTimestamp(value.savedAt, "savedAt");
  let previousSequence = -1;
  const actionIds = new Set<string>();
  for (const action of value.actions) {
    if (!isStoredAction(action))
      throw new TypeError("Action log contains an invalid action");
    if (action.sequence <= previousSequence || actionIds.has(action.actionId)) {
      throw new TypeError(
        "Action log actions must have unique, strictly increasing sequences",
      );
    }
    previousSequence = action.sequence;
    actionIds.add(action.actionId);
  }
  assertJsonSafeWithoutPersonalData(value);
}

export function assertValidSyncEntry(value: SyncQueueEntry): void {
  assertIdentifier(value.id, "sync id");
  assertIdentifier(value.cityId, "sync cityId");
  if (value.kind !== "checkpoint" && value.kind !== "milestone")
    throw new TypeError("Sync kind is invalid");
  if (value.status !== "pending" && value.status !== "retrying")
    throw new TypeError("Sync status is invalid");
  if (
    typeof value.idempotencyKey !== "string" ||
    value.idempotencyKey.length < 8 ||
    value.idempotencyKey.length > 256
  ) {
    throw new TypeError("Sync idempotencyKey is invalid");
  }
  if (
    typeof value.encryptedPayload !== "string" ||
    value.encryptedPayload.length === 0 ||
    value.encryptedPayload.length > 1_000_000
  ) {
    throw new TypeError("Sync encryptedPayload is invalid");
  }
  assertNonNegativeInteger(value.attempts, "sync attempts");
  assertFiniteTimestamp(value.nextAttemptAt, "sync nextAttemptAt");
  assertFiniteTimestamp(value.createdAt, "sync createdAt");
  assertJsonSafeWithoutPersonalData(value);
}

export function assertValidSettings(value: DeviceSettings): void {
  assertIdentifier(value.profileId, "settings profileId");
  if (
    typeof value.reducedMotion !== "boolean" ||
    typeof value.highContrast !== "boolean" ||
    typeof value.muted !== "boolean"
  ) {
    throw new TypeError("Accessibility settings must be boolean");
  }
  if (
    typeof value.textScale !== "number" ||
    !Number.isFinite(value.textScale) ||
    value.textScale < 0.8 ||
    value.textScale > 2
  ) {
    throw new TypeError("Settings textScale must be between 0.8 and 2");
  }
  if (value.locale !== "en")
    throw new TypeError("Settings locale is not supported");
  assertFiniteTimestamp(value.updatedAt, "settings updatedAt");
  assertJsonSafeWithoutPersonalData(value);
}

export function isValidProfile(value: unknown): value is LocalProfile {
  return catches(() => assertValidProfile(value as LocalProfile));
}
export function isValidCitySave(value: unknown): value is CitySave {
  return catches(() => assertValidCitySave(value as CitySave));
}
export function isValidCampaignCache(
  value: unknown,
): value is CampaignCacheEntry {
  return catches(() => assertValidCampaignCache(value as CampaignCacheEntry));
}
export function isValidActionLog(value: unknown): value is ActionLogSave {
  return catches(() => assertValidActionLog(value as ActionLogSave));
}
export function isValidSyncEntry(value: unknown): value is SyncQueueEntry {
  return catches(() => assertValidSyncEntry(value as SyncQueueEntry));
}
export function isValidSettings(value: unknown): value is DeviceSettings {
  return catches(() => assertValidSettings(value as DeviceSettings));
}

function isStoredCityState(value: unknown): value is StoredCityState {
  if (!isObject(value)) return false;
  return (
    typeof value.schemaVersion === "number" &&
    Number.isInteger(value.schemaVersion) &&
    value.schemaVersion > 0 &&
    typeof value.cityId === "string" &&
    typeof value.campaignId === "string" &&
    typeof value.campaignVersion === "number" &&
    Number.isInteger(value.campaignVersion) &&
    value.campaignVersion > 0 &&
    typeof value.turn === "number" &&
    Number.isInteger(value.turn) &&
    value.turn >= 0 &&
    Array.isArray(value.actionLog)
  );
}

function isStoredAction(value: unknown): value is StoredAction {
  if (!isObject(value)) return false;
  return (
    typeof value.actionId === "string" &&
    IDENTIFIER.test(value.actionId) &&
    typeof value.turn === "number" &&
    Number.isInteger(value.turn) &&
    value.turn >= 0 &&
    typeof value.sequence === "number" &&
    Number.isInteger(value.sequence) &&
    value.sequence >= 0 &&
    (value.type === "place-building" ||
      value.type === "remove-building" ||
      value.type === "advance-turn")
  );
}

function assertJsonSafeWithoutPersonalData(value: unknown, depth = 0): void {
  if (depth > 30) throw new TypeError("Local record is too deeply nested");
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError("Local record contains a non-finite number");
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value)
      assertJsonSafeWithoutPersonalData(item, depth + 1);
    return;
  }
  if (!isObject(value) || Object.getPrototypeOf(value) !== Object.prototype)
    throw new TypeError("Local record must be JSON-compatible");
  for (const [key, item] of Object.entries(value)) {
    if (PROHIBITED_KEYS.has(key.toLowerCase()))
      throw new TypeError(
        `Local persistence does not accept personal data field: ${key}`,
      );
    assertJsonSafeWithoutPersonalData(item, depth + 1);
  }
}

function assertIdentifier(
  value: unknown,
  label: string,
): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 120 ||
    !IDENTIFIER.test(value)
  )
    throw new TypeError(`${label} must be a URL-safe identifier`);
}
function assertFiniteTimestamp(value: unknown, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new TypeError(`${label} must be a non-negative timestamp`);
}
function assertPositiveInteger(value: unknown, label: string): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1)
    throw new TypeError(`${label} must be positive`);
}
function assertNonNegativeInteger(value: unknown, label: string): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0)
    throw new TypeError(`${label} must be non-negative`);
}
function isObject(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function catches(assertion: () => void): boolean {
  try {
    assertion();
    return true;
  } catch {
    return false;
  }
}
