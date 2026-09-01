#!/usr/bin/env node
/* global process */

import { Buffer } from "node:buffer";
import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";

const require = createRequire(
  new URL("../../packages/zero-g/package.json", import.meta.url),
);
const {
  Contract,
  Interface,
  JsonRpcProvider,
  Wallet,
  getAddress,
  keccak256,
  toUtf8Bytes,
} = require("ethers");

export const MAINNET_CHAIN_ID = 16661;
export const MAINNET_RPC_URL = "https://evmrpc.0g.ai";
export const AGENTIC_ID_PROXY = "0x0953a70D8c055799ef55404dE72d1d6c541046a9";
export const CANONICAL_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
export const UPSTREAM_COMMIT = "afc4d0e94af94ad5f2351215ed32c94e2fe7a54e";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const BYTES32 = /^0x[0-9a-fA-F]{64}$/u;
const BYTES = /^0x(?:[0-9a-fA-F]{2})+$/u;
const PRIVATE_KEY = /^0x[0-9a-fA-F]{64}$/u;
const DECIMAL_AGENT_ID = /^(?:0|[1-9][0-9]*)$/u;
const SAFE_MANIFEST_TEXT = /^[A-Za-z0-9][A-Za-z0-9 ._:/()#,+-]{0,255}$/u;
const FORBIDDEN_MANIFEST_FIELD =
  /(?:private.?key|mnemonic|seed.?phrase|secret|wrapped.?key|sealed.?key)/iu;
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_WRAPPED_KEY_BYTES = 64 * 1024;
const REGISTER_GAS_MARGIN_PERCENT = 125n;
const UPDATE_GAS_MARGIN_PERCENT = 120n;
const URI_UPDATE_GAS_RESERVE = 250_000n;
const POST_TRANSACTION_VERIFICATION_ATTEMPTS = 8;
const POST_TRANSACTION_VERIFICATION_DELAY_MS = 1_500;

const AGENTIC_ID_ABI = Object.freeze([
  "function VERSION() view returns (string)",
  "function canonical() view returns (address)",
  "function paused() view returns (bool)",
  "function register(string agentURI, tuple(string metadataKey, bytes metadataValue)[] metadata, tuple(string dataDescription, bytes32 dataHash)[] intelligentDatas, bytes[] sealedKeys) returns (uint256 agentId)",
  "function setAgentURI(uint256 agentId, string newURI)",
  "function ownerOf(uint256 agentId) view returns (address)",
  "function tokenURI(uint256 agentId) view returns (string)",
  "function getAgentSeal(uint256 agentId) view returns (address)",
  "function intelligentDatasOf(uint256 agentId) view returns (tuple(string dataDescription, bytes32 dataHash)[])",
  "function sealedKeysOf(uint256 agentId) view returns (bytes[])",
]);

const CANONICAL_ABI = Object.freeze([
  "function getVersion() view returns (string)",
  "function ownerOf(uint256 agentId) view returns (address)",
  "function tokenURI(uint256 agentId) view returns (string)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
]);
const CANONICAL_INTERFACE = new Interface(CANONICAL_ABI);

export class AgenticIdRegistrationError extends Error {
  constructor(code, context = {}) {
    super(code);
    this.name = "AgenticIdRegistrationError";
    this.code = code;
    this.publicContext = Object.freeze({ ...context });
  }
}

function fail(code, context) {
  throw new AgenticIdRegistrationError(code, context);
}

export function parseRegistrationArgs(argv) {
  const parsed = { broadcast: false };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (seen.has(argument)) fail("INVALID_ARGUMENTS");
    seen.add(argument);
    if (argument === "--manifest") parsed.manifest = argv[++index];
    else if (argument === "--wrapped-key-file") {
      parsed.wrappedKeyFile = argv[++index];
    } else if (argument === "--resume-agent-id") {
      parsed.resumeAgentId = argv[++index];
    } else if (argument === "--register-tx") {
      parsed.registerTransactionHash = argv[++index];
    } else if (argument === "--broadcast") parsed.broadcast = true;
    else fail("INVALID_ARGUMENTS");
  }
  if (
    typeof parsed.manifest !== "string" ||
    parsed.manifest.length === 0 ||
    typeof parsed.wrappedKeyFile !== "string" ||
    parsed.wrappedKeyFile.length === 0
  ) {
    fail("INVALID_ARGUMENTS");
  }
  const hasResumeAgentId = parsed.resumeAgentId !== undefined;
  const hasRegisterTransactionHash =
    parsed.registerTransactionHash !== undefined;
  if (hasResumeAgentId !== hasRegisterTransactionHash) {
    fail("INVALID_ARGUMENTS");
  }
  if (hasResumeAgentId) {
    if (
      typeof parsed.resumeAgentId !== "string" ||
      !DECIMAL_AGENT_ID.test(parsed.resumeAgentId) ||
      !BYTES32.test(parsed.registerTransactionHash)
    ) {
      fail("INVALID_ARGUMENTS");
    }
    const agentId = BigInt(parsed.resumeAgentId);
    if (agentId > BigInt(Number.MAX_SAFE_INTEGER)) fail("INVALID_ARGUMENTS");
    parsed.resumeAgentId = agentId;
    parsed.registerTransactionHash =
      parsed.registerTransactionHash.toLowerCase();
  }
  return Object.freeze(parsed);
}

export function selectRegistrationPrivateKey(environment) {
  const candidates = [
    environment.AGENTIC_ID_DEPLOYER_PRIVATE_KEY?.trim(),
    environment.ZERO_G_SPONSOR_PRIVATE_KEY?.trim(),
  ].filter(Boolean);
  if (candidates.length !== 1 || !PRIVATE_KEY.test(candidates[0])) {
    fail("INVALID_SIGNER_CONFIGURATION");
  }
  return candidates[0];
}

export function validateStorageRegistrationManifest(value) {
  if (!isPlainRecord(value)) fail("INVALID_STORAGE_MANIFEST");
  if (findForbiddenManifestFields(value).length > 0) {
    fail("STORAGE_MANIFEST_CONTAINS_SECRET");
  }
  if (
    value.schemaVersion !== 1 ||
    value.network !== "0g-mainnet" ||
    value.chainId !== MAINNET_CHAIN_ID ||
    !BYTES32.test(value.rootHash ?? "") ||
    (value.transactionHash !== null &&
      !BYTES32.test(value.transactionHash ?? "")) ||
    (value.transactionSequence !== undefined &&
      (!Number.isSafeInteger(value.transactionSequence) ||
        value.transactionSequence < 0)) ||
    value.finalized !== true ||
    value.downloadVerified !== true ||
    value.ciphertextOnlyUploaded !== true ||
    value.keyRecoveryTested !== true ||
    typeof value.dataDescription !== "string" ||
    !SAFE_MANIFEST_TEXT.test(value.dataDescription) ||
    typeof value.recipientFingerprint !== "string" ||
    !SAFE_MANIFEST_TEXT.test(value.recipientFingerprint)
  ) {
    fail("INVALID_STORAGE_MANIFEST");
  }
  return Object.freeze({
    rootHash: value.rootHash.toLowerCase(),
    transactionHash: value.transactionHash?.toLowerCase() ?? null,
    transactionSequence: value.transactionSequence ?? null,
    dataDescription: value.dataDescription,
    recipientFingerprint: value.recipientFingerprint,
  });
}

export function validateWrappedKey(value) {
  const wrappedKey = value.trim();
  if (
    !BYTES.test(wrappedKey) ||
    (wrappedKey.length - 2) / 2 > MAX_WRAPPED_KEY_BYTES
  ) {
    fail("INVALID_WRAPPED_KEY");
  }
  return wrappedKey.toLowerCase();
}

export function buildRivergateAgentUri(storage, agentId = null) {
  if (!BYTES32.test(storage.rootHash ?? "")) fail("INVALID_STORAGE_MANIFEST");
  if (
    agentId !== null &&
    (typeof agentId !== "bigint" ||
      agentId < 0n ||
      agentId > BigInt(Number.MAX_SAFE_INTEGER))
  ) {
    fail("INVALID_AGENT_ID");
  }
  const image = `data:image/svg+xml;base64,${Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#111c22"/><path d="M96 352 256 96l160 256" fill="none" stroke="#e4bb7b" stroke-width="36"/><circle cx="256" cy="352" r="56" fill="#87c9a1"/></svg>',
    "utf8",
  ).toString("base64")}`;
  const document = {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "Rivergate City Steward",
    description:
      "A non-seal Terra World city agent backed by encrypted data on 0G Storage.",
    image,
    services: [],
    x402Support: false,
    active: agentId !== null,
    registrations:
      agentId === null
        ? []
        : [
            {
              agentId: Number(agentId),
              agentRegistry: `eip155:${MAINNET_CHAIN_ID}:${CANONICAL_REGISTRY}`,
            },
          ],
    supportedTrust: [],
    properties: {
      agenticIdProxy: AGENTIC_ID_PROXY,
      intelligentDataRoot: storage.rootHash.toLowerCase(),
      sealMode: "none",
    },
  };
  return `data:application/json;base64,${Buffer.from(
    JSON.stringify(document),
    "utf8",
  ).toString("base64")}`;
}

export function parseCanonicalRegisteredAgentId(receipt) {
  const events = [];
  for (const log of receipt?.logs ?? []) {
    if (
      typeof log?.address !== "string" ||
      log.address.toLowerCase() !== CANONICAL_REGISTRY.toLowerCase()
    ) {
      continue;
    }
    try {
      const parsed = CANONICAL_INTERFACE.parseLog(log);
      if (parsed?.name === "Registered") events.push(parsed);
    } catch {
      // Other canonical-registry events are expected during registration.
    }
  }
  if (events.length !== 1) fail("REGISTERED_EVENT_COUNT_MISMATCH");
  const event = events[0];
  if (
    getAddress(event.args.owner) !== getAddress(AGENTIC_ID_PROXY) ||
    event.args.agentURI !== ""
  ) {
    fail("REGISTERED_EVENT_MISMATCH");
  }
  return BigInt(event.args.agentId);
}

export async function runAgenticIdRegistration(input, dependencies = {}) {
  const storage = validateStorageRegistrationManifest(input.manifest);
  const wrappedKey = validateWrappedKey(input.wrappedKey);
  const resume = validateResumeInput(input.resume);
  const privateKey = selectRegistrationPrivateKey(input.environment);
  const createClient = dependencies.createClient ?? createEthersClient;
  const client = await createClient(privateKey);
  await validateLiveDeployment(client);

  const preliminaryAgentUri = buildRivergateAgentUri(storage);
  const registerInput = Object.freeze({
    agentURI: preliminaryAgentUri,
    metadata: Object.freeze([]),
    intelligentDatas: Object.freeze([
      Object.freeze({
        dataDescription: storage.dataDescription,
        dataHash: storage.rootHash,
      }),
    ]),
    sealedKeys: Object.freeze([wrappedKey]),
  });
  const publicBase = {
    kind: "rivergate-agentic-id-mainnet-registration",
    chainId: MAINNET_CHAIN_ID,
    rpcUrl: MAINNET_RPC_URL,
    agenticIdProxy: AGENTIC_ID_PROXY,
    canonicalRegistry: CANONICAL_REGISTRY,
    upstreamCommit: UPSTREAM_COMMIT,
    deployer: client.address,
    nonSeal: true,
    storageRoot: storage.rootHash,
    storageTransactionHash: storage.transactionHash,
    storageTransactionSequence: storage.transactionSequence,
    recipientFingerprint: storage.recipientFingerprint,
    preliminaryAgentUriHash: keccak256(toUtf8Bytes(preliminaryAgentUri)),
  };

  if (resume) {
    return resumeAgenticIdRegistration({
      client,
      storage,
      wrappedKey,
      preliminaryAgentUri,
      resume,
      broadcast: input.broadcast === true,
      dependencies,
      publicBase,
    });
  }

  const simulatedAgentId = BigInt(await client.simulateRegister(registerInput));
  const registerGasEstimate = BigInt(
    await client.estimateRegisterGas(registerInput),
  );
  if (registerGasEstimate <= 0n) fail("INVALID_GAS_ESTIMATE");
  const registerGasLimit = gasWithMargin(
    registerGasEstimate,
    REGISTER_GAS_MARGIN_PERCENT,
  );
  const finalAgentUri = buildRivergateAgentUri(storage, simulatedAgentId);
  const registrationPublicBase = {
    ...publicBase,
    registerGasEstimate: registerGasEstimate.toString(),
    registerGasLimit: registerGasLimit.toString(),
  };

  if (!input.broadcast) {
    return Object.freeze({
      ...registrationPublicBase,
      ok: true,
      broadcast: false,
      simulatedAgentId: simulatedAgentId.toString(),
      canonicalAgentUri: finalAgentUri,
      canonicalAgentUriHash: keccak256(toUtf8Bytes(finalAgentUri)),
    });
  }

  const nonces = await client.getNonces();
  if (nonces.latest !== nonces.pending) fail("PENDING_TRANSACTION_EXISTS");
  const gasPrice = BigInt(await client.getGasPrice());
  if (gasPrice <= 0n) fail("INVALID_GAS_PRICE");
  const balance = BigInt(await client.getBalance());
  const minimumBalance = (registerGasLimit + URI_UPDATE_GAS_RESERVE) * gasPrice;
  if (balance < minimumBalance) fail("INSUFFICIENT_BALANCE");

  const registration = await client.broadcastRegister(
    registerInput,
    registerGasLimit,
    gasPrice,
    nonces.pending,
  );
  assertSuccessfulReceipt(registration.receipt, "REGISTER_TRANSACTION_FAILED");
  const agentId = parseCanonicalRegisteredAgentId(registration.receipt);
  await verifyMintedAgentWithRetry(
    client,
    {
      agentId,
      expectedOwner: client.address,
      expectedAgentUri: preliminaryAgentUri,
      storage,
      wrappedKey,
    },
    dependencies,
  );

  const canonicalAgentUri = buildRivergateAgentUri(storage, agentId);
  const updateGasEstimate = BigInt(
    await client.estimateSetAgentUriGas(agentId, canonicalAgentUri),
  );
  if (updateGasEstimate <= 0n)
    fail("INVALID_GAS_ESTIMATE", { agentId: agentId.toString() });
  const updateGasLimit = gasWithMargin(
    updateGasEstimate,
    UPDATE_GAS_MARGIN_PERCENT,
  );
  const remainingBalance = BigInt(await client.getBalance());
  if (remainingBalance < updateGasLimit * gasPrice) {
    fail("INSUFFICIENT_BALANCE_FOR_URI_UPDATE", {
      agentId: agentId.toString(),
      registerTransactionHash: registration.receipt.hash,
    });
  }
  const update = await client.broadcastSetAgentUri(
    agentId,
    canonicalAgentUri,
    updateGasLimit,
    gasPrice,
  );
  assertSuccessfulReceipt(update.receipt, "URI_UPDATE_TRANSACTION_FAILED", {
    agentId: agentId.toString(),
    registerTransactionHash: registration.receipt.hash,
  });
  await verifyMintedAgentWithRetry(
    client,
    {
      agentId,
      expectedOwner: client.address,
      expectedAgentUri: canonicalAgentUri,
      storage,
      wrappedKey,
    },
    dependencies,
  );

  return Object.freeze({
    ...registrationPublicBase,
    ok: true,
    broadcast: true,
    agentId: agentId.toString(),
    canonicalAgentUri,
    canonicalAgentUriHash: keccak256(toUtf8Bytes(canonicalAgentUri)),
    registerTransactionHash: registration.receipt.hash,
    registerBlockNumber: registration.receipt.blockNumber,
    registerGasUsed: registration.receipt.gasUsed.toString(),
    setAgentUriTransactionHash: update.receipt.hash,
    setAgentUriBlockNumber: update.receipt.blockNumber,
    setAgentUriGasUsed: update.receipt.gasUsed.toString(),
    updateGasEstimate: updateGasEstimate.toString(),
    updateGasLimit: updateGasLimit.toString(),
  });
}

async function resumeAgenticIdRegistration({
  client,
  storage,
  wrappedKey,
  preliminaryAgentUri,
  resume,
  broadcast,
  dependencies,
  publicBase,
}) {
  const receipt = await retryPostTransactionRead(
    async () => {
      const candidate = await client.getTransactionReceipt(
        resume.registerTransactionHash,
      );
      assertSuccessfulReceipt(candidate, "REGISTER_TRANSACTION_NOT_CONFIRMED");
      return candidate;
    },
    dependencies,
    "REGISTER_TRANSACTION_NOT_CONFIRMED",
    { registerTransactionHash: resume.registerTransactionHash },
  );
  if (
    receipt.hash.toLowerCase() !== resume.registerTransactionHash ||
    typeof receipt.to !== "string" ||
    getAddress(receipt.to) !== getAddress(AGENTIC_ID_PROXY)
  ) {
    fail("REGISTER_TRANSACTION_MISMATCH", {
      agentId: resume.agentId.toString(),
      registerTransactionHash: resume.registerTransactionHash,
    });
  }
  const registeredAgentId = parseCanonicalRegisteredAgentId(receipt);
  if (registeredAgentId !== resume.agentId) {
    fail("REGISTER_TRANSACTION_MISMATCH", {
      agentId: resume.agentId.toString(),
      registerTransactionHash: resume.registerTransactionHash,
    });
  }

  const canonicalAgentUri = buildRivergateAgentUri(storage, resume.agentId);
  const state = await verifyResumableAgentWithRetry(
    client,
    {
      agentId: resume.agentId,
      expectedOwner: client.address,
      preliminaryAgentUri,
      canonicalAgentUri,
      storage,
      wrappedKey,
    },
    dependencies,
  );
  const resumePublicBase = {
    ...publicBase,
    resume: true,
    agentId: resume.agentId.toString(),
    canonicalAgentUri,
    canonicalAgentUriHash: keccak256(toUtf8Bytes(canonicalAgentUri)),
    registerTransactionHash: receipt.hash,
    registerBlockNumber: receipt.blockNumber,
    registerGasUsed: receipt.gasUsed.toString(),
  };
  if (state === "canonical") {
    return Object.freeze({
      ...resumePublicBase,
      ok: true,
      broadcast: false,
      status: "already-canonical",
    });
  }

  const updateGasEstimate = BigInt(
    await client.estimateSetAgentUriGas(resume.agentId, canonicalAgentUri),
  );
  if (updateGasEstimate <= 0n) {
    fail("INVALID_GAS_ESTIMATE", { agentId: resume.agentId.toString() });
  }
  const updateGasLimit = gasWithMargin(
    updateGasEstimate,
    UPDATE_GAS_MARGIN_PERCENT,
  );
  if (!broadcast) {
    return Object.freeze({
      ...resumePublicBase,
      ok: true,
      broadcast: false,
      status: "ready-to-update",
      updateGasEstimate: updateGasEstimate.toString(),
      updateGasLimit: updateGasLimit.toString(),
    });
  }

  const nonces = await client.getNonces();
  if (nonces.latest !== nonces.pending) fail("PENDING_TRANSACTION_EXISTS");
  const gasPrice = BigInt(await client.getGasPrice());
  if (gasPrice <= 0n) fail("INVALID_GAS_PRICE");
  const balance = BigInt(await client.getBalance());
  if (balance < updateGasLimit * gasPrice) {
    fail("INSUFFICIENT_BALANCE_FOR_URI_UPDATE", {
      agentId: resume.agentId.toString(),
      registerTransactionHash: receipt.hash,
    });
  }
  const update = await client.broadcastSetAgentUri(
    resume.agentId,
    canonicalAgentUri,
    updateGasLimit,
    gasPrice,
  );
  assertSuccessfulReceipt(update.receipt, "URI_UPDATE_TRANSACTION_FAILED", {
    agentId: resume.agentId.toString(),
    registerTransactionHash: receipt.hash,
  });
  await verifyMintedAgentWithRetry(
    client,
    {
      agentId: resume.agentId,
      expectedOwner: client.address,
      expectedAgentUri: canonicalAgentUri,
      storage,
      wrappedKey,
    },
    dependencies,
  );
  return Object.freeze({
    ...resumePublicBase,
    ok: true,
    broadcast: true,
    status: "canonicalized",
    setAgentUriTransactionHash: update.receipt.hash,
    setAgentUriBlockNumber: update.receipt.blockNumber,
    setAgentUriGasUsed: update.receipt.gasUsed.toString(),
    updateGasEstimate: updateGasEstimate.toString(),
    updateGasLimit: updateGasLimit.toString(),
  });
}

async function validateLiveDeployment(client) {
  if ((await client.getChainId()) !== MAINNET_CHAIN_ID) fail("CHAIN_MISMATCH");
  if (!(await client.hasCode(CANONICAL_REGISTRY))) {
    fail("CANONICAL_CODE_MISSING");
  }
  if ((await client.getCanonicalVersion()) !== "2.0.0") {
    fail("CANONICAL_VERSION_MISMATCH");
  }
  if (!(await client.hasCode(AGENTIC_ID_PROXY))) fail("PROXY_CODE_MISSING");
  if ((await client.getAgenticIdVersion()) !== "1.1.0") {
    fail("PROXY_VERSION_MISMATCH");
  }
  if (
    getAddress(await client.getBoundCanonical()) !==
    getAddress(CANONICAL_REGISTRY)
  ) {
    fail("PROXY_CANONICAL_MISMATCH");
  }
  if (await client.isPaused()) fail("PROXY_PAUSED");
}

function validateResumeInput(value) {
  if (value === undefined || value === null) return null;
  if (
    !isPlainRecord(value) ||
    typeof value.agentId !== "bigint" ||
    value.agentId < 0n ||
    value.agentId > BigInt(Number.MAX_SAFE_INTEGER) ||
    !BYTES32.test(value.registerTransactionHash ?? "")
  ) {
    fail("INVALID_RESUME_CONFIGURATION");
  }
  return Object.freeze({
    agentId: value.agentId,
    registerTransactionHash: value.registerTransactionHash.toLowerCase(),
  });
}

async function verifyMintedAgent(client, expected) {
  const state = await readMintedAgent(client, expected.agentId);
  assertCommonMintedAgentState(state, expected);
  if (
    state.localUri !== expected.expectedAgentUri ||
    state.canonicalUri !== expected.expectedAgentUri
  ) {
    fail("POST_REGISTRATION_VERIFICATION_FAILED", {
      agentId: expected.agentId.toString(),
    });
  }
}

async function verifyMintedAgentWithRetry(client, expected, dependencies) {
  return retryPostTransactionRead(
    () => verifyMintedAgent(client, expected),
    dependencies,
    "POST_REGISTRATION_VERIFICATION_FAILED",
    { agentId: expected.agentId.toString() },
  );
}

async function verifyResumableAgentWithRetry(client, expected, dependencies) {
  return retryPostTransactionRead(
    async () => {
      const state = await readMintedAgent(client, expected.agentId);
      assertCommonMintedAgentState(state, expected);
      if (
        state.localUri === expected.canonicalAgentUri &&
        state.canonicalUri === expected.canonicalAgentUri
      ) {
        return "canonical";
      }
      if (
        state.localUri === expected.preliminaryAgentUri &&
        state.canonicalUri === expected.preliminaryAgentUri
      ) {
        return "preliminary";
      }
      fail("POST_REGISTRATION_VERIFICATION_FAILED", {
        agentId: expected.agentId.toString(),
      });
    },
    dependencies,
    "POST_REGISTRATION_VERIFICATION_FAILED",
    { agentId: expected.agentId.toString() },
  );
}

async function readMintedAgent(client, agentId) {
  return {
    localOwner: getAddress(await client.getLocalOwner(agentId)),
    canonicalOwner: getAddress(await client.getCanonicalOwner(agentId)),
    localUri: await client.getLocalTokenUri(agentId),
    canonicalUri: await client.getCanonicalTokenUri(agentId),
    seal: getAddress(await client.getAgentSeal(agentId)),
    datas: await client.getIntelligentDatas(agentId),
    sealedKeys: await client.getSealedKeys(agentId),
  };
}

function assertCommonMintedAgentState(state, expected) {
  if (
    state.localOwner !== getAddress(expected.expectedOwner) ||
    state.canonicalOwner !== getAddress(AGENTIC_ID_PROXY) ||
    state.seal !== ZERO_ADDRESS ||
    state.datas.length !== 1 ||
    state.datas[0].dataDescription !== expected.storage.dataDescription ||
    state.datas[0].dataHash.toLowerCase() !== expected.storage.rootHash ||
    state.sealedKeys.length !== 1 ||
    state.sealedKeys[0].toLowerCase() !== expected.wrappedKey
  ) {
    fail("POST_REGISTRATION_VERIFICATION_FAILED", {
      agentId: expected.agentId.toString(),
    });
  }
}

async function retryPostTransactionRead(
  operation,
  dependencies,
  failureCode,
  context,
) {
  const attempts =
    dependencies.verificationAttempts ?? POST_TRANSACTION_VERIFICATION_ATTEMPTS;
  const delayMs =
    dependencies.verificationDelayMs ?? POST_TRANSACTION_VERIFICATION_DELAY_MS;
  const wait =
    dependencies.delay ??
    ((milliseconds) =>
      new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds)));
  if (
    !Number.isSafeInteger(attempts) ||
    attempts < 1 ||
    attempts > 20 ||
    !Number.isSafeInteger(delayMs) ||
    delayMs < 0 ||
    delayMs > 5_000 ||
    typeof wait !== "function"
  ) {
    fail("INVALID_RETRY_CONFIGURATION");
  }
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch {
      if (attempt === attempts) fail(failureCode, context);
      await wait(delayMs);
    }
  }
  fail(failureCode, context);
}

function gasWithMargin(estimate, percentage) {
  return (estimate * percentage + 99n) / 100n;
}

function assertSuccessfulReceipt(receipt, code, context = {}) {
  if (
    !receipt ||
    receipt.status !== 1 ||
    !BYTES32.test(receipt.hash ?? "") ||
    !Number.isSafeInteger(receipt.blockNumber) ||
    BigInt(receipt.gasUsed ?? 0) <= 0n
  ) {
    fail(code, context);
  }
}

async function createEthersClient(privateKey) {
  const provider = new JsonRpcProvider(MAINNET_RPC_URL, MAINNET_CHAIN_ID, {
    staticNetwork: true,
  });
  const wallet = new Wallet(privateKey, provider);
  const proxy = new Contract(AGENTIC_ID_PROXY, AGENTIC_ID_ABI, wallet);
  const canonical = new Contract(CANONICAL_REGISTRY, CANONICAL_ABI, wallet);
  const register = proxy.getFunction(
    "register(string,(string,bytes)[],(string,bytes32)[],bytes[])",
  );
  return Object.freeze({
    address: wallet.address,
    // Do not trust the statically configured ethers Network object here: read
    // the live RPC chain identity before simulating or signing anything.
    getChainId: async () =>
      Number(BigInt(await provider.send("eth_chainId", []))),
    hasCode: async (address) => (await provider.getCode(address)) !== "0x",
    getCanonicalVersion: async () => canonical.getVersion(),
    getAgenticIdVersion: async () => proxy.VERSION(),
    getBoundCanonical: async () => proxy.canonical(),
    isPaused: async () => proxy.paused(),
    simulateRegister: async (input) =>
      register.staticCall(
        input.agentURI,
        input.metadata,
        input.intelligentDatas,
        input.sealedKeys,
      ),
    estimateRegisterGas: async (input) =>
      register.estimateGas(
        input.agentURI,
        input.metadata,
        input.intelligentDatas,
        input.sealedKeys,
      ),
    getNonces: async () => ({
      latest: await provider.getTransactionCount(wallet.address, "latest"),
      pending: await provider.getTransactionCount(wallet.address, "pending"),
    }),
    getGasPrice: async () => {
      const feeData = await provider.getFeeData();
      return feeData.gasPrice ?? 0n;
    },
    getBalance: async () => provider.getBalance(wallet.address),
    getTransactionReceipt: async (transactionHash) =>
      provider.getTransactionReceipt(transactionHash),
    broadcastRegister: async (input, gasLimit, gasPrice, nonce) => {
      const transaction = await register.send(
        input.agentURI,
        input.metadata,
        input.intelligentDatas,
        input.sealedKeys,
        { gasLimit, gasPrice, nonce, value: 0n },
      );
      return { receipt: await transaction.wait(1) };
    },
    estimateSetAgentUriGas: async (agentId, agentURI) =>
      proxy.setAgentURI.estimateGas(agentId, agentURI),
    broadcastSetAgentUri: async (agentId, agentURI, gasLimit, gasPrice) => {
      const transaction = await proxy.setAgentURI(agentId, agentURI, {
        gasLimit,
        gasPrice,
        value: 0n,
      });
      return { receipt: await transaction.wait(1) };
    },
    getLocalOwner: async (agentId) => proxy.ownerOf(agentId),
    getCanonicalOwner: async (agentId) => canonical.ownerOf(agentId),
    getLocalTokenUri: async (agentId) => proxy.tokenURI(agentId),
    getCanonicalTokenUri: async (agentId) => canonical.tokenURI(agentId),
    getAgentSeal: async (agentId) => proxy.getAgentSeal(agentId),
    getIntelligentDatas: async (agentId) => proxy.intelligentDatasOf(agentId),
    getSealedKeys: async (agentId) => proxy.sealedKeysOf(agentId),
  });
}

async function readBoundedFile(file, maximumBytes, code) {
  const resolved = path.resolve(file);
  const details = await stat(resolved).catch(() => fail(code));
  if (!details.isFile() || details.size < 1 || details.size > maximumBytes) {
    fail(code);
  }
  return readFile(resolved, "utf8").catch(() => fail(code));
}

function findForbiddenManifestFields(
  value,
  currentPath = "manifest",
  found = [],
) {
  if (!value || typeof value !== "object") return found;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${currentPath}.${key}`;
    if (FORBIDDEN_MANIFEST_FIELD.test(key)) found.push(childPath);
    findForbiddenManifestFields(child, childPath, found);
  }
  return found;
}

function isPlainRecord(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

export async function runRegistrationCli(options = {}) {
  const argv = options.argv ?? process.argv.slice(2);
  const environment = options.environment ?? process.env;
  const write = options.write ?? ((value) => process.stdout.write(value));
  try {
    const args = parseRegistrationArgs(argv);
    const manifestText = await readBoundedFile(
      args.manifest,
      MAX_MANIFEST_BYTES,
      "INVALID_STORAGE_MANIFEST_FILE",
    );
    let manifest;
    try {
      manifest = JSON.parse(manifestText);
    } catch {
      fail("INVALID_STORAGE_MANIFEST");
    }
    const wrappedKey = await readBoundedFile(
      args.wrappedKeyFile,
      MAX_WRAPPED_KEY_BYTES,
      "INVALID_WRAPPED_KEY_FILE",
    );
    const result = await runAgenticIdRegistration(
      {
        manifest,
        wrappedKey,
        broadcast: args.broadcast,
        environment,
        resume:
          args.resumeAgentId === undefined
            ? null
            : {
                agentId: args.resumeAgentId,
                registerTransactionHash: args.registerTransactionHash,
              },
      },
      {
        createClient: options.createClient,
        verificationAttempts: options.verificationAttempts,
        verificationDelayMs: options.verificationDelayMs,
        delay: options.delay,
      },
    );
    write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    const publicError =
      error instanceof AgenticIdRegistrationError
        ? { ok: false, error: error.code, ...error.publicContext }
        : { ok: false, error: "REGISTRATION_FAILED" };
    write(`${JSON.stringify(publicError)}\n`);
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await runRegistrationCli();
}
