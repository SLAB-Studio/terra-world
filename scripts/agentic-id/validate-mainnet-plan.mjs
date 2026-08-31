#!/usr/bin/env node
/* global Buffer, console, fetch, process */

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const PINNED_COMMIT = "afc4d0e94af94ad5f2351215ed32c94e2fe7a54e";
export const MAINNET_CHAIN_ID = 16661;
export const CANONICAL_ERC8004 = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
export const CANONICAL_VERSION = "2.0.0";
export const STORAGE_INDEXER = "https://indexer-storage-turbo.0g.ai";
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const BYTES = /^0x(?:[0-9a-fA-F]{2})+$/;
const TX_HASH = BYTES32;
const FORBIDDEN_SECRET_KEY = /(private.?key|mnemonic|seed.?phrase|secret)/i;

function requireCondition(condition, message, errors) {
  if (!condition) errors.push(message);
}

function findSecretFields(value, path = "plan", found = []) {
  if (!value || typeof value !== "object") return found;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_SECRET_KEY.test(key)) found.push(childPath);
    findSecretFields(child, childPath, found);
  }
  return found;
}

export function validatePlan(plan, phase = "deployment") {
  const errors = [];
  requireCondition(
    ["deployment", "registration", "all"].includes(phase),
    `unknown phase: ${phase}`,
    errors,
  );
  requireCondition(
    plan?.schemaVersion === 1,
    "schemaVersion must be 1",
    errors,
  );
  requireCondition(
    findSecretFields(plan).length === 0,
    "plan must not contain private keys, mnemonics, seed phrases, or secrets",
    errors,
  );

  requireCondition(
    plan?.network?.chainId === MAINNET_CHAIN_ID,
    `network.chainId must be ${MAINNET_CHAIN_ID}`,
    errors,
  );
  requireCondition(
    plan?.network?.canonicalERC8004?.toLowerCase() ===
      CANONICAL_ERC8004.toLowerCase(),
    "canonical ERC-8004 address is not the official mainnet singleton",
    errors,
  );
  requireCondition(
    plan?.network?.canonicalVersion === CANONICAL_VERSION,
    `canonical ERC-8004 version must be ${CANONICAL_VERSION}`,
    errors,
  );
  requireCondition(
    plan?.network?.storageIndexer === STORAGE_INDEXER,
    "storage indexer must be the official 0G mainnet turbo indexer",
    errors,
  );
  requireCondition(
    /^https:\/\//.test(plan?.network?.rpcUrl ?? ""),
    "network.rpcUrl must use HTTPS",
    errors,
  );
  requireCondition(
    plan?.upstream?.repository ===
      "https://github.com/0gfoundation/0g-agentic-id.git",
    "upstream repository must be the official 0G repository",
    errors,
  );
  requireCondition(
    plan?.upstream?.commit === PINNED_COMMIT,
    `upstream commit must be pinned to ${PINNED_COMMIT}`,
    errors,
  );

  const governance = plan?.governance ?? {};
  requireCondition(
    ADDRESS.test(governance.ownerMultisig ?? "") &&
      governance.ownerMultisig !== ZERO_ADDRESS,
    "ownerMultisig must be a non-zero address",
    errors,
  );
  requireCondition(
    governance.ownerHasContractCode === true,
    "ownerHasContractCode must be explicitly confirmed",
    errors,
  );
  requireCondition(
    governance.ownerMultisigConfirmed === true,
    "ownerMultisigConfirmed must be explicitly true",
    errors,
  );
  requireCondition(
    ADDRESS.test(governance.pauser ?? "") && governance.pauser !== ZERO_ADDRESS,
    "pauser must be a non-zero address",
    errors,
  );
  requireCondition(
    governance.pauser?.toLowerCase() !==
      governance.ownerMultisig?.toLowerCase(),
    "pauser must be separate from ownerMultisig",
    errors,
  );
  requireCondition(
    governance.pauserSeparationConfirmed === true,
    "pauser separation must be explicitly confirmed",
    errors,
  );
  requireCondition(
    Number.isInteger(governance.timelockDelaySeconds) &&
      governance.timelockDelaySeconds >= 172800,
    "timelock delay must be at least 172800 seconds",
    errors,
  );
  requireCondition(
    Array.isArray(governance.proposers) && governance.proposers.length > 0,
    "at least one timelock proposer is required",
    errors,
  );
  requireCondition(
    Array.isArray(governance.executors) && governance.executors.length > 0,
    "at least one timelock executor policy is required",
    errors,
  );
  requireCondition(
    (governance.proposers ?? []).every((address) => ADDRESS.test(address)),
    "every proposer must be an address",
    errors,
  );
  requireCondition(
    (governance.executors ?? []).every((address) => ADDRESS.test(address)),
    "every executor must be an address",
    errors,
  );
  requireCondition(
    (governance.proposers ?? []).some(
      (address) =>
        address.toLowerCase() === governance.ownerMultisig?.toLowerCase(),
    ),
    "ownerMultisig must be a timelock proposer",
    errors,
  );
  requireCondition(
    ADDRESS.test(governance.proposedDeployer ?? "") &&
      governance.proposedDeployer !== ZERO_ADDRESS,
    "proposedDeployer must be a non-zero address",
    errors,
  );

  const verifier = plan?.deployment?.verifier ?? {};
  requireCondition(
    typeof plan?.deployment?.nftName === "string" &&
      plan.deployment.nftName.length > 0,
    "deployment.nftName is required",
    errors,
  );
  requireCondition(
    typeof plan?.deployment?.nftSymbol === "string" &&
      plan.deployment.nftSymbol.length > 0,
    "deployment.nftSymbol is required",
    errors,
  );
  requireCondition(
    Number.isInteger(plan?.deployment?.maxProofAgeSeconds) &&
      plan.deployment.maxProofAgeSeconds > 0,
    "deployment.maxProofAgeSeconds must be positive",
    errors,
  );
  requireCondition(
    verifier.mode === "disabled",
    "mainnet preparation currently permits only verifier.mode=disabled; official 0G mainnet TEE runtime contracts are not published",
    errors,
  );
  requireCondition(
    verifier.teeOracle === ZERO_ADDRESS,
    "disabled verifier must use the zero TEE oracle",
    errors,
  );
  const requiredClaims = [
    "teeAttested",
    "sealedRuntime",
    "serveProof",
    "reputation",
    "secureTransfer",
  ];
  for (const claim of requiredClaims) {
    requireCondition(
      plan?.claims?.[claim] === false,
      `claim ${claim} must be false without reviewed real TEE infrastructure`,
      errors,
    );
  }

  if (phase === "registration" || phase === "all") {
    const registration = plan?.registration ?? {};
    requireCondition(
      registration.mode === "non-seal",
      "only non-seal registration is supported by this runbook",
      errors,
    );
    requireCondition(
      ADDRESS.test(plan?.deployment?.agenticIdProxy ?? "") &&
        plan.deployment.agenticIdProxy !== ZERO_ADDRESS,
      "agenticIdProxy must be filled after a verified deployment",
      errors,
    );
    requireCondition(
      ADDRESS.test(plan?.deployment?.verifier?.proxy ?? "") &&
        plan.deployment.verifier.proxy !== ZERO_ADDRESS,
      "verifier.proxy must be filled after a verified deployment",
      errors,
    );
    requireCondition(
      ADDRESS.test(registration.registrant ?? "") &&
        registration.registrant !== ZERO_ADDRESS,
      "registrant must be the intended non-zero token owner and transaction sender",
      errors,
    );
    requireCondition(
      /^(https:\/\/|ipfs:\/\/)/.test(registration.agentURI ?? ""),
      "agentURI must be a public HTTPS or IPFS URI",
      errors,
    );
    requireCondition(
      Array.isArray(registration.metadata),
      "registration.metadata must be an array",
      errors,
    );
    for (const [index, entry] of (registration.metadata ?? []).entries()) {
      requireCondition(
        typeof entry.metadataKey === "string" && entry.metadataKey.length > 0,
        `registration.metadata[${index}].metadataKey is required`,
        errors,
      );
      requireCondition(
        /^0x(?:[0-9a-fA-F]{2})*$/.test(entry.metadataValue ?? ""),
        `registration.metadata[${index}].metadataValue must be even-length hex bytes`,
        errors,
      );
    }
    requireCondition(
      Array.isArray(registration.intelligentData) &&
        registration.intelligentData.length > 0,
      "at least one IntelligentData entry is required",
      errors,
    );

    for (const [index, entry] of (
      registration.intelligentData ?? []
    ).entries()) {
      const prefix = `registration.intelligentData[${index}]`;
      requireCondition(
        typeof entry.dataDescription === "string" &&
          entry.dataDescription.length > 0,
        `${prefix}.dataDescription is required`,
        errors,
      );
      requireCondition(
        BYTES32.test(entry.dataHash ?? ""),
        `${prefix}.dataHash must be bytes32`,
        errors,
      );
      requireCondition(
        BYTES.test(entry.sealedKey ?? ""),
        `${prefix}.sealedKey must be non-empty even-length hex bytes`,
        errors,
      );
      requireCondition(
        typeof entry.encryption?.algorithm === "string" &&
          entry.encryption.algorithm.length > 0,
        `${prefix}.encryption.algorithm is required`,
        errors,
      );
      requireCondition(
        typeof entry.encryption?.recipient === "string" &&
          entry.encryption.recipient.length > 0,
        `${prefix}.encryption.recipient fingerprint is required`,
        errors,
      );
      requireCondition(
        entry.encryption?.ciphertextOnlyUploaded === true,
        `${prefix} must confirm only ciphertext was uploaded`,
        errors,
      );
      requireCondition(
        entry.encryption?.keyRecoveryTested === true,
        `${prefix} must confirm key recovery was tested`,
        errors,
      );
      requireCondition(
        BYTES32.test(entry.storage?.rootHash ?? ""),
        `${prefix}.storage.rootHash must be bytes32`,
        errors,
      );
      requireCondition(
        entry.dataHash?.toLowerCase() ===
          entry.storage?.rootHash?.toLowerCase(),
        `${prefix}.dataHash must equal the finalized 0G Storage root hash`,
        errors,
      );
      requireCondition(
        TX_HASH.test(entry.storage?.transactionHash ?? ""),
        `${prefix}.storage.transactionHash must be bytes32`,
        errors,
      );
      requireCondition(
        entry.storage?.finalized === true,
        `${prefix} upload must be finalized`,
        errors,
      );
      requireCondition(
        entry.storage?.downloadVerified === true,
        `${prefix} ciphertext download must be verified`,
        errors,
      );
    }

    const requiredAcknowledgements = [
      "noAgentSealEver",
      "noServeProofOrReputation",
      "transfersDisabledUntilRealOracleReview",
      "lostUnsealingKeyCanFreezeToken",
    ];
    for (const acknowledgement of requiredAcknowledgements) {
      requireCondition(
        registration.acknowledgements?.[acknowledgement] === true,
        `registration acknowledgement ${acknowledgement} must be true`,
        errors,
      );
    }
  }

  return errors;
}

async function rpc(url, method, params = []) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`${method} HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

function decodeAbiString(data) {
  if (!/^0x[0-9a-fA-F]+$/.test(data))
    throw new Error("invalid ABI string response");
  const bytes = Buffer.from(data.slice(2), "hex");
  const offset = Number(bytes.readBigUInt64BE(24));
  const length = Number(bytes.readBigUInt64BE(offset + 24));
  return bytes.subarray(offset + 32, offset + 32 + length).toString("utf8");
}

function decodeAbiAddress(data) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(data)) {
    throw new Error("invalid ABI address response");
  }
  return `0x${data.slice(-40)}`;
}

export async function validateOnline(
  plan,
  phase = "deployment",
  rpcCall = rpc,
) {
  const errors = [];
  const url = plan.network.rpcUrl;
  const chainId = Number.parseInt(await rpcCall(url, "eth_chainId"), 16);
  requireCondition(
    chainId === MAINNET_CHAIN_ID,
    `RPC reports chain ${chainId}, expected ${MAINNET_CHAIN_ID}`,
    errors,
  );

  const canonicalCode = await rpcCall(url, "eth_getCode", [
    CANONICAL_ERC8004,
    "latest",
  ]);
  requireCondition(
    canonicalCode !== "0x",
    "canonical ERC-8004 address has no contract code",
    errors,
  );
  const encodedVersion = await rpcCall(url, "eth_call", [
    { to: CANONICAL_ERC8004, data: "0x0d8e6e2c" },
    "latest",
  ]);
  requireCondition(
    decodeAbiString(encodedVersion) === CANONICAL_VERSION,
    `canonical ERC-8004 getVersion() is not ${CANONICAL_VERSION}`,
    errors,
  );

  const ownerCode = await rpcCall(url, "eth_getCode", [
    plan.governance.ownerMultisig,
    "latest",
  ]);
  requireCondition(
    ownerCode !== "0x",
    "ownerMultisig has no contract code on 0G mainnet",
    errors,
  );
  if (phase === "registration" || phase === "all") {
    const agenticCode = await rpcCall(url, "eth_getCode", [
      plan.deployment.agenticIdProxy,
      "latest",
    ]);
    requireCondition(
      agenticCode !== "0x",
      "agenticIdProxy has no contract code on 0G mainnet",
      errors,
    );
    const agenticVersion = decodeAbiString(
      await rpcCall(url, "eth_call", [
        { to: plan.deployment.agenticIdProxy, data: "0xffa1ad74" },
        "latest",
      ]),
    );
    requireCondition(
      agenticVersion === "1.1.0",
      `AgenticID VERSION() is ${agenticVersion}, expected pinned 1.1.0`,
      errors,
    );
    const agenticCanonical = decodeAbiAddress(
      await rpcCall(url, "eth_call", [
        { to: plan.deployment.agenticIdProxy, data: "0x26afaadd" },
        "latest",
      ]),
    );
    requireCondition(
      agenticCanonical.toLowerCase() === CANONICAL_ERC8004.toLowerCase(),
      "AgenticID proxy is not bound to the canonical mainnet ERC-8004 registry",
      errors,
    );
    const agenticVerifier = decodeAbiAddress(
      await rpcCall(url, "eth_call", [
        { to: plan.deployment.agenticIdProxy, data: "0x2b7ac3f3" },
        "latest",
      ]),
    );
    requireCondition(
      agenticVerifier.toLowerCase() ===
        plan.deployment.verifier.proxy.toLowerCase(),
      "AgenticID verifier() does not match the planned verifier proxy",
      errors,
    );
    for (const [label, selector, expected] of [
      ["AgenticID owner", "0x8da5cb5b", plan.governance.ownerMultisig],
      ["AgenticID pauser", "0x9fd0506d", plan.governance.pauser],
    ]) {
      const actual = decodeAbiAddress(
        await rpcCall(url, "eth_call", [
          { to: plan.deployment.agenticIdProxy, data: selector },
          "latest",
        ]),
      );
      requireCondition(
        actual.toLowerCase() === expected.toLowerCase(),
        `${label} does not match the plan`,
        errors,
      );
    }

    const verifierAddress = plan.deployment.verifier.proxy;
    const verifierCode = await rpcCall(url, "eth_getCode", [
      verifierAddress,
      "latest",
    ]);
    requireCondition(
      verifierCode !== "0x",
      "verifier.proxy has no contract code on 0G mainnet",
      errors,
    );
    for (const [label, selector, expected] of [
      ["verifier owner", "0x8da5cb5b", plan.governance.ownerMultisig],
      ["verifier pauser", "0x9fd0506d", plan.governance.pauser],
      ["verifier TEE oracle", "0x3622983c", ZERO_ADDRESS],
    ]) {
      const actual = decodeAbiAddress(
        await rpcCall(url, "eth_call", [
          { to: verifierAddress, data: selector },
          "latest",
        ]),
      );
      requireCondition(
        actual.toLowerCase() === expected.toLowerCase(),
        `${label} does not match the fail-closed plan`,
        errors,
      );
    }
  }
  return errors;
}

function parseArgs(argv) {
  const result = { phase: "deployment", online: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--online") result.online = true;
    else if (["--plan", "--phase", "--manifest"].includes(arg))
      result[arg.slice(2)] = argv[++i];
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!result.plan)
    throw new Error(
      "usage: validate-mainnet-plan.mjs --plan FILE [--phase deployment|registration|all] [--online] [--manifest FILE]",
    );
  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const source = await readFile(options.plan, "utf8");
  const plan = JSON.parse(source);
  const errors = validatePlan(plan, options.phase);
  if (options.online && errors.length === 0)
    errors.push(...(await validateOnline(plan, options.phase)));
  if (errors.length > 0) {
    console.error(errors.map((error) => `- ${error}`).join("\n"));
    process.exitCode = 1;
    return;
  }

  if (options.manifest) {
    const manifest = {
      kind: "terra-world-agentic-id-preflight",
      generatedAt: new Date().toISOString(),
      planSha256: createHash("sha256").update(source).digest("hex"),
      phase: options.phase,
      upstreamCommit: PINNED_COMMIT,
      chainId: MAINNET_CHAIN_ID,
      canonicalERC8004: CANONICAL_ERC8004,
      governance: plan.governance,
      deployment: plan.deployment,
      registration:
        options.phase === "deployment" ? undefined : plan.registration,
    };
    await writeFile(
      options.manifest,
      `${JSON.stringify(manifest, null, 2)}\n`,
      { flag: "wx" },
    );
    console.log(`wrote immutable preflight manifest: ${options.manifest}`);
  }
  console.log(
    `${options.phase} plan passed${options.online ? " offline and online" : " offline"} safety checks`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
