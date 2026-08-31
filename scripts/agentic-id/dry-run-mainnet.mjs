#!/usr/bin/env node
/* global console, process */

import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PINNED_COMMIT,
  validateOnline,
  validatePlan,
  ZERO_ADDRESS,
} from "./validate-mainnet-plan.mjs";

const FOUNDRY_PROCESS_ENV_ALLOWLIST = Object.freeze([
  "PATH",
  "HOME",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "TERM",
  "NO_COLOR",
  "CI",
]);

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (["--plan", "--upstream", "--log"].includes(argv[i]))
      result[argv[i].slice(2)] = argv[++i];
    else
      throw new Error(
        `unsupported argument ${argv[i]}; this tool intentionally has no broadcast or private-key option`,
      );
  }
  if (!result.plan || !result.upstream || !result.log) {
    throw new Error(
      "usage: dry-run-mainnet.mjs --plan FILE --upstream PINNED_CHECKOUT --log NEW_FILE",
    );
  }
  return result;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} failed\n${result.stdout}\n${result.stderr}`);
  return `${result.stdout}${result.stderr}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const plan = JSON.parse(await readFile(args.plan, "utf8"));
  const errors = validatePlan(plan, "deployment");
  if (errors.length === 0)
    errors.push(...(await validateOnline(plan, "deployment")));
  if (errors.length > 0)
    throw new Error(errors.map((error) => `- ${error}`).join("\n"));

  const checkout = path.resolve(args.upstream);
  const revision = run("git", ["rev-parse", "HEAD"], { cwd: checkout }).trim();
  if (revision !== PINNED_COMMIT)
    throw new Error(
      `upstream checkout is ${revision}; expected ${PINNED_COMMIT}`,
    );
  const status = run("git", ["status", "--porcelain"], { cwd: checkout });
  if (status !== "") throw new Error("upstream checkout has local changes");
  const submodules = run("git", ["submodule", "status", "--recursive"], {
    cwd: checkout,
  });
  if (
    submodules
      .split("\n")
      .some((line) => line.startsWith("-") || line.startsWith("+"))
  ) {
    throw new Error(
      "upstream submodules are missing or do not match the pinned superproject",
    );
  }

  const contracts = path.join(checkout, "contracts");
  const env = buildFoundryEnvironment(plan);
  const testOutput = run("forge", ["test"], { cwd: contracts, env });
  const deployer = plan.governance.proposedDeployer;
  // Deliberately omit --broadcast and every signing option. --sender is only the
  // simulated transaction origin, so no secret key is needed or accepted.
  const simulationOutput = run(
    "forge",
    [
      "script",
      "script/Deploy.s.sol:Deploy",
      "--rpc-url",
      plan.network.rpcUrl,
      "--sender",
      deployer,
      "-vvv",
    ],
    { cwd: contracts, env },
  );

  const log = [
    `pinned-upstream=${PINNED_COMMIT}`,
    `chain-id=${plan.network.chainId}`,
    "broadcast=false",
    "verifier-mode=disabled",
    "",
    "=== forge test ===",
    testOutput,
    "=== forge deployment simulation (NO BROADCAST) ===",
    simulationOutput,
  ].join("\n");
  await writeFile(args.log, log, { flag: "wx" });
  console.log(`tests and no-broadcast simulation passed; wrote ${args.log}`);
}

export function buildFoundryEnvironment(plan, source = process.env) {
  const environment = {};
  for (const key of FOUNDRY_PROCESS_ENV_ALLOWLIST) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0) environment[key] = value;
  }
  return {
    ...environment,
    OWNER: plan.governance.ownerMultisig,
    PAUSER: plan.governance.pauser,
    TEE_ORACLE: ZERO_ADDRESS,
    TIMELOCK_DELAY: String(plan.governance.timelockDelaySeconds),
    PROPOSERS: plan.governance.proposers.join(","),
    EXECUTORS: plan.governance.executors.join(","),
    NFT_NAME: plan.deployment.nftName,
    NFT_SYMBOL: plan.deployment.nftSymbol,
    MAX_PROOF_AGE: String(plan.deployment.maxProofAgeSeconds),
    CANONICAL_8004: plan.network.canonicalERC8004,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
