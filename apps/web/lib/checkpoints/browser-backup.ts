import type { CampaignSessionSave } from "../offline";

import {
  CheckpointBackupCoordinator,
  type AdultCheckpointReference,
  type CheckpointBackupStore,
  type CheckpointRemoteStorage,
} from "./backup";
import { encryptCheckpoint, importCheckpointKey } from "./encryption";

const KEY_BYTES = 32;
const KEY_ID_PREFIX = "adult-rivergate";
const BASE64URL = /^[A-Za-z0-9_-]{43}$/u;

export type AdultBackupKit = Readonly<{
  reference: AdultCheckpointReference;
  recoveryCode: string;
}>;

export async function backUpCampaignSession(input: {
  readonly session: CampaignSessionSave;
  readonly store: CheckpointBackupStore;
  readonly remote: CheckpointRemoteStorage;
  readonly now?: number;
}): Promise<AdultBackupKit> {
  const rawKey = crypto.getRandomValues(new Uint8Array(KEY_BYTES));
  const recoveryCode = encodeBase64Url(rawKey);
  const key = await importCheckpointKey(rawKey);
  rawKey.fill(0);
  const createdAt = validTimestamp(input.now ?? Date.now());
  const keyId = `${KEY_ID_PREFIX}-${createdAt.toString(36)}`;
  const envelope = await encryptCheckpoint(input.session, key, {
    keyId,
    checkpointSchemaVersion: input.session.schemaVersion,
    cityId: input.session.cityId,
    campaignId: input.session.campaignId,
    campaignVersion: input.session.campaignVersion,
    createdAt,
  });
  const coordinator = new CheckpointBackupCoordinator({
    store: input.store,
    remote: input.remote,
    autoUpload: false,
    now: () => createdAt,
  });
  const local = await coordinator.saveEncryptedCheckpoint(envelope);
  const [synced] = await coordinator.flush(createdAt);
  if (synced?.state !== "synced" || synced.remoteRoot === null) {
    throw new Error(
      `Encrypted backup is waiting for a safe retry (${synced?.failureCode ?? synced?.state ?? "missing"})`,
    );
  }
  return Object.freeze({
    recoveryCode,
    reference: Object.freeze({
      root: synced.remoteRoot,
      contentHash: local.contentHash,
      byteLength: local.byteLength,
      keyId,
      checkpointSchemaVersion: input.session.schemaVersion,
      cityId: input.session.cityId,
      campaignId: input.session.campaignId,
      campaignVersion: input.session.campaignVersion,
    }),
  });
}

export async function restoreCampaignSession(input: {
  readonly kit: AdultBackupKit;
  readonly store: CheckpointBackupStore;
  readonly remote: CheckpointRemoteStorage;
}): Promise<CampaignSessionSave> {
  const keyBytes = decodeBase64Url(input.kit.recoveryCode);
  const key = await importCheckpointKey(keyBytes);
  keyBytes.fill(0);
  const coordinator = new CheckpointBackupCoordinator({
    store: input.store,
    remote: input.remote,
    autoUpload: false,
  });
  const restored = await coordinator.restoreFromAdultReference(
    input.kit.reference,
    key,
    isCampaignSessionSave,
  );
  return restored.checkpoint;
}

function isCampaignSessionSave(value: unknown): value is CampaignSessionSave {
  if (!isRecord(value)) return false;
  return (
    value.schemaVersion === 1 &&
    typeof value.cityId === "string" &&
    value.cityId.length > 0 &&
    typeof value.campaignId === "string" &&
    value.campaignId.length > 0 &&
    Number.isSafeInteger(value.campaignVersion) &&
    Number(value.campaignVersion) > 0 &&
    Number.isSafeInteger(value.savedAt) &&
    Number(value.savedAt) >= 0 &&
    isRecord(value.payload)
  );
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/gu, "");
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!BASE64URL.test(value)) throw new TypeError("Invalid recovery code");
  const padded = value.replace(/-/gu, "+").replace(/_/gu, "/") + "=";
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new TypeError("Invalid recovery code");
  }
  if (binary.length !== KEY_BYTES) throw new TypeError("Invalid recovery code");
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function validTimestamp(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("Invalid backup timestamp");
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
