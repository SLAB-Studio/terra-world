import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { ZeroGServerConfig } from "./config";
import { createZeroGStorageAdapter, type ZeroGStorageDriver } from "./index";

const ROOT = `0x${"11".repeat(32)}`;
const OTHER_ROOT = `0x${"22".repeat(32)}`;
const TX_HASH = `0x${"33".repeat(32)}`;
const CANONICAL_CAMPAIGN = bytes('{"a":1,"b":2}');
const PACKAGE_HASH = "1929be31c58172ed";

const CONFIG: ZeroGServerConfig = {
  network: "testnet",
  chainId: 16602,
  chainRpcUrl: "https://evmrpc-testnet.0g.ai",
  chainExplorerUrl: "https://chainscan-galileo.0g.ai",
  compute: {
    baseUrl: "https://router-api-testnet.integratenetwork.work/v1",
    apiKey: "sk-server-only-secret",
    model: "private-model",
    trustMode: "private",
    verifyTee: true,
  },
  storage: { indexerUrl: "https://indexer.testnet.example" },
  sponsorPrivateKey: `0x${"12".repeat(32)}`,
  request: { timeoutMs: 1_000, maxRetries: 0 },
};

describe("0G Storage adapter", () => {
  it("uploads copied canonical campaign bytes with a sponsored server context", async () => {
    const original = Uint8Array.from(CANONICAL_CAMPAIGN);
    const uploadBytes = vi.fn<ZeroGStorageDriver["uploadBytes"]>(
      async (uploaded, context) => {
        expect(uploaded).toEqual(CANONICAL_CAMPAIGN);
        expect(uploaded).not.toBe(original);
        expect(context).toEqual({
          chainRpcUrl: CONFIG.chainRpcUrl,
          indexerUrl: CONFIG.storage.indexerUrl,
          sponsorPrivateKey: CONFIG.sponsorPrivateKey,
        });
        return {
          calculatedRootHash: ROOT.toUpperCase().replace("0X", "0x"),
          response: { rootHash: ROOT, txHash: TX_HASH },
        };
      },
    );
    const adapter = createZeroGStorageAdapter(CONFIG, {
      driver: driver({ uploadBytes }),
    });

    const result = await adapter.upload({
      kind: "campaign-package",
      bytes: original,
    });

    expect(result).toEqual({
      kind: "campaign-package",
      rootHash: ROOT,
      transactionHash: TX_HASH,
      contentHash: hash(CANONICAL_CAMPAIGN),
      byteLength: CANONICAL_CAMPAIGN.byteLength,
    });
    expect(uploadBytes).toHaveBeenCalledTimes(1);
  });

  it("accepts an opaque encrypted checkpoint without parsing ciphertext", async () => {
    const checkpointCiphertext = bytes("opaque-aes-gcm-envelope-bytes");
    const uploadBytes = vi.fn<ZeroGStorageDriver["uploadBytes"]>(async () => ({
      calculatedRootHash: ROOT,
      response: { rootHash: ROOT, txHash: TX_HASH },
    }));
    const adapter = createZeroGStorageAdapter(CONFIG, {
      driver: driver({ uploadBytes }),
    });

    await expect(
      adapter.upload({
        kind: "encrypted-checkpoint-envelope",
        bytes: checkpointCiphertext,
      }),
    ).resolves.toMatchObject({ contentHash: hash(checkpointCiphertext) });
  });

  it.each([
    ["whitespace", bytes('{"a":1, "b":2}')],
    ["unsorted keys", bytes('{"b":2,"a":1}')],
    ["invalid JSON", bytes("not-json")],
  ])(
    "rejects %s campaign bytes before calling the driver",
    async (_name, value) => {
      const uploadBytes = vi.fn<ZeroGStorageDriver["uploadBytes"]>();
      const adapter = createZeroGStorageAdapter(CONFIG, {
        driver: driver({ uploadBytes }),
      });

      await expect(
        adapter.upload({ kind: "campaign-package", bytes: value }),
      ).rejects.toMatchObject({ code: "INVALID_DATA", retryable: false });
      expect(uploadBytes).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      rootHashes: [ROOT],
      txHashes: [TX_HASH],
    },
    { rootHash: ROOT, txHash: TX_HASH, extra: "unexpected" },
    { rootHash: ROOT },
  ])(
    "rejects fragmented or unexpected MVP upload responses",
    async (response) => {
      const adapter = createZeroGStorageAdapter(CONFIG, {
        driver: driver({
          uploadBytes: async () => ({
            calculatedRootHash: ROOT,
            response,
          }),
        }),
      });

      await expect(
        adapter.upload({
          kind: "encrypted-checkpoint-envelope",
          bytes: bytes("ciphertext"),
        }),
      ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    },
  );

  it("rejects an upload root that differs from the precomputed Merkle root", async () => {
    const adapter = createZeroGStorageAdapter(CONFIG, {
      driver: driver({
        uploadBytes: async () => ({
          calculatedRootHash: ROOT,
          response: { rootHash: OTHER_ROOT, txHash: TX_HASH },
        }),
      }),
    });

    await expect(
      adapter.upload({
        kind: "encrypted-checkpoint-envelope",
        bytes: bytes("ciphertext"),
      }),
    ).rejects.toMatchObject({ code: "INTEGRITY_MISMATCH" });
  });

  it("retrieves proof-verified bytes and validates the application package hash", async () => {
    const downloadBytes = vi.fn<ZeroGStorageDriver["downloadBytes"]>(
      async (rootHash, context, maximumBytes) => {
        expect(rootHash).toBe(ROOT);
        expect(context.sponsorPrivateKey).toBe(CONFIG.sponsorPrivateKey);
        expect(maximumBytes).toBe(100);
        return {
          rootHash: ROOT,
          bytes: CANONICAL_CAMPAIGN,
          proofVerified: true,
        };
      },
    );
    const inspectPackageHash = vi.fn(() => PACKAGE_HASH);
    const adapter = createZeroGStorageAdapter(CONFIG, {
      driver: driver({ downloadBytes }),
      maximumDownloadBytes: 100,
    });

    const result = await adapter.retrieve({
      rootHash: ROOT,
      expectedContentHash: hash(CANONICAL_CAMPAIGN),
      campaign: {
        expectedPackageHash: PACKAGE_HASH,
        inspectPackageHash,
      },
    });

    expect(result).toMatchObject({
      bytes: CANONICAL_CAMPAIGN,
      rootHash: ROOT,
      contentHash: hash(CANONICAL_CAMPAIGN),
      proofVerified: true,
      packageHash: PACKAGE_HASH,
    });
    expect(result.bytes).not.toBe(CANONICAL_CAMPAIGN);
    expect(inspectPackageHash).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      "unverified proof",
      { rootHash: ROOT, bytes: CANONICAL_CAMPAIGN, proofVerified: false },
      "PROOF_VERIFICATION_FAILED",
    ],
    [
      "wrong root",
      { rootHash: OTHER_ROOT, bytes: CANONICAL_CAMPAIGN, proofVerified: true },
      "INTEGRITY_MISMATCH",
    ],
    [
      "modified bytes",
      { rootHash: ROOT, bytes: bytes("tampered"), proofVerified: true },
      "INTEGRITY_MISMATCH",
    ],
  ] as const)("rejects a retrieval with %s", async (_name, result, code) => {
    const adapter = createZeroGStorageAdapter(CONFIG, {
      driver: driver({ downloadBytes: async () => result }),
    });

    await expect(
      adapter.retrieve({
        rootHash: ROOT,
        expectedContentHash: hash(CANONICAL_CAMPAIGN),
      }),
    ).rejects.toMatchObject({ code });
  });

  it("rejects a package that fails schema inspection or its trust-anchor hash", async () => {
    const adapter = createZeroGStorageAdapter(CONFIG, {
      driver: driver({
        downloadBytes: async () => ({
          rootHash: ROOT,
          bytes: CANONICAL_CAMPAIGN,
          proofVerified: true,
        }),
      }),
    });
    const baseInput = {
      rootHash: ROOT,
      expectedContentHash: hash(CANONICAL_CAMPAIGN),
    };

    await expect(
      adapter.retrieve({
        ...baseInput,
        campaign: {
          expectedPackageHash: PACKAGE_HASH,
          inspectPackageHash: () => "different-package",
        },
      }),
    ).rejects.toMatchObject({ code: "INTEGRITY_MISMATCH" });
    await expect(
      adapter.retrieve({
        ...baseInput,
        campaign: {
          expectedPackageHash: PACKAGE_HASH,
          inspectPackageHash: () => {
            throw new Error("schema included private child text");
          },
        },
      }),
    ).rejects.not.toThrow(/private child text/u);
  });

  it("enforces upload and download size limits", async () => {
    const uploadBytes = vi.fn<ZeroGStorageDriver["uploadBytes"]>();
    const adapter = createZeroGStorageAdapter(CONFIG, {
      driver: driver({
        uploadBytes,
        downloadBytes: async () => ({
          rootHash: ROOT,
          bytes: bytes("123456"),
          proofVerified: true,
        }),
      }),
      maximumUploadBytes: 5,
      maximumDownloadBytes: 5,
    });

    await expect(
      adapter.upload({
        kind: "encrypted-checkpoint-envelope",
        bytes: bytes("123456"),
      }),
    ).rejects.toMatchObject({ code: "DATA_TOO_LARGE" });
    expect(uploadBytes).not.toHaveBeenCalled();
    await expect(
      adapter.retrieve({
        rootHash: ROOT,
        expectedContentHash: hash(bytes("123456")),
      }),
    ).rejects.toMatchObject({ code: "DATA_TOO_LARGE" });
  });

  it("times out stalled SDK operations with a safe typed error", async () => {
    vi.useFakeTimers();
    try {
      const adapter = createZeroGStorageAdapter(
        { ...CONFIG, request: { ...CONFIG.request, timeoutMs: 25 } },
        {
          driver: driver({
            uploadBytes: () => new Promise(() => undefined),
          }),
        },
      );
      const pending = adapter.upload({
        kind: "encrypted-checkpoint-envelope",
        bytes: bytes("ciphertext"),
      });
      const rejection = expect(pending).rejects.toMatchObject({
        code: "TIMEOUT",
        operation: "upload",
        retryable: true,
      });
      await vi.advanceTimersByTimeAsync(25);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it("maps driver failures without including secrets or stored data", async () => {
    const secret = "private-child-checkpoint-and-key";
    const adapter = createZeroGStorageAdapter(CONFIG, {
      driver: driver({
        uploadBytes: async () => {
          throw new Error(secret);
        },
      }),
    });

    const rejection = adapter.upload({
      kind: "encrypted-checkpoint-envelope",
      bytes: bytes(secret),
    });
    await expect(rejection).rejects.toMatchObject({
      code: "UPLOAD_FAILURE",
      message: "0G Storage upload failed",
    });
    await expect(rejection).rejects.not.toThrow(secret);
  });
});

function driver(
  overrides: Partial<ZeroGStorageDriver> = {},
): ZeroGStorageDriver {
  return {
    uploadBytes:
      overrides.uploadBytes ??
      (async () => ({
        calculatedRootHash: ROOT,
        response: { rootHash: ROOT, txHash: TX_HASH },
      })),
    downloadBytes:
      overrides.downloadBytes ??
      (async () => ({
        rootHash: ROOT,
        bytes: CANONICAL_CAMPAIGN,
        proofVerified: true,
      })),
  };
}

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function hash(value: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
