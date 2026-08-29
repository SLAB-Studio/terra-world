import {
  ZeroGStorageError,
  type ZeroGStorageDriver,
  type ZeroGStorageDriverContext,
  type ZeroGStorageDriverDownloadResult,
  type ZeroGStorageDriverUploadResult,
} from "./storage";

const STORAGE_SDK_SPECIFIER = "@0gfoundation/0g-storage-ts-sdk";
const ETHERS_SPECIFIER = "ethers";

type MerkleTreeLike = Readonly<{ rootHash(): unknown }>;
type MemDataLike = Readonly<{
  merkleTree(): Promise<readonly [MerkleTreeLike | null, unknown]>;
  close?: () => void | Promise<void>;
}>;
type IndexerLike = Readonly<{
  upload(
    data: MemDataLike,
    chainRpcUrl: string,
    signer: unknown,
  ): Promise<readonly [unknown, unknown]>;
  downloadToBlob(
    rootHash: string,
    options: Readonly<{ proof: true }>,
  ): Promise<readonly [unknown, unknown]>;
}>;
type ProviderLike = object;

type StorageSdkRuntime = Readonly<{
  MemData: new (bytes: Uint8Array) => MemDataLike;
  Indexer: new (indexerUrl: string) => IndexerLike;
}>;
type EthersRuntime = Readonly<{
  JsonRpcProvider: new (chainRpcUrl: string) => ProviderLike;
  Wallet: new (privateKey: string, provider: ProviderLike) => unknown;
}>;

type OfficialStorageDriverDependencies = Readonly<{
  loadStorageSdk?: () => Promise<unknown>;
  loadEthers?: () => Promise<unknown>;
}>;

/**
 * Thin server-only bridge to the official 0G SDK. Dynamic loading keeps the
 * SDK and ethers out of browser graphs and gives tests a deterministic seam.
 */
export function createOfficialZeroGStorageDriver(
  dependencies: OfficialStorageDriverDependencies = {},
): ZeroGStorageDriver {
  const loadStorageSdk =
    dependencies.loadStorageSdk ??
    (() => import(/* @vite-ignore */ STORAGE_SDK_SPECIFIER));
  const loadEthers =
    dependencies.loadEthers ??
    (() => import(/* @vite-ignore */ ETHERS_SPECIFIER));

  return Object.freeze({
    async uploadBytes(
      bytes: Uint8Array,
      context: ZeroGStorageDriverContext,
    ): Promise<ZeroGStorageDriverUploadResult> {
      assertServerRuntime("upload");
      const [storageSdk, ethers] = await loadRuntime(
        loadStorageSdk,
        loadEthers,
        "upload",
      );
      const data = new storageSdk.MemData(Uint8Array.from(bytes));
      try {
        const [tree, treeError] = await data.merkleTree();
        if (treeError !== null || tree === null) {
          throw safeError(
            "MERKLE_FAILURE",
            "0G Storage could not prepare the upload Merkle tree",
            "upload",
            false,
          );
        }
        const calculatedRootHash = tree.rootHash();
        if (typeof calculatedRootHash !== "string") {
          throw safeError(
            "MERKLE_FAILURE",
            "0G Storage returned an invalid Merkle root",
            "upload",
            false,
          );
        }

        const provider = new ethers.JsonRpcProvider(context.chainRpcUrl);
        const signer = new ethers.Wallet(context.sponsorPrivateKey, provider);
        const indexer = new storageSdk.Indexer(context.indexerUrl);
        const [response, uploadError] = await indexer.upload(
          data,
          context.chainRpcUrl,
          signer,
        );
        if (uploadError !== null) {
          throw safeError(
            "UPLOAD_FAILURE",
            "0G Storage upload failed",
            "upload",
            true,
          );
        }
        return Object.freeze({ calculatedRootHash, response });
      } catch (error) {
        if (error instanceof ZeroGStorageError) throw error;
        throw safeError(
          "UPLOAD_FAILURE",
          "0G Storage upload failed",
          "upload",
          true,
        );
      } finally {
        try {
          await data.close?.();
        } catch {
          // The data buffer contains no persistent resource required by callers.
        }
      }
    },

    async downloadBytes(
      rootHash: string,
      context: ZeroGStorageDriverContext,
      maximumBytes: number,
    ): Promise<ZeroGStorageDriverDownloadResult> {
      assertServerRuntime("download");
      const [storageSdk] = await loadRuntime(
        loadStorageSdk,
        loadEthers,
        "download",
      );
      try {
        const indexer = new storageSdk.Indexer(context.indexerUrl);
        const [blob, downloadError] = await indexer.downloadToBlob(rootHash, {
          proof: true,
        });
        if (downloadError !== null) {
          throw safeError(
            "PROOF_VERIFICATION_FAILED",
            "0G Storage proof-verified download failed",
            "download",
            false,
          );
        }
        const bytes = await bytesFromBlob(blob);
        if (bytes.byteLength > maximumBytes) {
          throw safeError(
            "DATA_TOO_LARGE",
            "0G Storage download exceeded the configured size limit",
            "download",
            false,
          );
        }
        return Object.freeze({
          bytes,
          rootHash,
          proofVerified: true,
        });
      } catch (error) {
        if (error instanceof ZeroGStorageError) throw error;
        throw safeError(
          "DOWNLOAD_FAILURE",
          "0G Storage download failed",
          "download",
          true,
        );
      }
    },
  });
}

async function loadRuntime(
  loadStorageSdk: () => Promise<unknown>,
  loadEthers: () => Promise<unknown>,
  operation: "upload" | "download",
): Promise<readonly [StorageSdkRuntime, EthersRuntime]> {
  let storageModule: unknown;
  let ethersModule: unknown;
  try {
    [storageModule, ethersModule] = await Promise.all([
      loadStorageSdk(),
      loadEthers(),
    ]);
  } catch {
    throw safeError(
      "SDK_UNAVAILABLE",
      "0G Storage server SDK is unavailable",
      operation,
      false,
    );
  }
  if (!isRecord(storageModule)) return invalidRuntime(operation);
  const ethersNamespace =
    isRecord(ethersModule) && isRecord(ethersModule.ethers)
      ? ethersModule.ethers
      : ethersModule;
  if (
    typeof storageModule.MemData !== "function" ||
    typeof storageModule.Indexer !== "function" ||
    !isRecord(ethersNamespace) ||
    typeof ethersNamespace.JsonRpcProvider !== "function" ||
    typeof ethersNamespace.Wallet !== "function"
  ) {
    return invalidRuntime(operation);
  }
  return [
    storageModule as unknown as StorageSdkRuntime,
    ethersNamespace as unknown as EthersRuntime,
  ] as const;
}

function invalidRuntime(operation: "upload" | "download"): never {
  throw safeError(
    "SDK_UNAVAILABLE",
    "0G Storage server SDK is incompatible",
    operation,
    false,
  );
}

async function bytesFromBlob(value: unknown): Promise<Uint8Array> {
  if (
    typeof value !== "object" ||
    value === null ||
    !("arrayBuffer" in value) ||
    typeof value.arrayBuffer !== "function"
  ) {
    throw new TypeError("Invalid download blob");
  }
  const buffer = (await value.arrayBuffer()) as unknown;
  if (!(buffer instanceof ArrayBuffer)) {
    throw new TypeError("Invalid download buffer");
  }
  return new Uint8Array(buffer);
}

function assertServerRuntime(operation: "upload" | "download"): void {
  if (typeof window !== "undefined") {
    throw safeError(
      "SDK_UNAVAILABLE",
      "0G Storage signing is available only on the application server",
      operation,
      false,
    );
  }
}

function safeError(
  code: ConstructorParameters<typeof ZeroGStorageError>[0],
  message: string,
  operation: "upload" | "download",
  retryable: boolean,
): ZeroGStorageError {
  return new ZeroGStorageError(code, message, { operation, retryable });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
