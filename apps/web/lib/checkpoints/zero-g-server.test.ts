import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  CheckpointRemoteError,
  MemoryCheckpointBackupStore,
  type AdultCheckpointReference,
  type CheckpointUploadRequest,
} from "./backup";
import {
  encryptCheckpoint,
  generateCheckpointKey,
  type CheckpointEncryptionContext,
  type EncryptedCheckpointEnvelope,
} from "./encryption";
import {
  createZeroGCheckpointBackupCoordinator,
  createZeroGCheckpointRemoteStorage,
  type ZeroGCheckpointStorageAdapter,
} from "./zero-g-server";

const ROOT = `0x${"11".repeat(32)}`;
const OTHER_ROOT = `0x${"22".repeat(32)}`;
const TRANSACTION_HASH = `0x${"33".repeat(32)}`;
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

describe("server-only 0G checkpoint bridge", () => {
  it("uploads only encrypted bytes and binds the 0G root, hash, and length", async () => {
    const { envelope } = await encryptedFixture();
    const request = await uploadRequest(envelope);
    const upload = vi.fn(
      async (input: Parameters<ZeroGCheckpointStorageAdapter["upload"]>[0]) => {
        expect(input.kind).toBe("encrypted-checkpoint-envelope");
        expect(new TextDecoder().decode(input.bytes)).toBe(
          request.encryptedEnvelope,
        );
        return {
          rootHash: ROOT,
          contentHash: request.contentHash,
          byteLength: request.byteLength,
          transactionHash: TRANSACTION_HASH,
          transactionSequence: 7,
        };
      },
    );
    const remote = createZeroGCheckpointRemoteStorage(
      storageAdapter({ upload }),
    );

    await expect(remote.upload(request)).resolves.toEqual({
      root: ROOT,
      contentHash: request.contentHash,
      byteLength: request.byteLength,
      transactionHash: TRANSACTION_HASH,
      transactionSequence: 7,
    });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(Object.keys(upload.mock.calls[0]?.[0] ?? {}).sort()).toEqual([
      "bytes",
      "kind",
    ]);
  });

  it.each([
    {
      rootHash: ROOT,
      contentHash: `sha256:${"0".repeat(64)}`,
      byteLength: "request",
    },
    { rootHash: ROOT, contentHash: "request", byteLength: 1 },
  ])(
    "rejects an upload receipt that breaks content binding",
    async (receipt) => {
      const { envelope } = await encryptedFixture();
      const request = await uploadRequest(envelope);
      const remote = createZeroGCheckpointRemoteStorage(
        storageAdapter({
          upload: async () => ({
            rootHash: receipt.rootHash,
            contentHash:
              receipt.contentHash === "request"
                ? request.contentHash
                : receipt.contentHash,
            byteLength:
              receipt.byteLength === "request"
                ? request.byteLength
                : Number(receipt.byteLength),
            transactionHash: TRANSACTION_HASH,
            transactionSequence: 7,
          }),
        }),
      );

      await expect(remote.upload(request)).rejects.toMatchObject({
        code: "integrity_mismatch",
        retryable: false,
      });
    },
  );

  it("passes an expected hash into proof-verified retrieval and rechecks downloaded bytes", async () => {
    const { envelope } = await encryptedFixture();
    const request = await uploadRequest(envelope);
    const retrieve = vi.fn(
      async (
        input: Parameters<ZeroGCheckpointStorageAdapter["retrieve"]>[0],
      ) => {
        expect(input).toEqual({
          rootHash: ROOT,
          expectedContentHash: request.contentHash,
        });
        return {
          bytes: new TextEncoder().encode(request.encryptedEnvelope),
          rootHash: ROOT,
          contentHash: request.contentHash,
          proofVerified: true,
        };
      },
    );
    const remote = createZeroGCheckpointRemoteStorage(
      storageAdapter({ retrieve }),
    );

    await expect(
      remote.download({
        root: ROOT,
        expectedContentHash: request.contentHash,
        expectedByteLength: request.byteLength,
      }),
    ).resolves.toEqual({
      root: ROOT,
      contentHash: request.contentHash,
      byteLength: request.byteLength,
      encryptedEnvelope: request.encryptedEnvelope,
    });
  });

  it.each([
    ["unverified proof", { proofVerified: false }],
    ["wrong root", { rootHash: OTHER_ROOT }],
    ["wrong declared hash", { contentHash: `sha256:${"0".repeat(64)}` }],
    ["tampered bytes", { tamperBytes: true }],
  ] as const)("rejects a download with %s", async (_label, override) => {
    const { envelope } = await encryptedFixture();
    const request = await uploadRequest(envelope);
    const original = new TextEncoder().encode(request.encryptedEnvelope);
    const tampered = Uint8Array.from(original);
    tampered[tampered.length - 1] =
      tampered[tampered.length - 1] === 120 ? 121 : 120;
    const remote = createZeroGCheckpointRemoteStorage(
      storageAdapter({
        retrieve: async () => ({
          bytes: "tamperBytes" in override ? tampered : original,
          rootHash: "rootHash" in override ? override.rootHash : ROOT,
          contentHash:
            "contentHash" in override
              ? override.contentHash
              : request.contentHash,
          proofVerified:
            "proofVerified" in override ? override.proofVerified : true,
        }),
      }),
    );

    await expect(
      remote.download({
        root: ROOT,
        expectedContentHash: request.contentHash,
        expectedByteLength: request.byteLength,
      }),
    ).rejects.toMatchObject({
      code: "integrity_mismatch",
      retryable: false,
    });
  });

  it("maps only typed retryable 0G failures into queue retries", async () => {
    let now = 1_000;
    let calls = 0;
    const store = new MemoryCheckpointBackupStore();
    const storage = storageAdapter({
      upload: async (input) => {
        calls += 1;
        if (calls === 1) {
          throw {
            name: "ZeroGStorageError",
            code: "UPLOAD_FAILURE",
            retryable: true,
          };
        }
        return {
          rootHash: ROOT,
          contentHash: hash(input.bytes),
          byteLength: input.bytes.byteLength,
          transactionHash: TRANSACTION_HASH,
          transactionSequence: 7,
        };
      },
    });
    const coordinator = createZeroGCheckpointBackupCoordinator({
      store,
      storage,
      autoUpload: false,
      now: () => now,
      retryBaseMs: 1_000,
    });
    const { envelope } = await encryptedFixture();
    await coordinator.saveEncryptedCheckpoint(envelope);

    await expect(coordinator.flush()).resolves.toMatchObject([
      {
        state: "retry-wait",
        attempts: 1,
        failureCode: "upload_failure",
        nextAttemptAt: 2_000,
      },
    ]);
    now = 2_000;
    await expect(coordinator.flush()).resolves.toMatchObject([
      { state: "synced", attempts: 2, remoteRoot: ROOT },
    ]);
  });

  it("fails closed on untyped storage errors instead of retrying them", async () => {
    const { envelope } = await encryptedFixture();
    const request = await uploadRequest(envelope);
    const upload = vi.fn(async () => {
      throw new Error("unclassified network-like failure");
    });
    const remote = createZeroGCheckpointRemoteStorage(
      storageAdapter({ upload }),
    );

    await expect(remote.upload(request)).rejects.toEqual(
      new CheckpointRemoteError("storage_failure", false),
    );
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("rejects non-envelope plaintext before it reaches sponsored storage", async () => {
    const bytes = new TextEncoder().encode('{"schemaVersion":1,"budget":900}');
    const contentHash = hash(bytes);
    const upload = vi.fn();
    const remote = createZeroGCheckpointRemoteStorage(
      storageAdapter({ upload }),
    );

    await expect(
      remote.upload({
        idempotencyKey: `checkpoint-v1-${contentHash.slice(7)}`,
        encryptedEnvelope: new TextDecoder().decode(bytes),
        contentHash,
        byteLength: bytes.byteLength,
      }),
    ).rejects.toEqual(new CheckpointRemoteError("invalid_request", false));
    expect(upload).not.toHaveBeenCalled();
  });

  it("uploads and restores through the coordinator without any child wallet", async () => {
    const { key, envelope } = await encryptedFixture();
    const storage = new ContentAddressedStorage();
    const sourceStore = new MemoryCheckpointBackupStore();
    const source = createZeroGCheckpointBackupCoordinator({
      store: sourceStore,
      storage,
      autoUpload: false,
      now: () => 1_000,
    });
    const local = await source.saveEncryptedCheckpoint(envelope);
    const [synced] = await source.flush();
    const reference = referenceFor(local, synced?.remoteRoot ?? "");

    const freshStore = new MemoryCheckpointBackupStore();
    const fresh = createZeroGCheckpointBackupCoordinator({
      store: freshStore,
      storage,
      autoUpload: false,
      now: () => 2_000,
    });
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
    expect(JSON.stringify(storage.uploadInputs)).not.toMatch(
      /wallet|private.?key/iu,
    );
  });

  it("does not accept a proof-marked restore when downloaded bytes were changed", async () => {
    const { key, envelope } = await encryptedFixture();
    const request = await uploadRequest(envelope);
    const tamperedBytes = new TextEncoder().encode(
      `${request.encryptedEnvelope.slice(0, -1)}x`,
    );
    const storage = storageAdapter({
      retrieve: async () => ({
        bytes: tamperedBytes,
        rootHash: ROOT,
        contentHash: request.contentHash,
        proofVerified: true,
      }),
    });
    const coordinator = createZeroGCheckpointBackupCoordinator({
      store: new MemoryCheckpointBackupStore(),
      storage,
      autoUpload: false,
    });

    await expect(
      coordinator.restoreFromAdultReference(
        referenceFor(request, ROOT),
        key,
        isTestCheckpoint,
      ),
    ).rejects.toBeInstanceOf(CheckpointRemoteError);
  });
});

class ContentAddressedStorage implements ZeroGCheckpointStorageAdapter {
  readonly uploadInputs: unknown[] = [];
  private readonly records = new Map<string, Uint8Array>();

  async upload(input: {
    kind: "encrypted-checkpoint-envelope";
    bytes: Uint8Array;
  }) {
    this.uploadInputs.push({
      kind: input.kind,
      byteLength: input.bytes.byteLength,
    });
    const contentHash = hash(input.bytes);
    const rootHash = `0x${contentHash.slice(7)}`;
    this.records.set(rootHash, Uint8Array.from(input.bytes));
    return {
      rootHash,
      contentHash,
      byteLength: input.bytes.byteLength,
      transactionHash: TRANSACTION_HASH,
      transactionSequence: 7,
    };
  }

  async retrieve(input: { rootHash: string; expectedContentHash: string }) {
    const bytes = this.records.get(input.rootHash);
    if (!bytes) throw new Error("missing fixture");
    return {
      bytes: Uint8Array.from(bytes),
      rootHash: input.rootHash,
      contentHash: hash(bytes),
      proofVerified: hash(bytes) === input.expectedContentHash,
    };
  }
}

function storageAdapter(
  overrides: Partial<ZeroGCheckpointStorageAdapter> = {},
): ZeroGCheckpointStorageAdapter {
  return {
    upload:
      overrides.upload ??
      (async (input) => ({
        rootHash: ROOT,
        contentHash: hash(input.bytes),
        byteLength: input.bytes.byteLength,
        transactionHash: TRANSACTION_HASH,
        transactionSequence: 7,
      })),
    retrieve:
      overrides.retrieve ??
      (async (input) => ({
        bytes: new Uint8Array(),
        rootHash: input.rootHash,
        contentHash: input.expectedContentHash,
        proofVerified: true,
      })),
  };
}

async function uploadRequest(
  envelope: EncryptedCheckpointEnvelope,
): Promise<CheckpointUploadRequest> {
  const store = new MemoryCheckpointBackupStore();
  const coordinator = createZeroGCheckpointBackupCoordinator({
    store,
    storage: storageAdapter(),
    autoUpload: false,
    now: () => 1_000,
  });
  const record = await coordinator.saveEncryptedCheckpoint(envelope);
  return {
    idempotencyKey: record.idempotencyKey,
    encryptedEnvelope: record.encryptedEnvelope,
    contentHash: record.contentHash,
    byteLength: record.byteLength,
  };
}

async function encryptedFixture(): Promise<{
  key: CryptoKey;
  envelope: EncryptedCheckpointEnvelope;
}> {
  const key = await generateCheckpointKey();
  return { key, envelope: await encryptCheckpoint(checkpoint, key, context) };
}

function referenceFor(
  local: Readonly<{ contentHash: string; byteLength: number }>,
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

function hash(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
