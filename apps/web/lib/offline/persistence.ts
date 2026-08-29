import {
  assertValidActionLog,
  assertValidCampaignCache,
  assertValidCampaignSession,
  assertValidCitySave,
  assertValidProfile,
  assertValidSettings,
  assertValidSyncEntry,
  isValidActionLog,
  isValidCampaignCache,
  isValidCampaignSession,
  isValidCitySave,
  isValidProfile,
  isValidSettings,
  isValidSyncEntry,
} from "./validation";
import {
  OFFLINE_DATABASE_NAME,
  OFFLINE_DATABASE_VERSION,
  OFFLINE_STORE_NAMES,
  type ActionLogSave,
  type CampaignCacheEntry,
  type CampaignSessionSave,
  type CitySave,
  type CorruptRecordNotice,
  type DeviceSettings,
  type LocalProfile,
  type OfflinePersistence,
  type OfflinePersistenceOptions,
  type OfflineStoreName,
  type SyncQueueEntry,
} from "./types";

type StoreRecord =
  | LocalProfile
  | CitySave
  | CampaignCacheEntry
  | CampaignSessionSave
  | ActionLogSave
  | SyncQueueEntry
  | DeviceSettings;
type StoreGuard<T> = (value: unknown) => value is T;

type StoredCampaignCache = CampaignCacheEntry & { cacheKey: string };

const KEY_PATHS: Readonly<Record<OfflineStoreName, string>> = {
  profiles: "profileId",
  cities: "cityId",
  "campaign-cache": "cacheKey",
  "campaign-sessions": "cityId",
  "action-logs": "cityId",
  "sync-queue": "id",
  settings: "profileId",
};

/** A pure in-memory replacement for SSR, tests, and browsers without IndexedDB. */
export class MemoryOfflinePersistence implements OfflinePersistence {
  readonly kind = "memory" as const;
  private readonly records = new Map<
    OfflineStoreName,
    Map<string, StoreRecord>
  >();

  constructor(
    private readonly onCorruptRecord?: (notice: CorruptRecordNotice) => void,
  ) {
    for (const store of OFFLINE_STORE_NAMES) this.records.set(store, new Map());
  }

  async saveProfile(profile: LocalProfile): Promise<void> {
    assertValidProfile(profile);
    this.put("profiles", profile.profileId, profile);
  }
  async getProfile(profileId: string): Promise<LocalProfile | null> {
    return this.read("profiles", profileId, isValidProfile);
  }
  async listProfiles(): Promise<readonly LocalProfile[]> {
    const profiles: LocalProfile[] = [];
    for (const [key, value] of this.store("profiles")) {
      if (isValidProfile(value)) profiles.push(copy(value));
      else this.rejectCorrupt("profiles", key);
    }
    return profiles.sort((left, right) => left.createdAt - right.createdAt);
  }

  async saveCity(city: CitySave): Promise<void> {
    assertValidCitySave(city);
    this.put("cities", city.cityId, city);
  }
  async getCity(cityId: string): Promise<CitySave | null> {
    return this.read("cities", cityId, isValidCitySave);
  }
  async deleteCity(cityId: string): Promise<void> {
    this.store("cities").delete(cityId);
  }

  async saveCampaignCache(entry: CampaignCacheEntry): Promise<void> {
    assertValidCampaignCache(entry);
    this.put(
      "campaign-cache",
      campaignCacheKey(entry.campaignId, entry.version),
      toStoredCampaignCache(entry),
    );
  }
  async getCampaignCache(
    campaignId: string,
    version: number,
  ): Promise<CampaignCacheEntry | null> {
    const entry = this.read(
      "campaign-cache",
      campaignCacheKey(campaignId, version),
      isValidStoredCampaignCache,
    );
    return entry ? toCampaignCacheEntry(entry) : null;
  }

  async saveCampaignSession(entry: CampaignSessionSave): Promise<void> {
    assertValidCampaignSession(entry);
    this.put("campaign-sessions", entry.cityId, entry);
  }
  async getCampaignSession(
    cityId: string,
  ): Promise<CampaignSessionSave | null> {
    return this.read("campaign-sessions", cityId, isValidCampaignSession);
  }
  async deleteCampaignSession(cityId: string): Promise<void> {
    this.store("campaign-sessions").delete(cityId);
  }

  async saveActionLog(entry: ActionLogSave): Promise<void> {
    assertValidActionLog(entry);
    this.put("action-logs", entry.cityId, entry);
  }
  async getActionLog(cityId: string): Promise<ActionLogSave | null> {
    return this.read("action-logs", cityId, isValidActionLog);
  }

  async enqueueSync(entry: SyncQueueEntry): Promise<void> {
    assertValidSyncEntry(entry);
    this.put("sync-queue", entry.id, entry);
  }
  async getPendingSync(now = Date.now()): Promise<readonly SyncQueueEntry[]> {
    const entries: SyncQueueEntry[] = [];
    for (const [key, value] of this.store("sync-queue")) {
      if (!isValidSyncEntry(value)) {
        this.rejectCorrupt("sync-queue", key);
        continue;
      }
      if (value.nextAttemptAt <= now) entries.push(copy(value));
    }
    return entries.sort(
      (left, right) =>
        left.nextAttemptAt - right.nextAttemptAt ||
        left.createdAt - right.createdAt,
    );
  }
  async updateSync(entry: SyncQueueEntry): Promise<void> {
    await this.enqueueSync(entry);
  }
  async removeSync(id: string): Promise<void> {
    this.store("sync-queue").delete(id);
  }

  async saveSettings(settings: DeviceSettings): Promise<void> {
    assertValidSettings(settings);
    this.put("settings", settings.profileId, settings);
  }
  async getSettings(profileId: string): Promise<DeviceSettings | null> {
    return this.read("settings", profileId, isValidSettings);
  }
  close(): void {
    /* no resources to release */
  }

  private store(name: OfflineStoreName): Map<string, StoreRecord> {
    const store = this.records.get(name);
    if (!store) throw new Error(`Unknown offline store: ${name}`);
    return store;
  }
  private put(name: OfflineStoreName, key: string, value: StoreRecord): void {
    this.store(name).set(key, copy(value));
  }
  private read<T extends StoreRecord>(
    name: OfflineStoreName,
    key: string,
    guard: StoreGuard<T>,
  ): T | null {
    const value = this.store(name).get(key);
    if (value === undefined) return null;
    if (guard(value)) return copy(value);
    this.rejectCorrupt(name, key);
    return null;
  }
  private rejectCorrupt(store: OfflineStoreName, key: string): void {
    this.store(store).delete(key);
    try {
      this.onCorruptRecord?.({ store, key });
    } catch {
      /* reporting cannot interrupt local recovery */
    }
  }
}

/** Creates IndexedDB persistence when available, otherwise a safe memory fallback. */
export async function createOfflinePersistence(
  options: OfflinePersistenceOptions = {},
): Promise<OfflinePersistence> {
  const factory =
    options.indexedDB ??
    (typeof globalThis !== "undefined" ? globalThis.indexedDB : undefined);
  if (!factory) return new MemoryOfflinePersistence(options.onCorruptRecord);
  try {
    return await IndexedDbOfflinePersistence.open(
      factory,
      options.databaseName ?? OFFLINE_DATABASE_NAME,
      options.onCorruptRecord,
    );
  } catch {
    // A privacy mode, quota policy, or unavailable browser API must not make the offline game unplayable.
    return new MemoryOfflinePersistence(options.onCorruptRecord);
  }
}

class IndexedDbOfflinePersistence implements OfflinePersistence {
  readonly kind = "indexeddb" as const;
  private constructor(
    private readonly database: IDBDatabase,
    private readonly onCorruptRecord?: (notice: CorruptRecordNotice) => void,
  ) {}

  static async open(
    factory: IDBFactory,
    name: string,
    onCorruptRecord?: (notice: CorruptRecordNotice) => void,
  ): Promise<IndexedDbOfflinePersistence> {
    const request = factory.open(name, OFFLINE_DATABASE_VERSION);
    request.onupgradeneeded = (event) =>
      upgradeDatabase(request.result, request.transaction, event.oldVersion);
    return new IndexedDbOfflinePersistence(
      await requestAsPromise(request),
      onCorruptRecord,
    );
  }

  async saveProfile(profile: LocalProfile): Promise<void> {
    assertValidProfile(profile);
    await this.put("profiles", profile);
  }
  async getProfile(profileId: string): Promise<LocalProfile | null> {
    return this.read("profiles", profileId, isValidProfile);
  }
  async listProfiles(): Promise<readonly LocalProfile[]> {
    const values = await this.getAll("profiles");
    const profiles: LocalProfile[] = [];
    for (const value of values) {
      if (isValidProfile(value)) profiles.push(value);
      else await this.rejectCorrupt("profiles", keyFor("profiles", value));
    }
    return profiles.sort((left, right) => left.createdAt - right.createdAt);
  }

  async saveCity(city: CitySave): Promise<void> {
    assertValidCitySave(city);
    await this.put("cities", city);
  }
  async getCity(cityId: string): Promise<CitySave | null> {
    return this.read("cities", cityId, isValidCitySave);
  }
  async deleteCity(cityId: string): Promise<void> {
    await this.remove("cities", cityId);
  }

  async saveCampaignCache(entry: CampaignCacheEntry): Promise<void> {
    assertValidCampaignCache(entry);
    await this.put("campaign-cache", toStoredCampaignCache(entry));
  }
  async getCampaignCache(
    campaignId: string,
    version: number,
  ): Promise<CampaignCacheEntry | null> {
    const entry = await this.read(
      "campaign-cache",
      campaignCacheKey(campaignId, version),
      isValidStoredCampaignCache,
    );
    return entry ? toCampaignCacheEntry(entry) : null;
  }

  async saveCampaignSession(entry: CampaignSessionSave): Promise<void> {
    assertValidCampaignSession(entry);
    await this.put("campaign-sessions", entry);
  }
  async getCampaignSession(
    cityId: string,
  ): Promise<CampaignSessionSave | null> {
    return this.read("campaign-sessions", cityId, isValidCampaignSession);
  }
  async deleteCampaignSession(cityId: string): Promise<void> {
    await this.remove("campaign-sessions", cityId);
  }

  async saveActionLog(entry: ActionLogSave): Promise<void> {
    assertValidActionLog(entry);
    await this.put("action-logs", entry);
  }
  async getActionLog(cityId: string): Promise<ActionLogSave | null> {
    return this.read("action-logs", cityId, isValidActionLog);
  }

  async enqueueSync(entry: SyncQueueEntry): Promise<void> {
    assertValidSyncEntry(entry);
    await this.put("sync-queue", entry);
  }
  async getPendingSync(now = Date.now()): Promise<readonly SyncQueueEntry[]> {
    const values = await this.getAll("sync-queue");
    const pending: SyncQueueEntry[] = [];
    for (const value of values) {
      if (!isValidSyncEntry(value)) {
        await this.rejectCorrupt("sync-queue", keyFor("sync-queue", value));
        continue;
      }
      if (value.nextAttemptAt <= now) pending.push(value);
    }
    return pending.sort(
      (left, right) =>
        left.nextAttemptAt - right.nextAttemptAt ||
        left.createdAt - right.createdAt,
    );
  }
  async updateSync(entry: SyncQueueEntry): Promise<void> {
    await this.enqueueSync(entry);
  }
  async removeSync(id: string): Promise<void> {
    await this.remove("sync-queue", id);
  }

  async saveSettings(settings: DeviceSettings): Promise<void> {
    assertValidSettings(settings);
    await this.put("settings", settings);
  }
  async getSettings(profileId: string): Promise<DeviceSettings | null> {
    return this.read("settings", profileId, isValidSettings);
  }
  close(): void {
    this.database.close();
  }

  private async read<T extends StoreRecord>(
    store: OfflineStoreName,
    key: string,
    guard: StoreGuard<T>,
  ): Promise<T | null> {
    const value = await this.get(store, key);
    if (value === undefined) return null;
    if (guard(value)) return value;
    await this.rejectCorrupt(store, key);
    return null;
  }
  private async get(store: OfflineStoreName, key: string): Promise<unknown> {
    const transaction = this.database.transaction(store, "readonly");
    const result = await requestAsPromise(
      transaction.objectStore(store).get(key),
    );
    await transactionAsPromise(transaction);
    return result;
  }
  private async getAll(store: OfflineStoreName): Promise<unknown[]> {
    const transaction = this.database.transaction(store, "readonly");
    const result = await requestAsPromise(
      transaction.objectStore(store).getAll(),
    );
    await transactionAsPromise(transaction);
    return result;
  }
  private async put(
    store: OfflineStoreName,
    value: StoreRecord,
  ): Promise<void> {
    const transaction = this.database.transaction(store, "readwrite");
    await requestAsPromise(transaction.objectStore(store).put(value));
    await transactionAsPromise(transaction);
  }
  private async remove(store: OfflineStoreName, key: string): Promise<void> {
    const transaction = this.database.transaction(store, "readwrite");
    await requestAsPromise(transaction.objectStore(store).delete(key));
    await transactionAsPromise(transaction);
  }
  private async rejectCorrupt(
    store: OfflineStoreName,
    key: string | null,
  ): Promise<void> {
    if (key !== null) await this.remove(store, key);
    try {
      if (key !== null) this.onCorruptRecord?.({ store, key });
    } catch {
      /* recovery remains safe */
    }
  }
}

export type MigrationStep = Readonly<{
  from: number;
  to: number;
  creates: readonly OfflineStoreName[];
  indexes: readonly string[];
}>;

/** Pure migration description, kept testable separately from the browser API. */
export function migrationPlan(fromVersion: number): readonly MigrationStep[] {
  if (
    !Number.isInteger(fromVersion) ||
    fromVersion < 0 ||
    fromVersion > OFFLINE_DATABASE_VERSION
  )
    throw new RangeError("Unsupported offline database version");
  const steps: MigrationStep[] = [];
  if (fromVersion < 1)
    steps.push({
      from: 0,
      to: 1,
      creates: OFFLINE_STORE_NAMES.filter(
        (store): store is Exclude<OfflineStoreName, "campaign-sessions"> =>
          store !== "campaign-sessions",
      ),
      indexes: [],
    });
  if (fromVersion < 2)
    steps.push({
      from: 1,
      to: 2,
      creates: [],
      indexes: [
        "cities:committedAt",
        "sync-queue:status",
        "sync-queue:nextAttemptAt",
      ],
    });
  if (fromVersion < 3)
    steps.push({
      from: 2,
      to: 3,
      creates: ["campaign-sessions"],
      indexes: [],
    });
  return steps;
}

function upgradeDatabase(
  database: IDBDatabase,
  transaction: IDBTransaction | null,
  oldVersion: number,
): void {
  if (!transaction)
    throw new Error("IndexedDB migration requires an upgrade transaction");
  for (const storeName of OFFLINE_STORE_NAMES) {
    if (!database.objectStoreNames.contains(storeName))
      database.createObjectStore(storeName, { keyPath: KEY_PATHS[storeName] });
  }
  if (oldVersion < 2) {
    const cities = transaction.objectStore("cities");
    if (!cities.indexNames.contains("committedAt"))
      cities.createIndex("committedAt", "committedAt");
    const syncQueue = transaction.objectStore("sync-queue");
    if (!syncQueue.indexNames.contains("status"))
      syncQueue.createIndex("status", "status");
    if (!syncQueue.indexNames.contains("nextAttemptAt"))
      syncQueue.createIndex("nextAttemptAt", "nextAttemptAt");
  }
}

function campaignCacheKey(campaignId: string, version: number): string {
  return `${campaignId}@${version}`;
}
function toStoredCampaignCache(entry: CampaignCacheEntry): StoredCampaignCache {
  return {
    ...entry,
    cacheKey: campaignCacheKey(entry.campaignId, entry.version),
  };
}
function toCampaignCacheEntry(entry: StoredCampaignCache): CampaignCacheEntry {
  return {
    campaignId: entry.campaignId,
    version: entry.version,
    verifiedAt: entry.verifiedAt,
    pack: entry.pack,
    ...(entry.storageRoot === undefined
      ? {}
      : { storageRoot: entry.storageRoot }),
  };
}
function isValidStoredCampaignCache(
  value: unknown,
): value is StoredCampaignCache {
  if (
    !isValidCampaignCache(value) ||
    typeof (value as Record<string, unknown>).cacheKey !== "string"
  )
    return false;
  return (
    (value as StoredCampaignCache).cacheKey ===
    campaignCacheKey(value.campaignId, value.version)
  );
}
function keyFor(store: OfflineStoreName, value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const key = (value as Record<string, unknown>)[KEY_PATHS[store]];
  return typeof key === "string" ? key : null;
}
function requestAsPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed"));
  });
}
function transactionAsPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}
function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
