import { describe, expect, it } from "vitest";

import {
  CheckpointDecryptionError,
  decryptAndValidateCheckpoint,
  decryptCheckpoint,
  encryptCheckpoint,
  generateCheckpointKey,
  importCheckpointKey,
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

describe("encrypted city checkpoint envelopes", () => {
  it("round-trips JSON through the unknown and validated decrypt APIs", async () => {
    const key = await generateCheckpointKey();
    const envelope = await encryptCheckpoint(checkpoint, key, context);

    await expect(decryptCheckpoint(envelope, key)).resolves.toEqual(checkpoint);
    await expect(
      decryptAndValidateCheckpoint(envelope, key, isTestCheckpoint),
    ).resolves.toEqual(checkpoint);
  });

  it("uses a fresh 96-bit IV and produces distinct ciphertext each time", async () => {
    const key = await generateCheckpointKey();
    const first = await encryptCheckpoint(checkpoint, key, context);
    const second = await encryptCheckpoint(checkpoint, key, context);

    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(decodeBase64UrlForTest(first.iv)).toHaveLength(12);
    expect(first.iv).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(first.ciphertext).toMatch(/^[A-Za-z0-9_-]+$/u);
  });

  it("rejects a different AES key without exposing cryptographic details", async () => {
    const key = await generateCheckpointKey();
    const wrongKey = await generateCheckpointKey();
    const envelope = await encryptCheckpoint(checkpoint, key, context);

    await expect(decryptCheckpoint(envelope, wrongKey)).rejects.toEqual(
      new CheckpointDecryptionError(),
    );
  });

  it.each([
    [
      "ciphertext",
      (envelope: EncryptedCheckpointEnvelope) => ({
        ...envelope,
        ciphertext: flipBase64UrlCharacter(envelope.ciphertext),
      }),
    ],
    [
      "iv",
      (envelope: EncryptedCheckpointEnvelope) => ({
        ...envelope,
        iv: flipBase64UrlCharacter(envelope.iv),
      }),
    ],
    [
      "authenticated metadata",
      (envelope: EncryptedCheckpointEnvelope) => ({
        ...envelope,
        aad: { ...envelope.aad, createdAt: envelope.aad.createdAt + 1 },
      }),
    ],
  ])("rejects tampered %s", async (_label, tamper) => {
    const key = await generateCheckpointKey();
    const envelope = await encryptCheckpoint(checkpoint, key, context);

    await expect(
      decryptCheckpoint(tamper(envelope), key),
    ).rejects.toBeInstanceOf(CheckpointDecryptionError);
  });

  it.each([
    null,
    {},
    {
      schemaVersion: 1,
      algorithm: "AES-GCM",
      keyId: "adult-session-key-1",
      iv: "not+base64url",
      aad: {},
      ciphertext: "AA",
    },
    {
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
        createdAt: 1_788_000_000_000,
      },
      ciphertext: "AA",
      plaintext: checkpoint,
    },
  ])("rejects a malformed envelope before decryption", async (malformed) => {
    const key = await generateCheckpointKey();
    await expect(decryptCheckpoint(malformed, key)).rejects.toBeInstanceOf(
      TypeError,
    );
  });

  it("rejects unsupported envelope and metadata versions", async () => {
    const key = await generateCheckpointKey();
    const envelope = await encryptCheckpoint(checkpoint, key, context);

    await expect(
      decryptCheckpoint({ ...envelope, schemaVersion: 2 }, key),
    ).rejects.toThrow("schema version is unsupported");
    await expect(
      decryptCheckpoint(
        { ...envelope, aad: { ...envelope.aad, schemaVersion: 2 } },
        key,
      ),
    ).rejects.toThrow("metadata schema version is unsupported");
  });

  it("rejects non-JSON and mismatched checkpoint schemas before encryption", async () => {
    const key = await generateCheckpointKey();

    await expect(
      encryptCheckpoint({ ...checkpoint, schemaVersion: 2 }, key, context),
    ).rejects.toThrow("schema version does not match");
    await expect(
      encryptCheckpoint({ ...checkpoint, budget: Number.NaN }, key, context),
    ).rejects.toThrow("non-finite number");
  });

  it("rejects decrypted data that fails application validation", async () => {
    const key = await importCheckpointKey(new Uint8Array(32).fill(7));
    const envelope = await encryptCheckpoint(checkpoint, key, context);

    await expect(
      decryptAndValidateCheckpoint(envelope, key, (value): value is never => {
        void value;
        return false;
      }),
    ).rejects.toThrow("failed application validation");
  });
});

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

function flipBase64UrlCharacter(value: string): string {
  return `${value[0] === "A" ? "B" : "A"}${value.slice(1)}`;
}

function decodeBase64UrlForTest(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
