import { describe, expect, it } from "vitest";

import {
  createOfflinePersistence,
  MemoryOfflinePersistence,
  migrationPlan,
} from "./persistence";
import type { CampaignSessionSave, CitySave, SyncQueueEntry } from "./types";

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

const sync: SyncQueueEntry = {
  id: "checkpoint-1",
  kind: "checkpoint",
  cityId: "rivergate",
  idempotencyKey: "checkpoint-key-1",
  encryptedPayload: "ciphertext",
  status: "pending",
  attempts: 0,
  nextAttemptAt: 100,
  createdAt: 10,
};

const session: CampaignSessionSave = {
  cityId: "rivergate",
  savedAt: 100,
  schemaVersion: 1,
  campaignId: "rivergate-campaign",
  campaignVersion: 1,
  payload: { city: city.state },
};

describe("offline persistence", () => {
  it("uses a pure in-memory implementation when IndexedDB is absent", async () => {
    const persistence = await createOfflinePersistence({
      indexedDB: undefined,
    });
    expect(persistence.kind).toBe("memory");

    await persistence.saveCity(city);
    const restored = await persistence.getCity("rivergate");
    expect(restored).toEqual(city);

    (restored?.state as { turn: number }).turn = 99;
    expect((await persistence.getCity("rivergate"))?.state.turn).toBe(2);
  });

  it("persists each required record category and orders eligible sync work", async () => {
    const persistence = new MemoryOfflinePersistence();
    await persistence.saveProfile({
      profileId: "guest-1",
      avatarId: "otter",
      createdAt: 1,
      updatedAt: 2,
    });
    await persistence.saveCity(city);
    await persistence.saveCampaignCache({
      campaignId: "rivergate-campaign",
      version: 1,
      verifiedAt: 5,
      pack: { id: "rivergate-campaign" },
    });
    await persistence.saveCampaignSession(session);
    await persistence.saveActionLog({
      cityId: "rivergate",
      savedAt: 100,
      actions: [],
    });
    await persistence.saveSettings({
      profileId: "guest-1",
      reducedMotion: false,
      highContrast: true,
      textScale: 1,
      muted: false,
      locale: "en",
      updatedAt: 3,
    });
    await persistence.enqueueSync({
      ...sync,
      id: "checkpoint-2",
      nextAttemptAt: 200,
    });
    await persistence.enqueueSync(sync);

    await expect(persistence.getProfile("guest-1")).resolves.toMatchObject({
      avatarId: "otter",
    });
    await expect(
      persistence.getCampaignCache("rivergate-campaign", 1),
    ).resolves.toEqual({
      campaignId: "rivergate-campaign",
      version: 1,
      verifiedAt: 5,
      pack: { id: "rivergate-campaign" },
    });
    await expect(persistence.getActionLog("rivergate")).resolves.toMatchObject({
      savedAt: 100,
    });
    await expect(persistence.getCampaignSession("rivergate")).resolves.toEqual(
      session,
    );
    await expect(persistence.getSettings("guest-1")).resolves.toMatchObject({
      highContrast: true,
    });
    await expect(persistence.getPendingSync(150)).resolves.toEqual([sync]);
  });

  it("rejects corrupt records safely and emits metadata without record contents", async () => {
    const notices: unknown[] = [];
    const persistence = new MemoryOfflinePersistence((notice) =>
      notices.push(notice),
    );
    const records = persistence as unknown as {
      records: Map<string, Map<string, unknown>>;
    };
    records.records
      .get("cities")
      ?.set("rivergate", { cityId: "rivergate", name: "private child name" });

    await expect(persistence.getCity("rivergate")).resolves.toBeNull();
    expect(notices).toEqual([{ store: "cities", key: "rivergate" }]);
    expect(records.records.get("cities")?.has("rivergate")).toBe(false);
  });

  it("does not allow personal-data-shaped fields into city records", async () => {
    const persistence = new MemoryOfflinePersistence();
    await expect(
      persistence.saveCity({
        ...city,
        state: {
          ...city.state,
          childName: "not-allowed",
        } as unknown as CitySave["state"],
      }),
    ).rejects.toThrow("personal data");
  });

  it("has explicit, forward-only IndexedDB migration steps", () => {
    expect(migrationPlan(0)).toEqual([
      {
        from: 0,
        to: 1,
        creates: [
          "profiles",
          "cities",
          "campaign-cache",
          "action-logs",
          "sync-queue",
          "settings",
        ],
        indexes: [],
      },
      {
        from: 1,
        to: 2,
        creates: [],
        indexes: [
          "cities:committedAt",
          "sync-queue:status",
          "sync-queue:nextAttemptAt",
        ],
      },
      {
        from: 2,
        to: 3,
        creates: ["campaign-sessions"],
        indexes: [],
      },
    ]);
    expect(migrationPlan(1)).toHaveLength(2);
    expect(migrationPlan(2)).toHaveLength(1);
    expect(migrationPlan(3)).toEqual([]);
    expect(() => migrationPlan(4)).toThrow("Unsupported");
  });
});
