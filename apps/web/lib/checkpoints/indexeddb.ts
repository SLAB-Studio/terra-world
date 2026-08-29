import {
  MemoryCheckpointBackupStore,
  type CheckpointBackupRecord,
  type CheckpointBackupStore,
} from "./backup";
import { assertEncryptedCheckpointEnvelope } from "./encryption";

export const CHECKPOINT_BACKUP_DATABASE_NAME = "terra-world-checkpoint-backups";
export const CHECKPOINT_BACKUP_DATABASE_VERSION = 2;
export const CHECKPOINT_BACKUP_STORE_NAME = "checkpoint-backups";

const RECORD_SCHEMA_VERSION = 1;
const CONTENT_HASH = /^sha256:[a-f0-9]{64}$/u;
const IDEMPOTENCY_KEY = /^checkpoint-v1-[a-f0-9]{64}$/u;
const SAFE_REMOTE_VALUE = /^[A-Za-z0-9._:-]+$/u;
const MAX_ENVELOPE_BYTES = 7_000_000;
const RECORD_KEYS = [
  "schemaVersion",
  "idempotencyKey",
  "encryptedEnvelope",
  "contentHash",
  "byteLength",
  "state",
  "attempts",
  "createdAt",
  "updatedAt",
  "nextAttemptAt",
  "remoteRoot",
  "failureCode",
] as const;

export type CheckpointBackupCorruptRecordNotice = Readonly<{
  store: typeof CHECKPOINT_BACKUP_STORE_NAME;
  key: string;
}>;

export type IndexedDbCheckpointBackupStoreOptions = Readonly<{
  indexedDB?: IDBFactory | undefined;
  databaseName?: string | undefined;
  onCorruptRecord?:
    ((notice: CheckpointBackupCorruptRecordNotice) => void) | undefined;
}>;

export interface DurableCheckpointBackupStore extends CheckpointBackupStore {
  readonly kind: "indexeddb" | "memory";
  clear(): Promise<void>;
  close(): void;
}

/**
 * Opens durable browser storage when available. Server rendering and browsers
 * that deny IndexedDB receive an isolated memory store instead of crashing.
 */
export async function createCheckpointBackupStore(
  options: IndexedDbCheckpointBackupStoreOptions = {},
): Promise<DurableCheckpointBackupStore> {
  const factory =
    options.indexedDB ??
    (typeof globalThis === "undefined" ? undefined : globalThis.indexedDB);
  if (!factory) return new ManagedMemoryCheckpointBackupStore();

  try {
    return await IndexedDbCheckpointBackupStore.open(
      factory,
      options.databaseName ?? CHECKPOINT_BACKUP_DATABASE_NAME,
      options.onCorruptRecord,
    );
  } catch {
    return new ManagedMemoryCheckpointBackupStore();
  }
}

export class IndexedDbCheckpointBackupStore implements DurableCheckpointBackupStore {
  readonly kind = "indexeddb" as const;

  private constructor(
    private readonly database: IDBDatabase,
    private readonly onCorruptRecord?: (
      notice: CheckpointBackupCorruptRecordNotice,
    ) => void,
  ) {}

  static async open(
    factory: IDBFactory,
    databaseName = CHECKPOINT_BACKUP_DATABASE_NAME,
    onCorruptRecord?: (notice: CheckpointBackupCorruptRecordNotice) => void,
  ): Promise<IndexedDbCheckpointBackupStore> {
    const request = factory.open(
      databaseName,
      CHECKPOINT_BACKUP_DATABASE_VERSION,
    );
    request.onupgradeneeded = () => upgradeDatabase(request);
    const database = await requestResult(request);
    database.onversionchange = () => database.close();
    return new IndexedDbCheckpointBackupStore(database, onCorruptRecord);
  }

  async saveIfAbsent(
    record: CheckpointBackupRecord,
  ): Promise<CheckpointBackupRecord> {
    assertValidRecord(record);
    const transaction = this.database.transaction(
      CHECKPOINT_BACKUP_STORE_NAME,
      "readwrite",
    );
    const completed = transactionComplete(transaction);
    const store = transaction.objectStore(CHECKPOINT_BACKUP_STORE_NAME);
    const existing = await requestResult(
      store.get(record.idempotencyKey) as IDBRequest<unknown>,
    );

    if (existing !== undefined && isValidRecord(existing)) {
      await completed;
      return copyRecord(existing);
    }
    const replacedCorruptRecord = existing !== undefined;
    if (replacedCorruptRecord) {
      await requestResult(store.delete(record.idempotencyKey));
    }
    await requestResult(store.add(copyRecord(record)));
    await completed;
    if (replacedCorruptRecord) this.reportCorrupt(record.idempotencyKey);
    return copyRecord(record);
  }

  async get(idempotencyKey: string): Promise<CheckpointBackupRecord | null> {
    assertIdempotencyKey(idempotencyKey);
    const transaction = this.database.transaction(
      CHECKPOINT_BACKUP_STORE_NAME,
      "readwrite",
    );
    const completed = transactionComplete(transaction);
    const store = transaction.objectStore(CHECKPOINT_BACKUP_STORE_NAME);
    const value = await requestResult(
      store.get(idempotencyKey) as IDBRequest<unknown>,
    );
    if (value === undefined) {
      await completed;
      return null;
    }
    if (!isValidRecord(value)) {
      await requestResult(store.delete(idempotencyKey));
      await completed;
      this.reportCorrupt(idempotencyKey);
      return null;
    }
    await completed;
    return copyRecord(value);
  }

  async claimEligible(
    idempotencyKey: string,
    now: number,
    leaseUntil: number,
  ): Promise<CheckpointBackupRecord | null> {
    assertIdempotencyKey(idempotencyKey);
    assertTimestamp(now);
    assertTimestamp(leaseUntil);
    if (leaseUntil <= now) {
      throw new TypeError("Checkpoint upload lease must end after it starts");
    }

    const transaction = this.database.transaction(
      CHECKPOINT_BACKUP_STORE_NAME,
      "readwrite",
    );
    const completed = transactionComplete(transaction);
    const store = transaction.objectStore(CHECKPOINT_BACKUP_STORE_NAME);
    const value = await requestResult(
      store.get(idempotencyKey) as IDBRequest<unknown>,
    );
    if (value === undefined) {
      await completed;
      return null;
    }
    if (!isValidRecord(value)) {
      await requestResult(store.delete(idempotencyKey));
      await completed;
      this.reportCorrupt(idempotencyKey);
      return null;
    }
    if (!isEligible(value, now)) {
      await completed;
      return null;
    }

    const claimed: CheckpointBackupRecord = {
      ...value,
      state: "uploading",
      attempts: value.attempts + 1,
      updatedAt: now,
      nextAttemptAt: leaseUntil,
      failureCode: null,
    };
    assertValidRecord(claimed);
    await requestResult(store.put(copyRecord(claimed)));
    await completed;
    return copyRecord(claimed);
  }

  async settleClaim(
    record: CheckpointBackupRecord,
    claimedAttempt: number,
  ): Promise<CheckpointBackupRecord> {
    assertValidSettlement(record, claimedAttempt);

    const transaction = this.database.transaction(
      CHECKPOINT_BACKUP_STORE_NAME,
      "readwrite",
    );
    const completed = transactionComplete(transaction);
    const store = transaction.objectStore(CHECKPOINT_BACKUP_STORE_NAME);
    const value = await requestResult(
      store.get(record.idempotencyKey) as IDBRequest<unknown>,
    );
    if (value === undefined) {
      await completed;
      throw new Error("Checkpoint backup queue record is missing");
    }
    if (!isValidRecord(value)) {
      await requestResult(store.delete(record.idempotencyKey));
      await completed;
      this.reportCorrupt(record.idempotencyKey);
      throw new Error("Checkpoint backup queue record is corrupt");
    }
    if (value.state !== "uploading" || value.attempts !== claimedAttempt) {
      await completed;
      return copyRecord(value);
    }
    assertImmutableFieldsMatch(value, record);
    await requestResult(store.put(copyRecord(record)));
    await completed;
    return copyRecord(record);
  }

  async save(record: CheckpointBackupRecord): Promise<void> {
    assertValidRecord(record);
    const transaction = this.database.transaction(
      CHECKPOINT_BACKUP_STORE_NAME,
      "readwrite",
    );
    const completed = transactionComplete(transaction);
    await requestResult(
      transaction
        .objectStore(CHECKPOINT_BACKUP_STORE_NAME)
        .put(copyRecord(record)),
    );
    await completed;
  }

  async listEligible(now: number): Promise<readonly CheckpointBackupRecord[]> {
    assertTimestamp(now);
    const transaction = this.database.transaction(
      CHECKPOINT_BACKUP_STORE_NAME,
      "readwrite",
    );
    const completed = transactionComplete(transaction);
    const store = transaction.objectStore(CHECKPOINT_BACKUP_STORE_NAME);
    const [values, keys] = await Promise.all([
      requestResult(store.getAll() as IDBRequest<unknown[]>),
      requestResult(store.getAllKeys()),
    ]);
    const eligible: CheckpointBackupRecord[] = [];
    const corruptNotices: string[] = [];

    for (const [index, value] of values.entries()) {
      if (!isValidRecord(value)) {
        const rawKey = keys[index];
        if (rawKey !== undefined) {
          await requestResult(store.delete(rawKey));
          corruptNotices.push(safeNoticeKey(rawKey));
        }
        continue;
      }
      if (isEligible(value, now)) eligible.push(copyRecord(value));
    }
    await completed;
    for (const key of corruptNotices) this.reportCorrupt(key);
    return eligible.sort(compareEligible);
  }

  async clear(): Promise<void> {
    const transaction = this.database.transaction(
      CHECKPOINT_BACKUP_STORE_NAME,
      "readwrite",
    );
    const completed = transactionComplete(transaction);
    await requestResult(
      transaction.objectStore(CHECKPOINT_BACKUP_STORE_NAME).clear(),
    );
    await completed;
  }

  close(): void {
    this.database.close();
  }

  private reportCorrupt(key: string): void {
    try {
      this.onCorruptRecord?.({
        store: CHECKPOINT_BACKUP_STORE_NAME,
        key,
      });
    } catch {
      // Reporting must never expose or interrupt local recovery.
    }
  }
}

class ManagedMemoryCheckpointBackupStore implements DurableCheckpointBackupStore {
  readonly kind = "memory" as const;
  private delegate = new MemoryCheckpointBackupStore();

  saveIfAbsent(record: CheckpointBackupRecord) {
    assertValidRecord(record);
    return this.delegate.saveIfAbsent(record);
  }
  get(idempotencyKey: string) {
    assertIdempotencyKey(idempotencyKey);
    return this.delegate.get(idempotencyKey);
  }
  claimEligible(idempotencyKey: string, now: number, leaseUntil: number) {
    assertIdempotencyKey(idempotencyKey);
    return this.delegate.claimEligible(idempotencyKey, now, leaseUntil);
  }
  settleClaim(record: CheckpointBackupRecord, claimedAttempt: number) {
    assertValidSettlement(record, claimedAttempt);
    return this.delegate.settleClaim(record, claimedAttempt);
  }
  save(record: CheckpointBackupRecord) {
    assertValidRecord(record);
    return this.delegate.save(record);
  }
  listEligible(now: number) {
    return this.delegate.listEligible(now);
  }
  async clear(): Promise<void> {
    this.delegate = new MemoryCheckpointBackupStore();
  }
  close(): void {
    // There is no browser handle to release.
  }
}

function upgradeDatabase(request: IDBOpenDBRequest): void {
  const database = request.result;
  const transaction = request.transaction;
  if (!transaction) {
    throw new Error("IndexedDB migration requires an upgrade transaction");
  }
  const store = database.objectStoreNames.contains(CHECKPOINT_BACKUP_STORE_NAME)
    ? transaction.objectStore(CHECKPOINT_BACKUP_STORE_NAME)
    : database.createObjectStore(CHECKPOINT_BACKUP_STORE_NAME, {
        keyPath: "idempotencyKey",
      });
  if (!store.indexNames.contains("state")) {
    store.createIndex("state", "state");
  }
  if (!store.indexNames.contains("nextAttemptAt")) {
    store.createIndex("nextAttemptAt", "nextAttemptAt");
  }
}

function isValidRecord(value: unknown): value is CheckpointBackupRecord {
  try {
    assertValidRecord(value);
    return true;
  } catch {
    return false;
  }
}

function assertValidRecord(
  value: unknown,
): asserts value is CheckpointBackupRecord {
  if (!isPlainObject(value)) {
    throw new TypeError("Checkpoint backup record must be a plain object");
  }
  const keys = Object.keys(value).sort();
  const expected = [...RECORD_KEYS].sort();
  if (
    Object.getOwnPropertySymbols(value).length !== 0 ||
    Object.getOwnPropertyNames(value).length !== keys.length ||
    keys.length !== expected.length ||
    keys.some((key, index) => key !== expected[index])
  ) {
    throw new TypeError("Checkpoint backup record contains unsupported data");
  }
  if (value.schemaVersion !== RECORD_SCHEMA_VERSION) {
    throw new TypeError("Checkpoint backup schema version is unsupported");
  }
  if (
    typeof value.contentHash !== "string" ||
    !CONTENT_HASH.test(value.contentHash)
  ) {
    throw new TypeError("Checkpoint content hash is invalid");
  }
  if (
    typeof value.idempotencyKey !== "string" ||
    !IDEMPOTENCY_KEY.test(value.idempotencyKey) ||
    value.idempotencyKey !== `checkpoint-v1-${value.contentHash.slice(7)}`
  ) {
    throw new TypeError("Checkpoint backup idempotency key is invalid");
  }
  if (
    typeof value.encryptedEnvelope !== "string" ||
    typeof value.byteLength !== "number" ||
    !Number.isSafeInteger(value.byteLength) ||
    value.byteLength < 1 ||
    value.byteLength > MAX_ENVELOPE_BYTES ||
    new TextEncoder().encode(value.encryptedEnvelope).byteLength !==
      value.byteLength
  ) {
    throw new TypeError("Checkpoint backup encrypted envelope is invalid");
  }
  assertEncryptedEnvelopeString(value.encryptedEnvelope);
  if (
    !["pending", "uploading", "retry-wait", "synced", "failed"].includes(
      String(value.state),
    )
  ) {
    throw new TypeError("Checkpoint backup state is invalid");
  }
  if (typeof value.attempts !== "number") {
    throw new TypeError("Checkpoint attempts must be a non-negative integer");
  }
  assertNonNegativeInteger(value.attempts, "attempts");
  assertTimestamp(value.createdAt);
  assertTimestamp(value.updatedAt);
  assertTimestamp(value.nextAttemptAt);
  if (value.updatedAt < value.createdAt) {
    throw new TypeError("Checkpoint backup update precedes its creation");
  }
  if (value.remoteRoot !== null) {
    assertSafeRemoteValue(value.remoteRoot, "remoteRoot", 256);
  }
  if (value.failureCode !== null) {
    assertSafeRemoteValue(value.failureCode, "failureCode", 64);
  }
  if (
    (value.state === "synced") !== (value.remoteRoot !== null) ||
    ["retry-wait", "failed"].includes(String(value.state)) !==
      (value.failureCode !== null) ||
    (value.state === "pending" && value.attempts !== 0) ||
    (value.state !== "pending" &&
      value.state !== "synced" &&
      value.attempts < 1)
  ) {
    throw new TypeError("Checkpoint backup state metadata is inconsistent");
  }
}

function assertEncryptedEnvelopeString(value: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
    assertEncryptedCheckpointEnvelope(parsed);
  } catch {
    throw new TypeError("Checkpoint backup encrypted envelope is invalid");
  }
}

function assertValidSettlement(
  record: CheckpointBackupRecord,
  claimedAttempt: number,
): void {
  assertValidRecord(record);
  assertPositiveInteger(claimedAttempt, "claimedAttempt");
  if (record.attempts !== claimedAttempt || record.state === "uploading") {
    throw new TypeError("Checkpoint settlement does not match its claim");
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isEligible(record: CheckpointBackupRecord, now: number): boolean {
  return (
    ["pending", "retry-wait", "uploading"].includes(record.state) &&
    record.nextAttemptAt <= now
  );
}

function compareEligible(
  left: CheckpointBackupRecord,
  right: CheckpointBackupRecord,
): number {
  return (
    left.nextAttemptAt - right.nextAttemptAt ||
    left.createdAt - right.createdAt ||
    left.idempotencyKey.localeCompare(right.idempotencyKey)
  );
}

function assertImmutableFieldsMatch(
  current: CheckpointBackupRecord,
  settlement: CheckpointBackupRecord,
): void {
  if (
    current.idempotencyKey !== settlement.idempotencyKey ||
    current.encryptedEnvelope !== settlement.encryptedEnvelope ||
    current.contentHash !== settlement.contentHash ||
    current.byteLength !== settlement.byteLength ||
    current.createdAt !== settlement.createdAt
  ) {
    throw new TypeError("Checkpoint settlement changed immutable backup data");
  }
}

function assertIdempotencyKey(value: string): void {
  if (typeof value !== "string" || !IDEMPOTENCY_KEY.test(value)) {
    throw new TypeError("Checkpoint backup idempotency key is invalid");
  }
}

function assertSafeRemoteValue(
  value: unknown,
  label: string,
  maxLength: number,
): void {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maxLength ||
    !SAFE_REMOTE_VALUE.test(value)
  ) {
    throw new TypeError(`Checkpoint ${label} is invalid`);
  }
}

function assertPositiveInteger(value: unknown, label: string): void {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new TypeError(`Checkpoint ${label} must be a positive integer`);
  }
}

function assertNonNegativeInteger(value: unknown, label: string): void {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new TypeError(`Checkpoint ${label} must be a non-negative integer`);
  }
}

function assertTimestamp(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new TypeError("Checkpoint timestamp is invalid");
  }
}

function safeNoticeKey(value: IDBValidKey): string {
  return typeof value === "string" && IDEMPOTENCY_KEY.test(value)
    ? value
    : "invalid-record";
}

function copyRecord(record: CheckpointBackupRecord): CheckpointBackupRecord {
  return { ...record };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}
