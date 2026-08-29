import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it } from "vitest";

import type { CheckpointBackupRecord } from "./backup";
import {
  CHECKPOINT_BACKUP_DATABASE_VERSION,
  CHECKPOINT_BACKUP_STORE_NAME,
  IndexedDbCheckpointBackupStore,
  createCheckpointBackupStore,
} from "./indexeddb";

type RegisteredDatabase = Readonly<{
  factory: IDBFactory;
  name: string;
}>;

const databases: RegisteredDatabase[] = [];

afterEach(async () => {
  await Promise.all(
    databases
      .splice(0)
      .map(({ factory, name }) => deleteDatabase(factory, name)),
  );
});

describe("IndexedDB checkpoint backup store", () => {
  it("persists structured-clone-safe encrypted records across close and reopen", async () => {
    const { factory, name } = registerDatabase("checkpoint-persistence");
    const first = await createCheckpointBackupStore({
      indexedDB: factory,
      databaseName: name,
    });
    expect(first.kind).toBe("indexeddb");
    const record = fixture("a", { createdAt: 11, nextAttemptAt: 11 });

    await expect(first.saveIfAbsent(record)).resolves.toEqual(record);
    first.close();

    const reopened = await IndexedDbCheckpointBackupStore.open(factory, name);
    await expect(reopened.get(record.idempotencyKey)).resolves.toEqual(record);
    const raw = await readRaw(factory, name, record.idempotencyKey);
    expect(Object.keys(raw as object).sort()).toEqual(
      [
        "attempts",
        "byteLength",
        "contentHash",
        "createdAt",
        "encryptedEnvelope",
        "failureCode",
        "idempotencyKey",
        "nextAttemptAt",
        "remoteRoot",
        "schemaVersion",
        "state",
        "updatedAt",
      ].sort(),
    );
    expect(JSON.stringify(raw)).not.toMatch(
      /wallet|private.?key|child.?name|plaintext/iu,
    );
    await reopened.clear();
    await expect(reopened.get(record.idempotencyKey)).resolves.toBeNull();
    reopened.close();
  });

  it("atomically preserves the first record across concurrent stores", async () => {
    const { factory, name } = registerDatabase("checkpoint-save-race");
    const left = await IndexedDbCheckpointBackupStore.open(factory, name);
    const right = await IndexedDbCheckpointBackupStore.open(factory, name);
    const original = fixture("b", { createdAt: 20, nextAttemptAt: 20 });
    const competingEnvelope = JSON.stringify({
      ...(JSON.parse(original.encryptedEnvelope) as object),
      ciphertext: "BAAAAAAAAAAAAAAAAAAAAA",
    });
    const competing = {
      ...original,
      encryptedEnvelope: competingEnvelope,
      byteLength: new TextEncoder().encode(competingEnvelope).byteLength,
    };

    const [firstResult, secondResult] = await Promise.all([
      left.saveIfAbsent(original),
      right.saveIfAbsent(competing),
    ]);

    expect(firstResult).toEqual(original);
    expect(secondResult).toEqual(original);
    await expect(right.get(original.idempotencyKey)).resolves.toEqual(original);
    left.close();
    right.close();
  });

  it("atomically grants only one upload lease across tabs", async () => {
    const { factory, name } = registerDatabase("checkpoint-claim-race");
    const left = await IndexedDbCheckpointBackupStore.open(factory, name);
    const right = await IndexedDbCheckpointBackupStore.open(factory, name);
    const record = fixture("c", { createdAt: 100, nextAttemptAt: 100 });
    await left.save(record);

    const claims = await Promise.all([
      left.claimEligible(record.idempotencyKey, 100, 200),
      right.claimEligible(record.idempotencyKey, 100, 200),
    ]);

    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(claims.find(Boolean)).toMatchObject({
      state: "uploading",
      attempts: 1,
      nextAttemptAt: 200,
    });
    left.close();
    right.close();
  });

  it("reclaims expired leases and prevents stale settlement", async () => {
    const { factory, name } = registerDatabase("checkpoint-stale-worker");
    const staleWorker = await IndexedDbCheckpointBackupStore.open(
      factory,
      name,
    );
    const recoveryWorker = await IndexedDbCheckpointBackupStore.open(
      factory,
      name,
    );
    const record = fixture("d", { createdAt: 100, nextAttemptAt: 100 });
    await staleWorker.save(record);
    const firstClaim = await staleWorker.claimEligible(
      record.idempotencyKey,
      100,
      200,
    );
    expect(firstClaim).not.toBeNull();

    await expect(
      recoveryWorker.claimEligible(record.idempotencyKey, 199, 300),
    ).resolves.toBeNull();
    const secondClaim = await recoveryWorker.claimEligible(
      record.idempotencyKey,
      200,
      300,
    );
    expect(secondClaim).toMatchObject({ attempts: 2, nextAttemptAt: 300 });

    const staleSettlement = synced(firstClaim!, "root-stale", 210);
    await expect(staleWorker.settleClaim(staleSettlement, 1)).resolves.toEqual(
      secondClaim,
    );

    const finalSettlement = synced(secondClaim!, "root-current", 220);
    await expect(
      recoveryWorker.settleClaim(finalSettlement, 2),
    ).resolves.toEqual(finalSettlement);
    await expect(staleWorker.get(record.idempotencyKey)).resolves.toEqual(
      finalSettlement,
    );
    staleWorker.close();
    recoveryWorker.close();
  });

  it("returns eligible records deterministically and isolates corruption", async () => {
    const { factory, name } = registerDatabase("checkpoint-corruption");
    const notices: unknown[] = [];
    const store = await IndexedDbCheckpointBackupStore.open(
      factory,
      name,
      (notice) => notices.push(notice),
    );
    const late = fixture("f", { createdAt: 100, nextAttemptAt: 20 });
    const tieSecond = fixture("e", { createdAt: 20, nextAttemptAt: 10 });
    const tieFirst = fixture("b", { createdAt: 20, nextAttemptAt: 10 });
    await Promise.all([
      store.save(late),
      store.save(tieSecond),
      store.save(tieFirst),
    ]);
    store.close();

    const corruptKey = keyFor("9");
    await writeRaw(factory, name, {
      ...fixture("9"),
      walletAddress: "0xnever-store-this",
    });
    const reopened = await IndexedDbCheckpointBackupStore.open(
      factory,
      name,
      (notice) => notices.push(notice),
    );

    await expect(reopened.listEligible(20)).resolves.toEqual([
      tieFirst,
      tieSecond,
      late,
    ]);
    expect(notices).toEqual([
      { store: CHECKPOINT_BACKUP_STORE_NAME, key: corruptKey },
    ]);
    await expect(reopened.get(corruptKey)).resolves.toBeNull();
    await expect(reopened.get(late.idempotencyKey)).resolves.toEqual(late);
    reopened.close();
  });

  it("rejects records with extra personal or secret-bearing fields", async () => {
    const { factory, name } = registerDatabase("checkpoint-private-fields");
    const store = await IndexedDbCheckpointBackupStore.open(factory, name);
    const unsafe = {
      ...fixture("7"),
      childName: "Ada",
      walletPrivateKey: "never",
    };

    await expect(store.save(unsafe as CheckpointBackupRecord)).rejects.toThrow(
      "unsupported data",
    );
    const plaintext = JSON.stringify({
      schemaVersion: 1,
      cityId: "rivergate-test",
      budget: 900,
    });
    await expect(
      store.save({
        ...fixture("5"),
        encryptedEnvelope: plaintext,
        byteLength: new TextEncoder().encode(plaintext).byteLength,
      }),
    ).rejects.toThrow("encrypted envelope");
    await expect(store.listEligible(100)).resolves.toEqual([]);
    store.close();
  });

  it("upgrades a version-one store without losing queued work", async () => {
    const { factory, name } = registerDatabase("checkpoint-upgrade");
    const record = fixture("8", { createdAt: 7, nextAttemptAt: 7 });
    const versionOne = await createVersionOneDatabase(factory, name);
    await putRaw(versionOne, record);
    versionOne.close();

    const upgraded = await IndexedDbCheckpointBackupStore.open(factory, name);
    await expect(upgraded.get(record.idempotencyKey)).resolves.toEqual(record);
    upgraded.close();

    const database = await openCurrentDatabase(factory, name);
    expect(database.version).toBe(CHECKPOINT_BACKUP_DATABASE_VERSION);
    const indexNames = database
      .transaction(CHECKPOINT_BACKUP_STORE_NAME)
      .objectStore(CHECKPOINT_BACKUP_STORE_NAME).indexNames;
    expect(indexNames).toContain("state");
    expect(indexNames).toContain("nextAttemptAt");
    database.close();
  });

  it("uses an SSR-safe memory fallback and supports explicit clearing", async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: undefined,
    });
    try {
      const store = await createCheckpointBackupStore();
      const record = fixture("6");
      expect(store.kind).toBe("memory");
      await store.save(record);
      await expect(store.get(record.idempotencyKey)).resolves.toEqual(record);
      await store.clear();
      await expect(store.get(record.idempotencyKey)).resolves.toBeNull();
      store.close();
    } finally {
      if (original) Object.defineProperty(globalThis, "indexedDB", original);
      else Reflect.deleteProperty(globalThis, "indexedDB");
    }
  });
});

function fixture(
  hashCharacter: string,
  overrides: Partial<CheckpointBackupRecord> = {},
): CheckpointBackupRecord {
  const encryptedEnvelope = JSON.stringify({
    schemaVersion: 1,
    algorithm: "AES-GCM",
    keyId: "adult-session-key-1",
    iv: "AAAAAAAAAAAAAAAA",
    aad: {
      schemaVersion: 1,
      checkpointSchemaVersion: 1,
      cityId: "rivergate-test",
      campaignId: "rivergate",
      campaignVersion: 1,
      createdAt: 1,
    },
    ciphertext: "AAAAAAAAAAAAAAAAAAAAAA",
  });
  const contentHash = `sha256:${hashCharacter.repeat(64)}`;
  const createdAt = overrides.createdAt ?? 1;
  return {
    schemaVersion: 1,
    idempotencyKey: `checkpoint-v1-${hashCharacter.repeat(64)}`,
    encryptedEnvelope,
    contentHash,
    byteLength: new TextEncoder().encode(encryptedEnvelope).byteLength,
    state: "pending",
    attempts: 0,
    createdAt,
    updatedAt: overrides.updatedAt ?? createdAt,
    nextAttemptAt: overrides.nextAttemptAt ?? createdAt,
    remoteRoot: null,
    failureCode: null,
    ...overrides,
  };
}

function synced(
  claim: CheckpointBackupRecord,
  remoteRoot: string,
  updatedAt: number,
): CheckpointBackupRecord {
  return {
    ...claim,
    state: "synced",
    updatedAt,
    nextAttemptAt: updatedAt,
    remoteRoot,
    failureCode: null,
  };
}

function keyFor(character: string): string {
  return `checkpoint-v1-${character.repeat(64)}`;
}

function registerDatabase(label: string): RegisteredDatabase {
  const registration = {
    factory: new IDBFactory(),
    name: `${label}-${databases.length + 1}`,
  };
  databases.push(registration);
  return registration;
}

function createVersionOneDatabase(
  factory: IDBFactory,
  name: string,
): Promise<IDBDatabase> {
  const request = factory.open(name, 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore(CHECKPOINT_BACKUP_STORE_NAME, {
      keyPath: "idempotencyKey",
    });
  };
  return requestResult(request);
}

async function readRaw(
  factory: IDBFactory,
  name: string,
  key: string,
): Promise<unknown> {
  const database = await openCurrentDatabase(factory, name);
  const transaction = database.transaction(
    CHECKPOINT_BACKUP_STORE_NAME,
    "readonly",
  );
  const completed = transactionComplete(transaction);
  const result = await requestResult(
    transaction.objectStore(CHECKPOINT_BACKUP_STORE_NAME).get(key),
  );
  await completed;
  database.close();
  return result;
}

async function writeRaw(
  factory: IDBFactory,
  name: string,
  value: unknown,
): Promise<void> {
  const database = await openCurrentDatabase(factory, name);
  await putRaw(database, value);
  database.close();
}

async function putRaw(database: IDBDatabase, value: unknown): Promise<void> {
  const transaction = database.transaction(
    CHECKPOINT_BACKUP_STORE_NAME,
    "readwrite",
  );
  const completed = transactionComplete(transaction);
  await requestResult(
    transaction.objectStore(CHECKPOINT_BACKUP_STORE_NAME).put(value),
  );
  await completed;
}

function openCurrentDatabase(
  factory: IDBFactory,
  name: string,
): Promise<IDBDatabase> {
  return requestResult(factory.open(name));
}

function deleteDatabase(factory: IDBFactory, name: string): Promise<void> {
  const request = factory.deleteDatabase(name);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error(`Database remained open: ${name}`));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
