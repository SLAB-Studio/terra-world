import { describe, expect, it } from "vitest";

import { createGameSessionSave, createDeveloperGame } from "../game/controller";
import {
  MemoryCheckpointBackupStore,
  type CheckpointDownloadRequest,
  type CheckpointRemoteStorage,
  type CheckpointUploadRequest,
} from "./backup";
import {
  backUpCampaignSession,
  parseAdultBackupKit,
  restoreCampaignSession,
  serializeAdultBackupKit,
} from "./browser-backup";

describe("adult browser backup kit", () => {
  it("encrypts, uploads, and restores a replay-verifiable campaign session", async () => {
    const remote = memoryRemote();
    const session = createGameSessionSave(createDeveloperGame(), 1_000);
    const kit = await backUpCampaignSession({
      session,
      store: new MemoryCheckpointBackupStore(),
      remote,
      now: 1_000,
    });

    expect(kit.recoveryCode).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(kit.reference).toMatchObject({
      root: expect.stringMatching(/^demo:/u),
      cityId: session.cityId,
      campaignId: session.campaignId,
      campaignVersion: session.campaignVersion,
    });
    expect(remote.plaintext).not.toContain('"payload"');
    expect(remote.plaintext).not.toContain('"budget"');
    expect(remote.plaintext).not.toContain('"tiles"');

    const recoveryPack = serializeAdultBackupKit(kit);
    expect(recoveryPack).toMatch(/^terra1\.[A-Za-z0-9_-]+$/u);
    expect(parseAdultBackupKit(recoveryPack)).toEqual(kit);

    await expect(
      restoreCampaignSession({
        kit,
        store: new MemoryCheckpointBackupStore(),
        remote,
      }),
    ).resolves.toEqual(session);
  });

  it("rejects malformed or expanded recovery packs", () => {
    expect(() => parseAdultBackupKit("terra1.not-json")).toThrow(
      "Invalid recovery pack",
    );
    const kit = {
      recoveryCode: "A".repeat(42),
      reference: {
        root: "demo:root",
        contentHash: `sha256:${"a".repeat(64)}`,
        byteLength: 10,
        keyId: "adult-rivergate-1",
        checkpointSchemaVersion: 1,
        cityId: "rivergate-city",
        campaignId: "rivergate-foundations",
        campaignVersion: 1,
      },
    };
    expect(() => serializeAdultBackupKit(kit)).toThrow("Invalid recovery pack");
  });

  it("rejects a changed adult recovery code", async () => {
    const remote = memoryRemote();
    const kit = await backUpCampaignSession({
      session: createGameSessionSave(createDeveloperGame(), 2_000),
      store: new MemoryCheckpointBackupStore(),
      remote,
      now: 2_000,
    });

    await expect(
      restoreCampaignSession({
        kit: {
          ...kit,
          recoveryCode: `${kit.recoveryCode.slice(0, -1)}${kit.recoveryCode.endsWith("A") ? "B" : "A"}`,
        },
        store: new MemoryCheckpointBackupStore(),
        remote,
      }),
    ).rejects.toThrow("Checkpoint could not be decrypted");
  });
});

function memoryRemote(): CheckpointRemoteStorage & { plaintext: string } {
  let stored:
    | Readonly<{
        root: string;
        contentHash: string;
        byteLength: number;
        encryptedEnvelope: string;
      }>
    | undefined;
  return {
    get plaintext() {
      return stored?.encryptedEnvelope ?? "";
    },
    async upload(request: CheckpointUploadRequest) {
      stored = {
        root: `demo:${request.contentHash.slice("sha256:".length)}`,
        contentHash: request.contentHash,
        byteLength: request.byteLength,
        encryptedEnvelope: request.encryptedEnvelope,
      };
      return {
        root: stored.root,
        contentHash: stored.contentHash,
        byteLength: stored.byteLength,
      };
    },
    async download(request: CheckpointDownloadRequest) {
      if (
        stored === undefined ||
        request.root !== stored.root ||
        request.expectedContentHash !== stored.contentHash ||
        request.expectedByteLength !== stored.byteLength
      ) {
        throw new Error("missing");
      }
      return stored;
    },
  };
}
