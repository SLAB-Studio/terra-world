/**
 * Local records deliberately contain no identity fields. Profile IDs are opaque
 * device-local identifiers; display names, dates of birth, schools, locations,
 * chat, and behavioural data do not belong in this persistence layer.
 */
export const OFFLINE_DATABASE_NAME = "terra-world";
export const OFFLINE_DATABASE_VERSION = 2;

export const OFFLINE_STORE_NAMES = [
  "profiles",
  "cities",
  "campaign-cache",
  "action-logs",
  "sync-queue",
  "settings",
] as const;

export type OfflineStoreName = (typeof OFFLINE_STORE_NAMES)[number];
export type PersistenceKind = "indexeddb" | "memory";

export type LocalProfile = Readonly<{
  profileId: string;
  avatarId?: string;
  colourTheme?: "sunrise" | "river" | "forest";
  createdAt: number;
  updatedAt: number;
}>;

/** The minimum deterministic city shape required to make a durable save. */
export type StoredCityState = Readonly<{
  schemaVersion: number;
  cityId: string;
  campaignId: string;
  campaignVersion: number;
  turn: number;
  actionLog: readonly unknown[];
}>;

export type CitySave = Readonly<{
  cityId: string;
  committedAt: number;
  state: StoredCityState;
}>;

export type CampaignCacheEntry = Readonly<{
  campaignId: string;
  version: number;
  verifiedAt: number;
  /** A verified, JSON-compatible campaign pack. */
  pack: unknown;
  storageRoot?: string;
}>;

export type StoredAction = Readonly<{
  actionId: string;
  turn: number;
  sequence: number;
  type: "place-building" | "remove-building" | "advance-turn";
}>;

export type ActionLogSave = Readonly<{
  cityId: string;
  savedAt: number;
  actions: readonly StoredAction[];
}>;

export type SyncOperationKind = "checkpoint" | "milestone";
export type SyncStatus = "pending" | "retrying";

export type SyncQueueEntry = Readonly<{
  id: string;
  kind: SyncOperationKind;
  cityId: string;
  idempotencyKey: string;
  /** Encrypted or otherwise non-personal opaque request data only. */
  encryptedPayload: string;
  status: SyncStatus;
  attempts: number;
  nextAttemptAt: number;
  createdAt: number;
}>;

export type DeviceSettings = Readonly<{
  profileId: string;
  reducedMotion: boolean;
  highContrast: boolean;
  textScale: number;
  muted: boolean;
  locale: "en";
  updatedAt: number;
}>;

export type CorruptRecordNotice = Readonly<{
  store: OfflineStoreName;
  key: string;
}>;

export type OfflinePersistenceOptions = Readonly<{
  databaseName?: string;
  indexedDB?: IDBFactory | undefined;
  onCorruptRecord?: (notice: CorruptRecordNotice) => void;
}>;

export interface OfflinePersistence {
  readonly kind: PersistenceKind;
  saveProfile(profile: LocalProfile): Promise<void>;
  getProfile(profileId: string): Promise<LocalProfile | null>;
  listProfiles(): Promise<readonly LocalProfile[]>;
  saveCity(city: CitySave): Promise<void>;
  getCity(cityId: string): Promise<CitySave | null>;
  deleteCity(cityId: string): Promise<void>;
  saveCampaignCache(entry: CampaignCacheEntry): Promise<void>;
  getCampaignCache(
    campaignId: string,
    version: number,
  ): Promise<CampaignCacheEntry | null>;
  saveActionLog(entry: ActionLogSave): Promise<void>;
  getActionLog(cityId: string): Promise<ActionLogSave | null>;
  enqueueSync(entry: SyncQueueEntry): Promise<void>;
  getPendingSync(now?: number): Promise<readonly SyncQueueEntry[]>;
  updateSync(entry: SyncQueueEntry): Promise<void>;
  removeSync(id: string): Promise<void>;
  saveSettings(settings: DeviceSettings): Promise<void>;
  getSettings(profileId: string): Promise<DeviceSettings | null>;
  close(): void;
}
