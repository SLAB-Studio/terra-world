import { createHash } from "node:crypto";

import { Interface, computeAddress } from "ethers";
import { describe, expect, it, vi } from "vitest";

import {
  AGENTIC_MILESTONE_MAINNET_TARGET,
  createAgenticMilestoneSynchronizer,
  type AgenticMilestoneChain,
  type AgenticMilestoneConfig,
  type AgenticMilestoneKeyCodec,
  type VerifiedCheckpointMilestone,
  type ZeroGStorageAdapter,
} from "./index";

const PRIVATE_KEY = `0x${"11".repeat(32)}` as const;
const OWNER = computeAddress(PRIVATE_KEY);
const OLD_ROOT =
  "0x6bec9714b20d3ac73545f3d383de14be75dd267ee5a93b2c31b4f3f48ac96abf" as const;
// Public on-chain bytes from the deployed registration's sole ECIES key entry.
const OLD_SEALED_KEY =
  "0x02038ece88abf325af6584266735c0892b4f9b910f0b6b36c7c22ded5fd9e664d46b39a7b364198a1cfd88236516d19be1fa7d53154b1c5283b986dc2d7c951a5c4cbe5ccf9424f0309f753cf76b59a1164a" as const;
const BLOCK_HASH = `0x${"44".repeat(32)}` as const;
const CHECKPOINT_ROOT = `0x${"55".repeat(32)}` as const;
const CHECKPOINT_TX = `0x${"66".repeat(32)}` as const;
const UPDATE_TX = `0x${"77".repeat(32)}` as const;
const URI_TX = `0x${"88".repeat(32)}` as const;
const DESCRIPTION = "Rivergate encrypted city intelligence v1 on 0G Storage";

const CONTRACT = new Interface([
  "function updateAt(uint256 tokenId,uint256 index,tuple(string dataDescription,bytes32 dataHash) newData,bytes sealedKey)",
  "function setAgentURI(uint256 agentId,string newURI)",
  "event EntryUpdated(uint256 indexed tokenId,uint256 indexed index,tuple(string dataDescription,bytes32 dataHash) oldData,tuple(string dataDescription,bytes32 dataHash) newData,bytes sealedKey)",
]);
const CANONICAL = new Interface([
  "event URIUpdated(uint256 indexed agentId,string newURI,address indexed updatedBy)",
]);

const CONFIG: AgenticMilestoneConfig = {
  ...AGENTIC_MILESTONE_MAINNET_TARGET,
  chainRpcUrl: "https://evmrpc.0g.ai",
  ownerPrivateKey: PRIVATE_KEY,
};

const CHECKPOINT: VerifiedCheckpointMilestone = {
  idempotencyKey: `checkpoint-v1-${"ab".repeat(32)}`,
  rootHash: CHECKPOINT_ROOT,
  contentHash: `sha256:${"cd".repeat(32)}`,
  byteLength: 4096,
  transactionHash: CHECKPOINT_TX,
  transactionSequence: 17,
  savedAt: 1_800_000_000_000,
};

describe("AgenticID milestone synchronizer", () => {
  it("pins the deployed updateAt and setAgentURI selectors", () => {
    const chain = new MemoryChain();
    expect(
      chain
        .encodeUpdateAt(
          { dataDescription: DESCRIPTION, dataHash: OLD_ROOT },
          OLD_SEALED_KEY,
        )
        .slice(0, 10),
    ).toBe("0xb4786f37");
    expect(chain.encodeSetAgentUri(cardUri(OLD_ROOT)).slice(0, 10)).toBe(
      "0x0af28bd3",
    );
  });

  it("updates data and Agent Card once, then reconciles an identical retry without duplicate updateAt", async () => {
    const storage = new MemoryStorage();
    const chain = new MemoryChain();
    const synchronizer = service(chain, storage);

    const first = await synchronizer.sync(CHECKPOINT);

    expect(first).toMatchObject({
      status: "updated",
      agentTokenId: "3531123",
      intelligentDataIndex: 0,
      updateAt: { transactionHash: UPDATE_TX, blockNumber: 101 },
      agentCard: { transactionHash: URI_TX, blockNumber: 102 },
    });
    expect(first.milestoneStorage).toMatchObject({
      rootHash: first.milestoneRoot,
      transactionSequence: 91,
    });
    expect(chain.updateCalls).toBe(1);
    expect(chain.uriCalls).toBe(1);
    expect(chain.updateGasLimits).toEqual([120_000n]);
    expect(chain.uriGasLimits).toEqual([60_000n]);
    expect(readCardRoot(chain.state.localTokenUri)).toBe(first.milestoneRoot);

    const second = await synchronizer.sync(CHECKPOINT);

    expect(second).toMatchObject({
      status: "already-current",
      milestoneRoot: first.milestoneRoot,
      updateAt: null,
      agentCard: null,
    });
    expect(chain.updateCalls).toBe(1);
    expect(chain.uriCalls).toBe(1);
    expect(storage.uploads).toHaveLength(2);
    expect(storage.uploads[1]).toEqual(storage.uploads[0]);
    expect(storage.retrievals.length).toBeGreaterThanOrEqual(3);
  });

  it("accepts the existing non-milestone registration data and sealed-key shape on first sync", async () => {
    const storage = new MemoryStorage();
    const chain = new MemoryChain();

    expect(chain.state.datas).toEqual([
      { dataDescription: DESCRIPTION, dataHash: OLD_ROOT },
    ]);
    expect(chain.state.sealedKeys).toHaveLength(1);
    expect((chain.state.sealedKeys[0]!.length - 2) / 2).toBe(82);

    await expect(
      service(chain, storage).sync(CHECKPOINT),
    ).resolves.toMatchObject({
      status: "updated",
      updateAt: { transactionHash: UPDATE_TX },
      agentCard: { transactionHash: URI_TX },
    });
  });

  it("derives byte-identical ciphertext and root for the same checkpoint across retries", async () => {
    const leftStorage = new MemoryStorage();
    const rightStorage = new MemoryStorage();

    const [left, right] = await Promise.all([
      service(new MemoryChain(), leftStorage).sync(CHECKPOINT),
      service(new MemoryChain(), rightStorage).sync(CHECKPOINT),
    ]);

    expect(left.milestoneRoot).toBe(right.milestoneRoot);
    expect(leftStorage.uploads[0]).toEqual(rightStorage.uploads[0]);
  });

  it("serializes concurrent retries through one signer queue", async () => {
    const storage = new MemoryStorage();
    const chain = new MemoryChain();
    const synchronizer = service(chain, storage);

    const results = await Promise.all([
      synchronizer.sync(CHECKPOINT),
      synchronizer.sync(CHECKPOINT),
    ]);

    expect(results.map((result) => result.status)).toEqual([
      "updated",
      "already-current",
    ]);
    expect(chain.updateCalls).toBe(1);
    expect(chain.uriCalls).toBe(1);
  });

  it("uses the official 0G ECIES wrapper and recovers its key on a retry", async () => {
    const storage = new MemoryStorage();
    const chain = new MemoryChain();
    const synchronizer = createAgenticMilestoneSynchronizer(CONFIG, {
      storage,
      chain,
    });

    const first = await synchronizer.sync(CHECKPOINT);
    const second = await synchronizer.sync(CHECKPOINT);

    expect(first.status).toBe("updated");
    expect(second.status).toBe("already-current");
    expect(chain.updateCalls).toBe(1);
  });

  it("reconciles only the Agent Card when intelligent data is already current", async () => {
    const storage = new MemoryStorage();
    const chain = new MemoryChain();
    const synchronizer = service(chain, storage);
    const first = await synchronizer.sync(CHECKPOINT);
    chain.setCardRoot(OLD_ROOT);

    const result = await synchronizer.sync(CHECKPOINT);

    expect(result.status).toBe("uri-reconciled");
    expect(result.updateAt).toBeNull();
    expect(result.agentCard?.transactionHash).toBe(URI_TX);
    expect(chain.updateCalls).toBe(1);
    expect(chain.uriCalls).toBe(2);
    expect(readCardRoot(chain.state.localTokenUri)).toBe(first.milestoneRoot);
  });

  it("rejects an older checkpoint before uploading or broadcasting", async () => {
    const storage = new MemoryStorage();
    const chain = new MemoryChain();
    const synchronizer = service(chain, storage);
    await synchronizer.sync(CHECKPOINT);
    const uploadsBefore = storage.uploads.length;

    await expect(
      synchronizer.sync({ ...CHECKPOINT, savedAt: CHECKPOINT.savedAt - 1 }),
    ).rejects.toMatchObject({ code: "STALE_CHECKPOINT", retryable: false });
    expect(storage.uploads).toHaveLength(uploadsBefore);
    expect(chain.updateCalls).toBe(1);
  });

  it("rejects two different checkpoints at the same savedAt", async () => {
    const storage = new MemoryStorage();
    const chain = new MemoryChain();
    const synchronizer = service(chain, storage);
    await synchronizer.sync(CHECKPOINT);

    await expect(
      synchronizer.sync({
        ...CHECKPOINT,
        idempotencyKey: `checkpoint-v1-${"ef".repeat(32)}`,
        rootHash: `0x${"99".repeat(32)}`,
        transactionHash: null,
      }),
    ).rejects.toMatchObject({ code: "CHECKPOINT_REVISION_CONFLICT" });
    expect(chain.updateCalls).toBe(1);
  });

  it("recovers and validates the existing sealed key before treating a root as current", async () => {
    const storage = new MemoryStorage();
    const chain = new MemoryChain();
    const synchronizer = service(chain, storage);
    await synchronizer.sync(CHECKPOINT);
    chain.state.sealedKeys = ["0x12"];

    await expect(synchronizer.sync(CHECKPOINT)).rejects.toMatchObject({
      code: "CURRENT_MILESTONE_INVALID",
    });
    expect(chain.updateCalls).toBe(1);
  });

  it("fails closed on owner drift before Storage or transaction work", async () => {
    const storage = new MemoryStorage();
    const chain = new MemoryChain();
    chain.state.localOwner = "0x0000000000000000000000000000000000000001";

    await expect(
      service(chain, storage).sync(CHECKPOINT),
    ).rejects.toMatchObject({
      code: "SIGNER_NOT_TOKEN_OWNER",
      retryable: false,
    });
    expect(storage.uploads).toHaveLength(0);
    expect(chain.updateCalls).toBe(0);
  });

  it("rejects a receipt without the exact proxy EntryUpdated event", async () => {
    const storage = new MemoryStorage();
    const chain = new MemoryChain();
    chain.omitUpdateEvent = true;

    await expect(
      service(chain, storage).sync(CHECKPOINT),
    ).rejects.toMatchObject({
      code: "UPDATE_TRANSACTION_FAILED",
      retryable: false,
    });
  });

  it.each([
    ["wrong emitting contract", "wrong-address"],
    ["wrong token id", "wrong-token"],
    ["wrong data index", "wrong-index"],
    ["wrong previous data", "wrong-old"],
  ])("rejects EntryUpdated with the %s", async (_label, mutation) => {
    const storage = new MemoryStorage();
    const chain = new MemoryChain();
    chain.updateEventMutation = mutation as MemoryChain["updateEventMutation"];

    await expect(
      service(chain, storage).sync(CHECKPOINT),
    ).rejects.toMatchObject({
      code: "UPDATE_TRANSACTION_FAILED",
      retryable: false,
    });
  });

  it("rejects URIUpdated unless the canonical registry reports the proxy as updater", async () => {
    const storage = new MemoryStorage();
    const chain = new MemoryChain();
    chain.wrongUriUpdater = true;

    await expect(
      service(chain, storage).sync(CHECKPOINT),
    ).rejects.toMatchObject({
      code: "URI_TRANSACTION_FAILED",
      retryable: false,
    });
  });

  it("rejects proof-retrieved bytes that differ from the uploaded artifact", async () => {
    const storage = new MemoryStorage();
    storage.corruptRetrieval = true;

    await expect(
      service(new MemoryChain(), storage).sync(CHECKPOINT),
    ).rejects.toMatchObject({
      code: "STORAGE_VERIFICATION_FAILED",
      retryable: false,
    });
  });

  it("does not permit callers to select a different token or index through config", () => {
    expect(() =>
      createAgenticMilestoneSynchronizer(
        { ...CONFIG, agentTokenId: 9n },
        {
          storage: new MemoryStorage(),
          chain: new MemoryChain(),
          keyCodec: KEY_CODEC,
        },
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONFIG" }));
    expect(() =>
      createAgenticMilestoneSynchronizer(
        { ...CONFIG, intelligentDataIndex: 1n },
        {
          storage: new MemoryStorage(),
          chain: new MemoryChain(),
          keyCodec: KEY_CODEC,
        },
      ),
    ).toThrowError(expect.objectContaining({ code: "INVALID_CONFIG" }));
  });
});

function service(chain: MemoryChain, storage: MemoryStorage) {
  return createAgenticMilestoneSynchronizer(CONFIG, {
    storage,
    chain,
    keyCodec: KEY_CODEC,
  });
}

const KEY_CODEC: AgenticMilestoneKeyCodec = {
  async wrap(dataKey) {
    const result = new Uint8Array(64);
    result.set(dataKey, 0);
    result.set(createHash("sha256").update(dataKey).digest(), 32);
    return result;
  },
  async unwrap(sealedKey) {
    if (sealedKey.byteLength !== 64) return new Uint8Array();
    const key = sealedKey.slice(0, 32);
    const expected = createHash("sha256").update(key).digest();
    if (!Buffer.from(sealedKey.slice(32)).equals(expected)) {
      return new Uint8Array();
    }
    return key;
  },
};

class MemoryStorage implements ZeroGStorageAdapter {
  readonly uploads: Uint8Array[] = [];
  readonly retrievals: string[] = [];
  readonly records = new Map<string, Uint8Array>();
  corruptRetrieval = false;

  readonly upload = vi.fn<ZeroGStorageAdapter["upload"]>(async (input) => {
    const bytes = Uint8Array.from(input.bytes);
    this.uploads.push(bytes);
    const rootHash =
      `0x${createHash("sha256").update(bytes).digest("hex")}` as const;
    const existed = this.records.has(rootHash);
    this.records.set(rootHash, bytes);
    return Object.freeze({
      kind: input.kind,
      rootHash,
      transactionHash: existed ? null : (`0x${"aa".repeat(32)}` as const),
      transactionSequence: 91,
      contentHash: contentHash(bytes),
      byteLength: bytes.byteLength,
    });
  });

  readonly retrieve = vi.fn<ZeroGStorageAdapter["retrieve"]>(async (input) => {
    this.retrievals.push(input.rootHash);
    const stored = this.records.get(input.rootHash);
    if (!stored) throw new Error("missing");
    const bytes = Uint8Array.from(stored);
    if (this.corruptRetrieval) bytes[0] = (bytes[0] ?? 0) ^ 0xff;
    return Object.freeze({
      bytes,
      rootHash: input.rootHash as `0x${string}`,
      contentHash: contentHash(stored),
      proofVerified: true as const,
    });
  });
}

class MemoryChain implements AgenticMilestoneChain {
  readonly signerAddress = OWNER;
  updateCalls = 0;
  uriCalls = 0;
  readonly updateGasLimits: bigint[] = [];
  readonly uriGasLimits: bigint[] = [];
  omitUpdateEvent = false;
  updateEventMutation:
    "none" | "wrong-address" | "wrong-token" | "wrong-index" | "wrong-old" =
    "none";
  wrongUriUpdater = false;
  state = {
    version: "1.1.0",
    canonical: AGENTIC_MILESTONE_MAINNET_TARGET.canonicalRegistry,
    paused: false,
    localOwner: OWNER,
    canonicalOwner: AGENTIC_MILESTONE_MAINNET_TARGET.agenticIdProxy,
    agentSeal: "0x0000000000000000000000000000000000000000",
    datas: [{ dataDescription: DESCRIPTION, dataHash: OLD_ROOT }] as Array<{
      dataDescription: string;
      dataHash: `0x${string}`;
    }>,
    sealedKeys: [OLD_SEALED_KEY] as string[],
    localTokenUri: cardUri(OLD_ROOT),
    canonicalTokenUri: cardUri(OLD_ROOT),
  };

  async getChainId() {
    return 16661;
  }

  async hasCode() {
    return true;
  }

  async readState() {
    return structuredClone(this.state) as Awaited<
      ReturnType<AgenticMilestoneChain["readState"]>
    >;
  }

  encodeUpdateAt(
    data: Readonly<{ dataDescription: string; dataHash: `0x${string}` }>,
    sealedKey: `0x${string}`,
  ) {
    return CONTRACT.encodeFunctionData("updateAt", [
      3_531_123n,
      0n,
      data,
      sealedKey,
    ]);
  }

  async simulateUpdateAt() {}

  async estimateUpdateAtGas() {
    return 100_000n;
  }

  async sendUpdateAt(
    data: Readonly<{ dataDescription: string; dataHash: `0x${string}` }>,
    sealedKey: `0x${string}`,
    gasLimit: bigint,
  ) {
    this.updateCalls += 1;
    this.updateGasLimits.push(gasLimit);
    const oldData = this.state.datas[0];
    if (!oldData) throw new Error("missing state");
    this.state.datas = [{ ...data }];
    this.state.sealedKeys = [sealedKey];
    const encoded = CONTRACT.encodeEventLog(
      CONTRACT.getEvent("EntryUpdated")!,
      [
        this.updateEventMutation === "wrong-token" ? 3_531_124n : 3_531_123n,
        this.updateEventMutation === "wrong-index" ? 1n : 0n,
        this.updateEventMutation === "wrong-old"
          ? { ...oldData, dataHash: `0x${"fe".repeat(32)}` }
          : oldData,
        data,
        sealedKey,
      ],
    );
    return submitted(
      UPDATE_TX,
      this.encodeUpdateAt(data, sealedKey),
      101,
      this.omitUpdateEvent
        ? []
        : [
            {
              address:
                this.updateEventMutation === "wrong-address"
                  ? AGENTIC_MILESTONE_MAINNET_TARGET.canonicalRegistry
                  : AGENTIC_MILESTONE_MAINNET_TARGET.agenticIdProxy,
              topics: encoded.topics,
              data: encoded.data,
            },
          ],
    );
  }

  encodeSetAgentUri(uri: string) {
    return CONTRACT.encodeFunctionData("setAgentURI", [3_531_123n, uri]);
  }

  async simulateSetAgentUri() {}

  async estimateSetAgentUriGas() {
    return 50_000n;
  }

  async sendSetAgentUri(uri: string, gasLimit: bigint) {
    this.uriCalls += 1;
    this.uriGasLimits.push(gasLimit);
    this.state.localTokenUri = uri;
    this.state.canonicalTokenUri = uri;
    const encoded = CANONICAL.encodeEventLog(
      CANONICAL.getEvent("URIUpdated")!,
      [
        3_531_123n,
        uri,
        this.wrongUriUpdater
          ? OWNER
          : AGENTIC_MILESTONE_MAINNET_TARGET.agenticIdProxy,
      ],
    );
    return submitted(URI_TX, this.encodeSetAgentUri(uri), 102, [
      {
        address: AGENTIC_MILESTONE_MAINNET_TARGET.canonicalRegistry,
        topics: encoded.topics,
        data: encoded.data,
      },
    ]);
  }

  setCardRoot(root: `0x${string}`) {
    this.state.localTokenUri = cardUri(root);
    this.state.canonicalTokenUri = cardUri(root);
  }
}

function submitted(
  hash: `0x${string}`,
  data: string,
  blockNumber: number,
  logs: readonly Readonly<{
    address: string;
    topics: readonly string[];
    data: string;
  }>[],
) {
  return Object.freeze({
    transaction: Object.freeze({
      hash,
      from: OWNER,
      to: AGENTIC_MILESTONE_MAINNET_TARGET.agenticIdProxy,
      data,
      value: 0n,
    }),
    receipt: Object.freeze({
      hash,
      status: 1,
      blockNumber,
      blockHash: BLOCK_HASH,
      from: OWNER,
      to: AGENTIC_MILESTONE_MAINNET_TARGET.agenticIdProxy,
      logs,
    }),
  });
}

function cardUri(root: `0x${string}`): string {
  const card = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "Rivergate City Steward",
    active: true,
    registrations: [
      {
        agentId: 3_531_123,
        agentRegistry: `eip155:16661:${AGENTIC_MILESTONE_MAINNET_TARGET.canonicalRegistry}`,
      },
    ],
    properties: {
      agenticIdProxy: AGENTIC_MILESTONE_MAINNET_TARGET.agenticIdProxy,
      intelligentDataRoot: root,
      sealMode: "none",
    },
  };
  return `data:application/json;base64,${Buffer.from(JSON.stringify(card)).toString("base64")}`;
}

function readCardRoot(uri: string): string {
  const value = JSON.parse(
    Buffer.from(
      uri.slice("data:application/json;base64,".length),
      "base64",
    ).toString("utf8"),
  ) as { properties: { intelligentDataRoot: string } };
  return value.properties.intelligentDataRoot;
}

function contentHash(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
