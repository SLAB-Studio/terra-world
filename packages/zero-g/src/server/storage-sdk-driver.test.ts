import { describe, expect, it, vi } from "vitest";

import {
  createOfficialZeroGStorageDriver,
  type ZeroGStorageDriverContext,
} from "./index";

const ROOT = `0x${"11".repeat(32)}`;
const TX_HASH = `0x${"22".repeat(32)}`;
const CONTEXT: ZeroGStorageDriverContext = {
  chainId: 16602,
  chainRpcUrl: "https://evmrpc-testnet.0g.ai",
  indexerUrl: "https://indexer-storage-testnet-turbo.0g.ai",
  flowAddress: "0x22e03a6a89b950f1c82ec5e74f8eca321a105296",
  sponsorPrivateKey: `0x${"ab".repeat(32)}`,
};
const MAINNET_CONTEXT: ZeroGStorageDriverContext = {
  chainId: 16661,
  chainRpcUrl: "https://evmrpc.0g.ai",
  indexerUrl: "https://indexer-storage-turbo.0g.ai",
  flowAddress: "0x62d4144db0f0a6fbbaeb6296c785c71b3d57c526",
  sponsorPrivateKey: `0x${"ab".repeat(32)}`,
};

describe("official 0G Storage SDK driver", () => {
  it("fails safely before loading the SDK when upload signing is absent", async () => {
    const loadStorageSdk = vi.fn();
    const loadEthers = vi.fn();
    const driver = createOfficialZeroGStorageDriver({
      loadStorageSdk,
      loadEthers,
    });

    await expect(
      driver.uploadBytes(new Uint8Array([1]), {
        chainId: CONTEXT.chainId,
        chainRpcUrl: CONTEXT.chainRpcUrl,
        indexerUrl: CONTEXT.indexerUrl,
        flowAddress: CONTEXT.flowAddress,
      }),
    ).rejects.toMatchObject({
      code: "SIGNER_UNAVAILABLE",
      retryable: false,
    });
    expect(loadStorageSdk).not.toHaveBeenCalled();
    expect(loadEthers).not.toHaveBeenCalled();
  });

  it("builds the Merkle tree before a finality-aware sponsored upload and closes MemData", async () => {
    const calls: string[] = [];
    const close = vi.fn(async () => {
      calls.push("close");
    });
    const splitableUpload = vi.fn(async (_data, options) => {
      calls.push("upload");
      expect(options).toEqual({
        expectedReplica: 1,
        finalityRequired: true,
        skipIfFinalized: true,
      });
      return [
        { rootHashes: [ROOT], txHashes: [TX_HASH], txSeqs: [7] },
        null,
      ] as const;
    });
    class MemData {
      constructor(readonly value: Uint8Array) {
        calls.push("construct-data");
      }

      async merkleTree() {
        calls.push("merkle");
        return [{ rootHash: () => ROOT }, null] as const;
      }

      close = close;
    }
    class Indexer {
      constructor(indexerUrl: string) {
        calls.push("construct-indexer");
        expect(indexerUrl).toBe(CONTEXT.indexerUrl);
      }

      newUploaderFromIndexerNodes = vi.fn(
        async (chainRpcUrl, signer, expectedReplica) => {
          expect(chainRpcUrl).toBe(CONTEXT.chainRpcUrl);
          expect(expectedReplica).toBe(1);
          expect(signer).toMatchObject({
            privateKey: CONTEXT.sponsorPrivateKey,
            provider: { rpcUrl: CONTEXT.chainRpcUrl },
          });
          return [
            {
              flow: { target: CONTEXT.flowAddress },
              splitableUpload,
            },
            null,
          ] as const;
        },
      );
      downloadToBlob = vi.fn();
    }
    class JsonRpcProvider {
      readonly rpcUrl: string;
      constructor(rpcUrl: string) {
        this.rpcUrl = rpcUrl;
      }

      async getNetwork() {
        return { chainId: BigInt(CONTEXT.chainId) };
      }
    }
    class Wallet {
      constructor(
        readonly privateKey: string,
        readonly provider: JsonRpcProvider,
      ) {}
    }
    const storageModule = { MemData, Indexer };
    const driver = createOfficialZeroGStorageDriver({
      loadStorageSdk: async () => storageModule,
      loadEthers: async () => ({ ethers: { JsonRpcProvider, Wallet } }),
    });

    await expect(
      driver.uploadBytes(new TextEncoder().encode("ciphertext"), CONTEXT),
    ).resolves.toEqual({
      calculatedRootHash: ROOT,
      response: { rootHash: ROOT, txHash: TX_HASH, txSeq: 7 },
    });
    expect(calls.indexOf("merkle")).toBeLessThan(calls.indexOf("upload"));
    expect(calls.at(-1)).toBe("close");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("refuses to construct a signer when the RPC reports another chain", async () => {
    const newUploaderFromIndexerNodes = vi.fn();
    class MemData {
      async merkleTree() {
        return [{ rootHash: () => ROOT }, null] as const;
      }
      close = vi.fn();
    }
    class Indexer {
      newUploaderFromIndexerNodes = newUploaderFromIndexerNodes;
    }
    class JsonRpcProvider {
      async getNetwork() {
        return { chainId: 1n };
      }
    }
    class Wallet {
      constructor() {
        throw new Error("signer must not be constructed");
      }
    }
    const driver = createOfficialZeroGStorageDriver({
      loadStorageSdk: async () => ({ MemData, Indexer }),
      loadEthers: async () => ({ ethers: { JsonRpcProvider, Wallet } }),
    });

    await expect(
      driver.uploadBytes(new TextEncoder().encode("ciphertext"), CONTEXT),
    ).rejects.toMatchObject({
      code: "NETWORK_MISMATCH",
      retryable: false,
    });
    expect(newUploaderFromIndexerNodes).not.toHaveBeenCalled();
  });

  it("refuses to upload when the SDK selects another Flow contract", async () => {
    const splitableUpload = vi.fn();
    class MemData {
      async merkleTree() {
        return [{ rootHash: () => ROOT }, null] as const;
      }
      close = vi.fn();
    }
    class Indexer {
      newUploaderFromIndexerNodes = vi.fn(
        async () =>
          [
            {
              flow: { target: `0x${"33".repeat(20)}` },
              splitableUpload,
            },
            null,
          ] as const,
      );
    }
    const driver = createOfficialZeroGStorageDriver({
      loadStorageSdk: async () => ({ MemData, Indexer }),
      loadEthers: async () => runtimeEthers(CONTEXT.chainId),
    });

    await expect(
      driver.uploadBytes(new TextEncoder().encode("ciphertext"), CONTEXT),
    ).rejects.toMatchObject({
      code: "NETWORK_MISMATCH",
      retryable: false,
    });
    expect(splitableUpload).not.toHaveBeenCalled();
  });

  it("accepts the pinned 0G mainnet chain and Flow uploader", async () => {
    const splitableUpload = vi.fn(
      async () =>
        [
          { rootHashes: [ROOT], txHashes: [TX_HASH], txSeqs: [9] },
          null,
        ] as const,
    );
    class MemData {
      async merkleTree() {
        return [{ rootHash: () => ROOT }, null] as const;
      }
    }
    class Indexer {
      newUploaderFromIndexerNodes = vi.fn(
        async () =>
          [
            {
              flow: { target: MAINNET_CONTEXT.flowAddress },
              splitableUpload,
            },
            null,
          ] as const,
      );
    }
    const driver = createOfficialZeroGStorageDriver({
      loadStorageSdk: async () => ({ MemData, Indexer }),
      loadEthers: async () => runtimeEthers(MAINNET_CONTEXT.chainId),
    });

    await expect(
      driver.uploadBytes(
        new TextEncoder().encode("ciphertext"),
        MAINNET_CONTEXT,
      ),
    ).resolves.toEqual({
      calculatedRootHash: ROOT,
      response: { rootHash: ROOT, txHash: TX_HASH, txSeq: 9 },
    });
    expect(splitableUpload).toHaveBeenCalledTimes(1);
  });

  it("requests SDK proof verification for in-memory retrieval", async () => {
    const payload = new TextEncoder().encode("verified bytes");
    const downloadToBlob = vi.fn(async (rootHash, options) => {
      expect(rootHash).toBe(ROOT);
      expect(options).toEqual({ proof: true });
      return [new Blob([payload]), null] as const;
    });
    class Indexer {
      downloadToBlob = downloadToBlob;
    }
    const driver = createOfficialZeroGStorageDriver({
      loadStorageSdk: async () => ({ MemData: class {}, Indexer }),
      loadEthers: async () => runtimeEthers(),
    });

    await expect(driver.downloadBytes(ROOT, CONTEXT, 100)).resolves.toEqual({
      bytes: payload,
      rootHash: ROOT,
      proofVerified: true,
    });
    expect(downloadToBlob).toHaveBeenCalledTimes(1);
  });

  it("closes MemData and returns a safe error when Merkle preparation fails", async () => {
    const secret = "child-data-must-not-escape";
    const close = vi.fn();
    class MemData {
      async merkleTree() {
        return [null, new Error(secret)] as const;
      }
      close = close;
    }
    const driver = createOfficialZeroGStorageDriver({
      loadStorageSdk: async () => ({ MemData, Indexer: class {} }),
      loadEthers: async () => runtimeEthers(),
    });
    const rejection = driver.uploadBytes(
      new TextEncoder().encode(secret),
      CONTEXT,
    );

    await expect(rejection).rejects.toMatchObject({
      code: "MERKLE_FAILURE",
      message: "0G Storage could not prepare the upload Merkle tree",
    });
    await expect(rejection).rejects.not.toThrow(secret);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("does not expose the sponsor key when the SDK upload tuple fails", async () => {
    const close = vi.fn();
    class MemData {
      async merkleTree() {
        return [{ rootHash: () => ROOT }, null] as const;
      }
      close = close;
    }
    class Indexer {
      downloadToBlob = vi.fn();
      newUploaderFromIndexerNodes = vi.fn(
        async () =>
          [
            {
              flow: { target: CONTEXT.flowAddress },
              splitableUpload: vi.fn(
                async () =>
                  [
                    null,
                    new Error(`rejected signer ${CONTEXT.sponsorPrivateKey}`),
                  ] as const,
              ),
            },
            null,
          ] as const,
      );
    }
    const driver = createOfficialZeroGStorageDriver({
      loadStorageSdk: async () => ({ MemData, Indexer }),
      loadEthers: async () => runtimeEthers(),
    });
    const rejection = driver.uploadBytes(new Uint8Array([1, 2, 3]), CONTEXT);

    await expect(rejection).rejects.toMatchObject({
      code: "UPLOAD_FAILURE",
      message: "0G Storage upload failed",
    });
    await expect(rejection).rejects.not.toThrow(CONTEXT.sponsorPrivateKey);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("fails closed when proof-verified download reports an SDK error", async () => {
    const secret = "indexer-response-with-private-data";
    class Indexer {
      upload = vi.fn();
      downloadToBlob = vi.fn(async () => [null, new Error(secret)] as const);
    }
    const driver = createOfficialZeroGStorageDriver({
      loadStorageSdk: async () => ({ MemData: class {}, Indexer }),
      loadEthers: async () => runtimeEthers(),
    });
    const rejection = driver.downloadBytes(ROOT, CONTEXT, 100);

    await expect(rejection).rejects.toMatchObject({
      code: "PROOF_VERIFICATION_FAILED",
      operation: "download",
    });
    await expect(rejection).rejects.not.toThrow(secret);
  });

  it("enforces the download size boundary after proof verification", async () => {
    class Indexer {
      upload = vi.fn();
      downloadToBlob = vi.fn(
        async () => [new Blob([new Uint8Array(6)]), null] as const,
      );
    }
    const driver = createOfficialZeroGStorageDriver({
      loadStorageSdk: async () => ({ MemData: class {}, Indexer }),
      loadEthers: async () => runtimeEthers(),
    });

    await expect(driver.downloadBytes(ROOT, CONTEXT, 5)).rejects.toMatchObject({
      code: "DATA_TOO_LARGE",
      operation: "download",
    });
  });

  it("maps missing or incompatible SDK modules without exposing loader details", async () => {
    const secret = "module-path-with-server-secret";
    const missing = createOfficialZeroGStorageDriver({
      loadStorageSdk: async () => {
        throw new Error(secret);
      },
      loadEthers: async () => runtimeEthers(),
    });
    const incompatible = createOfficialZeroGStorageDriver({
      loadStorageSdk: async () => ({}),
      loadEthers: async () => runtimeEthers(),
    });

    const missingRejection = missing.downloadBytes(ROOT, CONTEXT, 100);
    await expect(missingRejection).rejects.toMatchObject({
      code: "SDK_UNAVAILABLE",
      operation: "download",
    });
    await expect(missingRejection).rejects.not.toThrow(secret);
    await expect(
      incompatible.uploadBytes(new Uint8Array([1]), CONTEXT),
    ).rejects.toMatchObject({ code: "SDK_UNAVAILABLE" });
  });

  it("fails closed when a loaded SDK instance lacks the pinned methods", async () => {
    class MemData {
      async merkleTree() {
        return [{ rootHash: () => ROOT }, null] as const;
      }
    }
    const incompatible = createOfficialZeroGStorageDriver({
      loadStorageSdk: async () => ({ MemData, Indexer: class {} }),
      loadEthers: async () => runtimeEthers(),
    });

    await expect(
      incompatible.uploadBytes(new Uint8Array([1]), CONTEXT),
    ).rejects.toMatchObject({
      code: "SDK_UNAVAILABLE",
      retryable: false,
    });
    await expect(
      incompatible.downloadBytes(ROOT, CONTEXT, 100),
    ).rejects.toMatchObject({
      code: "SDK_UNAVAILABLE",
      retryable: false,
    });
  });

  it("matches the pinned official SDK runtime surface", async () => {
    const sdk = await import("@0gfoundation/0g-storage-ts-sdk");
    const indexer = new sdk.Indexer(CONTEXT.indexerUrl);
    const data = new sdk.MemData(new Uint8Array([1]));

    expect(typeof indexer.newUploaderFromIndexerNodes).toBe("function");
    expect(typeof indexer.downloadToBlob).toBe("function");
    expect(typeof sdk.Uploader.prototype.splitableUpload).toBe("function");
    expect(typeof data.merkleTree).toBe("function");
  });
});

function runtimeEthers(chainId = CONTEXT.chainId) {
  return {
    JsonRpcProvider: class {
      async getNetwork() {
        return { chainId: BigInt(chainId) };
      }
    },
    Wallet: class {
      constructor(
        readonly privateKey?: string,
        readonly provider?: unknown,
      ) {}
    },
  };
}
