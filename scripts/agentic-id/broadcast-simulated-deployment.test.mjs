/* global URL */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { validateDeploymentArtifact } from "./broadcast-simulated-deployment.mjs";

const require = createRequire(
  new URL("../../packages/zero-g/package.json", import.meta.url),
);
const { getCreateAddress } = require("ethers");

const SENDER = "0x402eA1d4e1335Cc6BdcB6b1AA1563AD93eb5392e";
const NAMES = [
  "TimelockController",
  "TEEDataVerifier",
  "UpgradeableBeacon",
  "BeaconProxy",
  "AgenticID",
  "UpgradeableBeacon",
  "BeaconProxy",
  "AgenticIDReputationRegistry",
  "UpgradeableBeacon",
  "BeaconProxy",
];

function artifact(overrides = {}) {
  return {
    chain: 16661,
    transactions: NAMES.map((contractName, index) => ({
      transactionType: "CREATE",
      contractName,
      contractAddress: getCreateAddress({ from: SENDER, nonce: index + 2 }),
      transaction: {
        from: SENDER,
        to: null,
        gas: "0x100000",
        value: "0x0",
        input: "0x60006000",
        nonce: `0x${(index + 2).toString(16)}`,
      },
    })),
    ...overrides,
  };
}

test("accepts the exact deterministic ten-contract deployment", () => {
  const deployments = validateDeploymentArtifact(artifact(), SENDER);
  assert.equal(deployments.length, 10);
  assert.equal(deployments[0].nonce, 2);
  assert.equal(deployments[4].contractName, "AgenticID");
});

test("rejects a non-mainnet artifact", () => {
  assert.throws(
    () => validateDeploymentArtifact(artifact({ chain: 16602 }), SENDER),
    /not for 0G mainnet/u,
  );
});

test("rejects reordered contracts", () => {
  const changed = artifact();
  changed.transactions[4].contractName = "BeaconProxy";
  assert.throws(
    () => validateDeploymentArtifact(changed, SENDER),
    /Unexpected deployment transaction/u,
  );
});

test("rejects a mismatched sender", () => {
  const changed = artifact();
  changed.transactions[0].transaction.from =
    "0x0000000000000000000000000000000000000001";
  assert.throws(
    () => validateDeploymentArtifact(changed, SENDER),
    /sender mismatch/u,
  );
});

test("rejects a mismatched predicted CREATE address", () => {
  const changed = artifact();
  changed.transactions[0].contractAddress =
    "0x0000000000000000000000000000000000000001";
  assert.throws(
    () => validateDeploymentArtifact(changed, SENDER),
    /CREATE address mismatch/u,
  );
});
