import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it } from "vitest";

import { createOfflinePersistence } from "./persistence";
import type { CitySave, OfflineStoreName } from "./types";

const city: CitySave = {
  cityId: "rivergate",
  committedAt: 100,
  state: {
    schemaVersion: 1,
    cityId: "rivergate",
    campaignId: "rivergate-campaign",
    campaignVersion: 1,
    turn: 2,
    actionLog: [],
  },
};

const databaseNames: string[] = [];

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map(deleteDatabase));
});

describe("IndexedDB offline persistence", () => {
  it("restores a saved city after closing and reopening the browser database", async () => {
    const indexedDB = new IDBFactory();
    const databaseName = registerDatabase("terra-world-persistence");

    const firstSession = await createOfflinePersistence({
      indexedDB,
      databaseName,
    });
    expect(firstSession.kind).toBe("indexeddb");
    await firstSession.saveCity(city);
    firstSession.close();

    const reopenedSession = await createOfflinePersistence({
      indexedDB,
      databaseName,
    });
    await expect(reopenedSession.getCity(city.cityId)).resolves.toEqual(city);
    reopenedSession.close();
  });

  it("removes a corrupt browser record and reports only its store and key", async () => {
    const indexedDB = new IDBFactory();
    const databaseName = registerDatabase("terra-world-corruption");
    const notices: unknown[] = [];
    const persistence = await createOfflinePersistence({
      indexedDB,
      databaseName,
      onCorruptRecord: (notice) => notices.push(notice),
    });
    persistence.close();

    const database = await openDatabase(indexedDB, databaseName);
    await writeRecord(database, "cities", {
      cityId: "damaged-city",
      childName: "never persist this",
    });
    database.close();

    const reopenedSession = await createOfflinePersistence({
      indexedDB,
      databaseName,
      onCorruptRecord: (notice) => notices.push(notice),
    });
    await expect(reopenedSession.getCity("damaged-city")).resolves.toBeNull();
    expect(notices).toEqual([{ store: "cities", key: "damaged-city" }]);
    reopenedSession.close();

    const recoveredDatabase = await openDatabase(indexedDB, databaseName);
    await expect(
      readRecord(recoveredDatabase, "cities", "damaged-city"),
    ).resolves.toBeUndefined();
    recoveredDatabase.close();
  });

  it("upgrades a version-one city save without losing it and adds version-two indexes", async () => {
    const indexedDB = new IDBFactory();
    const databaseName = registerDatabase("terra-world-migration");
    const versionOne = await createVersionOneDatabase(indexedDB, databaseName);
    await writeRecord(versionOne, "cities", city);
    versionOne.close();

    const persistence = await createOfflinePersistence({
      indexedDB,
      databaseName,
    });
    expect(persistence.kind).toBe("indexeddb");
    await expect(persistence.getCity(city.cityId)).resolves.toEqual(city);
    persistence.close();

    const migrated = await openDatabase(indexedDB, databaseName);
    expect(migrated.version).toBe(2);
    expect(
      migrated.transaction("cities").objectStore("cities").indexNames,
    ).toContain("committedAt");
    const syncIndexes = migrated
      .transaction("sync-queue")
      .objectStore("sync-queue").indexNames;
    expect(syncIndexes).toContain("status");
    expect(syncIndexes).toContain("nextAttemptAt");
    migrated.close();
  });
});

function registerDatabase(label: string): string {
  const name = `${label}-${databaseNames.length + 1}`;
  databaseNames.push(name);
  return name;
}

function createVersionOneDatabase(
  indexedDB: IDBFactory,
  name: string,
): Promise<IDBDatabase> {
  const request = indexedDB.open(name, 1);
  request.onupgradeneeded = () => {
    const database = request.result;
    const keyPaths: Readonly<Record<OfflineStoreName, string>> = {
      profiles: "profileId",
      cities: "cityId",
      "campaign-cache": "cacheKey",
      "action-logs": "cityId",
      "sync-queue": "id",
      settings: "profileId",
    };
    for (const [store, keyPath] of Object.entries(keyPaths)) {
      database.createObjectStore(store, { keyPath });
    }
  };
  return requestResult(request);
}

function openDatabase(
  indexedDB: IDBFactory,
  name: string,
): Promise<IDBDatabase> {
  return requestResult(indexedDB.open(name));
}

async function writeRecord(
  database: IDBDatabase,
  storeName: OfflineStoreName,
  value: unknown,
): Promise<void> {
  const transaction = database.transaction(storeName, "readwrite");
  await requestResult(transaction.objectStore(storeName).put(value));
  await transactionComplete(transaction);
}

async function readRecord(
  database: IDBDatabase,
  storeName: OfflineStoreName,
  key: string,
): Promise<unknown> {
  const transaction = database.transaction(storeName, "readonly");
  const value = await requestResult(
    transaction.objectStore(storeName).get(key),
  );
  await transactionComplete(transaction);
  return value;
}

function deleteDatabase(name: string): Promise<void> {
  const request = new IDBFactory().deleteDatabase(name);
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
