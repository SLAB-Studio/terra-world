import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import {
  CANONICAL_ERC8004,
  PINNED_COMMIT,
  STORAGE_INDEXER,
  validateOnline,
  validatePlan,
  ZERO_ADDRESS,
} from "./validate-mainnet-plan.mjs";

function validPlan() {
  const owner = "0x1111111111111111111111111111111111111111";
  const root = `0x${"ab".repeat(32)}`;
  return {
    schemaVersion: 1,
    network: {
      chainId: 16661,
      rpcUrl: "https://evmrpc.0g.ai",
      storageIndexer: STORAGE_INDEXER,
      canonicalERC8004: CANONICAL_ERC8004,
      canonicalVersion: "2.0.0",
    },
    upstream: {
      repository: "https://github.com/0gfoundation/0g-agentic-id.git",
      commit: PINNED_COMMIT,
    },
    governance: {
      ownerMultisig: owner,
      ownerHasContractCode: true,
      ownerMultisigConfirmed: true,
      pauser: "0x2222222222222222222222222222222222222222",
      pauserSeparationConfirmed: true,
      proposers: [owner],
      executors: [ZERO_ADDRESS],
      timelockDelaySeconds: 172800,
      proposedDeployer: "0x3333333333333333333333333333333333333333",
    },
    deployment: {
      nftName: "Rivergate AgenticID",
      nftSymbol: "RGAID",
      maxProofAgeSeconds: 86400,
      agenticIdProxy: "0x4444444444444444444444444444444444444444",
      verifier: {
        mode: "disabled",
        proxy: "0x6666666666666666666666666666666666666666",
        teeOracle: ZERO_ADDRESS,
      },
    },
    claims: {
      teeAttested: false,
      sealedRuntime: false,
      serveProof: false,
      reputation: false,
      secureTransfer: false,
    },
    registration: {
      mode: "non-seal",
      registrant: "0x5555555555555555555555555555555555555555",
      agentURI: "https://example.com/agent-card.json",
      metadata: [],
      intelligentData: [
        {
          dataDescription: "encrypted bundle",
          dataHash: root,
          sealedKey: "0xabcd",
          encryption: {
            algorithm: "reviewed AEAD",
            recipient: "fingerprint",
            ciphertextOnlyUploaded: true,
            keyRecoveryTested: true,
          },
          storage: {
            rootHash: root,
            transactionHash: `0x${"cd".repeat(32)}`,
            finalized: true,
            downloadVerified: true,
          },
        },
      ],
      acknowledgements: {
        noAgentSealEver: true,
        noServeProofOrReputation: true,
        transfersDisabledUntilRealOracleReview: true,
        lostUnsealingKeyCanFreezeToken: true,
      },
    },
  };
}

test("accepts a complete disabled-verifier non-seal plan", () => {
  assert.deepEqual(validatePlan(validPlan(), "all"), []);
});

test("rejects TEE and runtime claims without real infrastructure", () => {
  const plan = validPlan();
  plan.claims.teeAttested = true;
  plan.deployment.verifier = {
    mode: "real-tee",
    teeOracle: "0x6666666666666666666666666666666666666666",
  };
  const errors = validatePlan(plan, "deployment").join("\n");
  assert.match(errors, /only verifier.mode=disabled/);
  assert.match(errors, /claim teeAttested must be false/);
});

test("rejects unsafe governance", () => {
  const plan = validPlan();
  plan.governance.pauser = plan.governance.ownerMultisig;
  plan.governance.timelockDelaySeconds = 0;
  const errors = validatePlan(plan).join("\n");
  assert.match(errors, /pauser must be separate/);
  assert.match(errors, /at least 172800/);
});

test("rejects unfinalized, plaintext, or mismatched 0G Storage data", () => {
  const plan = validPlan();
  plan.registration.intelligentData[0].encryption.ciphertextOnlyUploaded = false;
  plan.registration.intelligentData[0].storage.finalized = false;
  plan.registration.intelligentData[0].storage.rootHash = `0x${"ef".repeat(32)}`;
  const errors = validatePlan(plan, "registration").join("\n");
  assert.match(errors, /only ciphertext/);
  assert.match(errors, /upload must be finalized/);
  assert.match(errors, /dataHash must equal/);
});

test("rejects secrets in a plan", () => {
  const plan = validPlan();
  plan.privateKey = "never store this";
  assert.match(validatePlan(plan).join("\n"), /must not contain private keys/);
});

test("online registration rejects an AgenticID wired to a different verifier", async () => {
  const plan = validPlan();
  const wrongVerifier = "0x7777777777777777777777777777777777777777";
  const errors = await validateOnline(
    plan,
    "registration",
    onlineRpc(plan, wrongVerifier),
  );
  assert.match(
    errors.join("\n"),
    /AgenticID verifier\(\) does not match the planned verifier proxy/,
  );
});

test("online registration accepts the exact planned verifier binding", async () => {
  const plan = validPlan();
  const errors = await validateOnline(
    plan,
    "registration",
    onlineRpc(plan, plan.deployment.verifier.proxy),
  );
  assert.deepEqual(errors, []);
});

function onlineRpc(plan, agenticVerifier) {
  return async (_url, method, params = []) => {
    if (method === "eth_chainId") return "0x4115";
    if (method === "eth_getCode") return "0x6000";
    if (method !== "eth_call")
      throw new Error(`unexpected RPC method ${method}`);

    const call = params[0];
    switch (call.data) {
      case "0x0d8e6e2c":
        return abiString("2.0.0");
      case "0xffa1ad74":
        return abiString("1.1.0");
      case "0x26afaadd":
        return abiAddress(CANONICAL_ERC8004);
      case "0x2b7ac3f3":
        return abiAddress(agenticVerifier);
      case "0x8da5cb5b":
        return abiAddress(plan.governance.ownerMultisig);
      case "0x9fd0506d":
        return abiAddress(plan.governance.pauser);
      case "0x3622983c":
        return abiAddress(ZERO_ADDRESS);
      default:
        throw new Error(`unexpected selector ${call.data}`);
    }
  };
}

function abiAddress(address) {
  return `0x${address.slice(2).padStart(64, "0")}`;
}

function abiString(value) {
  const encoded = Buffer.from(value, "utf8").toString("hex");
  return `0x${"20".padStart(64, "0")}${value.length
    .toString(16)
    .padStart(
      64,
      "0",
    )}${encoded.padEnd(Math.ceil(encoded.length / 64) * 64, "0")}`;
}
