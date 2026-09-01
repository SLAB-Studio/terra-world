import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import test from "node:test";
import { tmpdir } from "node:os";
import path from "node:path";
import { URL } from "node:url";

import { createRequire } from "node:module";

import {
  AGENTIC_ID_PROXY,
  AgenticIdRegistrationError,
  buildRivergateAgentUri,
  CANONICAL_REGISTRY,
  parseCanonicalRegisteredAgentId,
  parseRegistrationArgs,
  runAgenticIdRegistration,
  runRegistrationCli,
  selectRegistrationPrivateKey,
  validateStorageRegistrationManifest,
} from "./register-agentic-id-mainnet.mjs";

const require = createRequire(
  new URL("../../packages/zero-g/package.json", import.meta.url),
);
const { Interface } = require("ethers");

const PRIVATE_KEY = `0x${"11".repeat(32)}`;
const ROOT = `0x${"22".repeat(32)}`;
const TRANSACTION_HASH = `0x${"33".repeat(32)}`;
const REGISTER_HASH = `0x${"44".repeat(32)}`;
const UPDATE_HASH = `0x${"55".repeat(32)}`;
const DEPLOYER = "0x402eA1d4e1335Cc6BdcB6b1AA1563AD93eb5392e";
const WRAPPED_KEY = "0xcafebabe";
const AGENT_ID = 42n;
const REGISTERED = new Interface([
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
]);

function manifest(overrides = {}) {
  return {
    schemaVersion: 1,
    network: "0g-mainnet",
    chainId: 16661,
    rootHash: ROOT,
    transactionHash: TRANSACTION_HASH,
    finalized: true,
    downloadVerified: true,
    ciphertextOnlyUploaded: true,
    keyRecoveryTested: true,
    dataDescription: "Rivergate encrypted agent bundle on 0G Storage",
    recipientFingerprint: "sha256:recipient-key-fingerprint",
    ...overrides,
  };
}

function registeredLog(agentId = AGENT_ID) {
  const encoded = REGISTERED.encodeEventLog(REGISTERED.getEvent("Registered"), [
    agentId,
    "",
    AGENTIC_ID_PROXY,
  ]);
  return { address: CANONICAL_REGISTRY, ...encoded };
}

function receipt(hash, logs = []) {
  return {
    status: 1,
    hash,
    to: AGENTIC_ID_PROXY,
    blockNumber: 100,
    gasUsed: 120_000n,
    logs,
  };
}

function fakeClient(overrides = {}) {
  const { initialUri = null, ...clientOverrides } = overrides;
  let currentUri = initialUri;
  const calls = [];
  const client = {
    address: DEPLOYER,
    getChainId: async () => 16661,
    hasCode: async () => true,
    getCanonicalVersion: async () => "2.0.0",
    getAgenticIdVersion: async () => "1.1.0",
    getBoundCanonical: async () => CANONICAL_REGISTRY,
    isPaused: async () => false,
    simulateRegister: async (input) => {
      calls.push(["simulate", input]);
      currentUri = input.agentURI;
      return AGENT_ID;
    },
    estimateRegisterGas: async (input) => {
      calls.push(["estimate-register", input]);
      return 200_000n;
    },
    getNonces: async () => ({ latest: 5, pending: 5 }),
    getGasPrice: async () => 1_000_000_000n,
    getBalance: async () => 10n ** 20n,
    getTransactionReceipt: async (transactionHash) =>
      transactionHash === REGISTER_HASH
        ? receipt(REGISTER_HASH, [registeredLog()])
        : null,
    broadcastRegister: async (input, gasLimit, gasPrice, nonce) => {
      calls.push(["broadcast-register", input, gasLimit, gasPrice, nonce]);
      currentUri = input.agentURI;
      return { receipt: receipt(REGISTER_HASH, [registeredLog()]) };
    },
    estimateSetAgentUriGas: async (agentId, uri) => {
      calls.push(["estimate-uri", agentId, uri]);
      return 80_000n;
    },
    broadcastSetAgentUri: async (agentId, uri) => {
      calls.push(["broadcast-uri", agentId, uri]);
      currentUri = uri;
      return { receipt: receipt(UPDATE_HASH) };
    },
    getLocalOwner: async () => DEPLOYER,
    getCanonicalOwner: async () => AGENTIC_ID_PROXY,
    getLocalTokenUri: async () => currentUri,
    getCanonicalTokenUri: async () => currentUri,
    getAgentSeal: async () => "0x0000000000000000000000000000000000000000",
    getIntelligentDatas: async () => [
      {
        dataDescription: manifest().dataDescription,
        dataHash: ROOT,
      },
    ],
    getSealedKeys: async () => [WRAPPED_KEY],
    ...clientOverrides,
  };
  return { calls, client };
}

test("accepts only the guarded manifest, wrapped-key file interface and explicit broadcast", () => {
  assert.deepEqual(
    parseRegistrationArgs([
      "--manifest",
      "storage.json",
      "--wrapped-key-file",
      "wrapped-key.hex",
    ]),
    {
      manifest: "storage.json",
      wrappedKeyFile: "wrapped-key.hex",
      broadcast: false,
    },
  );
  assert.equal(
    parseRegistrationArgs([
      "--manifest",
      "storage.json",
      "--wrapped-key-file",
      "wrapped-key.hex",
      "--broadcast",
    ]).broadcast,
    true,
  );
  assert.throws(
    () => parseRegistrationArgs(["--broadcast"]),
    errorCode("INVALID_ARGUMENTS"),
  );
  assert.deepEqual(
    parseRegistrationArgs([
      "--manifest",
      "storage.json",
      "--wrapped-key-file",
      "wrapped-key.hex",
      "--resume-agent-id",
      "3531123",
      "--register-tx",
      REGISTER_HASH,
    ]),
    {
      manifest: "storage.json",
      wrappedKeyFile: "wrapped-key.hex",
      broadcast: false,
      resumeAgentId: 3531123n,
      registerTransactionHash: REGISTER_HASH,
    },
  );
  assert.throws(
    () =>
      parseRegistrationArgs([
        "--manifest",
        "storage.json",
        "--wrapped-key-file",
        "wrapped-key.hex",
        "--resume-agent-id",
        "42",
      ]),
    errorCode("INVALID_ARGUMENTS"),
  );
});

test("requires exactly one structurally valid signer without returning it", () => {
  assert.equal(
    selectRegistrationPrivateKey({
      AGENTIC_ID_DEPLOYER_PRIVATE_KEY: PRIVATE_KEY,
    }),
    PRIVATE_KEY,
  );
  assert.equal(
    selectRegistrationPrivateKey({ ZERO_G_SPONSOR_PRIVATE_KEY: PRIVATE_KEY }),
    PRIVATE_KEY,
  );
  assert.throws(
    () =>
      selectRegistrationPrivateKey({
        AGENTIC_ID_DEPLOYER_PRIVATE_KEY: PRIVATE_KEY,
        ZERO_G_SPONSOR_PRIVATE_KEY: PRIVATE_KEY,
      }),
    errorCode("INVALID_SIGNER_CONFIGURATION"),
  );
});

test("validates finalized ciphertext evidence and rejects secret-bearing manifests", () => {
  const prepared = validateStorageRegistrationManifest(manifest());
  assert.equal(prepared.rootHash, ROOT);
  assert.equal(prepared.transactionSequence, null);
  assert.equal(
    validateStorageRegistrationManifest(
      manifest({ transactionHash: null, transactionSequence: 23 }),
    ).transactionHash,
    null,
  );
  assert.throws(
    () => validateStorageRegistrationManifest(manifest({ finalized: false })),
    errorCode("INVALID_STORAGE_MANIFEST"),
  );
  assert.throws(
    () =>
      validateStorageRegistrationManifest({
        ...manifest(),
        privateKey: PRIVATE_KEY,
      }),
    errorCode("STORAGE_MANIFEST_CONTAINS_SECRET"),
  );
});

test("builds deterministic temporary and canonical ERC-8004 data URIs", () => {
  const storage = validateStorageRegistrationManifest(manifest());
  const temporary = decodeDataUri(buildRivergateAgentUri(storage));
  const canonicalUri = buildRivergateAgentUri(storage, AGENT_ID);
  const canonical = decodeDataUri(canonicalUri);

  assert.equal(temporary.active, false);
  assert.deepEqual(temporary.registrations, []);
  assert.equal(canonical.active, true);
  assert.deepEqual(canonical.registrations, [
    {
      agentId: 42,
      agentRegistry: `eip155:16661:${CANONICAL_REGISTRY}`,
    },
  ]);
  assert.equal(canonical.properties.sealMode, "none");
  assert.equal(canonical.properties.intelligentDataRoot, ROOT);
  assert.equal(buildRivergateAgentUri(storage, AGENT_ID), canonicalUri);
});

test("dry-run validates both deployed contracts and never broadcasts", async () => {
  const fake = fakeClient();
  const result = await runAgenticIdRegistration(
    {
      manifest: manifest(),
      wrappedKey: WRAPPED_KEY,
      broadcast: false,
      environment: { AGENTIC_ID_DEPLOYER_PRIVATE_KEY: PRIVATE_KEY },
    },
    { createClient: async () => fake.client },
  );

  assert.equal(result.ok, true);
  assert.equal(result.broadcast, false);
  assert.equal(result.simulatedAgentId, "42");
  assert.equal(result.nonSeal, true);
  assert.equal(
    fake.calls.filter(([name]) => name.startsWith("broadcast")).length,
    0,
  );
  assert.equal(JSON.stringify(result).includes(PRIVATE_KEY), false);
  assert.equal(JSON.stringify(result).includes(WRAPPED_KEY), false);
});

test("fails closed on chain, bytecode, version, canonical binding, or pause drift", async (t) => {
  const cases = [
    ["chain", { getChainId: async () => 16602 }, "CHAIN_MISMATCH"],
    ["code", { hasCode: async () => false }, "CANONICAL_CODE_MISSING"],
    [
      "canonical version",
      { getCanonicalVersion: async () => "1.0.0" },
      "CANONICAL_VERSION_MISMATCH",
    ],
    [
      "proxy version",
      { getAgenticIdVersion: async () => "1.0.0" },
      "PROXY_VERSION_MISMATCH",
    ],
    [
      "binding",
      {
        getBoundCanonical: async () =>
          "0x0000000000000000000000000000000000000001",
      },
      "PROXY_CANONICAL_MISMATCH",
    ],
    ["pause", { isPaused: async () => true }, "PROXY_PAUSED"],
  ];
  for (const [name, override, code] of cases) {
    await t.test(name, async () => {
      const fake = fakeClient(override);
      await assert.rejects(
        runAgenticIdRegistration(
          {
            manifest: manifest(),
            wrappedKey: WRAPPED_KEY,
            broadcast: false,
            environment: { ZERO_G_SPONSOR_PRIVATE_KEY: PRIVATE_KEY },
          },
          { createClient: async () => fake.client },
        ),
        errorCode(code),
      );
    });
  }
});

test("broadcast parses the canonical id then verifies and canonicalizes the URI", async () => {
  const fake = fakeClient();
  const result = await runAgenticIdRegistration(
    {
      manifest: manifest(),
      wrappedKey: WRAPPED_KEY,
      broadcast: true,
      environment: { AGENTIC_ID_DEPLOYER_PRIVATE_KEY: PRIVATE_KEY },
    },
    { createClient: async () => fake.client },
  );

  assert.equal(result.broadcast, true);
  assert.equal(result.agentId, "42");
  assert.equal(result.registerTransactionHash, REGISTER_HASH);
  assert.equal(result.setAgentUriTransactionHash, UPDATE_HASH);
  const update = fake.calls.find(([name]) => name === "broadcast-uri");
  assert.equal(update[1], AGENT_ID);
  assert.equal(decodeDataUri(update[2]).registrations[0].agentId, 42);
  assert.equal(JSON.stringify(result).includes(WRAPPED_KEY), false);
  assert.equal(JSON.stringify(result).includes(PRIVATE_KEY), false);
});

test("resume dry-run proves the receipt and preliminary state without reminting", async () => {
  const storage = validateStorageRegistrationManifest(manifest());
  const fake = fakeClient({ initialUri: buildRivergateAgentUri(storage) });
  const result = await runAgenticIdRegistration(
    {
      manifest: manifest(),
      wrappedKey: WRAPPED_KEY,
      broadcast: false,
      environment: { AGENTIC_ID_DEPLOYER_PRIVATE_KEY: PRIVATE_KEY },
      resume: {
        agentId: AGENT_ID,
        registerTransactionHash: REGISTER_HASH,
      },
    },
    { createClient: async () => fake.client },
  );

  assert.equal(result.resume, true);
  assert.equal(result.broadcast, false);
  assert.equal(result.status, "ready-to-update");
  assert.equal(result.agentId, "42");
  assert.equal(result.registerTransactionHash, REGISTER_HASH);
  assert.equal(
    fake.calls.some(([name]) =>
      ["simulate", "estimate-register", "broadcast-register"].includes(name),
    ),
    false,
  );
  assert.equal(
    fake.calls.filter(([name]) => name === "estimate-uri").length,
    1,
  );
  assert.equal(
    fake.calls.filter(([name]) => name === "broadcast-uri").length,
    0,
  );
});

test("resume broadcast only canonicalizes the proven existing token", async () => {
  const storage = validateStorageRegistrationManifest(manifest());
  const fake = fakeClient({ initialUri: buildRivergateAgentUri(storage) });
  const result = await runAgenticIdRegistration(
    {
      manifest: manifest(),
      wrappedKey: WRAPPED_KEY,
      broadcast: true,
      environment: { AGENTIC_ID_DEPLOYER_PRIVATE_KEY: PRIVATE_KEY },
      resume: {
        agentId: AGENT_ID,
        registerTransactionHash: REGISTER_HASH,
      },
    },
    { createClient: async () => fake.client },
  );

  assert.equal(result.status, "canonicalized");
  assert.equal(result.setAgentUriTransactionHash, UPDATE_HASH);
  assert.equal(
    fake.calls.some(([name]) =>
      ["simulate", "estimate-register", "broadcast-register"].includes(name),
    ),
    false,
  );
  assert.equal(
    fake.calls.filter(([name]) => name === "broadcast-uri").length,
    1,
  );
});

test("resume is idempotent when the canonical URI is already stored", async () => {
  const storage = validateStorageRegistrationManifest(manifest());
  const fake = fakeClient({
    initialUri: buildRivergateAgentUri(storage, AGENT_ID),
  });
  const result = await runAgenticIdRegistration(
    {
      manifest: manifest(),
      wrappedKey: WRAPPED_KEY,
      broadcast: true,
      environment: { AGENTIC_ID_DEPLOYER_PRIVATE_KEY: PRIVATE_KEY },
      resume: {
        agentId: AGENT_ID,
        registerTransactionHash: REGISTER_HASH,
      },
    },
    { createClient: async () => fake.client },
  );

  assert.equal(result.status, "already-canonical");
  assert.equal(result.broadcast, false);
  assert.equal(
    fake.calls.some(([name]) =>
      [
        "simulate",
        "estimate-register",
        "estimate-uri",
        "broadcast-uri",
      ].includes(name),
    ),
    false,
  );
});

test("resume rejects a receipt whose Registered token differs", async () => {
  const storage = validateStorageRegistrationManifest(manifest());
  const fake = fakeClient({
    initialUri: buildRivergateAgentUri(storage),
    getTransactionReceipt: async () =>
      receipt(REGISTER_HASH, [registeredLog(43n)]),
  });
  await assert.rejects(
    runAgenticIdRegistration(
      {
        manifest: manifest(),
        wrappedKey: WRAPPED_KEY,
        broadcast: false,
        environment: { AGENTIC_ID_DEPLOYER_PRIVATE_KEY: PRIVATE_KEY },
        resume: {
          agentId: AGENT_ID,
          registerTransactionHash: REGISTER_HASH,
        },
      },
      { createClient: async () => fake.client },
    ),
    errorCode("REGISTER_TRANSACTION_MISMATCH"),
  );
  assert.equal(
    fake.calls.some(([name]) => name.startsWith("broadcast")),
    false,
  );
});

test("post-transaction verification retries bounded RPC propagation lag", async () => {
  let ownerReads = 0;
  const delays = [];
  const fake = fakeClient({
    getLocalOwner: async () => {
      ownerReads += 1;
      if (ownerReads < 3) throw new Error("stale RPC");
      return DEPLOYER;
    },
  });
  const result = await runAgenticIdRegistration(
    {
      manifest: manifest(),
      wrappedKey: WRAPPED_KEY,
      broadcast: true,
      environment: { AGENTIC_ID_DEPLOYER_PRIVATE_KEY: PRIVATE_KEY },
    },
    {
      createClient: async () => fake.client,
      verificationAttempts: 4,
      verificationDelayMs: 7,
      delay: async (milliseconds) => delays.push(milliseconds),
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(delays, [7, 7]);
});

test("requires exactly one canonical Registered event owned by the proxy", () => {
  assert.equal(
    parseCanonicalRegisteredAgentId(receipt(REGISTER_HASH, [registeredLog()])),
    AGENT_ID,
  );
  assert.throws(
    () =>
      parseCanonicalRegisteredAgentId(
        receipt(REGISTER_HASH, [registeredLog(), registeredLog(43n)]),
      ),
    errorCode("REGISTERED_EVENT_COUNT_MISMATCH"),
  );
  const wrongOwner = REGISTERED.encodeEventLog(
    REGISTERED.getEvent("Registered"),
    [AGENT_ID, "", DEPLOYER],
  );
  assert.throws(
    () =>
      parseCanonicalRegisteredAgentId(
        receipt(REGISTER_HASH, [
          { address: CANONICAL_REGISTRY, ...wrongOwner },
        ]),
      ),
    errorCode("REGISTERED_EVENT_MISMATCH"),
  );
});

test("refuses a post-mint ownership or non-seal verification mismatch", async () => {
  const fake = fakeClient({
    getAgentSeal: async () => DEPLOYER,
  });
  await assert.rejects(
    runAgenticIdRegistration(
      {
        manifest: manifest(),
        wrappedKey: WRAPPED_KEY,
        broadcast: true,
        environment: { AGENTIC_ID_DEPLOYER_PRIVATE_KEY: PRIVATE_KEY },
      },
      {
        createClient: async () => fake.client,
        verificationAttempts: 2,
        verificationDelayMs: 0,
        delay: async () => {},
      },
    ),
    errorCode("POST_REGISTRATION_VERIFICATION_FAILED"),
  );
});

test("CLI output sanitizes unknown signer and RPC failures", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "rivergate-register-"));
  try {
    const manifestPath = path.join(directory, "storage.json");
    const wrappedKeyPath = path.join(directory, "wrapped-key.hex");
    await Promise.all([
      writeFile(manifestPath, JSON.stringify(manifest())),
      writeFile(wrappedKeyPath, WRAPPED_KEY),
    ]);
    let output = "";
    const exitCode = await runRegistrationCli({
      argv: ["--manifest", manifestPath, "--wrapped-key-file", wrappedKeyPath],
      environment: { AGENTIC_ID_DEPLOYER_PRIVATE_KEY: PRIVATE_KEY },
      createClient: async () => {
        throw new Error(`remote failure echoed ${PRIVATE_KEY} ${WRAPPED_KEY}`);
      },
      write: (value) => {
        output += value;
      },
    });

    assert.equal(exitCode, 1);
    assert.deepEqual(JSON.parse(output), {
      ok: false,
      error: "REGISTRATION_FAILED",
    });
    assert.equal(output.includes(PRIVATE_KEY), false);
    assert.equal(output.includes(WRAPPED_KEY), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function decodeDataUri(uri) {
  const prefix = "data:application/json;base64,";
  assert.ok(uri.startsWith(prefix));
  return JSON.parse(Buffer.from(uri.slice(prefix.length), "base64").toString());
}

function errorCode(code) {
  return (error) =>
    error instanceof AgenticIdRegistrationError && error.code === code;
}
