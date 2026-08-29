import {
  CheckpointBackupCoordinator,
  CheckpointRemoteError,
  type CheckpointBackupCoordinatorOptions,
  type CheckpointDownload,
  type CheckpointDownloadRequest,
  type CheckpointRemoteStorage,
  type CheckpointUploadRequest,
} from "./backup";

const CONTENT_HASH = /^sha256:[a-f0-9]{64}$/u;
const IDEMPOTENCY_KEY = /^checkpoint-v1-([a-f0-9]{64})$/u;

/** The server-only subset of the official `ZeroGStorageAdapter`. */
export type ZeroGCheckpointStorageAdapter = Readonly<{
  upload(input: {
    kind: "encrypted-checkpoint-envelope";
    bytes: Uint8Array;
  }): Promise<{
    rootHash: string;
    contentHash: string;
    byteLength: number;
  }>;
  retrieve(input: { rootHash: string; expectedContentHash: string }): Promise<{
    bytes: Uint8Array;
    rootHash: string;
    contentHash: string;
    proofVerified: boolean;
  }>;
}>;

export type ZeroGCheckpointCoordinatorOptions = Omit<
  CheckpointBackupCoordinatorOptions,
  "remote"
> &
  Readonly<{ storage: ZeroGCheckpointStorageAdapter }>;

/**
 * Connects the local-first queue to the sponsor-funded 0G Storage boundary.
 * This module must be imported only from server code; no signer is accepted or
 * returned here, so a child-facing browser can never be asked for a wallet.
 */
export function createZeroGCheckpointRemoteStorage(
  storage: ZeroGCheckpointStorageAdapter,
): CheckpointRemoteStorage {
  assertServerRuntime();
  return Object.freeze({
    async upload(request: CheckpointUploadRequest) {
      try {
        const bytes = await validateUploadRequest(request);
        const receipt = await storage.upload({
          kind: "encrypted-checkpoint-envelope",
          bytes,
        });
        if (
          receipt.contentHash !== request.contentHash ||
          receipt.byteLength !== request.byteLength ||
          typeof receipt.rootHash !== "string" ||
          receipt.rootHash.length === 0
        ) {
          throw new CheckpointRemoteError("integrity_mismatch", false);
        }
        return Object.freeze({
          root: receipt.rootHash,
          contentHash: receipt.contentHash,
          byteLength: receipt.byteLength,
        });
      } catch (error) {
        throw mapStorageError(error);
      }
    },

    async download(
      request: CheckpointDownloadRequest,
    ): Promise<CheckpointDownload> {
      try {
        validateDownloadRequest(request);
        const result = await storage.retrieve({
          rootHash: request.root,
          expectedContentHash: request.expectedContentHash,
        });
        if (
          result.proofVerified !== true ||
          result.rootHash !== request.root ||
          result.contentHash !== request.expectedContentHash ||
          !(result.bytes instanceof Uint8Array) ||
          result.bytes.byteLength !== request.expectedByteLength ||
          (await sha256(Uint8Array.from(result.bytes))) !==
            request.expectedContentHash
        ) {
          throw new CheckpointRemoteError("integrity_mismatch", false);
        }
        const encryptedEnvelope = decodeUtf8(result.bytes);
        return Object.freeze({
          root: result.rootHash,
          contentHash: result.contentHash,
          byteLength: result.bytes.byteLength,
          encryptedEnvelope,
        });
      } catch (error) {
        throw mapStorageError(error);
      }
    },
  });
}

/** Creates the production coordinator while keeping all signing inside 0G. */
export function createZeroGCheckpointBackupCoordinator(
  options: ZeroGCheckpointCoordinatorOptions,
): CheckpointBackupCoordinator {
  const { storage, ...coordinatorOptions } = options;
  return new CheckpointBackupCoordinator({
    ...coordinatorOptions,
    remote: createZeroGCheckpointRemoteStorage(storage),
  });
}

async function validateUploadRequest(
  request: CheckpointUploadRequest,
): Promise<Uint8Array<ArrayBuffer>> {
  const match = IDEMPOTENCY_KEY.exec(request.idempotencyKey);
  if (!match || request.contentHash !== `sha256:${match[1]}`) {
    throw new CheckpointRemoteError("invalid_request", false);
  }
  assertContentHash(request.contentHash);
  if (typeof request.encryptedEnvelope !== "string") {
    throw new CheckpointRemoteError("invalid_request", false);
  }
  const bytes = new TextEncoder().encode(request.encryptedEnvelope);
  if (
    bytes.byteLength === 0 ||
    bytes.byteLength !== request.byteLength ||
    (await sha256(bytes)) !== request.contentHash
  ) {
    throw new CheckpointRemoteError("integrity_mismatch", false);
  }
  return bytes;
}

function validateDownloadRequest(request: CheckpointDownloadRequest): void {
  if (
    typeof request.root !== "string" ||
    request.root.length === 0 ||
    request.root.length > 256 ||
    !Number.isSafeInteger(request.expectedByteLength) ||
    request.expectedByteLength < 1
  ) {
    throw new CheckpointRemoteError("invalid_request", false);
  }
  assertContentHash(request.expectedContentHash);
}

function assertContentHash(value: string): void {
  if (!CONTENT_HASH.test(value)) {
    throw new CheckpointRemoteError("invalid_request", false);
  }
}

async function sha256(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<`sha256:${string}`> {
  if (!globalThis.crypto?.subtle) {
    throw new CheckpointRemoteError("crypto_unavailable", false);
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new CheckpointRemoteError("invalid_response", false);
  }
}

function mapStorageError(error: unknown): CheckpointRemoteError {
  if (error instanceof CheckpointRemoteError) return error;
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    "retryable" in error &&
    typeof error.retryable === "boolean"
  ) {
    return new CheckpointRemoteError(safeCode(error.code), error.retryable);
  }
  return new CheckpointRemoteError("storage_failure", false);
}

function safeCode(code: string): string {
  const normalized = code.toLowerCase();
  return /^[a-z0-9_:-]{1,64}$/u.test(normalized)
    ? normalized
    : "storage_failure";
}

function assertServerRuntime(): void {
  if (typeof window !== "undefined") {
    throw new CheckpointRemoteError("server_only", false);
  }
}
