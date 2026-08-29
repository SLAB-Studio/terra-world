import { describe, expect, it, vi } from "vitest";

import {
  CheckpointBackupCoordinator,
  CheckpointBackupIntegrityError,
  CheckpointRemoteError,
  MemoryCheckpointBackupStore,
  type AdultCheckpointReference,
  type CheckpointDownload,
  type CheckpointRemoteReceipt,
  type CheckpointRemoteStorage,
  type CheckpointUploadRequest,
} from "./backup";
import {
  encryptCheckpoint,
  generateCheckpointKey,
  type CheckpointEncryptionContext,
  type EncryptedCheckpointEnvelope,
} from "./encryption";

const checkpoint = {
  schemaVersion: 1,
  cityId: "rivergate-test",
  campaignId: "rivergate",
  campaignVersion: 1,
  turn: 8,
  actionLog: [{ type: "advance-turn", turn: 8 }],
};

const context: CheckpointEncryptionContext = {
  keyId: "adult-session-key-1",
  checkpointSchemaVersion: 1,
  cityId: checkpoint.cityId,
  campaignId: checkpoint.campaignId,
  campaignVersion: checkpoint.campaignVersion,
  createdAt: 1_788_000_000_000,
};

describe("local-first encrypted checkpoint backup", () => {
  it("saves offline immediately with a deterministic idempotency key and no wallet data", async () => {
    const store = new MemoryCheckpointBackupStore();
    const remote = new FakeRemoteStorage();
    const coordinator = coordinatorFor(store, remote);
    const { envelope } = await encryptedFixture();

    const first = await coordinator.saveEncryptedCheckpoint(envelope);
    const duplicate = await coordinator.saveEncryptedCheckpoint(envelope);
    const reordered = await coordinator.saveEncryptedCheckpoint({
      ciphertext: envelope.ciphertext,
      aad: {
        createdAt: envelope.aad.createdAt,
        campaignVersion: envelope.aad.campaignVersion,
        campaignId: envelope.aad.campaignId,
        cityId: envelope.aad.cityId,
        checkpointSchemaVersion: envelope.aad.checkpointSchemaVersion,
        schemaVersion: envelope.aad.schemaVersion,
      },
      iv: envelope.iv,
      keyId: envelope.keyId,
      algorithm: envelope.algorithm,
      schemaVersion: envelope.schemaVersion,
    });

    expect(first.state).toBe("pending");
    expect(duplicate).toEqual(first);
    expect(reordered).toEqual(first);
    expect(first.idempotencyKey).toMatch(/^checkpoint-v1-[a-f0-9]{64}$/u);
    await expect(store.get(first.idempotencyKey)).resolves.toEqual(first);
    expect(remote.uploads).toHaveLength(0);
    expect(JSON.stringify(first)).not.toMatch(
      /wallet|private.?key|plaintext/iu,
    );
  });

  it("turns a non-retryable upload failure into terminal queue state without rejecting the save", async () => {
    const store = new MemoryCheckpointBackupStore();
    const remote = new FakeRemoteStorage();
    remote.onUpload = async () => {
      throw new CheckpointRemoteError("request_rejected", false);
    };
    const coordinator = coordinatorFor(store, remote);
    const { envelope } = await encryptedFixture();

    const local = await coordinator.saveEncryptedCheckpoint(envelope);
    await expect(coordinator.flush(1_000)).resolves.toMatchObject([
      { state: "failed", failureCode: "request_rejected", attempts: 1 },
    ]);
    await expect(store.get(local.idempotencyKey)).resolves.toMatchObject({
      state: "failed",
    });
    expect(remote.uploads).toHaveLength(1);
  });

  it("keeps retryable work queued offline and uploads it after reconnect", async () => {
    let now = 1_000;
    const store = new MemoryCheckpointBackupStore();
    const remote = new FakeRemoteStorage();
    remote.onUpload = async (request) => {
      if (remote.uploads.length === 1) {
        throw new CheckpointRemoteError("offline", true);
      }
      return remote.accept(request);
    };
    const coordinator = coordinatorFor(store, remote, () => now);
    const { envelope } = await encryptedFixture();
    const local = await coordinator.saveEncryptedCheckpoint(envelope);

    await expect(coordinator.flush()).resolves.toMatchObject([
      { state: "retry-wait", nextAttemptAt: 2_000, attempts: 1 },
    ]);
    await expect(coordinator.flush(1_999)).resolves.toEqual([]);

    now = 2_000;
    await expect(coordinator.flush()).resolves.toMatchObject([
      { state: "synced", attempts: 2, remoteRoot: expect.any(String) },
    ]);
    await expect(store.get(local.idempotencyKey)).resolves.toMatchObject({
      state: "synced",
    });
  });

  it("retries an ambiguous accepted upload with the same key and receives the same root", async () => {
    let now = 1_000;
    const store = new MemoryCheckpointBackupStore();
    const remote = new FakeRemoteStorage();
    remote.onUpload = async (request) => {
      const receipt = remote.accept(request);
      if (remote.uploads.length === 1) {
        throw new CheckpointRemoteError("response_lost", true);
      }
      return receipt;
    };
    const coordinator = coordinatorFor(store, remote, () => now);
    const { envelope } = await encryptedFixture();
    await coordinator.saveEncryptedCheckpoint(envelope);

    await coordinator.flush();
    const acceptedRoot = [...remote.receipts.values()][0]?.root;
    now = 2_000;
    const [synced] = await coordinator.flush();

    expect(remote.uploads).toHaveLength(2);
    expect(remote.uploads[0]?.idempotencyKey).toBe(
      remote.uploads[1]?.idempotencyKey,
    );
    expect(synced?.remoteRoot).toBe(acceptedRoot);
    await coordinator.flush(now);
    expect(remote.uploads).toHaveLength(2);
  });

  it("restores into a fresh local profile from an adult-controlled reference", async () => {
    const { key, envelope } = await encryptedFixture();
    const remote = new FakeRemoteStorage();
    const sourceStore = new MemoryCheckpointBackupStore();
    const source = coordinatorFor(sourceStore, remote);
    const queued = await source.saveEncryptedCheckpoint(envelope);
    const [synced] = await source.flush();
    expect(synced?.state).toBe("synced");

    const reference = referenceFor(queued, synced?.remoteRoot ?? "");
    const freshStore = new MemoryCheckpointBackupStore();
    const fresh = coordinatorFor(freshStore, remote);

    const restored = await fresh.restoreFromAdultReference(
      reference,
      key,
      isTestCheckpoint,
    );

    expect(restored.checkpoint).toEqual(checkpoint);
    expect(restored.localRecord).toMatchObject({
      state: "synced",
      remoteRoot: reference.root,
      contentHash: reference.contentHash,
    });
    await expect(
      freshStore.get(restored.localRecord.idempotencyKey),
    ).resolves.toEqual(restored.localRecord);
  });

  it("rejects tampered bytes and wrong expected metadata before accepting a restore", async () => {
    const { key, envelope } = await encryptedFixture();
    const remote = new FakeRemoteStorage();
    const source = coordinatorFor(new MemoryCheckpointBackupStore(), remote);
    const queued = await source.saveEncryptedCheckpoint(envelope);
    const [synced] = await source.flush();
    const reference = referenceFor(queued, synced?.remoteRoot ?? "");

    const tamperedStore = new MemoryCheckpointBackupStore();
    remote.downloadOverride = (root) => {
      const original = remote.downloads.get(root);
      if (!original) throw new Error("missing test fixture");
      return {
        ...original,
        encryptedEnvelope: `${original.encryptedEnvelope.slice(0, -1)}x`,
      };
    };
    await expect(
      coordinatorFor(tamperedStore, remote).restoreFromAdultReference(
        reference,
        key,
        isTestCheckpoint,
      ),
    ).rejects.toBeInstanceOf(CheckpointBackupIntegrityError);
    await expect(
      tamperedStore.listEligible(Number.MAX_SAFE_INTEGER),
    ).resolves.toEqual([]);

    remote.downloadOverride = undefined;
    const wrongMetadataStore = new MemoryCheckpointBackupStore();
    await expect(
      coordinatorFor(wrongMetadataStore, remote).restoreFromAdultReference(
        { ...reference, cityId: "another-city" },
        key,
        isTestCheckpoint,
      ),
    ).rejects.toBeInstanceOf(CheckpointBackupIntegrityError);
    await expect(
      wrongMetadataStore.listEligible(Number.MAX_SAFE_INTEGER),
    ).resolves.toEqual([]);

    await expect(
      coordinatorFor(
        new MemoryCheckpointBackupStore(),
        remote,
      ).restoreFromAdultReference(
        {
          ...reference,
          contentHash: `sha256:${"0".repeat(64)}`,
        },
        key,
        isTestCheckpoint,
      ),
    ).rejects.toBeInstanceOf(CheckpointBackupIntegrityError);
  });

  it("deduplicates concurrent saves and flushes into one remote upload", async () => {
    const store = new MemoryCheckpointBackupStore();
    const remote = new FakeRemoteStorage();
    const coordinator = coordinatorFor(store, remote);
    const { envelope } = await encryptedFixture();

    const [first, second, third] = await Promise.all([
      coordinator.saveEncryptedCheckpoint(envelope),
      coordinator.saveEncryptedCheckpoint(envelope),
      coordinator.saveEncryptedCheckpoint(envelope),
    ]);
    expect(
      new Set([
        first.idempotencyKey,
        second.idempotencyKey,
        third.idempotencyKey,
      ]),
    ).toHaveLength(1);

    const [left, right] = await Promise.all([
      coordinator.flush(1_000),
      coordinator.flush(1_000),
    ]);
    expect(left[0]).toMatchObject({ state: "synced" });
    expect(right[0]).toMatchObject({ state: "synced" });
    expect(remote.uploads).toHaveLength(1);
    expect(Object.keys(remote.uploads[0] ?? {}).sort()).toEqual([
      "byteLength",
      "contentHash",
      "encryptedEnvelope",
      "idempotencyKey",
    ]);
  });

  it("recovers an expired uploading lease after a worker restart", async () => {
    const store = new MemoryCheckpointBackupStore();
    const remote = new FakeRemoteStorage();
    const coordinator = coordinatorFor(store, remote);
    const { envelope } = await encryptedFixture();
    const queued = await coordinator.saveEncryptedCheckpoint(envelope);
    await store.save({
      ...queued,
      state: "uploading",
      attempts: 1,
      updatedAt: 1_000,
      nextAttemptAt: 2_000,
    });

    await expect(coordinator.flush(1_999)).resolves.toEqual([]);
    await expect(coordinator.flush(2_000)).resolves.toMatchObject([
      { state: "synced", attempts: 2 },
    ]);
  });

  it("uses an atomic lease to deduplicate concurrent workers", async () => {
    const store = new MemoryCheckpointBackupStore();
    const remote = new FakeRemoteStorage();
    const firstWorker = coordinatorFor(store, remote);
    const secondWorker = coordinatorFor(store, remote);
    const { envelope } = await encryptedFixture();
    const queued = await firstWorker.saveEncryptedCheckpoint(envelope);

    await Promise.all([firstWorker.flush(1_000), secondWorker.flush(1_000)]);

    expect(remote.uploads).toHaveLength(1);
    await expect(store.get(queued.idempotencyKey)).resolves.toMatchObject({
      state: "synced",
    });
  });

  it("prevents an expired worker from overwriting a newer successful attempt", async () => {
    const store = new MemoryCheckpointBackupStore();
    const remote = new FakeRemoteStorage();
    const staleResponse = deferred<CheckpointRemoteReceipt>();
    remote.onUpload = (request) =>
      remote.uploads.length === 1
        ? staleResponse.promise
        : Promise.resolve(remote.accept(request));
    const staleWorker = coordinatorFor(store, remote);
    const recoveryWorker = coordinatorFor(store, remote);
    const { envelope } = await encryptedFixture();
    const queued = await staleWorker.saveEncryptedCheckpoint(envelope);

    const staleFlush = staleWorker.flush(1_000);
    await vi.waitFor(() => expect(remote.uploads).toHaveLength(1));
    await expect(recoveryWorker.flush(6_000)).resolves.toMatchObject([
      { state: "synced", attempts: 2 },
    ]);

    staleResponse.resolve(remote.accept(remote.uploads[0]!));
    await expect(staleFlush).resolves.toMatchObject([
      { state: "synced", attempts: 2 },
    ]);
    await expect(store.get(queued.idempotencyKey)).resolves.toMatchObject({
      state: "synced",
      attempts: 2,
      failureCode: null,
    });
  });

  it("defaults to a background upload while returning the local save first", async () => {
    const store = new MemoryCheckpointBackupStore();
    const remote = new FakeRemoteStorage();
    const uploaded = deferred<CheckpointRemoteReceipt>();
    remote.onUpload = () => uploaded.promise;
    const coordinator = new CheckpointBackupCoordinator({
      store,
      remote,
      now: () => 1_000,
    });
    const { envelope } = await encryptedFixture();

    const local = await coordinator.saveEncryptedCheckpoint(envelope);
    expect(local.state).toBe("pending");
    await vi.waitFor(() => expect(remote.uploads).toHaveLength(1));
    await expect(store.get(local.idempotencyKey)).resolves.toMatchObject({
      state: "uploading",
    });

    uploaded.resolve(remote.accept(remote.uploads[0]!));
    await vi.waitFor(async () => {
      await expect(store.get(local.idempotencyKey)).resolves.toMatchObject({
        state: "synced",
      });
    });
  });
});

class FakeRemoteStorage implements CheckpointRemoteStorage {
  readonly uploads: CheckpointUploadRequest[] = [];
  readonly receipts = new Map<string, CheckpointRemoteReceipt>();
  readonly downloads = new Map<string, CheckpointDownload>();
  onUpload?: (
    request: CheckpointUploadRequest,
  ) => Promise<CheckpointRemoteReceipt>;
  downloadOverride: ((root: string) => CheckpointDownload) | undefined;

  async upload(
    request: CheckpointUploadRequest,
  ): Promise<CheckpointRemoteReceipt> {
    this.uploads.push({ ...request });
    return this.onUpload ? this.onUpload(request) : this.accept(request);
  }

  accept(request: CheckpointUploadRequest): CheckpointRemoteReceipt {
    const existing = this.receipts.get(request.idempotencyKey);
    if (existing) return existing;
    const receipt = {
      root: `root-${request.contentHash.slice(7, 23)}`,
      contentHash: request.contentHash,
      byteLength: request.byteLength,
    };
    this.receipts.set(request.idempotencyKey, receipt);
    this.downloads.set(receipt.root, {
      ...receipt,
      encryptedEnvelope: request.encryptedEnvelope,
    });
    return receipt;
  }

  async download(root: string): Promise<CheckpointDownload> {
    if (this.downloadOverride) return this.downloadOverride(root);
    const download = this.downloads.get(root);
    if (!download) throw new CheckpointRemoteError("not_found", false);
    return { ...download };
  }
}

function coordinatorFor(
  store: MemoryCheckpointBackupStore,
  remote: FakeRemoteStorage,
  now: () => number = () => 1_000,
): CheckpointBackupCoordinator {
  return new CheckpointBackupCoordinator({
    store,
    remote,
    now,
    autoUpload: false,
    retryBaseMs: 1_000,
    uploadLeaseMs: 5_000,
  });
}

async function encryptedFixture(): Promise<{
  key: CryptoKey;
  envelope: EncryptedCheckpointEnvelope;
}> {
  const key = await generateCheckpointKey();
  return { key, envelope: await encryptCheckpoint(checkpoint, key, context) };
}

function referenceFor(
  local: Readonly<{
    contentHash: string;
    byteLength: number;
  }>,
  root: string,
): AdultCheckpointReference {
  return {
    root,
    contentHash: local.contentHash,
    byteLength: local.byteLength,
    keyId: context.keyId,
    checkpointSchemaVersion: context.checkpointSchemaVersion,
    cityId: context.cityId,
    campaignId: context.campaignId,
    campaignVersion: context.campaignVersion,
  };
}

type TestCheckpoint = typeof checkpoint;

function isTestCheckpoint(value: unknown): value is TestCheckpoint {
  return (
    typeof value === "object" &&
    value !== null &&
    "schemaVersion" in value &&
    value.schemaVersion === 1 &&
    "cityId" in value &&
    value.cityId === checkpoint.cityId &&
    "turn" in value &&
    value.turn === checkpoint.turn
  );
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfil) => {
    resolve = fulfil;
  });
  return { promise, resolve };
}
