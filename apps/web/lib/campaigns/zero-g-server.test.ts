import { createHash } from "node:crypto";

import {
  RIVERGATE_CAMPAIGN_V1_HASH,
  createCampaignState,
  createInitialCityState,
  serializeRivergateCampaignPackage,
} from "@terra/simulation";
import { describe, expect, it, vi } from "vitest";

import type { ZeroGServerConfig } from "../../../../packages/zero-g/src/server/config";
import {
  createZeroGStorageAdapter,
  type ZeroGStorageDriver,
} from "../../../../packages/zero-g/src/server/storage";

import {
  RivergateCampaignStorageError,
  createRivergateCampaignStorageCommand,
  type RivergateCampaignReference,
} from "./zero-g-server";

const TRANSACTION_HASH = `0x${"33".repeat(32)}` as const;
const SERVER_SECRET = `0x${"12".repeat(32)}` as const;
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
  storage: {
    indexerUrl: "https://indexer-storage-testnet-turbo.0g.ai",
  },
  sponsorPrivateKey: SERVER_SECRET,
  request: { timeoutMs: 1_000, maxRetries: 0 },
};

describe("Rivergate campaign 0G Storage command", () => {
  it("publishes canonical v1 and proof-verifies it through a fresh reader", async () => {
    const network = createMemoryStorageNetwork();
    const publisher = createZeroGStorageAdapter(CONFIG, {
      driver: network.createDriver(),
    });
    // This is intentionally a new adapter and driver, like a fresh process.
    const freshReader = createZeroGStorageAdapter(CONFIG, {
      driver: network.createDriver(),
    });
    const command = createRivergateCampaignStorageCommand({
      publisher,
      freshReader,
    });

    const result = await command.publishAndVerify();
    const loaded = result.retrieval.campaignPackage;
    const city = createInitialCityState(loaded.map, {
      cityId: "fresh-storage-client",
      campaignId: loaded.campaign.id,
      campaignVersion: loaded.campaign.version,
      budget: loaded.campaign.initialBudget,
    });
    const progress = createCampaignState(loaded.campaign, city);

    expect(result.publication.reference).toMatchObject({
      schemaVersion: 1,
      packageId: "rivergate-campaign-v1",
      packageVersion: 1,
      packageHash: RIVERGATE_CAMPAIGN_V1_HASH,
      byteLength: bytes(serializeRivergateCampaignPackage()).byteLength,
    });
    expect(result.publication.transactionHash).toBe(TRANSACTION_HASH);
    expect(result.retrieval).toMatchObject({
      proofVerified: true,
      reference: result.publication.reference,
    });
    expect(loaded.campaign.chapters).toHaveLength(5);
    expect(
      loaded.campaign.chapters.flatMap((chapter) => chapter.missions),
    ).toHaveLength(15);
    expect(progress).toMatchObject({
      phase: "active",
      chapterId: "chapter-1-water",
      missionId: "find-the-water",
    });
    expect(network.uploads).toBe(1);
    expect(network.downloads).toBe(1);
    expect(JSON.stringify(result)).not.toContain(SERVER_SECRET);
    expect(JSON.stringify(result)).not.toContain("sk-server-only-secret");
  });

  it("fails closed when bytes are modified after publication", async () => {
    const network = createMemoryStorageNetwork();
    const command = createCommand(network);
    const publication = await command.publish();
    network.put(
      publication.reference.rootHash,
      bytes("modified campaign bytes with private-child-data"),
    );

    await expect(command.retrieve(publication.reference)).rejects.toMatchObject(
      {
        name: "RivergateCampaignStorageError",
        code: "INTEGRITY_MISMATCH",
        retryable: false,
      },
    );
    await expect(command.retrieve(publication.reference)).rejects.not.toThrow(
      /private-child-data/u,
    );
  });

  it("rejects noncanonical bytes even when their parsed package is valid", async () => {
    const network = createMemoryStorageNetwork();
    const command = createCommand(network);
    const publication = await command.publish();
    const parsed = JSON.parse(serializeRivergateCampaignPackage()) as Record<
      string,
      unknown
    >;
    const reversed = Object.fromEntries(Object.entries(parsed).reverse());
    const noncanonicalBytes = bytes(JSON.stringify(reversed));
    expect(noncanonicalBytes.byteLength).toBe(publication.reference.byteLength);
    const rootHash = hash32(noncanonicalBytes);
    network.put(rootHash, noncanonicalBytes);
    const reference: RivergateCampaignReference = {
      ...publication.reference,
      rootHash,
      contentHash: contentHash(noncanonicalBytes),
    };

    await expect(command.retrieve(reference)).rejects.toMatchObject({
      code: "INTEGRITY_MISMATCH",
    });
  });

  it("rejects forged or secret-bearing references before any download", async () => {
    const network = createMemoryStorageNetwork();
    const command = createCommand(network);
    const publication = await command.publish();
    const before = network.downloads;

    for (const reference of [
      { ...publication.reference, packageHash: "forged-package" },
      { ...publication.reference, childName: "Ari" },
      { ...publication.reference, rootHash: "0x1234" },
    ]) {
      await expect(command.retrieve(reference)).rejects.toMatchObject({
        code: "INVALID_REFERENCE",
      });
    }
    expect(network.downloads).toBe(before);
  });

  it("maps SDK failures to retryable typed errors without leaking content", async () => {
    const secret = "sk-live-secret and child checkpoint text";
    const publisher = createZeroGStorageAdapter(CONFIG, {
      driver: {
        uploadBytes: vi.fn(async () => {
          throw new Error(secret);
        }),
        downloadBytes: vi.fn(),
      },
    });
    const command = createRivergateCampaignStorageCommand({
      publisher,
      freshReader: publisher,
    });

    const rejection = command.publish();
    await expect(rejection).rejects.toEqual(
      expect.objectContaining({
        name: "RivergateCampaignStorageError",
        code: "PUBLICATION_FAILED",
        retryable: true,
      }),
    );
    await expect(rejection).rejects.not.toThrow(secret);
  });

  it("uses a dedicated safe error type", () => {
    const error = new RivergateCampaignStorageError(
      "INVALID_REFERENCE",
      "Reference rejected",
    );
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: "RivergateCampaignStorageError",
      retryable: false,
    });
  });
});

function createCommand(network: ReturnType<typeof createMemoryStorageNetwork>) {
  return createRivergateCampaignStorageCommand({
    publisher: createZeroGStorageAdapter(CONFIG, {
      driver: network.createDriver(),
    }),
    freshReader: createZeroGStorageAdapter(CONFIG, {
      driver: network.createDriver(),
    }),
  });
}

function createMemoryStorageNetwork() {
  const stored = new Map<string, Uint8Array>();
  const state = { uploads: 0, downloads: 0 };

  return {
    get uploads() {
      return state.uploads;
    },
    get downloads() {
      return state.downloads;
    },
    put(rootHash: string, value: Uint8Array) {
      stored.set(rootHash, Uint8Array.from(value));
    },
    createDriver(): ZeroGStorageDriver {
      return {
        async uploadBytes(uploaded, context) {
          expect(context.sponsorPrivateKey).toBe(SERVER_SECRET);
          state.uploads += 1;
          const rootHash = hash32(uploaded);
          stored.set(rootHash, Uint8Array.from(uploaded));
          return {
            calculatedRootHash: rootHash,
            response: { rootHash, txHash: TRANSACTION_HASH },
          };
        },
        async downloadBytes(rootHash, context) {
          expect(context.sponsorPrivateKey).toBe(SERVER_SECRET);
          state.downloads += 1;
          const storedBytes = stored.get(rootHash);
          if (storedBytes === undefined) throw new Error("not found");
          return {
            bytes: Uint8Array.from(storedBytes),
            rootHash,
            proofVerified: true,
          };
        },
      };
    },
  };
}

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function hash32(value: Uint8Array): `0x${string}` {
  return `0x${createHash("sha256").update(value).digest("hex")}`;
}

function contentHash(value: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
