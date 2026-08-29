import { describe, expect, it, vi } from "vitest";

import {
  createOfficialZeroGStorageDriver,
  type ZeroGStorageDriverContext,
} from "./index";

const ROOT = `0x${"11".repeat(32)}`;
const TX_HASH = `0x${"22".repeat(32)}`;
const CONTEXT: ZeroGStorageDriverContext = {
  chainRpcUrl: "https://evmrpc-testnet.0g.ai",
  indexerUrl: "https://indexer-storage-testnet-turbo.0g.ai",
  sponsorPrivateKey: `0x${"ab".repeat(32)}`,
};

describe("official 0G Storage SDK driver", () => {
  it("builds the Merkle tree before sponsored Indexer.upload and closes MemData", async () => {
    const calls: string[] = [];
    const close = vi.fn(async () => {
      calls.push("close");
    });
    const upload = vi.fn(async (_data, chainRpcUrl, signer) => {
      calls.push("upload");
      expect(chainRpcUrl).toBe(CONTEXT.chainRpcUrl);
      expect(signer).toMatchObject({
        privateKey: CONTEXT.sponsorPrivateKey,
        provider: { rpcUrl: CONTEXT.chainRpcUrl },
      });
      return [{ rootHash: ROOT, txHash: TX_HASH }, null] as const;
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

      upload = upload;
      downloadToBlob = vi.fn();
    }
    class JsonRpcProvider {
      readonly rpcUrl: string;
      constructor(rpcUrl: string) {
        this.rpcUrl = rpcUrl;
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
      response: { rootHash: ROOT, txHash: TX_HASH },
    });
    expect(calls.indexOf("merkle")).toBeLessThan(calls.indexOf("upload"));
    expect(calls.at(-1)).toBe("close");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("requests SDK proof verification for in-memory retrieval", async () => {
    const payload = new TextEncoder().encode("verified bytes");
    const downloadToBlob = vi.fn(async (rootHash, options) => {
      expect(rootHash).toBe(ROOT);
      expect(options).toEqual({ proof: true });
      return [new Blob([payload]), null] as const;
    });
    class Indexer {
      upload = vi.fn();
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
      upload = vi.fn(
        async () =>
          [
            null,
            new Error(`rejected signer ${CONTEXT.sponsorPrivateKey}`),
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
});

function runtimeEthers() {
  return {
    JsonRpcProvider: class {},
    Wallet: class {},
  };
}
