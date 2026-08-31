# Rivergate AgenticID mainnet preparation runbook

Status: **preparation only; deployment and registration are blocked pending an operator security review.** This repository contains no command that broadcasts a deployment or registration transaction.

Rivergate must use the full official `0gfoundation/0g-agentic-id` stack. The existing `TerraCityAgent.sol` is a separate application contract and must never be presented or deployed as ERC-7857/AgenticID. Simplified examples, `MockOracle`, placeholder proofs, and the older `0g-agent-nft` reference implementation are not deployment inputs.

## Pinned authority and current mainnet limitation

- Source: [`0gfoundation/0g-agentic-id`](https://github.com/0gfoundation/0g-agentic-id), pinned to commit `afc4d0e94af94ad5f2351215ed32c94e2fe7a54e`. The machine-readable lock is [`contracts/agentic-id-mainnet/upstream.lock.json`](../contracts/agentic-id-mainnet/upstream.lock.json).
- Deploy the upstream `contracts/script/Deploy.s.sol` stack unchanged: TimelockController plus implementation, beacon, and proxy for `TEEDataVerifier`, `AgenticID`, and `AgenticIDReputationRegistry`. See the official [contract deployment guide](https://github.com/0gfoundation/0g-agentic-id/blob/afc4d0e94af94ad5f2351215ed32c94e2fe7a54e/contracts/DEPLOYMENT.md).
- 0G mainnet is chain `16661`; the official RPC is `https://evmrpc.0g.ai`. The canonical ERC-8004 v2 registry is `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`. The preflight calls `getVersion()` and requires `2.0.0`.
- The official AgenticID repository currently publishes only a Galileo deployment record. The official [0g-tapp contract list](https://github.com/0gfoundation/0g-tapp/blob/main/contract/CONTRACTS.md) says its mainnet contracts are “To be deployed”, and the public AgenticID attestor is configured for Galileo. Consequently this runbook permits only a disabled verifier and non-seal mint. It must not claim TEE attestation, a sealed runtime, ServeProof, reputation, or secure transfer.

With `TEE_ORACLE=0x0`, proof-gated transfers cannot succeed. That is intentional fail-closed behavior. Do not register a valuable token unless the owner accepts that it is non-transferable until a separately audited real mainnet oracle is installed. A non-seal mint can never gain an `agentSeal` later and can never produce ServeProof or accrue AgenticID reputation; see the official [self-mint semantics](https://github.com/0gfoundation/0g-agentic-id/blob/afc4d0e94af94ad5f2351215ed32c94e2fe7a54e/contracts/README.md#path-b-self-mint).

## 1. Governance and funding preconditions

1. Create a contract-based multisig on 0G mainnet for `OWNER`. Record the owners, threshold, recovery process, and an executed test transaction. The online preflight rejects an owner address with no contract code.
2. Assign a separate, operationally monitored `PAUSER`; it must not equal the owner multisig. Treat this role as an emergency hot role with a documented rotation process.
3. Use at least `172800` seconds (two days) for `TIMELOCK_DELAY`. Make the multisig the proposer. Decide deliberately whether execution is open (`0x0`) or restricted.
4. Fund a dedicated deployer with enough 0G for the ten-contract deployment plus verification margin. Never put its private key, seed phrase, or mnemonic in the plan, shell history, repository, dry-run log, or manifest. The plan records only its public address.
5. Copy `contracts/agentic-id-mainnet/rivergate.plan.example.json` to an ignored operator-controlled location and fill the public fields. Keep `verifier.mode` as `disabled`, `teeOracle` as the zero address, and all claims false.

## 2. Obtain and verify the exact source

Use a clean directory outside this repository:

```sh
git clone --recurse-submodules https://github.com/0gfoundation/0g-agentic-id.git /secure/operator/0g-agentic-id
git -C /secure/operator/0g-agentic-id checkout --detach afc4d0e94af94ad5f2351215ed32c94e2fe7a54e
git -C /secure/operator/0g-agentic-id submodule update --init --recursive
git -C /secure/operator/0g-agentic-id rev-parse HEAD
git -C /secure/operator/0g-agentic-id status --porcelain
git -C /secure/operator/0g-agentic-id submodule status --recursive
```

The revision must equal the lock and status must be empty. Review the pinned source and dependency lockfiles. Do not substitute a branch tip, release-like tag, example contract, or locally modified checkout.

## 3. Validate and simulate without a key

First run the validator's focused tests:

```sh
node --test scripts/agentic-id/validate-mainnet-plan.test.mjs
```

Then validate governance, the live chain ID, canonical ERC-8004 code/version, and owner contract code:

```sh
node scripts/agentic-id/validate-mainnet-plan.mjs \
  --plan /secure/operator/rivergate.plan.json \
  --phase deployment \
  --online \
  --manifest /secure/operator/deployment-preflight.json
```

Generate a fresh test/simulation log. The command accepts no private key and the implementation deliberately omits `--broadcast`:

```sh
node scripts/agentic-id/dry-run-mainnet.mjs \
  --plan /secure/operator/rivergate.plan.json \
  --upstream /secure/operator/0g-agentic-id \
  --log /secure/operator/agentic-id-mainnet-dry-run.log
```

Archive the plan, manifest, upstream commit, complete test output, simulation output, gas estimate, compiler version, Foundry version, and reviewer approvals. Re-run if any input changes. A dry-run is not an audit.

## 4. Deployment ceremony (deliberately not automated here)

Deployment remains blocked until two reviewers confirm the manifest, governance, gas balance, source lock, and fail-closed verifier. At the ceremony, construct the upstream command from `contracts/DEPLOYMENT.md`, but do not use its documented fixed gas-price workaround without a fresh network assessment. Hardware-sign or multisig the deployment transaction through an approved operator system. This repository intentionally provides no broadcast wrapper.

Immediately after mining:

1. Record all ten addresses printed by the official deployment script, deployment transaction hash, block number/hash, deployer nonce, bytecode hashes, constructor/initializer arguments, and the pinned commit in a signed deployment manifest.
2. Confirm each beacon owner is the deployed TimelockController; the configured delay is at least two days; `AgenticID.owner()` and `TEEDataVerifier.owner()` are the intended multisig; and the pauser is separate.
3. Confirm `AgenticID` is custody-bound to the canonical ERC-8004 v2 singleton, not the Galileo address.
4. Confirm `TEEDataVerifier.teeOracleAddress()` is zero and do not whitelist an attestor or framework hash. Those post-deploy steps are required only for real attestor mint and are prohibited in this non-seal plan.
5. Verify every implementation and proxy on the explorer using the exact pinned compiler settings and source. If automatic verification is unavailable, publish standard-json compiler input, metadata, ABI, bytecode hashes, and storage layout with the manifest. Do not announce production readiness before independent bytecode comparison.

## 5. Encrypted 0G Storage preconditions

Before building registration calldata:

1. Generate a random data-encryption key in an approved offline or hardware-backed environment. Encrypt the Rivergate bundle with a reviewed authenticated-encryption construction. Never upload plaintext or the key.
2. Encrypt/wrap that data key to a recovery/unsealing key controlled by the intended registrant. The resulting non-empty bytes become `sealedKeys[i]`. The contract does not validate the encryption target.
3. Upload only ciphertext to 0G Storage mainnet using the official JS SDK flow (`@0gfoundation/0g-storage-ts-sdk`): build the Merkle tree, submit the upload transaction with a funded wallet, wait for the transaction receipt, then download through `https://indexer-storage-turbo.0g.ai` and compare bytes. See the official [SDK upload/download guide](https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk).
4. Set `IntelligentData.dataHash` to the finalized 0G Storage root hash. Record the upload transaction hash, root hash, encryption algorithm, recipient-key fingerprint, and successful recovery test in the plan. The validator rejects an unfinalized upload, mismatched root, missing sealed key, plaintext upload, or untested recovery.
5. Host the ERC-8004 Agent Card referenced by `agentURI` at a durable public HTTPS or IPFS URL. Do not put decryption material in the Agent Card or metadata.

0G Storage persistence and EVM transaction finality are separate checks. “Upload submitted” is not sufficient: wait for the on-chain receipt, confirm the storage node/indexer serves the exact ciphertext, and perform a clean-room decrypt/recovery test before registration.

## 6. Non-seal registration review

Fill `deployment.agenticIdProxy` only from the verified deployment manifest. The registrant must be the intended token owner because official `register(string,(string,bytes)[],(string,bytes32)[],bytes[])` mints to `msg.sender`.

Run both offline and online registration validation and create a new immutable manifest:

```sh
node scripts/agentic-id/validate-mainnet-plan.mjs \
  --plan /secure/operator/rivergate.plan.json \
  --phase registration \
  --online \
  --manifest /secure/operator/registration-preflight.json
```

Construct calldata from the pinned ABI using a reviewed ABI encoder, independently decode it, and compare every tuple in order:

- `agentURI`
- `MetadataEntry[]`: `(metadataKey, metadataValue)`
- `IntelligentData[]`: `(dataDescription, dataHash)`
- `sealedKeys[]`, with the same length and order as `IntelligentData[]`

Simulate the exact call from the registrant against the finalized block, estimate gas with margin, and have a second reviewer compare decoded calldata to the signed registration manifest. Registration must be separately approved and signed outside this repository. After mining, verify `Registered` and `ITransferred` events, owner, Agent Card, metadata, `intelligentDatasOf`, sealed-key event entries, canonical ERC-8004 visibility, `getAgentSeal(agentId) == 0`, and a failed ServeProof/transfer capability check. Re-download and decrypt the ciphertext once more.

## 7. Conditions for enabling TEE-dependent features later

Do not merely change booleans in the plan. A new audited deployment/upgrade plan is required after official 0G mainnet TappRegistry and SandboxServing addresses exist and the complete real attestor stack is operating: TDX-capable Tapp, KMS, sandbox provider, funded TEE signer, Agent Card hosting, indexer, PostgreSQL, monitoring, incident response, and key rotation. All `MOCK_TEE`, `MOCK_KMS`, `MOCK_STORAGE`, and `MOCK_SANDBOX` settings must be false. Independently verify remote-attestation policy, framework hashes, oracle encryption keys, signatures, replay limits, and multi-node behavior.

Even after that work, this already self-minted token can never receive an `agentSeal`; enabling a real transfer oracle would only unlock proof-gated non-seal transfer. A seal-bound Rivergate AgenticID would require a new `registerWithSeal` mint through a trusted real attestor.
