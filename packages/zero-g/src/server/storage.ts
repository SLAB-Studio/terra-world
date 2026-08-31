import { createHash } from "node:crypto";

import type { ZeroGSponsorConfig, ZeroGStorageConfig } from "./config";

const HASH_32_BYTES = /^0x[0-9a-fA-F]{64}$/u;
const CONTENT_HASH = /^sha256:[0-9a-f]{64}$/u;
const DEFAULT_MAX_BYTES = 8_000_000;

export type ZeroGStoragePayloadKind =
  "campaign-package" | "encrypted-checkpoint-envelope";

export type ZeroGStorageErrorCode =
  | "DATA_TOO_LARGE"
  | "INVALID_DATA"
  | "SDK_UNAVAILABLE"
  | "SIGNER_UNAVAILABLE"
  | "NETWORK_MISMATCH"
  | "MERKLE_FAILURE"
  | "UPLOAD_FAILURE"
  | "DOWNLOAD_FAILURE"
  | "PROOF_VERIFICATION_FAILED"
  | "INVALID_RESPONSE"
  | "INTEGRITY_MISMATCH"
  | "TIMEOUT";

export class ZeroGStorageError extends Error {
  readonly code: ZeroGStorageErrorCode;
  readonly operation: "upload" | "download";
  readonly retryable: boolean;

  constructor(
    code: ZeroGStorageErrorCode,
    message: string,
    options: {
      operation: "upload" | "download";
      retryable: boolean;
    },
  ) {
    super(message);
    this.name = "ZeroGStorageError";
    this.code = code;
    this.operation = options.operation;
    this.retryable = options.retryable;
  }
}

export type ZeroGStorageDriverContext = Readonly<{
  chainId: 16602 | 16661;
  chainRpcUrl: string;
  indexerUrl: string;
  flowAddress: `0x${string}`;
  /** Server/adult-sponsored signer material. It must never be sent to a child. */
  sponsorPrivateKey?: `0x${string}`;
}>;

export type ZeroGStorageDriverUploadResult = Readonly<{
  calculatedRootHash: string;
  response: unknown;
}>;

export type ZeroGStorageDriverDownloadResult = Readonly<{
  bytes: Uint8Array;
  rootHash: string;
  proofVerified: boolean;
}>;

/** Injectable boundary around the network SDK; tests never need secrets or RPC. */
export type ZeroGStorageDriver = Readonly<{
  uploadBytes(
    bytes: Uint8Array,
    context: ZeroGStorageDriverContext,
  ): Promise<ZeroGStorageDriverUploadResult>;
  downloadBytes(
    rootHash: string,
    context: ZeroGStorageDriverContext,
    maximumBytes: number,
  ): Promise<ZeroGStorageDriverDownloadResult>;
}>;

export type ZeroGStorageUploadInput = Readonly<{
  kind: ZeroGStoragePayloadKind;
  bytes: Uint8Array;
}>;

export type ZeroGStorageUploadReceipt = Readonly<{
  kind: ZeroGStoragePayloadKind;
  rootHash: `0x${string}`;
  /** Null when the SDK reports that this exact root was already finalized. */
  transactionHash: `0x${string}` | null;
  transactionSequence: number;
  contentHash: `sha256:${string}`;
  byteLength: number;
}>;

export type CampaignPackageVerification = Readonly<{
  expectedPackageHash: string;
  /** Parse and schema-validate the bytes, then return their embedded package hash. */
  inspectPackageHash(
    canonicalPackageBytes: Uint8Array,
  ): string | Promise<string>;
}>;

export type ZeroGStorageRetrieveInput = Readonly<{
  rootHash: string;
  expectedContentHash: string;
  campaign?: CampaignPackageVerification;
}>;

export type ZeroGStorageRetrieveResult = Readonly<{
  bytes: Uint8Array;
  rootHash: `0x${string}`;
  contentHash: `sha256:${string}`;
  proofVerified: true;
  packageHash?: string;
}>;

export type ZeroGStorageAdapter = Readonly<{
  upload(input: ZeroGStorageUploadInput): Promise<ZeroGStorageUploadReceipt>;
  retrieve(
    input: ZeroGStorageRetrieveInput,
  ): Promise<ZeroGStorageRetrieveResult>;
}>;

type StorageAdapterDependencies = Readonly<{
  driver: ZeroGStorageDriver;
  maximumUploadBytes?: number;
  maximumDownloadBytes?: number;
}>;

/**
 * Server-only 0G Storage boundary. A child-facing browser never signs a
 * transaction: uploads are paid by the configured adult/sponsor wallet.
 */
export function createZeroGStorageAdapter(
  config: ZeroGStorageConfig & Partial<ZeroGSponsorConfig>,
  dependencies: StorageAdapterDependencies,
): ZeroGStorageAdapter {
  const maximumUploadBytes = validateMaximumBytes(
    dependencies.maximumUploadBytes ?? DEFAULT_MAX_BYTES,
    "maximumUploadBytes",
  );
  const maximumDownloadBytes = validateMaximumBytes(
    dependencies.maximumDownloadBytes ?? DEFAULT_MAX_BYTES,
    "maximumDownloadBytes",
  );
  const context: ZeroGStorageDriverContext = Object.freeze({
    chainId: config.chainId,
    chainRpcUrl: config.chainRpcUrl,
    indexerUrl: config.storage.indexerUrl,
    flowAddress: config.storage.flowAddress,
    ...(config.sponsorPrivateKey
      ? { sponsorPrivateKey: config.sponsorPrivateKey }
      : {}),
  });

  return Object.freeze({
    async upload(
      input: ZeroGStorageUploadInput,
    ): Promise<ZeroGStorageUploadReceipt> {
      const bytes = validateUploadInput(input, maximumUploadBytes);
      let driverResult: ZeroGStorageDriverUploadResult;
      try {
        driverResult = await withTimeout(
          dependencies.driver.uploadBytes(bytes, context),
          config.storage.uploadTimeoutMs,
          "upload",
          false,
        );
      } catch (error) {
        throw mapDriverError(error, "upload");
      }

      const calculatedRoot = normalizeHash(
        driverResult.calculatedRootHash,
        "upload",
      );
      const response = parseSingleUploadResponse(driverResult.response);
      if (response.rootHash !== calculatedRoot) {
        throw storageError(
          "INTEGRITY_MISMATCH",
          "0G Storage returned a root that does not match the uploaded bytes",
          "upload",
          false,
        );
      }

      return Object.freeze({
        kind: input.kind,
        rootHash: response.rootHash,
        transactionHash: response.transactionHash,
        transactionSequence: response.transactionSequence,
        contentHash: contentHash(bytes),
        byteLength: bytes.byteLength,
      });
    },

    async retrieve(
      input: ZeroGStorageRetrieveInput,
    ): Promise<ZeroGStorageRetrieveResult> {
      const requestedRoot = normalizeHash(input.rootHash, "download");
      const expectedContentHash = validateContentHash(
        input.expectedContentHash,
      );
      let driverResult: ZeroGStorageDriverDownloadResult;
      try {
        driverResult = await withTimeout(
          dependencies.driver.downloadBytes(
            requestedRoot,
            context,
            maximumDownloadBytes,
          ),
          config.request.timeoutMs,
          "download",
          true,
        );
      } catch (error) {
        throw mapDriverError(error, "download");
      }

      if (!driverResult.proofVerified) {
        throw storageError(
          "PROOF_VERIFICATION_FAILED",
          "0G Storage proof verification did not succeed",
          "download",
          false,
        );
      }
      const receivedRoot = normalizeHash(driverResult.rootHash, "download");
      if (receivedRoot !== requestedRoot) {
        throw storageError(
          "INTEGRITY_MISMATCH",
          "0G Storage returned data for an unexpected root",
          "download",
          false,
        );
      }
      if (!(driverResult.bytes instanceof Uint8Array)) {
        throw storageError(
          "INVALID_RESPONSE",
          "0G Storage returned an invalid byte payload",
          "download",
          false,
        );
      }
      if (driverResult.bytes.byteLength > maximumDownloadBytes) {
        throw storageError(
          "DATA_TOO_LARGE",
          "0G Storage download exceeded the configured size limit",
          "download",
          false,
        );
      }

      const bytes = Uint8Array.from(driverResult.bytes);
      const receivedContentHash = contentHash(bytes);
      if (receivedContentHash !== expectedContentHash) {
        throw storageError(
          "INTEGRITY_MISMATCH",
          "0G Storage bytes do not match the expected content hash",
          "download",
          false,
        );
      }

      const packageHash = input.campaign
        ? await verifyCampaignPackage(bytes, input.campaign)
        : undefined;
      return Object.freeze({
        bytes,
        rootHash: receivedRoot,
        contentHash: receivedContentHash,
        proofVerified: true as const,
        ...(packageHash === undefined ? {} : { packageHash }),
      });
    },
  });
}

function validateUploadInput(
  input: ZeroGStorageUploadInput,
  maximumBytes: number,
): Uint8Array {
  if (
    input.kind !== "campaign-package" &&
    input.kind !== "encrypted-checkpoint-envelope"
  ) {
    throw storageError(
      "INVALID_DATA",
      "0G Storage payload kind is unsupported",
      "upload",
      false,
    );
  }
  if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength === 0) {
    throw storageError(
      "INVALID_DATA",
      "0G Storage payload must contain bytes",
      "upload",
      false,
    );
  }
  if (input.bytes.byteLength > maximumBytes) {
    throw storageError(
      "DATA_TOO_LARGE",
      "0G Storage upload exceeded the configured size limit",
      "upload",
      false,
    );
  }
  const bytes = Uint8Array.from(input.bytes);
  if (input.kind === "campaign-package") assertCanonicalJson(bytes);
  return bytes;
}

function assertCanonicalJson(bytes: Uint8Array): void {
  let decoded: string;
  let parsed: unknown;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    parsed = JSON.parse(decoded) as unknown;
  } catch {
    throw storageError(
      "INVALID_DATA",
      "Campaign package bytes must contain valid UTF-8 JSON",
      "upload",
      false,
    );
  }
  if (!isPlainRecord(parsed) || canonicalStringify(parsed) !== decoded) {
    throw storageError(
      "INVALID_DATA",
      "Campaign package bytes must use canonical JSON encoding",
      "upload",
      false,
    );
  }
}

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`)
    .join(",")}}`;
}

async function verifyCampaignPackage(
  bytes: Uint8Array,
  verification: CampaignPackageVerification,
): Promise<string> {
  if (
    typeof verification.expectedPackageHash !== "string" ||
    verification.expectedPackageHash.length < 1 ||
    verification.expectedPackageHash.length > 128
  ) {
    throw storageError(
      "INVALID_DATA",
      "Expected campaign package hash is invalid",
      "download",
      false,
    );
  }
  let packageHash: string;
  try {
    packageHash = await verification.inspectPackageHash(Uint8Array.from(bytes));
  } catch {
    throw storageError(
      "INTEGRITY_MISMATCH",
      "Retrieved campaign package failed application validation",
      "download",
      false,
    );
  }
  if (packageHash !== verification.expectedPackageHash) {
    throw storageError(
      "INTEGRITY_MISMATCH",
      "Retrieved campaign package hash does not match the trust anchor",
      "download",
      false,
    );
  }
  return packageHash;
}

function parseSingleUploadResponse(response: unknown): {
  rootHash: `0x${string}`;
  transactionHash: `0x${string}` | null;
  transactionSequence: number;
} {
  if (!isPlainRecord(response)) return invalidUploadResponse();
  const keys = Object.keys(response).sort();
  const transactionSequence = response.txSeq;
  if (
    keys.length !== 3 ||
    keys[0] !== "rootHash" ||
    keys[1] !== "txHash" ||
    keys[2] !== "txSeq" ||
    typeof transactionSequence !== "number" ||
    !Number.isSafeInteger(transactionSequence) ||
    transactionSequence < 0 ||
    typeof response.txHash !== "string"
  ) {
    return invalidUploadResponse();
  }
  return {
    rootHash: normalizeHash(response.rootHash, "upload"),
    transactionHash:
      response.txHash === "" ? null : normalizeHash(response.txHash, "upload"),
    transactionSequence,
  };
}

function invalidUploadResponse(): never {
  throw storageError(
    "INVALID_RESPONSE",
    "0G Storage did not return one root and one transaction sequence",
    "upload",
    false,
  );
}

function normalizeHash(
  value: unknown,
  operation: "upload" | "download",
): `0x${string}` {
  if (typeof value !== "string" || !HASH_32_BYTES.test(value)) {
    throw storageError(
      "INVALID_RESPONSE",
      "0G Storage returned an invalid hash",
      operation,
      false,
    );
  }
  return value.toLowerCase() as `0x${string}`;
}

function validateContentHash(value: string): `sha256:${string}` {
  if (!CONTENT_HASH.test(value)) {
    throw storageError(
      "INVALID_DATA",
      "Expected content hash must be a SHA-256 hash",
      "download",
      false,
    );
  }
  return value as `sha256:${string}`;
}

function contentHash(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function validateMaximumBytes(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 50_000_000) {
    throw new TypeError(`${field} must be between 1 and 50000000 bytes`);
  }
  return value;
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  operationName: "upload" | "download",
  retryable: boolean,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(
      () =>
        reject(
          storageError(
            "TIMEOUT",
            `0G Storage ${operationName} timed out`,
            operationName,
            retryable,
          ),
        ),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([operation, deadline]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function mapDriverError(
  error: unknown,
  operation: "upload" | "download",
): ZeroGStorageError {
  if (error instanceof ZeroGStorageError) return error;
  return storageError(
    operation === "upload" ? "UPLOAD_FAILURE" : "DOWNLOAD_FAILURE",
    `0G Storage ${operation} failed`,
    operation,
    true,
  );
}

function storageError(
  code: ZeroGStorageErrorCode,
  message: string,
  operation: "upload" | "download",
  retryable: boolean,
): ZeroGStorageError {
  return new ZeroGStorageError(code, message, { operation, retryable });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}
