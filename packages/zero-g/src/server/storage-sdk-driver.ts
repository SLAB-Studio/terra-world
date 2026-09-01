import {
  ZeroGStorageError,
  type ZeroGStorageDriver,
  type ZeroGStorageDriverContext,
  type ZeroGStorageDriverDownloadResult,
  type ZeroGStorageDriverUploadResult,
} from "./storage";

const HASH_32_BYTES = /^0x[0-9a-fA-F]{64}$/u;

type MerkleTreeLike = Readonly<{ rootHash(): unknown }>;
type MemDataLike = Readonly<{
  merkleTree(): Promise<readonly [MerkleTreeLike | null, unknown]>;
  close?: () => void | Promise<void>;
}>;
type FlowContractLike = Readonly<{ target: unknown }>;
type UploaderLike = Readonly<{
  flow: FlowContractLike;
  splitableUpload(
    data: MemDataLike,
    options: Readonly<{
      expectedReplica: 1;
      finalityRequired: true;
      skipIfFinalized: true;
    }>,
  ): Promise<readonly [unknown, unknown]>;
}>;
type IndexerLike = Readonly<{
  newUploaderFromIndexerNodes(
    chainRpcUrl: string,
    signer: unknown,
    expectedReplica: 1,
  ): Promise<readonly [UploaderLike | null, unknown]>;
  downloadToBlob(
    rootHash: string,
    options: Readonly<{ proof: true }>,
  ): Promise<readonly [unknown, unknown]>;
}>;
type ProviderLike = Readonly<{
  getNetwork(): Promise<Readonly<{ chainId: bigint | number }>>;
}>;

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
    (() => import("@0gfoundation/0g-storage-ts-sdk"));
  const loadEthers = dependencies.loadEthers ?? (() => import("ethers"));

  return Object.freeze({
    async uploadBytes(
      bytes: Uint8Array,
      context: ZeroGStorageDriverContext,
    ): Promise<ZeroGStorageDriverUploadResult> {
      assertServerRuntime("upload");
      if (!context.sponsorPrivateKey) {
        throw safeError(
          "SIGNER_UNAVAILABLE",
          "0G Storage upload requires a server-side sponsor signer",
          "upload",
          false,
        );
      }
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
        const providerNetwork = await provider.getNetwork();
        if (Number(providerNetwork.chainId) !== context.chainId) {
          throw safeError(
            "NETWORK_MISMATCH",
            "0G Storage RPC returned an unexpected chain",
            "upload",
            false,
          );
        }
        const signer = new ethers.Wallet(context.sponsorPrivateKey, provider);
        const indexer = new storageSdk.Indexer(context.indexerUrl);
        if (
          !isRecord(indexer) ||
          typeof indexer.newUploaderFromIndexerNodes !== "function"
        ) {
          throw incompatibleSdk("upload");
        }
        const [uploader, uploaderError] =
          await indexer.newUploaderFromIndexerNodes(
            context.chainRpcUrl,
            signer,
            1,
          );
        if (uploaderError !== null || uploader === null) {
          throw safeError(
            "UPLOAD_FAILURE",
            "0G Storage could not prepare the official uploader",
            "upload",
            true,
          );
        }
        if (
          !isRecord(uploader) ||
          !isRecord(uploader.flow) ||
          typeof uploader.splitableUpload !== "function"
        ) {
          throw incompatibleSdk("upload");
        }
        const selectedFlowAddress = uploader.flow.target;
        if (
          typeof selectedFlowAddress !== "string" ||
          selectedFlowAddress.toLowerCase() !==
            context.flowAddress.toLowerCase()
        ) {
          throw safeError(
            "NETWORK_MISMATCH",
            "0G Storage selected an unexpected Flow contract",
            "upload",
            false,
          );
        }
        const [fragmentResponse, uploadError] = await uploader.splitableUpload(
          data,
          {
            expectedReplica: 1,
            finalityRequired: true,
            skipIfFinalized: true,
          },
        );
        if (uploadError !== null) {
          throw safeError(
            "UPLOAD_FAILURE",
            "0G Storage upload failed",
            "upload",
            true,
          );
        }
        const response = singleUploadResponse(fragmentResponse);
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
        if (
          !isRecord(indexer) ||
          typeof indexer.downloadToBlob !== "function"
        ) {
          throw incompatibleSdk("download");
        }
        const [blob, downloadError] = await indexer.downloadToBlob(rootHash, {
          proof: true,
        });
        if (downloadError !== null) {
          throw safeError(
            "PROOF_VERIFICATION_FAILED",
            "0G Storage download could not be verified",
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
        await verifyDownloadedRoot(storageSdk, bytes, rootHash);
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

async function verifyDownloadedRoot(
  storageSdk: StorageSdkRuntime,
  bytes: Uint8Array,
  requestedRoot: string,
): Promise<void> {
  let data: MemDataLike | undefined;
  try {
    if (bytes.byteLength === 0 || !HASH_32_BYTES.test(requestedRoot)) {
      throw proofVerificationError();
    }
    data = new storageSdk.MemData(Uint8Array.from(bytes));
    const [tree, treeError] = await data.merkleTree();
    const calculatedRoot = tree?.rootHash();
    if (
      treeError !== null ||
      typeof calculatedRoot !== "string" ||
      !HASH_32_BYTES.test(calculatedRoot) ||
      calculatedRoot.toLowerCase() !== requestedRoot.toLowerCase()
    ) {
      throw proofVerificationError();
    }
  } catch (error) {
    if (error instanceof ZeroGStorageError) throw error;
    throw proofVerificationError();
  } finally {
    try {
      await data?.close?.();
    } catch {
      // Verification is complete and no persistent resource is returned.
    }
  }
}

function proofVerificationError(): ZeroGStorageError {
  return safeError(
    "PROOF_VERIFICATION_FAILED",
    "0G Storage downloaded bytes do not match the requested Merkle root",
    "download",
    false,
  );
}

function singleUploadResponse(response: unknown): unknown {
  if (
    !isRecord(response) ||
    !Array.isArray(response.rootHashes) ||
    !Array.isArray(response.txHashes) ||
    !Array.isArray(response.txSeqs) ||
    response.rootHashes.length !== 1 ||
    response.txHashes.length !== 1 ||
    response.txSeqs.length !== 1
  ) {
    return response;
  }
  return Object.freeze({
    rootHash: response.rootHashes[0],
    txHash: response.txHashes[0],
    txSeq: response.txSeqs[0],
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
  throw incompatibleSdk(operation);
}

function incompatibleSdk(operation: "upload" | "download"): never {
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
