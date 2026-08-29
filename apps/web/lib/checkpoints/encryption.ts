/**
 * Browser-side encryption for verified city checkpoints.
 *
 * The envelope is JSON-safe so it can be queued locally or sent to storage,
 * but neither plaintext checkpoints nor encryption keys leave this module.
 */

export const CHECKPOINT_ENVELOPE_SCHEMA_VERSION = 1 as const;
export const CHECKPOINT_ALGORITHM = "AES-GCM" as const;

const AES_GCM_IV_BYTES = 12;
const AES_GCM_TAG_BITS = 128;
const MAX_CIPHERTEXT_BYTES = 5_000_000;
const MAX_PLAINTEXT_BYTES = MAX_CIPHERTEXT_BYTES - AES_GCM_TAG_BITS / 8;
const IDENTIFIER = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export type CheckpointAuthenticatedMetadata = Readonly<{
  schemaVersion: 1;
  checkpointSchemaVersion: number;
  cityId: string;
  campaignId: string;
  campaignVersion: number;
  createdAt: number;
}>;

export type CheckpointEncryptionContext = Readonly<{
  keyId: string;
  checkpointSchemaVersion: number;
  cityId: string;
  campaignId: string;
  campaignVersion: number;
  createdAt: number;
}>;

export type EncryptedCheckpointEnvelope = Readonly<{
  schemaVersion: 1;
  algorithm: typeof CHECKPOINT_ALGORITHM;
  keyId: string;
  iv: string;
  aad: CheckpointAuthenticatedMetadata;
  ciphertext: string;
}>;

export class CheckpointDecryptionError extends Error {
  override readonly name = "CheckpointDecryptionError";

  constructor() {
    super("Checkpoint could not be decrypted");
  }
}

/** Creates a non-extractable browser key suitable only for checkpoint AES-GCM. */
export async function generateCheckpointKey(): Promise<CryptoKey> {
  return cryptoProvider().subtle.generateKey(
    { name: CHECKPOINT_ALGORITHM, length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Imports an adult/session-managed AES key without making it extractable. */
export async function importCheckpointKey(
  rawKey: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  if (![16, 24, 32].includes(rawKey.byteLength)) {
    throw new TypeError("Checkpoint key must contain 128, 192, or 256 bits");
  }

  return cryptoProvider().subtle.importKey(
    "raw",
    rawKey,
    { name: CHECKPOINT_ALGORITHM },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Encrypts a JSON checkpoint with a fresh 96-bit IV and authenticated context. */
export async function encryptCheckpoint(
  checkpoint: unknown,
  key: CryptoKey,
  context: CheckpointEncryptionContext,
): Promise<EncryptedCheckpointEnvelope> {
  assertAesGcmKey(key, "encrypt");
  assertJsonCheckpoint(checkpoint, context.checkpointSchemaVersion);

  const aad = createAuthenticatedMetadata(context);
  const keyId = assertIdentifier(context.keyId, "keyId");
  const iv = cryptoProvider().getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(checkpoint));
  if (plaintext.byteLength > MAX_PLAINTEXT_BYTES) {
    throw new TypeError("Checkpoint plaintext is too large");
  }
  const additionalData = encodeAdditionalData(keyId, aad);
  const encrypted = await cryptoProvider().subtle.encrypt(
    {
      name: CHECKPOINT_ALGORITHM,
      iv,
      additionalData,
      tagLength: AES_GCM_TAG_BITS,
    },
    key,
    plaintext,
  );

  return {
    schemaVersion: CHECKPOINT_ENVELOPE_SCHEMA_VERSION,
    algorithm: CHECKPOINT_ALGORITHM,
    keyId,
    iv: encodeBase64Url(iv),
    aad,
    ciphertext: encodeBase64Url(new Uint8Array(encrypted)),
  };
}

/**
 * Decrypts an envelope after strict structural and version validation.
 * The caller still owns domain validation of the returned checkpoint.
 */
export async function decryptCheckpoint(
  envelope: unknown,
  key: CryptoKey,
): Promise<unknown> {
  assertAesGcmKey(key, "decrypt");
  assertEncryptedCheckpointEnvelope(envelope);

  const iv = decodeBase64Url(envelope.iv, "iv");
  const ciphertext = decodeBase64Url(envelope.ciphertext, "ciphertext");
  const additionalData = encodeAdditionalData(envelope.keyId, envelope.aad);

  let decrypted: ArrayBuffer;
  try {
    decrypted = await cryptoProvider().subtle.decrypt(
      {
        name: CHECKPOINT_ALGORITHM,
        iv,
        additionalData,
        tagLength: AES_GCM_TAG_BITS,
      },
      key,
      ciphertext,
    );
  } catch {
    throw new CheckpointDecryptionError();
  }

  let checkpoint: unknown;
  try {
    const json = new TextDecoder("utf-8", { fatal: true }).decode(decrypted);
    checkpoint = JSON.parse(json) as unknown;
  } catch {
    throw new CheckpointDecryptionError();
  }

  try {
    assertJsonCheckpoint(checkpoint, envelope.aad.checkpointSchemaVersion);
  } catch {
    throw new CheckpointDecryptionError();
  }
  return checkpoint;
}

/** Decrypts and applies an application-level checkpoint type guard. */
export async function decryptAndValidateCheckpoint<T>(
  envelope: unknown,
  key: CryptoKey,
  isValid: (value: unknown) => value is T,
): Promise<T> {
  const checkpoint = await decryptCheckpoint(envelope, key);
  if (!isValid(checkpoint)) {
    throw new TypeError("Decrypted checkpoint failed application validation");
  }
  return checkpoint;
}

export function assertEncryptedCheckpointEnvelope(
  value: unknown,
): asserts value is EncryptedCheckpointEnvelope {
  if (!isPlainRecord(value)) {
    throw new TypeError("Checkpoint envelope must be an object");
  }
  assertExactKeys(value, [
    "schemaVersion",
    "algorithm",
    "keyId",
    "iv",
    "aad",
    "ciphertext",
  ]);
  if (value.schemaVersion !== CHECKPOINT_ENVELOPE_SCHEMA_VERSION) {
    throw new TypeError("Checkpoint envelope schema version is unsupported");
  }
  if (value.algorithm !== CHECKPOINT_ALGORITHM) {
    throw new TypeError("Checkpoint envelope algorithm is unsupported");
  }
  assertIdentifier(value.keyId, "keyId");
  const iv = decodeBase64Url(value.iv, "iv");
  if (iv.byteLength !== AES_GCM_IV_BYTES) {
    throw new TypeError("Checkpoint envelope IV must contain 96 bits");
  }
  const ciphertext = decodeBase64Url(value.ciphertext, "ciphertext");
  if (
    ciphertext.byteLength < AES_GCM_TAG_BITS / 8 ||
    ciphertext.byteLength > MAX_CIPHERTEXT_BYTES
  ) {
    throw new TypeError("Checkpoint envelope ciphertext length is invalid");
  }
  assertAuthenticatedMetadata(value.aad);
}

function createAuthenticatedMetadata(
  context: CheckpointEncryptionContext,
): CheckpointAuthenticatedMetadata {
  const metadata = {
    schemaVersion: CHECKPOINT_ENVELOPE_SCHEMA_VERSION,
    checkpointSchemaVersion: context.checkpointSchemaVersion,
    cityId: context.cityId,
    campaignId: context.campaignId,
    campaignVersion: context.campaignVersion,
    createdAt: context.createdAt,
  } as const;
  assertAuthenticatedMetadata(metadata);
  return metadata;
}

function assertAuthenticatedMetadata(
  value: unknown,
): asserts value is CheckpointAuthenticatedMetadata {
  if (!isPlainRecord(value)) {
    throw new TypeError("Checkpoint authenticated metadata must be an object");
  }
  assertExactKeys(value, [
    "schemaVersion",
    "checkpointSchemaVersion",
    "cityId",
    "campaignId",
    "campaignVersion",
    "createdAt",
  ]);
  if (value.schemaVersion !== CHECKPOINT_ENVELOPE_SCHEMA_VERSION) {
    throw new TypeError("Checkpoint metadata schema version is unsupported");
  }
  assertPositiveInteger(
    value.checkpointSchemaVersion,
    "checkpointSchemaVersion",
  );
  assertIdentifier(value.cityId, "cityId");
  assertIdentifier(value.campaignId, "campaignId");
  assertPositiveInteger(value.campaignVersion, "campaignVersion");
  if (
    typeof value.createdAt !== "number" ||
    !Number.isSafeInteger(value.createdAt) ||
    value.createdAt < 0
  ) {
    throw new TypeError(
      "Checkpoint createdAt must be a non-negative timestamp",
    );
  }
}

function encodeAdditionalData(
  keyId: string,
  metadata: CheckpointAuthenticatedMetadata,
): Uint8Array<ArrayBuffer> {
  // A fixed tuple avoids relying on object property insertion order.
  return new TextEncoder().encode(
    JSON.stringify([
      CHECKPOINT_ENVELOPE_SCHEMA_VERSION,
      CHECKPOINT_ALGORITHM,
      keyId,
      metadata.schemaVersion,
      metadata.checkpointSchemaVersion,
      metadata.cityId,
      metadata.campaignId,
      metadata.campaignVersion,
      metadata.createdAt,
    ]),
  );
}

function assertJsonCheckpoint(
  value: unknown,
  expectedSchemaVersion: number,
): asserts value is Record<string, unknown> {
  assertPositiveInteger(expectedSchemaVersion, "checkpointSchemaVersion");
  assertJsonValue(value, new Set(), 0);
  if (!isPlainRecord(value)) {
    throw new TypeError("Checkpoint must be a JSON object");
  }
  if (
    !Object.hasOwn(value, "schemaVersion") ||
    value.schemaVersion !== expectedSchemaVersion
  ) {
    throw new TypeError(
      "Checkpoint schema version does not match its metadata",
    );
  }
}

function assertJsonValue(
  value: unknown,
  ancestors: Set<object>,
  depth: number,
): void {
  if (depth > 100) throw new TypeError("Checkpoint JSON is too deeply nested");
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError("Checkpoint contains a non-finite number");
    return;
  }
  if (typeof value !== "object") {
    throw new TypeError("Checkpoint is not JSON-compatible");
  }
  if (ancestors.has(value)) {
    throw new TypeError("Checkpoint contains a circular reference");
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (const item of value) assertJsonValue(item, ancestors, depth + 1);
  } else {
    if (!isPlainRecord(value)) {
      throw new TypeError("Checkpoint contains a non-plain object");
    }
    for (const [key, item] of Object.entries(value)) {
      if (["__proto__", "constructor", "prototype"].includes(key)) {
        throw new TypeError("Checkpoint contains an unsafe object key");
      }
      assertJsonValue(item, ancestors, depth + 1);
    }
  }
  ancestors.delete(value);
}

function assertAesGcmKey(key: CryptoKey, usage: "encrypt" | "decrypt"): void {
  if (
    !key ||
    key.type !== "secret" ||
    key.algorithm.name !== CHECKPOINT_ALGORITHM ||
    !key.usages.includes(usage)
  ) {
    throw new TypeError(`Checkpoint key does not permit ${usage}`);
  }
}

function assertIdentifier(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length > 128 ||
    !IDENTIFIER.test(value)
  ) {
    throw new TypeError(`Checkpoint ${label} is invalid`);
  }
  return value;
}

function assertPositiveInteger(value: unknown, label: string): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`Checkpoint ${label} must be a positive integer`);
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): void {
  const keys = Object.keys(value);
  if (
    keys.length !== expected.length ||
    expected.some((key) => !Object.hasOwn(value, key))
  ) {
    throw new TypeError("Checkpoint envelope contains unexpected fields");
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function decodeBase64Url(
  value: unknown,
  label: string,
): Uint8Array<ArrayBuffer> {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !BASE64URL.test(value) ||
    value.length % 4 === 1
  ) {
    throw new TypeError(`Checkpoint envelope ${label} is not base64url`);
  }

  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new TypeError(`Checkpoint envelope ${label} is not base64url`);
  }
  const decoded = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    decoded[index] = binary.charCodeAt(index);
  }
  if (encodeBase64Url(decoded) !== value) {
    throw new TypeError(
      `Checkpoint envelope ${label} is not canonical base64url`,
    );
  }
  return decoded;
}

function cryptoProvider(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto is unavailable in this browser");
  }
  return globalThis.crypto;
}
