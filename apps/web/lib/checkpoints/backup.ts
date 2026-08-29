import {
  assertEncryptedCheckpointEnvelope,
  decryptAndValidateCheckpoint,
  type EncryptedCheckpointEnvelope,
} from "./encryption";

const BACKUP_SCHEMA_VERSION = 1 as const;
const SHA_256_PREFIX = "sha256:";
const MAX_ENVELOPE_BYTES = 7_000_000;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_RETRY_BASE_MS = 1_000;
const DEFAULT_UPLOAD_LEASE_MS = 30_000;
const SAFE_REMOTE_VALUE = /^[A-Za-z0-9._:-]+$/u;

export type CheckpointBackupState =
  "pending" | "uploading" | "retry-wait" | "synced" | "failed";

/**
 * A durable local record. It contains encrypted bytes and non-personal
 * integrity metadata only; wallet material and plaintext never enter the queue.
 */
export type CheckpointBackupRecord = Readonly<{
  schemaVersion: 1;
  idempotencyKey: string;
  encryptedEnvelope: string;
  contentHash: string;
  byteLength: number;
  state: CheckpointBackupState;
  attempts: number;
  createdAt: number;
  updatedAt: number;
  /** Retry time, or an upload lease while state is `uploading`. */
  nextAttemptAt: number;
  remoteRoot: string | null;
  failureCode: string | null;
}>;

export interface CheckpointBackupStore {
  /** Must be atomic so concurrent callers cannot create duplicate work. */
  saveIfAbsent(record: CheckpointBackupRecord): Promise<CheckpointBackupRecord>;
  get(idempotencyKey: string): Promise<CheckpointBackupRecord | null>;
  /** Atomically leases eligible work so tabs/workers cannot upload it twice. */
  claimEligible(
    idempotencyKey: string,
    now: number,
    leaseUntil: number,
  ): Promise<CheckpointBackupRecord | null>;
  /** Finalizes only the matching lease attempt; stale workers cannot overwrite newer state. */
  settleClaim(
    record: CheckpointBackupRecord,
    claimedAttempt: number,
  ): Promise<CheckpointBackupRecord>;
  save(record: CheckpointBackupRecord): Promise<void>;
  listEligible(now: number): Promise<readonly CheckpointBackupRecord[]>;
}

export type CheckpointUploadRequest = Readonly<{
  idempotencyKey: string;
  encryptedEnvelope: string;
  contentHash: string;
  byteLength: number;
}>;

export type CheckpointRemoteReceipt = Readonly<{
  root: string;
  contentHash: string;
  byteLength: number;
}>;

export type CheckpointDownload = CheckpointRemoteReceipt &
  Readonly<{ encryptedEnvelope: string }>;

export type CheckpointDownloadRequest = Readonly<{
  root: string;
  expectedContentHash: string;
  expectedByteLength: number;
}>;

/** Implemented by the adult-sponsored server boundary, never by a child wallet. */
export interface CheckpointRemoteStorage {
  upload(request: CheckpointUploadRequest): Promise<CheckpointRemoteReceipt>;
  download(request: CheckpointDownloadRequest): Promise<CheckpointDownload>;
}

export type AdultCheckpointReference = Readonly<{
  root: string;
  contentHash: string;
  byteLength: number;
  keyId: string;
  checkpointSchemaVersion: number;
  cityId: string;
  campaignId: string;
  campaignVersion: number;
}>;

export type RestoredCheckpoint<T> = Readonly<{
  checkpoint: T;
  envelope: EncryptedCheckpointEnvelope;
  localRecord: CheckpointBackupRecord;
}>;

export type CheckpointBackupCoordinatorOptions = Readonly<{
  store: CheckpointBackupStore;
  remote: CheckpointRemoteStorage;
  now?: () => number;
  autoUpload?: boolean;
  maxAttempts?: number;
  retryBaseMs?: number;
  uploadLeaseMs?: number;
}>;

export class CheckpointRemoteError extends Error {
  override readonly name = "CheckpointRemoteError";

  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super("Checkpoint remote storage is unavailable");
  }
}

export class CheckpointBackupIntegrityError extends Error {
  override readonly name = "CheckpointBackupIntegrityError";

  constructor() {
    super("Checkpoint backup failed integrity verification");
  }
}

/**
 * Coordinates local-first encrypted backups and adult-authorized restores.
 * Upload failures are converted into queue state and are never thrown through
 * the gameplay save path.
 */
export class CheckpointBackupCoordinator {
  private readonly store: CheckpointBackupStore;
  private readonly remote: CheckpointRemoteStorage;
  private readonly now: () => number;
  private readonly autoUpload: boolean;
  private readonly maxAttempts: number;
  private readonly retryBaseMs: number;
  private readonly uploadLeaseMs: number;
  private readonly inFlight = new Map<
    string,
    Promise<CheckpointBackupRecord>
  >();

  constructor(options: CheckpointBackupCoordinatorOptions) {
    this.store = options.store;
    this.remote = options.remote;
    this.now = options.now ?? Date.now;
    this.autoUpload = options.autoUpload ?? true;
    this.maxAttempts = positiveInteger(
      options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      "maxAttempts",
    );
    this.retryBaseMs = positiveInteger(
      options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS,
      "retryBaseMs",
    );
    this.uploadLeaseMs = positiveInteger(
      options.uploadLeaseMs ?? DEFAULT_UPLOAD_LEASE_MS,
      "uploadLeaseMs",
    );
  }

  /** Saves encrypted data locally before scheduling any remote work. */
  async saveEncryptedCheckpoint(
    envelope: EncryptedCheckpointEnvelope,
  ): Promise<CheckpointBackupRecord> {
    const prepared = await prepareEncryptedEnvelope(envelope);
    const timestamp = validTimestamp(this.now());
    const local = await this.store.saveIfAbsent({
      schemaVersion: BACKUP_SCHEMA_VERSION,
      idempotencyKey: prepared.idempotencyKey,
      encryptedEnvelope: prepared.serialized,
      contentHash: prepared.contentHash,
      byteLength: prepared.byteLength,
      state: "pending",
      attempts: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      nextAttemptAt: timestamp,
      remoteRoot: null,
      failureCode: null,
    });
    assertRecordMatchesPrepared(local, prepared);

    if (this.autoUpload && isEligible(local, timestamp)) {
      queueMicrotask(() => {
        void this.processOne(local.idempotencyKey, this.now()).catch(() => {
          // A local storage failure must not become an unhandled gameplay error.
        });
      });
    }
    return local;
  }

  /** Processes all queue entries eligible at `now`, including expired leases. */
  async flush(now = this.now()): Promise<readonly CheckpointBackupRecord[]> {
    validTimestamp(now);
    const entries = await this.store.listEligible(now);
    return Promise.all(
      entries.map((entry) => this.processOne(entry.idempotencyKey, now)),
    );
  }

  /**
   * Restores encrypted bytes named by an adult-controlled reference. Integrity
   * and authenticated metadata are checked before decrypting or accepting it.
   */
  async restoreFromAdultReference<T>(
    reference: AdultCheckpointReference,
    key: CryptoKey,
    isValid: (value: unknown) => value is T,
  ): Promise<RestoredCheckpoint<T>> {
    assertAdultReference(reference);
    const downloaded = await this.remote.download({
      root: reference.root,
      expectedContentHash: reference.contentHash,
      expectedByteLength: reference.byteLength,
    });
    assertDownloadedMatchesReference(downloaded, reference);
    const bytes = new TextEncoder().encode(downloaded.encryptedEnvelope);
    if (bytes.byteLength !== reference.byteLength) {
      throw new CheckpointBackupIntegrityError();
    }
    const contentHash = await sha256(bytes);
    if (contentHash !== reference.contentHash) {
      throw new CheckpointBackupIntegrityError();
    }

    const envelope = parseEncryptedEnvelope(downloaded.encryptedEnvelope);
    assertEnvelopeMatchesReference(envelope, reference);
    const checkpoint = await decryptAndValidateCheckpoint(
      envelope,
      key,
      isValid,
    );

    const timestamp = validTimestamp(this.now());
    const idempotencyKey = idempotencyKeyForHash(contentHash);
    const restoredRecord: CheckpointBackupRecord = {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      idempotencyKey,
      encryptedEnvelope: downloaded.encryptedEnvelope,
      contentHash,
      byteLength: bytes.byteLength,
      state: "synced",
      attempts: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      nextAttemptAt: timestamp,
      remoteRoot: reference.root,
      failureCode: null,
    };
    let localRecord = await this.store.saveIfAbsent(restoredRecord);
    assertRecordMatchesPrepared(localRecord, {
      idempotencyKey,
      serialized: downloaded.encryptedEnvelope,
      contentHash,
      byteLength: bytes.byteLength,
    });
    if (
      localRecord.remoteRoot !== null &&
      localRecord.remoteRoot !== reference.root
    ) {
      throw new CheckpointBackupIntegrityError();
    }
    if (localRecord.state !== "synced") {
      localRecord = {
        ...restoredRecord,
        createdAt: localRecord.createdAt,
        attempts: localRecord.attempts,
      };
      await this.store.save(localRecord);
    }
    return { checkpoint, envelope, localRecord };
  }

  private processOne(
    idempotencyKey: string,
    now: number,
  ): Promise<CheckpointBackupRecord> {
    const existing = this.inFlight.get(idempotencyKey);
    if (existing) return existing;
    const operation = this.uploadEligible(idempotencyKey, now).finally(() => {
      this.inFlight.delete(idempotencyKey);
    });
    this.inFlight.set(idempotencyKey, operation);
    return operation;
  }

  private async uploadEligible(
    idempotencyKey: string,
    now: number,
  ): Promise<CheckpointBackupRecord> {
    const uploading = await this.store.claimEligible(
      idempotencyKey,
      now,
      now + this.uploadLeaseMs,
    );
    if (!uploading) {
      const current = await this.store.get(idempotencyKey);
      if (!current)
        throw new Error("Checkpoint backup queue record is missing");
      assertValidBackupRecord(current);
      return current;
    }

    try {
      await assertBackupPayloadIntegrity(uploading);
      const receipt = await this.remote.upload({
        idempotencyKey: uploading.idempotencyKey,
        encryptedEnvelope: uploading.encryptedEnvelope,
        contentHash: uploading.contentHash,
        byteLength: uploading.byteLength,
      });
      assertValidReceipt(receipt);
      if (
        receipt.contentHash !== uploading.contentHash ||
        receipt.byteLength !== uploading.byteLength
      ) {
        throw new CheckpointBackupIntegrityError();
      }
      const timestamp = this.completionTimestamp(uploading.updatedAt);
      const synced: CheckpointBackupRecord = {
        ...uploading,
        state: "synced",
        updatedAt: timestamp,
        nextAttemptAt: timestamp,
        remoteRoot: receipt.root,
        failureCode: null,
      };
      return this.store.settleClaim(synced, uploading.attempts);
    } catch (error) {
      const timestamp = this.completionTimestamp(uploading.updatedAt);
      const retryable =
        error instanceof CheckpointRemoteError && error.retryable;
      const retry = retryable && uploading.attempts < this.maxAttempts;
      const failed: CheckpointBackupRecord = {
        ...uploading,
        state: retry ? "retry-wait" : "failed",
        updatedAt: timestamp,
        nextAttemptAt: retry
          ? timestamp + this.retryDelay(uploading.attempts)
          : timestamp,
        failureCode:
          error instanceof CheckpointRemoteError
            ? safeFailureCode(error.code)
            : error instanceof CheckpointBackupIntegrityError
              ? "integrity_failed"
              : "upload_failed",
      };
      return this.store.settleClaim(failed, uploading.attempts);
    }
  }

  private retryDelay(attempts: number): number {
    return Math.min(this.retryBaseMs * 2 ** (attempts - 1), 60_000);
  }

  private completionTimestamp(notBefore: number): number {
    return Math.max(validTimestamp(this.now()), notBefore);
  }
}

/** In-memory implementation for SSR, tests, and dependency-injected previews. */
export class MemoryCheckpointBackupStore implements CheckpointBackupStore {
  private readonly records = new Map<string, CheckpointBackupRecord>();

  async saveIfAbsent(
    record: CheckpointBackupRecord,
  ): Promise<CheckpointBackupRecord> {
    assertValidBackupRecord(record);
    const existing = this.records.get(record.idempotencyKey);
    if (existing) return clone(existing);
    this.records.set(record.idempotencyKey, clone(record));
    return clone(record);
  }

  async get(idempotencyKey: string): Promise<CheckpointBackupRecord | null> {
    const record = this.records.get(idempotencyKey);
    return record ? clone(record) : null;
  }

  async claimEligible(
    idempotencyKey: string,
    now: number,
    leaseUntil: number,
  ): Promise<CheckpointBackupRecord | null> {
    validTimestamp(now);
    validTimestamp(leaseUntil);
    if (leaseUntil <= now) {
      throw new TypeError("Checkpoint upload lease must end after it starts");
    }
    const current = this.records.get(idempotencyKey);
    if (!current || !isEligible(current, now)) return null;
    const claimed: CheckpointBackupRecord = {
      ...current,
      state: "uploading",
      attempts: current.attempts + 1,
      updatedAt: now,
      nextAttemptAt: leaseUntil,
      failureCode: null,
    };
    assertValidBackupRecord(claimed);
    this.records.set(idempotencyKey, clone(claimed));
    return clone(claimed);
  }

  async settleClaim(
    record: CheckpointBackupRecord,
    claimedAttempt: number,
  ): Promise<CheckpointBackupRecord> {
    assertValidBackupRecord(record);
    positiveInteger(claimedAttempt, "claimedAttempt");
    const current = this.records.get(record.idempotencyKey);
    if (!current) throw new Error("Checkpoint backup queue record is missing");
    if (current.state !== "uploading" || current.attempts !== claimedAttempt) {
      return clone(current);
    }
    this.records.set(record.idempotencyKey, clone(record));
    return clone(record);
  }

  async save(record: CheckpointBackupRecord): Promise<void> {
    assertValidBackupRecord(record);
    this.records.set(record.idempotencyKey, clone(record));
  }

  async listEligible(now: number): Promise<readonly CheckpointBackupRecord[]> {
    validTimestamp(now);
    return [...this.records.values()]
      .filter((record) => isEligible(record, now))
      .sort(
        (left, right) =>
          left.nextAttemptAt - right.nextAttemptAt ||
          left.createdAt - right.createdAt ||
          left.idempotencyKey.localeCompare(right.idempotencyKey),
      )
      .map(clone);
  }
}

type PreparedEnvelope = Readonly<{
  idempotencyKey: string;
  serialized: string;
  contentHash: string;
  byteLength: number;
}>;

async function prepareEncryptedEnvelope(
  envelope: EncryptedCheckpointEnvelope,
): Promise<PreparedEnvelope> {
  assertEncryptedCheckpointEnvelope(envelope);
  const serialized = serializeEncryptedEnvelope(envelope);
  const bytes = new TextEncoder().encode(serialized);
  if (bytes.byteLength > MAX_ENVELOPE_BYTES) {
    throw new TypeError("Encrypted checkpoint envelope is too large");
  }
  const contentHash = await sha256(bytes);
  return {
    idempotencyKey: idempotencyKeyForHash(contentHash),
    serialized,
    contentHash,
    byteLength: bytes.byteLength,
  };
}

function serializeEncryptedEnvelope(
  envelope: EncryptedCheckpointEnvelope,
): string {
  return JSON.stringify({
    schemaVersion: envelope.schemaVersion,
    algorithm: envelope.algorithm,
    keyId: envelope.keyId,
    iv: envelope.iv,
    aad: {
      schemaVersion: envelope.aad.schemaVersion,
      checkpointSchemaVersion: envelope.aad.checkpointSchemaVersion,
      cityId: envelope.aad.cityId,
      campaignId: envelope.aad.campaignId,
      campaignVersion: envelope.aad.campaignVersion,
      createdAt: envelope.aad.createdAt,
    },
    ciphertext: envelope.ciphertext,
  });
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto is unavailable in this browser");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `${SHA_256_PREFIX}${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function idempotencyKeyForHash(contentHash: string): string {
  return `checkpoint-v${BACKUP_SCHEMA_VERSION}-${contentHash.slice(SHA_256_PREFIX.length)}`;
}

function parseEncryptedEnvelope(
  serialized: string,
): EncryptedCheckpointEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    throw new CheckpointBackupIntegrityError();
  }
  try {
    assertEncryptedCheckpointEnvelope(parsed);
  } catch {
    throw new CheckpointBackupIntegrityError();
  }
  return parsed;
}

function assertDownloadedMatchesReference(
  download: CheckpointDownload,
  reference: AdultCheckpointReference,
): void {
  try {
    assertValidReceipt(download);
  } catch {
    throw new CheckpointBackupIntegrityError();
  }
  if (
    download.root !== reference.root ||
    download.contentHash !== reference.contentHash ||
    download.byteLength !== reference.byteLength ||
    typeof download.encryptedEnvelope !== "string"
  ) {
    throw new CheckpointBackupIntegrityError();
  }
}

function assertEnvelopeMatchesReference(
  envelope: EncryptedCheckpointEnvelope,
  reference: AdultCheckpointReference,
): void {
  if (
    envelope.keyId !== reference.keyId ||
    envelope.aad.checkpointSchemaVersion !==
      reference.checkpointSchemaVersion ||
    envelope.aad.cityId !== reference.cityId ||
    envelope.aad.campaignId !== reference.campaignId ||
    envelope.aad.campaignVersion !== reference.campaignVersion
  ) {
    throw new CheckpointBackupIntegrityError();
  }
}

function assertAdultReference(reference: AdultCheckpointReference): void {
  assertSafeRemoteValue(reference.root, "root");
  assertContentHash(reference.contentHash);
  positiveInteger(reference.byteLength, "byteLength");
  if (reference.byteLength > MAX_ENVELOPE_BYTES) {
    throw new TypeError("Checkpoint byteLength exceeds the backup limit");
  }
  assertSafeRemoteValue(reference.keyId, "keyId");
  positiveInteger(reference.checkpointSchemaVersion, "checkpointSchemaVersion");
  assertSafeRemoteValue(reference.cityId, "cityId");
  assertSafeRemoteValue(reference.campaignId, "campaignId");
  positiveInteger(reference.campaignVersion, "campaignVersion");
}

function assertValidReceipt(receipt: CheckpointRemoteReceipt): void {
  if (!receipt || typeof receipt !== "object") {
    throw new CheckpointBackupIntegrityError();
  }
  assertSafeRemoteValue(receipt.root, "root");
  assertContentHash(receipt.contentHash);
  positiveInteger(receipt.byteLength, "byteLength");
  if (receipt.byteLength > MAX_ENVELOPE_BYTES) {
    throw new CheckpointBackupIntegrityError();
  }
}

function assertValidBackupRecord(record: CheckpointBackupRecord): void {
  if (record.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new TypeError("Checkpoint backup schema version is unsupported");
  }
  assertContentHash(record.contentHash);
  if (record.idempotencyKey !== idempotencyKeyForHash(record.contentHash)) {
    throw new TypeError("Checkpoint backup idempotency key is invalid");
  }
  if (
    typeof record.encryptedEnvelope !== "string" ||
    new TextEncoder().encode(record.encryptedEnvelope).byteLength !==
      record.byteLength ||
    record.byteLength > MAX_ENVELOPE_BYTES
  ) {
    throw new TypeError("Checkpoint backup encrypted envelope is invalid");
  }
  if (
    !["pending", "uploading", "retry-wait", "synced", "failed"].includes(
      record.state,
    )
  ) {
    throw new TypeError("Checkpoint backup state is invalid");
  }
  nonNegativeInteger(record.attempts, "attempts");
  validTimestamp(record.createdAt);
  validTimestamp(record.updatedAt);
  validTimestamp(record.nextAttemptAt);
  if (record.updatedAt < record.createdAt) {
    throw new TypeError("Checkpoint backup update precedes its creation");
  }
  if (record.remoteRoot !== null) {
    assertSafeRemoteValue(record.remoteRoot, "remoteRoot");
  }
  if (
    record.failureCode !== null &&
    (!SAFE_REMOTE_VALUE.test(record.failureCode) ||
      record.failureCode.length > 64)
  ) {
    throw new TypeError("Checkpoint backup failure code is invalid");
  }
  if (
    (record.state === "synced") !== (record.remoteRoot !== null) ||
    ["retry-wait", "failed"].includes(record.state) !==
      (record.failureCode !== null) ||
    (record.state === "pending" && record.attempts !== 0) ||
    (record.state !== "pending" &&
      record.state !== "synced" &&
      record.attempts < 1)
  ) {
    throw new TypeError("Checkpoint backup state metadata is inconsistent");
  }
}

async function assertBackupPayloadIntegrity(
  record: CheckpointBackupRecord,
): Promise<void> {
  const bytes = new TextEncoder().encode(record.encryptedEnvelope);
  if (
    bytes.byteLength !== record.byteLength ||
    (await sha256(bytes)) !== record.contentHash
  ) {
    throw new CheckpointBackupIntegrityError();
  }
  const envelope = parseEncryptedEnvelope(record.encryptedEnvelope);
  if (serializeEncryptedEnvelope(envelope) !== record.encryptedEnvelope) {
    throw new CheckpointBackupIntegrityError();
  }
}

function assertRecordMatchesPrepared(
  record: CheckpointBackupRecord,
  prepared: PreparedEnvelope,
): void {
  if (
    record.idempotencyKey !== prepared.idempotencyKey ||
    record.encryptedEnvelope !== prepared.serialized ||
    record.contentHash !== prepared.contentHash ||
    record.byteLength !== prepared.byteLength
  ) {
    throw new CheckpointBackupIntegrityError();
  }
}

function isEligible(record: CheckpointBackupRecord, now: number): boolean {
  return (
    (record.state === "pending" ||
      record.state === "retry-wait" ||
      record.state === "uploading") &&
    record.nextAttemptAt <= now
  );
}

function assertContentHash(value: string): void {
  if (!/^sha256:[a-f0-9]{64}$/u.test(value)) {
    throw new TypeError("Checkpoint content hash is invalid");
  }
}

function assertSafeRemoteValue(value: string, label: string): void {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 256 ||
    !SAFE_REMOTE_VALUE.test(value)
  ) {
    throw new TypeError(`Checkpoint ${label} is invalid`);
  }
}

function safeFailureCode(value: string): string {
  return SAFE_REMOTE_VALUE.test(value) && value.length <= 64
    ? value
    : "remote_failed";
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`Checkpoint ${label} must be a positive integer`);
  }
  return value;
}

function nonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`Checkpoint ${label} must be a non-negative integer`);
  }
}

function validTimestamp(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("Checkpoint timestamp is invalid");
  }
  return value;
}

function clone(record: CheckpointBackupRecord): CheckpointBackupRecord {
  return { ...record };
}
