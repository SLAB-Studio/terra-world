import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import {
  Contract,
  Interface,
  JsonRpcProvider,
  SigningKey,
  Wallet,
  computeAddress,
  getAddress,
} from "ethers";
import {
  MemData,
  decryptFile,
  deriveEciesDecryptKey,
  newEciesEncryptedFile,
  parseEncryptionHeader,
} from "@0gfoundation/0g-storage-ts-sdk";

import type { ZeroGStorageAdapter, ZeroGStorageUploadReceipt } from "./storage";

export const AGENTIC_MILESTONE_MAINNET_TARGET = Object.freeze({
  chainId: 16661 as const,
  agenticIdProxy: "0x0953a70D8c055799ef55404dE72d1d6c541046a9" as const,
  canonicalRegistry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const,
  agentTokenId: 3_531_123n,
  intelligentDataIndex: 0n,
});

const EXPECTED_VERSION = "1.1.0";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const UPDATE_GAS_MARGIN_PERCENT = 120n;
const AES_KEY_BYTES = 32;
const AES_NONCE_BYTES = 12;
const AES_TAG_BYTES = 16;
const MAX_ARTIFACT_BYTES = 64 * 1024;
const MAX_SEALED_KEY_BYTES = 64 * 1024;
const CHECKPOINT_ID = /^checkpoint-v1-[a-f0-9]{64}$/u;
const HASH_32 = /^0x[0-9a-fA-F]{64}$/u;
const CONTENT_HASH = /^sha256:[a-f0-9]{64}$/u;
const PRIVATE_KEY = /^0x[0-9a-fA-F]{64}$/u;
const MILESTONE_DESCRIPTION =
  /^Rivergate encrypted city milestone v1 on 0G Storage; savedAt=([0-9]+); ciphertext=(sha256:[a-f0-9]{64})$/u;
const DESCRIPTION_PREFIX =
  "Rivergate encrypted city milestone v1 on 0G Storage";
const KEY_DOMAIN = "terra-world/agentic-milestone/v1/aes-key";
const NONCE_DOMAIN = "terra-world/agentic-milestone/v1/aes-nonce";
const ENVELOPE_AAD =
  "terra-world/agentic-milestone-envelope/v1:eip155:16661:0x0953a70d8c055799ef55404de72d1d6c541046a9:3531123:0";

const AGENTIC_ID_ABI = Object.freeze([
  "function VERSION() view returns (string)",
  "function canonical() view returns (address)",
  "function paused() view returns (bool)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getAgentSeal(uint256 tokenId) view returns (address)",
  "function intelligentDatasOf(uint256 tokenId) view returns (tuple(string dataDescription,bytes32 dataHash)[])",
  "function sealedKeysOf(uint256 tokenId) view returns (bytes[])",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function updateAt(uint256 tokenId,uint256 index,tuple(string dataDescription,bytes32 dataHash) newData,bytes sealedKey)",
  "function setAgentURI(uint256 agentId,string newURI)",
  "event EntryUpdated(uint256 indexed tokenId,uint256 indexed index,tuple(string dataDescription,bytes32 dataHash) oldData,tuple(string dataDescription,bytes32 dataHash) newData,bytes sealedKey)",
]);
const CANONICAL_ABI = Object.freeze([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "event URIUpdated(uint256 indexed agentId,string newURI,address indexed updatedBy)",
]);
const AGENTIC_INTERFACE = new Interface(AGENTIC_ID_ABI);
const CANONICAL_INTERFACE = new Interface(CANONICAL_ABI);

export type AgenticMilestoneConfig = Readonly<{
  chainId: 16661;
  chainRpcUrl: string;
  agenticIdProxy: `0x${string}`;
  canonicalRegistry: `0x${string}`;
  agentTokenId: bigint;
  intelligentDataIndex: bigint;
  ownerPrivateKey: `0x${string}`;
}>;

export type VerifiedCheckpointMilestone = Readonly<{
  idempotencyKey: string;
  rootHash: `0x${string}`;
  contentHash: `sha256:${string}`;
  byteLength: number;
  transactionHash: `0x${string}` | null;
  transactionSequence: number;
  savedAt: number;
}>;

export type AgenticMilestoneChainEvidence = Readonly<{
  transactionHash: `0x${string}`;
  blockNumber: number;
  blockHash: `0x${string}`;
}>;

export type AgenticMilestoneStorageEvidence = Readonly<{
  rootHash: `0x${string}`;
  transactionHash: `0x${string}` | null;
  transactionSequence: number;
  contentHash: `sha256:${string}`;
  byteLength: number;
}>;

export type AgenticMilestoneSyncResult = Readonly<{
  status: "updated" | "already-current" | "uri-reconciled";
  agenticIdProxy: typeof AGENTIC_MILESTONE_MAINNET_TARGET.agenticIdProxy;
  agentTokenId: "3531123";
  intelligentDataIndex: 0;
  savedAt: number;
  milestoneRoot: `0x${string}`;
  milestoneStorage: AgenticMilestoneStorageEvidence;
  updateAt: AgenticMilestoneChainEvidence | null;
  agentCard: AgenticMilestoneChainEvidence | null;
}>;

export type AgenticMilestoneErrorCode =
  | "INVALID_CONFIG"
  | "INVALID_CHECKPOINT"
  | "LIVE_DEPLOYMENT_MISMATCH"
  | "SIGNER_NOT_TOKEN_OWNER"
  | "AGENT_SEAL_UNEXPECTED"
  | "AGENT_STATE_INVALID"
  | "CURRENT_MILESTONE_INVALID"
  | "STALE_CHECKPOINT"
  | "CHECKPOINT_REVISION_CONFLICT"
  | "STORAGE_VERIFICATION_FAILED"
  | "CHAIN_STATE_CHANGED"
  | "UPDATE_SIMULATION_FAILED"
  | "UPDATE_TRANSACTION_FAILED"
  | "URI_TRANSACTION_FAILED"
  | "POST_UPDATE_VERIFICATION_FAILED";

export class AgenticMilestoneError extends Error {
  override readonly name = "AgenticMilestoneError";

  constructor(
    readonly code: AgenticMilestoneErrorCode,
    readonly retryable: boolean,
  ) {
    super(`Agentic milestone synchronization failed: ${code}`);
  }
}

export type AgenticMilestoneIntelligentData = Readonly<{
  dataDescription: string;
  dataHash: `0x${string}`;
}>;

export type AgenticMilestoneLiveState = Readonly<{
  version: string;
  canonical: string;
  paused: boolean;
  localOwner: string;
  canonicalOwner: string;
  agentSeal: string;
  datas: readonly AgenticMilestoneIntelligentData[];
  sealedKeys: readonly `0x${string}`[];
  localTokenUri: string;
  canonicalTokenUri: string;
}>;

export type AgenticMilestoneRawLog = Readonly<{
  address: string;
  topics: readonly string[];
  data: string;
}>;
export type AgenticMilestoneRawTransaction = Readonly<{
  hash: string;
  from: string;
  to: string | null;
  data: string;
  value: bigint;
}>;
export type AgenticMilestoneRawReceipt = Readonly<{
  hash: string;
  status: number;
  blockNumber: number;
  blockHash: string;
  from: string;
  to: string | null;
  logs: readonly AgenticMilestoneRawLog[];
}>;
export type AgenticMilestoneSubmittedTransaction = Readonly<{
  transaction: AgenticMilestoneRawTransaction;
  receipt: AgenticMilestoneRawReceipt;
}>;

export interface AgenticMilestoneChain {
  readonly signerAddress: string;
  getChainId(): Promise<number>;
  hasCode(address: string): Promise<boolean>;
  readState(): Promise<AgenticMilestoneLiveState>;
  encodeUpdateAt(
    data: AgenticMilestoneIntelligentData,
    sealedKey: `0x${string}`,
  ): string;
  simulateUpdateAt(
    data: AgenticMilestoneIntelligentData,
    sealedKey: `0x${string}`,
  ): Promise<void>;
  estimateUpdateAtGas(
    data: AgenticMilestoneIntelligentData,
    sealedKey: `0x${string}`,
  ): Promise<bigint>;
  sendUpdateAt(
    data: AgenticMilestoneIntelligentData,
    sealedKey: `0x${string}`,
    gasLimit: bigint,
  ): Promise<AgenticMilestoneSubmittedTransaction>;
  encodeSetAgentUri(uri: string): string;
  simulateSetAgentUri(uri: string): Promise<void>;
  estimateSetAgentUriGas(uri: string): Promise<bigint>;
  sendSetAgentUri(
    uri: string,
    gasLimit: bigint,
  ): Promise<AgenticMilestoneSubmittedTransaction>;
}

export interface AgenticMilestoneKeyCodec {
  wrap(dataKey: Uint8Array, ownerPublicKey: string): Promise<Uint8Array>;
  unwrap(sealedKey: Uint8Array, ownerPrivateKey: string): Promise<Uint8Array>;
}

export type AgenticMilestoneDependencies = Readonly<{
  storage: ZeroGStorageAdapter;
  chain?: AgenticMilestoneChain;
  keyCodec?: AgenticMilestoneKeyCodec;
}>;

export type AgenticMilestoneSynchronizer = Readonly<{
  sync(
    checkpoint: VerifiedCheckpointMilestone,
  ): Promise<AgenticMilestoneSyncResult>;
}>;

type ValidatedConfig = AgenticMilestoneConfig &
  Readonly<{ ownerAddress: string; ownerPublicKey: string }>;

type MilestoneArtifact = Readonly<{
  schemaVersion: 1;
  kind: "rivergate-agentic-id-milestone";
  target: Readonly<{
    chainId: 16661;
    agenticIdProxy: typeof AGENTIC_MILESTONE_MAINNET_TARGET.agenticIdProxy;
    agentTokenId: 3_531_123;
    intelligentDataIndex: 0;
  }>;
  checkpoint: VerifiedCheckpointMilestone;
}>;

type PreparedMilestone = Readonly<{
  artifact: MilestoneArtifact;
  artifactBytes: Uint8Array;
  encryptedBytes: Uint8Array;
  encryptedContentHash: `sha256:${string}`;
  dataKey: Uint8Array;
  description: string;
}>;

type CurrentMilestone = Readonly<{
  rootHash: `0x${string}`;
  prepared: PreparedMilestone;
}>;

export function validateAgenticMilestoneConfig(
  value: AgenticMilestoneConfig,
): ValidatedConfig {
  try {
    if (
      value.chainId !== AGENTIC_MILESTONE_MAINNET_TARGET.chainId ||
      getAddress(value.agenticIdProxy) !==
        getAddress(AGENTIC_MILESTONE_MAINNET_TARGET.agenticIdProxy) ||
      getAddress(value.canonicalRegistry) !==
        getAddress(AGENTIC_MILESTONE_MAINNET_TARGET.canonicalRegistry) ||
      value.agentTokenId !== AGENTIC_MILESTONE_MAINNET_TARGET.agentTokenId ||
      value.intelligentDataIndex !==
        AGENTIC_MILESTONE_MAINNET_TARGET.intelligentDataIndex ||
      !PRIVATE_KEY.test(value.ownerPrivateKey)
    ) {
      fail("INVALID_CONFIG", false);
    }
    const rpc = new URL(value.chainRpcUrl);
    if (
      rpc.protocol !== "https:" ||
      rpc.username !== "" ||
      rpc.password !== "" ||
      rpc.hash !== ""
    ) {
      fail("INVALID_CONFIG", false);
    }
    const ownerAddress = getAddress(computeAddress(value.ownerPrivateKey));
    const ownerPublicKey = new SigningKey(value.ownerPrivateKey).publicKey;
    return Object.freeze({
      ...value,
      agenticIdProxy: AGENTIC_MILESTONE_MAINNET_TARGET.agenticIdProxy,
      canonicalRegistry: AGENTIC_MILESTONE_MAINNET_TARGET.canonicalRegistry,
      ownerAddress,
      ownerPublicKey,
    });
  } catch (error) {
    if (error instanceof AgenticMilestoneError) throw error;
    fail("INVALID_CONFIG", false);
  }
}

export function createAgenticMilestoneSynchronizer(
  inputConfig: AgenticMilestoneConfig,
  dependencies: AgenticMilestoneDependencies,
): AgenticMilestoneSynchronizer {
  const config = validateAgenticMilestoneConfig(inputConfig);
  if (!dependencies?.storage) fail("INVALID_CONFIG", false);
  const chain = dependencies.chain ?? createEthersAgenticMilestoneChain(config);
  const keyCodec = dependencies.keyCodec ?? createOfficialKeyCodec();

  const synchronize = async (
    checkpointInput: VerifiedCheckpointMilestone,
  ): Promise<AgenticMilestoneSyncResult> => {
    const checkpoint = validateCheckpoint(checkpointInput);
    const prepared = prepareMilestone(checkpoint, config.ownerPrivateKey);
    try {
      const initial = await readValidatedState(chain, config);
      const previous = await readCurrentMilestone(
        initial,
        dependencies.storage,
        keyCodec,
        config,
      );
      assertCheckpointOrder(checkpoint, prepared, previous);

      let storageEvidence: AgenticMilestoneStorageEvidence;
      let updateEvidence: AgenticMilestoneChainEvidence | null = null;
      const currentData = requiredCurrentData(initial);

      if (
        previous !== null &&
        sameBytes(previous.prepared.encryptedBytes, prepared.encryptedBytes)
      ) {
        assertAlreadyCurrent(previous, prepared, initial);
        storageEvidence = await storeAndVerifyMilestone(
          dependencies.storage,
          prepared,
        );
        if (
          storageEvidence.rootHash.toLowerCase() !==
          currentData.dataHash.toLowerCase()
        ) {
          fail("CURRENT_MILESTONE_INVALID", false);
        }
      } else {
        const sealedKey = await wrapPreparedKey(
          prepared,
          keyCodec,
          config.ownerPublicKey,
        );
        storageEvidence = await storeAndVerifyMilestone(
          dependencies.storage,
          prepared,
        );
        if (
          storageEvidence.rootHash.toLowerCase() ===
          currentData.dataHash.toLowerCase()
        ) {
          // The live root collides with the intended bytes but its description
          // did not let us recover and validate the current key/artifact.
          fail("CURRENT_MILESTONE_INVALID", false);
        }
        const nextData: AgenticMilestoneIntelligentData = Object.freeze({
          dataDescription: prepared.description,
          dataHash: storageEvidence.rootHash,
        });
        await assertStateUnchanged(chain, config, initial);
        try {
          await chain.simulateUpdateAt(nextData, sealedKey);
        } catch {
          fail("UPDATE_SIMULATION_FAILED", false);
        }
        const estimate = await positiveGasEstimate(
          () => chain.estimateUpdateAtGas(nextData, sealedKey),
          "UPDATE_SIMULATION_FAILED",
        );
        const submitted = await chain
          .sendUpdateAt(
            nextData,
            sealedKey,
            gasWithMargin(estimate, UPDATE_GAS_MARGIN_PERCENT),
          )
          .catch(() => fail("UPDATE_TRANSACTION_FAILED", true));
        updateEvidence = verifyUpdateTransaction(
          submitted,
          chain.encodeUpdateAt(nextData, sealedKey),
          nextData,
          sealedKey,
          currentData,
          config,
        );
        await verifyFinalDataState(chain, config, nextData, sealedKey);
      }

      const expectedRoot = storageEvidence.rootHash;
      const cardEvidence = await reconcileAgentCard(
        chain,
        config,
        expectedRoot,
      );
      return Object.freeze({
        status:
          updateEvidence !== null
            ? "updated"
            : cardEvidence !== null
              ? "uri-reconciled"
              : "already-current",
        agenticIdProxy: AGENTIC_MILESTONE_MAINNET_TARGET.agenticIdProxy,
        agentTokenId: "3531123",
        intelligentDataIndex: 0,
        savedAt: checkpoint.savedAt,
        milestoneRoot: expectedRoot,
        milestoneStorage: storageEvidence,
        updateAt: updateEvidence,
        agentCard: cardEvidence,
      });
    } finally {
      prepared.dataKey.fill(0);
    }
  };
  let signerQueue: Promise<void> = Promise.resolve();
  return Object.freeze({
    sync(checkpointInput) {
      // Serialize every transaction-capable run for this owner. The durable
      // outbox remains responsible for cross-process exclusion, but one server
      // instance must never race its own signer nonce or overwrite a newer job.
      const run = signerQueue.then(() => synchronize(checkpointInput));
      signerQueue = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  });
}

function validateCheckpoint(
  value: VerifiedCheckpointMilestone,
): VerifiedCheckpointMilestone {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, [
      "idempotencyKey",
      "rootHash",
      "contentHash",
      "byteLength",
      "transactionHash",
      "transactionSequence",
      "savedAt",
    ]) ||
    !CHECKPOINT_ID.test(value.idempotencyKey) ||
    !HASH_32.test(value.rootHash) ||
    !CONTENT_HASH.test(value.contentHash) ||
    !Number.isSafeInteger(value.byteLength) ||
    value.byteLength < 1 ||
    (value.transactionHash !== null && !HASH_32.test(value.transactionHash)) ||
    !Number.isSafeInteger(value.transactionSequence) ||
    value.transactionSequence < 0 ||
    !Number.isSafeInteger(value.savedAt) ||
    value.savedAt < 0
  ) {
    fail("INVALID_CHECKPOINT", false);
  }
  return Object.freeze({
    ...value,
    rootHash: value.rootHash.toLowerCase() as `0x${string}`,
    contentHash: value.contentHash.toLowerCase() as `sha256:${string}`,
    transactionHash:
      value.transactionHash === null
        ? null
        : (value.transactionHash.toLowerCase() as `0x${string}`),
  });
}

function prepareMilestone(
  checkpoint: VerifiedCheckpointMilestone,
  ownerPrivateKey: `0x${string}`,
): PreparedMilestone {
  const artifact: MilestoneArtifact = Object.freeze({
    schemaVersion: 1,
    kind: "rivergate-agentic-id-milestone",
    target: Object.freeze({
      chainId: 16661,
      agenticIdProxy: AGENTIC_MILESTONE_MAINNET_TARGET.agenticIdProxy,
      agentTokenId: 3_531_123,
      intelligentDataIndex: 0,
    }),
    checkpoint,
  });
  const artifactBytes = encodeUtf8(canonicalJson(artifact));
  const ownerKey = Buffer.from(ownerPrivateKey.slice(2), "hex");
  const dataKey = hmacBytes(ownerKey, KEY_DOMAIN, artifactBytes);
  const nonce = hmacBytes(ownerKey, NONCE_DOMAIN, artifactBytes).subarray(
    0,
    AES_NONCE_BYTES,
  );
  ownerKey.fill(0);
  const cipher = createCipheriv("aes-256-gcm", dataKey, nonce, {
    authTagLength: AES_TAG_BYTES,
  });
  cipher.setAAD(encodeUtf8(ENVELOPE_AAD));
  const ciphertext = Buffer.concat([
    cipher.update(artifactBytes),
    cipher.final(),
  ]);
  const encryptedBytes = encodeUtf8(
    canonicalJson({
      schemaVersion: 1,
      kind: "rivergate-agentic-id-milestone-envelope",
      encryption: {
        algorithm: "AES-256-GCM",
        aad: ENVELOPE_AAD,
        nonce: Buffer.from(nonce).toString("base64"),
        authenticationTag: cipher.getAuthTag().toString("base64"),
      },
      ciphertext: ciphertext.toString("base64"),
    }),
  );
  if (encryptedBytes.byteLength > MAX_ARTIFACT_BYTES) {
    dataKey.fill(0);
    fail("INVALID_CHECKPOINT", false);
  }
  const encryptedContentHash = sha256(encryptedBytes);
  return Object.freeze({
    artifact,
    artifactBytes,
    encryptedBytes,
    encryptedContentHash,
    dataKey,
    description: `${DESCRIPTION_PREFIX}; savedAt=${checkpoint.savedAt}; ciphertext=${encryptedContentHash}`,
  });
}

async function readValidatedState(
  chain: AgenticMilestoneChain,
  config: ValidatedConfig,
): Promise<AgenticMilestoneLiveState> {
  const [chainId, proxyCode, canonicalCode, state] = await Promise.all([
    chain.getChainId(),
    chain.hasCode(config.agenticIdProxy),
    chain.hasCode(config.canonicalRegistry),
    chain.readState(),
  ]).catch(() => fail("LIVE_DEPLOYMENT_MISMATCH", true));
  if (
    chainId !== config.chainId ||
    !proxyCode ||
    !canonicalCode ||
    state.version !== EXPECTED_VERSION ||
    getAddress(state.canonical) !== getAddress(config.canonicalRegistry) ||
    state.paused ||
    getAddress(state.canonicalOwner) !== getAddress(config.agenticIdProxy) ||
    state.localTokenUri !== state.canonicalTokenUri
  ) {
    fail("LIVE_DEPLOYMENT_MISMATCH", false);
  }
  if (
    getAddress(chain.signerAddress) !== getAddress(config.ownerAddress) ||
    getAddress(state.localOwner) !== getAddress(config.ownerAddress)
  ) {
    fail("SIGNER_NOT_TOKEN_OWNER", false);
  }
  if (getAddress(state.agentSeal) !== ZERO_ADDRESS) {
    fail("AGENT_SEAL_UNEXPECTED", false);
  }
  if (
    state.datas.length !== 1 ||
    state.sealedKeys.length !== 1 ||
    !HASH_32.test(state.datas[0]?.dataHash ?? "") ||
    !/^0x(?:[0-9a-fA-F]{2})+$/u.test(state.sealedKeys[0] ?? "") ||
    ((state.sealedKeys[0]?.length ?? 2) - 2) / 2 > MAX_SEALED_KEY_BYTES
  ) {
    fail("AGENT_STATE_INVALID", false);
  }
  return state;
}

async function readCurrentMilestone(
  state: AgenticMilestoneLiveState,
  storage: ZeroGStorageAdapter,
  keyCodec: AgenticMilestoneKeyCodec,
  config: ValidatedConfig,
): Promise<CurrentMilestone | null> {
  const current = requiredCurrentData(state);
  const marker = MILESTONE_DESCRIPTION.exec(current.dataDescription);
  if (!marker) return null;
  const savedAt = Number(marker[1]);
  const expectedContentHash = marker[2] as `sha256:${string}`;
  if (!Number.isSafeInteger(savedAt) || savedAt < 0) {
    fail("CURRENT_MILESTONE_INVALID", false);
  }
  let retrieved: Awaited<ReturnType<ZeroGStorageAdapter["retrieve"]>>;
  try {
    retrieved = await storage.retrieve({
      rootHash: current.dataHash,
      expectedContentHash,
    });
  } catch {
    fail("CURRENT_MILESTONE_INVALID", true);
  }
  let dataKey: Uint8Array | undefined;
  try {
    dataKey = await keyCodec.unwrap(
      hexBytes(state.sealedKeys[0] as `0x${string}`),
      config.ownerPrivateKey,
    );
    if (
      !(dataKey instanceof Uint8Array) ||
      dataKey.byteLength !== AES_KEY_BYTES
    ) {
      fail("CURRENT_MILESTONE_INVALID", false);
    }
    const artifact = decryptMilestone(retrieved.bytes, dataKey);
    if (
      artifact.checkpoint.savedAt !== savedAt ||
      artifact.target.chainId !== config.chainId ||
      artifact.target.agenticIdProxy.toLowerCase() !==
        config.agenticIdProxy.toLowerCase() ||
      artifact.target.agentTokenId !== Number(config.agentTokenId) ||
      artifact.target.intelligentDataIndex !==
        Number(config.intelligentDataIndex)
    ) {
      fail("CURRENT_MILESTONE_INVALID", false);
    }
    const prepared = prepareMilestone(
      artifact.checkpoint,
      config.ownerPrivateKey,
    );
    if (
      !sameBytes(prepared.encryptedBytes, retrieved.bytes) ||
      prepared.encryptedContentHash !== expectedContentHash
    ) {
      prepared.dataKey.fill(0);
      fail("CURRENT_MILESTONE_INVALID", false);
    }
    return Object.freeze({ rootHash: current.dataHash, prepared });
  } catch (error) {
    if (error instanceof AgenticMilestoneError) throw error;
    fail("CURRENT_MILESTONE_INVALID", false);
  } finally {
    dataKey?.fill(0);
  }
  fail("CURRENT_MILESTONE_INVALID", false);
}

function assertCheckpointOrder(
  incoming: VerifiedCheckpointMilestone,
  prepared: PreparedMilestone,
  current: CurrentMilestone | null,
): void {
  if (!current) return;
  try {
    if (incoming.savedAt < current.prepared.artifact.checkpoint.savedAt) {
      fail("STALE_CHECKPOINT", false);
    }
    if (
      incoming.savedAt === current.prepared.artifact.checkpoint.savedAt &&
      !sameBytes(prepared.artifactBytes, current.prepared.artifactBytes)
    ) {
      fail("CHECKPOINT_REVISION_CONFLICT", false);
    }
  } finally {
    current.prepared.dataKey.fill(0);
  }
}

function assertAlreadyCurrent(
  current: CurrentMilestone | null,
  prepared: PreparedMilestone,
  state: AgenticMilestoneLiveState,
): void {
  const data = requiredCurrentData(state);
  if (
    !current ||
    current.rootHash.toLowerCase() !== data.dataHash.toLowerCase() ||
    data.dataDescription !== prepared.description ||
    !sameBytes(current.prepared.encryptedBytes, prepared.encryptedBytes)
  ) {
    fail("CURRENT_MILESTONE_INVALID", false);
  }
}

async function wrapPreparedKey(
  prepared: PreparedMilestone,
  keyCodec: AgenticMilestoneKeyCodec,
  ownerPublicKey: string,
): Promise<`0x${string}`> {
  try {
    const wrapped = await keyCodec.wrap(prepared.dataKey, ownerPublicKey);
    if (
      !(wrapped instanceof Uint8Array) ||
      wrapped.byteLength <= 50 ||
      wrapped.byteLength > MAX_SEALED_KEY_BYTES
    ) {
      fail("STORAGE_VERIFICATION_FAILED", false);
    }
    return bytesHex(wrapped);
  } catch (error) {
    if (error instanceof AgenticMilestoneError) throw error;
    fail("STORAGE_VERIFICATION_FAILED", false);
  }
}

async function storeAndVerifyMilestone(
  storage: ZeroGStorageAdapter,
  prepared: PreparedMilestone,
): Promise<AgenticMilestoneStorageEvidence> {
  let receipt: ZeroGStorageUploadReceipt;
  try {
    receipt = await storage.upload({
      kind: "encrypted-checkpoint-envelope",
      bytes: Uint8Array.from(prepared.encryptedBytes),
    });
    if (
      receipt.contentHash !== prepared.encryptedContentHash ||
      receipt.byteLength !== prepared.encryptedBytes.byteLength ||
      !HASH_32.test(receipt.rootHash) ||
      (receipt.transactionHash !== null &&
        !HASH_32.test(receipt.transactionHash)) ||
      !Number.isSafeInteger(receipt.transactionSequence) ||
      receipt.transactionSequence < 0
    ) {
      fail("STORAGE_VERIFICATION_FAILED", false);
    }
    const retrieved = await storage.retrieve({
      rootHash: receipt.rootHash,
      expectedContentHash: receipt.contentHash,
    });
    if (
      retrieved.proofVerified !== true ||
      retrieved.rootHash.toLowerCase() !== receipt.rootHash.toLowerCase() ||
      retrieved.contentHash !== receipt.contentHash ||
      !sameBytes(retrieved.bytes, prepared.encryptedBytes)
    ) {
      fail("STORAGE_VERIFICATION_FAILED", false);
    }
  } catch (error) {
    if (error instanceof AgenticMilestoneError) throw error;
    fail("STORAGE_VERIFICATION_FAILED", true);
  }
  return Object.freeze({
    rootHash: receipt.rootHash,
    transactionHash: receipt.transactionHash,
    transactionSequence: receipt.transactionSequence,
    contentHash: receipt.contentHash,
    byteLength: receipt.byteLength,
  });
}

async function assertStateUnchanged(
  chain: AgenticMilestoneChain,
  config: ValidatedConfig,
  expected: AgenticMilestoneLiveState,
): Promise<void> {
  const current = await readValidatedState(chain, config);
  if (
    current.datas[0]?.dataDescription !== expected.datas[0]?.dataDescription ||
    current.datas[0]?.dataHash.toLowerCase() !==
      expected.datas[0]?.dataHash.toLowerCase() ||
    current.sealedKeys[0]?.toLowerCase() !==
      expected.sealedKeys[0]?.toLowerCase()
  ) {
    fail("CHAIN_STATE_CHANGED", true);
  }
}

async function verifyFinalDataState(
  chain: AgenticMilestoneChain,
  config: ValidatedConfig,
  expectedData: AgenticMilestoneIntelligentData,
  expectedSealedKey: `0x${string}`,
): Promise<void> {
  const current = await readValidatedState(chain, config);
  if (
    current.datas[0]?.dataDescription !== expectedData.dataDescription ||
    current.datas[0]?.dataHash.toLowerCase() !==
      expectedData.dataHash.toLowerCase() ||
    current.sealedKeys[0]?.toLowerCase() !== expectedSealedKey.toLowerCase()
  ) {
    fail("POST_UPDATE_VERIFICATION_FAILED", true);
  }
}

async function reconcileAgentCard(
  chain: AgenticMilestoneChain,
  config: ValidatedConfig,
  expectedRoot: `0x${string}`,
): Promise<AgenticMilestoneChainEvidence | null> {
  const state = await readValidatedState(chain, config);
  if (
    requiredCurrentData(state).dataHash.toLowerCase() !==
    expectedRoot.toLowerCase()
  ) {
    fail("POST_UPDATE_VERIFICATION_FAILED", true);
  }
  const targetUri = updateAgentCardRoot(
    state.localTokenUri,
    expectedRoot,
    config,
  );
  if (targetUri === state.localTokenUri) return null;
  try {
    await chain.simulateSetAgentUri(targetUri);
  } catch {
    fail("URI_TRANSACTION_FAILED", false);
  }
  const estimate = await positiveGasEstimate(
    () => chain.estimateSetAgentUriGas(targetUri),
    "URI_TRANSACTION_FAILED",
  );
  const submitted = await chain
    .sendSetAgentUri(
      targetUri,
      gasWithMargin(estimate, UPDATE_GAS_MARGIN_PERCENT),
    )
    .catch(() => fail("URI_TRANSACTION_FAILED", true));
  const evidence = verifyUriTransaction(
    submitted,
    chain.encodeSetAgentUri(targetUri),
    targetUri,
    config,
  );
  const final = await readValidatedState(chain, config);
  if (
    final.localTokenUri !== targetUri ||
    final.canonicalTokenUri !== targetUri ||
    requiredCurrentData(final).dataHash.toLowerCase() !==
      expectedRoot.toLowerCase()
  ) {
    fail("POST_UPDATE_VERIFICATION_FAILED", true);
  }
  return evidence;
}

function updateAgentCardRoot(
  uri: string,
  expectedRoot: `0x${string}`,
  config: ValidatedConfig,
): string {
  const prefix = "data:application/json;base64,";
  if (!uri.startsWith(prefix) || uri.length > 64 * 1024) {
    fail("AGENT_STATE_INVALID", false);
  }
  let card: unknown;
  try {
    const encoded = uri.slice(prefix.length);
    if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded) || encoded.length % 4 !== 0) {
      fail("AGENT_STATE_INVALID", false);
    }
    const decoded = Buffer.from(encoded, "base64");
    if (decoded.toString("base64") !== encoded) {
      fail("AGENT_STATE_INVALID", false);
    }
    card = JSON.parse(decoded.toString("utf8")) as unknown;
  } catch {
    fail("AGENT_STATE_INVALID", false);
  }
  if (
    !isPlainRecord(card) ||
    card.type !== "https://eips.ethereum.org/EIPS/eip-8004#registration-v1" ||
    card.name !== "Rivergate City Steward" ||
    card.active !== true ||
    !Array.isArray(card.registrations) ||
    card.registrations.length !== 1 ||
    !isPlainRecord(card.registrations[0]) ||
    card.registrations[0].agentId !== Number(config.agentTokenId) ||
    card.registrations[0].agentRegistry !==
      `eip155:${config.chainId}:${config.canonicalRegistry}` ||
    !isPlainRecord(card.properties) ||
    card.properties.agenticIdProxy !== config.agenticIdProxy ||
    card.properties.sealMode !== "none" ||
    typeof card.properties.intelligentDataRoot !== "string" ||
    !HASH_32.test(card.properties.intelligentDataRoot)
  ) {
    fail("AGENT_STATE_INVALID", false);
  }
  if (
    card.properties.intelligentDataRoot.toLowerCase() ===
    expectedRoot.toLowerCase()
  ) {
    return uri;
  }
  card.properties.intelligentDataRoot = expectedRoot.toLowerCase();
  return `${prefix}${Buffer.from(JSON.stringify(card), "utf8").toString("base64")}`;
}

function verifyUpdateTransaction(
  submitted: AgenticMilestoneSubmittedTransaction,
  expectedCalldata: string,
  expectedData: AgenticMilestoneIntelligentData,
  expectedSealedKey: `0x${string}`,
  expectedOldData: AgenticMilestoneIntelligentData,
  config: ValidatedConfig,
): AgenticMilestoneChainEvidence {
  verifyTransactionEnvelope(
    submitted,
    expectedCalldata,
    config,
    "UPDATE_TRANSACTION_FAILED",
  );
  const events = matchingEvents(
    submitted.receipt.logs,
    config.agenticIdProxy,
    AGENTIC_INTERFACE,
    "EntryUpdated",
  );
  if (events.length !== 1) fail("UPDATE_TRANSACTION_FAILED", false);
  const args = events[0]?.args;
  if (
    BigInt(args?.tokenId ?? -1) !== config.agentTokenId ||
    BigInt(args?.index ?? -1) !== config.intelligentDataIndex ||
    args?.newData?.dataDescription !== expectedData.dataDescription ||
    String(args?.newData?.dataHash).toLowerCase() !==
      expectedData.dataHash.toLowerCase() ||
    args?.oldData?.dataDescription !== expectedOldData.dataDescription ||
    String(args?.oldData?.dataHash).toLowerCase() !==
      expectedOldData.dataHash.toLowerCase() ||
    String(args?.sealedKey).toLowerCase() !== expectedSealedKey.toLowerCase()
  ) {
    fail("UPDATE_TRANSACTION_FAILED", false);
  }
  return chainEvidence(submitted.receipt, "UPDATE_TRANSACTION_FAILED");
}

function verifyUriTransaction(
  submitted: AgenticMilestoneSubmittedTransaction,
  expectedCalldata: string,
  expectedUri: string,
  config: ValidatedConfig,
): AgenticMilestoneChainEvidence {
  verifyTransactionEnvelope(
    submitted,
    expectedCalldata,
    config,
    "URI_TRANSACTION_FAILED",
  );
  const events = matchingEvents(
    submitted.receipt.logs,
    config.canonicalRegistry,
    CANONICAL_INTERFACE,
    "URIUpdated",
  );
  if (events.length !== 1) fail("URI_TRANSACTION_FAILED", false);
  const args = events[0]?.args;
  if (
    BigInt(args?.agentId ?? -1) !== config.agentTokenId ||
    args?.newURI !== expectedUri ||
    getAddress(String(args?.updatedBy)) !== getAddress(config.agenticIdProxy)
  ) {
    fail("URI_TRANSACTION_FAILED", false);
  }
  return chainEvidence(submitted.receipt, "URI_TRANSACTION_FAILED");
}

function verifyTransactionEnvelope(
  submitted: AgenticMilestoneSubmittedTransaction,
  expectedCalldata: string,
  config: ValidatedConfig,
  code: "UPDATE_TRANSACTION_FAILED" | "URI_TRANSACTION_FAILED",
): void {
  const { transaction, receipt } = submitted;
  if (
    !HASH_32.test(transaction.hash) ||
    transaction.hash.toLowerCase() !== receipt.hash.toLowerCase() ||
    getAddress(transaction.from) !== getAddress(config.ownerAddress) ||
    getAddress(transaction.to ?? ZERO_ADDRESS) !==
      getAddress(config.agenticIdProxy) ||
    transaction.data.toLowerCase() !== expectedCalldata.toLowerCase() ||
    transaction.value !== 0n ||
    receipt.status !== 1 ||
    getAddress(receipt.from) !== getAddress(config.ownerAddress) ||
    getAddress(receipt.to ?? ZERO_ADDRESS) !== getAddress(config.agenticIdProxy)
  ) {
    fail(code, false);
  }
}

function matchingEvents(
  logs: readonly AgenticMilestoneRawLog[],
  address: string,
  iface: Interface,
  eventName: string,
) {
  return logs.flatMap((log) => {
    if (log.address.toLowerCase() !== address.toLowerCase()) return [];
    try {
      const parsed = iface.parseLog({
        topics: [...log.topics],
        data: log.data,
      });
      return parsed?.name === eventName ? [parsed] : [];
    } catch {
      return [];
    }
  });
}

function chainEvidence(
  receipt: AgenticMilestoneRawReceipt,
  code: "UPDATE_TRANSACTION_FAILED" | "URI_TRANSACTION_FAILED",
): AgenticMilestoneChainEvidence {
  if (
    !HASH_32.test(receipt.hash) ||
    !HASH_32.test(receipt.blockHash) ||
    !Number.isSafeInteger(receipt.blockNumber) ||
    receipt.blockNumber < 0
  ) {
    fail(code, false);
  }
  return Object.freeze({
    transactionHash: receipt.hash.toLowerCase() as `0x${string}`,
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash.toLowerCase() as `0x${string}`,
  });
}

function decryptMilestone(
  encryptedBytes: Uint8Array,
  dataKey: Uint8Array,
): MilestoneArtifact {
  let envelope: unknown;
  try {
    envelope = JSON.parse(
      new TextDecoder("utf8", { fatal: true }).decode(encryptedBytes),
    );
  } catch {
    fail("CURRENT_MILESTONE_INVALID", false);
  }
  if (
    !isPlainRecord(envelope) ||
    !hasExactKeys(envelope, [
      "ciphertext",
      "encryption",
      "kind",
      "schemaVersion",
    ]) ||
    envelope.schemaVersion !== 1 ||
    envelope.kind !== "rivergate-agentic-id-milestone-envelope" ||
    typeof envelope.ciphertext !== "string" ||
    !isPlainRecord(envelope.encryption) ||
    !hasExactKeys(envelope.encryption, [
      "aad",
      "algorithm",
      "authenticationTag",
      "nonce",
    ]) ||
    envelope.encryption.algorithm !== "AES-256-GCM" ||
    envelope.encryption.aad !== ENVELOPE_AAD ||
    typeof envelope.encryption.nonce !== "string" ||
    typeof envelope.encryption.authenticationTag !== "string"
  ) {
    fail("CURRENT_MILESTONE_INVALID", false);
  }
  try {
    const nonce = Buffer.from(envelope.encryption.nonce, "base64");
    const tag = Buffer.from(envelope.encryption.authenticationTag, "base64");
    if (
      nonce.byteLength !== AES_NONCE_BYTES ||
      tag.byteLength !== AES_TAG_BYTES
    ) {
      fail("CURRENT_MILESTONE_INVALID", false);
    }
    const decipher = createDecipheriv("aes-256-gcm", dataKey, nonce, {
      authTagLength: AES_TAG_BYTES,
    });
    decipher.setAAD(encodeUtf8(ENVELOPE_AAD));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]);
    const decoded = new TextDecoder("utf8", { fatal: true }).decode(plaintext);
    const artifact = JSON.parse(decoded) as unknown;
    assertMilestoneArtifact(artifact);
    if (canonicalJson(artifact) !== decoded) {
      fail("CURRENT_MILESTONE_INVALID", false);
    }
    return artifact;
  } catch (error) {
    if (error instanceof AgenticMilestoneError) throw error;
    fail("CURRENT_MILESTONE_INVALID", false);
  }
}

function assertMilestoneArtifact(
  value: unknown,
): asserts value is MilestoneArtifact {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ["checkpoint", "kind", "schemaVersion", "target"]) ||
    value.schemaVersion !== 1 ||
    value.kind !== "rivergate-agentic-id-milestone" ||
    !isPlainRecord(value.target) ||
    !hasExactKeys(value.target, [
      "agentTokenId",
      "agenticIdProxy",
      "chainId",
      "intelligentDataIndex",
    ]) ||
    value.target.chainId !== 16661 ||
    value.target.agenticIdProxy !==
      AGENTIC_MILESTONE_MAINNET_TARGET.agenticIdProxy ||
    value.target.agentTokenId !== 3_531_123 ||
    value.target.intelligentDataIndex !== 0
  ) {
    fail("CURRENT_MILESTONE_INVALID", false);
  }
  validateCheckpoint(value.checkpoint as VerifiedCheckpointMilestone);
}

function createOfficialKeyCodec(): AgenticMilestoneKeyCodec {
  const codec: AgenticMilestoneKeyCodec = {
    async wrap(dataKey, ownerPublicKey) {
      const keyCopy = Uint8Array.from(dataKey);
      const source = new MemData(keyCopy);
      let encrypted: ReturnType<typeof newEciesEncryptedFile> | undefined;
      try {
        encrypted = newEciesEncryptedFile(source, ownerPublicKey);
        const result = await encrypted.readFromFile(0, encrypted.size());
        if (result.bytesRead !== encrypted.size()) {
          fail("STORAGE_VERIFICATION_FAILED", false);
        }
        return Uint8Array.from(result.buffer);
      } finally {
        encrypted?.key.fill(0);
        keyCopy.fill(0);
      }
    },
    async unwrap(sealedKey, ownerPrivateKey) {
      let decryptKey: Uint8Array | undefined;
      try {
        const header = parseEncryptionHeader(sealedKey);
        decryptKey = deriveEciesDecryptKey(
          ownerPrivateKey,
          header.ephemeralPub,
        );
        return Uint8Array.from(decryptFile(decryptKey, sealedKey));
      } finally {
        decryptKey?.fill(0);
      }
    },
  };
  return Object.freeze(codec);
}

function createEthersAgenticMilestoneChain(
  config: ValidatedConfig,
): AgenticMilestoneChain {
  const provider = new JsonRpcProvider(config.chainRpcUrl, config.chainId, {
    staticNetwork: true,
  });
  const wallet = new Wallet(config.ownerPrivateKey, provider);
  const proxy = new Contract(config.agenticIdProxy, AGENTIC_ID_ABI, wallet);
  const canonical = new Contract(
    config.canonicalRegistry,
    CANONICAL_ABI,
    wallet,
  );
  const updateAt = proxy.getFunction(
    "updateAt(uint256,uint256,(string,bytes32),bytes)",
  );
  const setAgentURI = proxy.getFunction("setAgentURI(uint256,string)");
  const readVersion = proxy.getFunction("VERSION");
  const readCanonical = proxy.getFunction("canonical");
  const readPaused = proxy.getFunction("paused");
  const readLocalOwner = proxy.getFunction("ownerOf");
  const readCanonicalOwner = canonical.getFunction("ownerOf");
  const readSeal = proxy.getFunction("getAgentSeal");
  const readDatas = proxy.getFunction("intelligentDatasOf");
  const readSealedKeys = proxy.getFunction("sealedKeysOf");
  const readLocalUri = proxy.getFunction("tokenURI");
  const readCanonicalUri = canonical.getFunction("tokenURI");

  async function submit(
    call: Promise<unknown>,
  ): Promise<AgenticMilestoneSubmittedTransaction> {
    const response = (await call) as {
      hash: string;
      from: string;
      to: string | null;
      data: string;
      value: bigint;
      wait(confirmations: number): Promise<unknown>;
    };
    const receipt = (await response.wait(1)) as {
      hash: string;
      status: number;
      blockNumber: number;
      blockHash: string;
      from: string;
      to: string | null;
      logs: readonly AgenticMilestoneRawLog[];
    } | null;
    if (!receipt) fail("UPDATE_TRANSACTION_FAILED", true);
    return Object.freeze({
      transaction: Object.freeze({
        hash: response.hash,
        from: response.from,
        to: response.to,
        data: response.data,
        value: response.value,
      }),
      receipt: Object.freeze({
        hash: receipt.hash,
        status: receipt.status,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
        from: receipt.from,
        to: receipt.to,
        logs: receipt.logs.map((log) => ({
          address: log.address,
          topics: [...log.topics],
          data: log.data,
        })),
      }),
    });
  }

  const chain: AgenticMilestoneChain = {
    signerAddress: wallet.address,
    getChainId: async () =>
      Number(BigInt(await provider.send("eth_chainId", []))),
    hasCode: async (address) => (await provider.getCode(address)) !== "0x",
    readState: async () => {
      const tokenId = config.agentTokenId;
      const [
        version,
        boundCanonical,
        paused,
        localOwner,
        canonicalOwner,
        agentSeal,
        datas,
        sealedKeys,
        localTokenUri,
        canonicalTokenUri,
      ] = await Promise.all([
        readVersion(),
        readCanonical(),
        readPaused(),
        readLocalOwner(tokenId),
        readCanonicalOwner(tokenId),
        readSeal(tokenId),
        readDatas(tokenId),
        readSealedKeys(tokenId),
        readLocalUri(tokenId),
        readCanonicalUri(tokenId),
      ]);
      return Object.freeze({
        version: String(version),
        canonical: String(boundCanonical),
        paused: Boolean(paused),
        localOwner: String(localOwner),
        canonicalOwner: String(canonicalOwner),
        agentSeal: String(agentSeal),
        datas: Object.freeze(
          [...datas].map((entry) =>
            Object.freeze({
              dataDescription: String(entry.dataDescription),
              dataHash: String(entry.dataHash) as `0x${string}`,
            }),
          ),
        ),
        sealedKeys: Object.freeze(
          [...sealedKeys].map((entry) => String(entry) as `0x${string}`),
        ),
        localTokenUri: String(localTokenUri),
        canonicalTokenUri: String(canonicalTokenUri),
      });
    },
    encodeUpdateAt: (data, sealedKey) =>
      AGENTIC_INTERFACE.encodeFunctionData("updateAt", [
        config.agentTokenId,
        config.intelligentDataIndex,
        data,
        sealedKey,
      ]),
    simulateUpdateAt: async (data, sealedKey) => {
      await updateAt.staticCall(
        config.agentTokenId,
        config.intelligentDataIndex,
        data,
        sealedKey,
      );
    },
    estimateUpdateAtGas: async (data, sealedKey) =>
      updateAt.estimateGas(
        config.agentTokenId,
        config.intelligentDataIndex,
        data,
        sealedKey,
      ),
    sendUpdateAt: async (data, sealedKey, gasLimit) =>
      submit(
        updateAt.send(
          config.agentTokenId,
          config.intelligentDataIndex,
          data,
          sealedKey,
          { gasLimit, value: 0n },
        ),
      ),
    encodeSetAgentUri: (uri) =>
      AGENTIC_INTERFACE.encodeFunctionData("setAgentURI", [
        config.agentTokenId,
        uri,
      ]),
    simulateSetAgentUri: async (uri) => {
      await setAgentURI.staticCall(config.agentTokenId, uri);
    },
    estimateSetAgentUriGas: async (uri) =>
      setAgentURI.estimateGas(config.agentTokenId, uri),
    sendSetAgentUri: async (uri, gasLimit) =>
      submit(
        setAgentURI.send(config.agentTokenId, uri, { gasLimit, value: 0n }),
      ),
  };
  return Object.freeze(chain);
}

function requiredCurrentData(
  state: AgenticMilestoneLiveState,
): AgenticMilestoneIntelligentData {
  const data = state.datas[0];
  if (!data) fail("AGENT_STATE_INVALID", false);
  return data;
}

async function positiveGasEstimate(
  operation: () => Promise<bigint>,
  code: "UPDATE_SIMULATION_FAILED" | "URI_TRANSACTION_FAILED",
): Promise<bigint> {
  const estimate = await operation().catch(() => fail(code, true));
  if (estimate <= 0n) fail(code, false);
  return estimate;
}

function gasWithMargin(value: bigint, percentage: bigint): bigint {
  return (value * percentage + 99n) / 100n;
}

function hmacBytes(
  key: Uint8Array,
  domain: string,
  payload: Uint8Array,
): Uint8Array {
  return Uint8Array.from(
    createHmac("sha256", key)
      .update(domain, "utf8")
      .update(Buffer.from([0]))
      .update(payload)
      .digest(),
  );
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength &&
    timingSafeEqual(Buffer.from(left), Buffer.from(right))
  );
}

function sha256(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (isPlainRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) fail("INVALID_CHECKPOINT", false);
  return encoded;
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function bytesHex(value: Uint8Array): `0x${string}` {
  return `0x${Buffer.from(value).toString("hex")}`;
}

function hexBytes(value: `0x${string}`): Uint8Array {
  return Uint8Array.from(Buffer.from(value.slice(2), "hex"));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  );
}

function fail(code: AgenticMilestoneErrorCode, retryable: boolean): never {
  throw new AgenticMilestoneError(code, retryable);
}
