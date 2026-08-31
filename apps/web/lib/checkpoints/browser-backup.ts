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
const RECOVERY_PACK_PREFIX = "terra1.";
const SAFE_TEXT = /^[A-Za-z0-9._:-]+$/u;
const CONTENT_HASH = /^sha256:[a-f0-9]{64}$/u;
const MAINNET_UPLOAD_LEASE_MS = 15 * 60_000;

export type AdultBackupKit = Readonly<{
  reference: AdultCheckpointReference;
  recoveryCode: string;
}>;

export function serializeAdultBackupKit(kit: AdultBackupKit): string {
  assertAdultBackupKit(kit);
  const bytes = new TextEncoder().encode(JSON.stringify(kit));
  return `${RECOVERY_PACK_PREFIX}${encodeBase64Url(bytes)}`;
}

export function parseAdultBackupKit(value: string): AdultBackupKit {
  if (!value.startsWith(RECOVERY_PACK_PREFIX) || value.length > 2_048) {
    throw new TypeError("Invalid recovery pack");
  }
  const encoded = value.slice(RECOVERY_PACK_PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/u.test(encoded)) {
    throw new TypeError("Invalid recovery pack");
  }
  let parsed: unknown;
  try {
    const padding = "=".repeat((4 - (encoded.length % 4)) % 4);
    const padded = encoded.replace(/-/gu, "+").replace(/_/gu, "/") + padding;
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    if (encodeBase64Url(bytes) !== encoded) {
      throw new TypeError("Invalid recovery pack");
    }
    parsed = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch {
    throw new TypeError("Invalid recovery pack");
  }
  assertAdultBackupKit(parsed);
  return Object.freeze({
    recoveryCode: parsed.recoveryCode,
    reference: Object.freeze({ ...parsed.reference }),
  });
}

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
    uploadLeaseMs: MAINNET_UPLOAD_LEASE_MS,
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
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (encodeBase64Url(bytes) !== value) {
    bytes.fill(0);
    throw new TypeError("Invalid recovery code");
  }
  return bytes;
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

function assertAdultBackupKit(value: unknown): asserts value is AdultBackupKit {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["reference", "recoveryCode"]) ||
    typeof value.recoveryCode !== "string" ||
    !BASE64URL.test(value.recoveryCode) ||
    !isRecord(value.reference) ||
    !hasExactKeys(value.reference, [
      "root",
      "contentHash",
      "byteLength",
      "keyId",
      "checkpointSchemaVersion",
      "cityId",
      "campaignId",
      "campaignVersion",
    ]) ||
    typeof value.reference.root !== "string" ||
    !SAFE_TEXT.test(value.reference.root) ||
    typeof value.reference.contentHash !== "string" ||
    !CONTENT_HASH.test(value.reference.contentHash) ||
    !Number.isSafeInteger(value.reference.byteLength) ||
    Number(value.reference.byteLength) < 1 ||
    typeof value.reference.keyId !== "string" ||
    !SAFE_TEXT.test(value.reference.keyId) ||
    !Number.isSafeInteger(value.reference.checkpointSchemaVersion) ||
    Number(value.reference.checkpointSchemaVersion) < 1 ||
    typeof value.reference.cityId !== "string" ||
    !SAFE_TEXT.test(value.reference.cityId) ||
    typeof value.reference.campaignId !== "string" ||
    !SAFE_TEXT.test(value.reference.campaignId) ||
    !Number.isSafeInteger(value.reference.campaignVersion) ||
    Number(value.reference.campaignVersion) < 1
  ) {
    throw new TypeError("Invalid recovery pack");
  }
  decodeBase64Url(value.recoveryCode);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  );
}
