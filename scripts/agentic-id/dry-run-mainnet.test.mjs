import assert from "node:assert/strict";
import test from "node:test";

import { buildFoundryEnvironment } from "./dry-run-mainnet.mjs";

test("passes only the minimal process environment plus reviewed Foundry config", () => {
  const plan = {
    network: {
      canonicalERC8004: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    },
    governance: {
      ownerMultisig: "0x1111111111111111111111111111111111111111",
      pauser: "0x2222222222222222222222222222222222222222",
      proposers: ["0x1111111111111111111111111111111111111111"],
      executors: ["0x0000000000000000000000000000000000000000"],
      timelockDelaySeconds: 172800,
    },
    deployment: {
      nftName: "Rivergate AgenticID",
      nftSymbol: "RGAID",
      maxProofAgeSeconds: 86400,
    },
  };
  const environment = buildFoundryEnvironment(plan, {
    PATH: "/operator/bin",
    HOME: "/operator/home",
    TMPDIR: "/operator/tmp",
    LANG: "C.UTF-8",
    TERM: "xterm-256color",
    CI: "true",
    PRIVATE_KEY: "must-not-pass",
    ZERO_G_SPONSOR_PRIVATE_KEY: "must-not-pass",
    HTTPS_PROXY: "https://credentials@proxy.invalid",
    FOUNDRY_FFI: "true",
    FOUNDRY_RPC_URL: "https://wrong-chain.invalid",
  });

  assert.deepEqual(environment, {
    PATH: "/operator/bin",
    HOME: "/operator/home",
    TMPDIR: "/operator/tmp",
    LANG: "C.UTF-8",
    TERM: "xterm-256color",
    CI: "true",
    OWNER: plan.governance.ownerMultisig,
    PAUSER: plan.governance.pauser,
    TEE_ORACLE: "0x0000000000000000000000000000000000000000",
    TIMELOCK_DELAY: "172800",
    PROPOSERS: plan.governance.proposers[0],
    EXECUTORS: plan.governance.executors[0],
    NFT_NAME: "Rivergate AgenticID",
    NFT_SYMBOL: "RGAID",
    MAX_PROOF_AGE: "86400",
    CANONICAL_8004: plan.network.canonicalERC8004,
  });
  assert.equal("PRIVATE_KEY" in environment, false);
  assert.equal("ZERO_G_SPONSOR_PRIVATE_KEY" in environment, false);
  assert.equal("HTTPS_PROXY" in environment, false);
  assert.equal("FOUNDRY_FFI" in environment, false);
  assert.equal("FOUNDRY_RPC_URL" in environment, false);
});
