#!/usr/bin/env node
/* global console, process, URL */

import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(
  new URL("../../packages/zero-g/package.json", import.meta.url),
);
const {
  JsonRpcProvider,
  Wallet,
  formatEther,
  formatUnits,
  getAddress,
  getCreateAddress,
} = require("ethers");

const CHAIN_ID = 16661;
const RPC_URL = "https://evmrpc.0g.ai";
const EXPECTED_CONTRACTS = Object.freeze([
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
]);

function parseArgs(argv) {
  const args = { broadcast: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--artifact") args.artifact = argv[++index];
    else if (argument === "--output") args.output = argv[++index];
    else if (argument === "--broadcast") args.broadcast = true;
    else throw new Error(`Unsupported argument: ${argument}`);
  }
  if (!args.artifact || !args.output) {
    throw new Error(
      "Usage: broadcast-simulated-deployment.mjs --artifact FILE --output FILE [--broadcast]",
    );
  }
  return args;
}

export function validateDeploymentArtifact(artifact, expectedSender) {
  if (Number(artifact?.chain) !== CHAIN_ID) {
    throw new Error("Deployment artifact is not for 0G mainnet chain 16661");
  }
  const transactions = artifact?.transactions;
  if (!Array.isArray(transactions) || transactions.length !== 10) {
    throw new Error(
      "Deployment artifact must contain exactly ten transactions",
    );
  }
  const sender = getAddress(expectedSender);
  return transactions.map((entry, index) => {
    if (
      entry?.transactionType !== "CREATE" ||
      entry?.contractName !== EXPECTED_CONTRACTS[index] ||
      (entry?.transaction?.to !== null && entry?.transaction?.to !== undefined)
    ) {
      throw new Error(`Unexpected deployment transaction at index ${index}`);
    }
    const from = getAddress(entry.transaction.from);
    if (from !== sender) {
      throw new Error(`Deployment sender mismatch at index ${index}`);
    }
    const nonce = Number(BigInt(entry.transaction.nonce));
    const predicted = getAddress(getCreateAddress({ from: sender, nonce }));
    const artifactAddress = getAddress(entry.contractAddress);
    if (predicted !== artifactAddress) {
      throw new Error(`CREATE address mismatch at index ${index}`);
    }
    if (
      typeof entry.transaction.input !== "string" ||
      !/^0x[0-9a-fA-F]+$/u.test(entry.transaction.input) ||
      typeof entry.transaction.gas !== "string" ||
      BigInt(entry.transaction.value ?? "0x0") !== 0n
    ) {
      throw new Error(`Malformed deployment transaction at index ${index}`);
    }
    return Object.freeze({
      index,
      contractName: entry.contractName,
      contractAddress: artifactAddress,
      nonce,
      data: entry.transaction.input,
      gasLimit: (BigInt(entry.transaction.gas) * 125n + 99n) / 100n,
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const privateKey =
    process.env.AGENTIC_ID_DEPLOYER_PRIVATE_KEY ??
    process.env.ZERO_G_SPONSOR_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error(
      "AGENTIC_ID_DEPLOYER_PRIVATE_KEY or ZERO_G_SPONSOR_PRIVATE_KEY is required",
    );
  }

  const provider = new JsonRpcProvider(RPC_URL, CHAIN_ID, {
    staticNetwork: true,
  });
  const wallet = new Wallet(privateKey, provider);
  const artifact = JSON.parse(
    await readFile(path.resolve(args.artifact), "utf8"),
  );
  const deployments = validateDeploymentArtifact(artifact, wallet.address);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== CHAIN_ID) {
    throw new Error("RPC chain mismatch");
  }

  const latestNonce = await provider.getTransactionCount(
    wallet.address,
    "latest",
  );
  const pendingNonce = await provider.getTransactionCount(
    wallet.address,
    "pending",
  );
  if (latestNonce !== pendingNonce) {
    throw new Error("Deployer has pending transactions; refusing to broadcast");
  }

  const existing = [];
  for (const deployment of deployments) {
    const code = await provider.getCode(deployment.contractAddress);
    existing.push(code !== "0x");
  }
  const firstMissingIndex = existing.findIndex((value) => !value);
  const expectedNonce =
    firstMissingIndex === -1
      ? deployments.at(-1).nonce + 1
      : deployments[firstMissingIndex].nonce;
  if (latestNonce !== expectedNonce) {
    throw new Error(
      `Deployer nonce ${latestNonce} does not match the simulated deployment nonce ${expectedNonce}`,
    );
  }
  if (
    firstMissingIndex > 0 &&
    existing.slice(firstMissingIndex).some(Boolean)
  ) {
    throw new Error("Deployment bytecode exists out of sequence");
  }

  const feeData = await provider.getFeeData();
  if (!feeData.gasPrice || feeData.gasPrice <= 0n) {
    throw new Error("RPC did not return a usable gas price");
  }
  const gasPrice = (feeData.gasPrice * 120n + 99n) / 100n;
  const missing = deployments.slice(
    firstMissingIndex === -1 ? deployments.length : firstMissingIndex,
  );
  const estimatedCost = missing.reduce(
    (sum, deployment) => sum + deployment.gasLimit * gasPrice,
    0n,
  );
  const balance = await provider.getBalance(wallet.address);
  if (balance < estimatedCost) {
    throw new Error("Deployer balance is insufficient for the deployment");
  }

  const result = {
    kind: "rivergate-agentic-id-mainnet-deployment",
    chainId: CHAIN_ID,
    rpcUrl: RPC_URL,
    deployer: wallet.address,
    sourceCommit: artifact.commit ?? null,
    gasPriceWei: gasPrice.toString(),
    gasPriceGwei: formatUnits(gasPrice, "gwei"),
    balanceOG: formatEther(balance),
    estimatedMaximumCostOG: formatEther(estimatedCost),
    broadcast: args.broadcast,
    contracts: [],
  };

  if (!args.broadcast) {
    result.contracts = deployments.map((deployment, index) => ({
      contractName: deployment.contractName,
      contractAddress: deployment.contractAddress,
      nonce: deployment.nonce,
      status: existing[index] ? "already-deployed" : "planned",
    }));
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  for (let index = 0; index < deployments.length; index += 1) {
    const deployment = deployments[index];
    if (existing[index]) {
      result.contracts.push({
        contractName: deployment.contractName,
        contractAddress: deployment.contractAddress,
        nonce: deployment.nonce,
        status: "already-deployed",
      });
      continue;
    }
    const response = await wallet.sendTransaction({
      data: deployment.data,
      gasLimit: deployment.gasLimit,
      gasPrice,
      nonce: deployment.nonce,
      value: 0n,
    });
    const receipt = await response.wait(1);
    if (!receipt || receipt.status !== 1) {
      throw new Error(
        `Deployment transaction failed for ${deployment.contractName}`,
      );
    }
    if (
      !receipt.contractAddress ||
      getAddress(receipt.contractAddress) !== deployment.contractAddress
    ) {
      throw new Error(
        `Mined CREATE address mismatch for ${deployment.contractName}`,
      );
    }
    const code = await provider.getCode(deployment.contractAddress);
    if (code === "0x") {
      throw new Error(
        `No bytecode found after deploying ${deployment.contractName}`,
      );
    }
    result.contracts.push({
      contractName: deployment.contractName,
      contractAddress: deployment.contractAddress,
      nonce: deployment.nonce,
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      status: "deployed",
    });
    await writeFile(path.resolve(args.output), JSON.stringify(result, null, 2));
    console.log(
      JSON.stringify({
        deployed: deployment.contractName,
        address: deployment.contractAddress,
        transactionHash: receipt.hash,
      }),
    );
  }

  await writeFile(path.resolve(args.output), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
