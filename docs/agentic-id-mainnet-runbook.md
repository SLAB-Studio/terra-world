# Rivergate AgenticID mainnet runbook

Status: **the Terra World AgenticID contract stack is deployed on 0G mainnet; no Rivergate token registration is recorded yet.**

The deployment is an application-managed instance of the official
[`0gfoundation/0g-agentic-id`](https://github.com/0gfoundation/0g-agentic-id)
contracts. It is not an official 0G-operated mainnet AgenticID service. The
official SDK still identifies the hosted AgenticID environment as testnet-only,
and [`agenticid.0g.ai/config`](https://agenticid.0g.ai/config) currently resolves
to Galileo chain `16602`. Canonical ERC-8004 Identity and Reputation registries,
by contrast, are live on 0G mainnet and are listed in the
[official ERC-8004 deployment registry](https://github.com/erc-8004/erc-8004-contracts/blob/master/README.md#0g-mainnet).

The public, machine-readable deployment record is
[`contracts/agentic-id-mainnet/deployment-mainnet.v1.json`](../contracts/agentic-id-mainnet/deployment-mainnet.v1.json).
It records all ten creation transactions, blocks, bytecode addresses, source
revision, configuration, and post-deployment wiring checks.

## Deployed mainnet stack

- Network: 0G mainnet, chain `16661`; official RPC
  `https://evmrpc.0g.ai`.
- Source: commit
  [`afc4d0e94af94ad5f2351215ed32c94e2fe7a54e`](https://github.com/0gfoundation/0g-agentic-id/tree/afc4d0e94af94ad5f2351215ed32c94e2fe7a54e).
- AgenticID proxy: [`0x0953a70D8c055799ef55404dE72d1d6c541046a9`](https://chainscan.0g.ai/address/0x0953a70D8c055799ef55404dE72d1d6c541046a9), version `1.1.0`.
- TEEDataVerifier proxy: [`0x191DfE1D3Ca2485bD363268286672C989bF57828`](https://chainscan.0g.ai/address/0x191DfE1D3Ca2485bD363268286672C989bF57828), version `1.1.0`.
- AgenticIDReputationRegistry proxy: [`0x3319604Cd1A1467e9d4419354Bf6259984A7f592`](https://chainscan.0g.ai/address/0x3319604Cd1A1467e9d4419354Bf6259984A7f592), version `1.2.0`.
- TimelockController: [`0x20677959956561cb1034189c77511cA32D36aEfa`](https://chainscan.0g.ai/address/0x20677959956561cb1034189c77511cA32D36aEfa), minimum delay `172800` seconds.
- Canonical ERC-8004 IdentityRegistry:
  [`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`](https://chainscan.0g.ai/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432), version `2.0.0`.
- Canonical ERC-8004 ReputationRegistry:
  [`0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`](https://chainscan.0g.ai/address/0x8004BAa17C55a88189AE136b182e5fdA19dE9b63).

The three upgradeable-contract beacons are owned by the TimelockController and
point to the implementations recorded in the manifest. AgenticID is bound to the
canonical mainnet IdentityRegistry, points to the deployed verifier, and the
AgenticIDReputationRegistry points back to the AgenticID proxy. All ten deployed
addresses had runtime bytecode when checked on 2026-09-01.

## Current security and capability boundary

Owner, proposer, pauser, and deployer are currently the same public EOA:
`0x402eA1d4e1335Cc6BdcB6b1AA1563AD93eb5392e`. Timelock execution is open, while
proposal authority remains with that address. This is transparent deployment
state, not a multisig claim. Before treating the stack as unattended production
infrastructure, transfer ownership/proposal authority to reviewed governance and
separate the emergency pauser, using the upstream timelock procedures and an
independently reviewed transaction plan.

The verifier's `teeOracleAddress()` is the zero address. Therefore this deployment
must not be described as TEE-attested or as providing a sealed runtime,
ServeProof, verified AgenticID reputation, or proof-gated secure transfer. The
contracts are deployed and unpaused, but the TEE-dependent trust path is disabled.
Do not add a placeholder oracle, mock attestor, or unverified framework hash.

`TerraCityAgent.sol` remains a separate application contract and must not be
presented as ERC-7857, AgenticID, or the canonical ERC-8004 registry.

## Rivergate registration preconditions

No token ID, registration transaction, Agent Card URI, or finalized Rivergate
Storage root is claimed by the deployment manifest. Registration is a separate
irreversible approval and remains pending.

Before constructing registration calldata:

1. Prepare one Rivergate Agent Card following the
   [ERC-8004 registration-file specification](https://eips.ethereum.org/EIPS/eip-8004#registration-v1).
   It represents the evolving city as one identity, not one identity per resident,
   building, repair, or checkpoint.
2. Upload the exact Agent Card bytes to 0G Storage mainnet with the official
   [`@0gfoundation/0g-storage-ts-sdk` flow](https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk).
   Wait for the upload receipt, retrieve the bytes through the official indexer,
   and verify the Merkle root and content before using its durable retrieval URI.
3. Decide explicitly between direct canonical ERC-8004 registration and a
   non-seal registration through this AgenticID proxy. Direct canonical
   registration provides the public identity without implying ERC-7857 or TEE
   features. A non-seal AgenticID registration remains permanently without an
   `agentSeal` and cannot produce ServeProof.
4. Have a second operator verify chain ID, target address, exact ABI, Agent Card
   URI, intended owner, nonce, gas limit, and decoded calldata. The signer must
   separately approve the registration transaction.
5. After mining, record the transaction hash, block number/hash, canonical
   `agentId`, owner, `agentURI`, and exact Storage root in a new versioned
   registration manifest. Do not add a token ID to the deployment manifest.

If direct canonical registration is selected, call only the official mainnet
IdentityRegistry using its published ABI. If non-seal AgenticID registration is
selected, use the pinned AgenticID ABI and acknowledge in the signed review that
TEE-dependent capabilities are unavailable while the oracle is zero.

## Post-registration verification

For either route, verify the `Registered` event, canonical owner, `tokenURI`,
Agent Card retrieval, and exact downloaded bytes. For a non-seal AgenticID mint,
also verify local ownership, canonical visibility, intelligent-data commitments,
`getAgentSeal(agentId) == 0`, and expected failure of TEE-dependent operations.

Routine city simulation, saves, movement, dialogue, and repairs remain local.
They do not create identity transactions. Future milestone anchoring requires a
separate idempotent server worker, durable evidence, and an allowlisted operation;
it is not implied by this deployment.

## Enabling sealed AgenticID later

The official 0G AgenticID hosted stack remains testnet-only as of this manifest.
When 0G publishes an official mainnet attestor/config and trust-root addresses,
review that release independently. Adoption may require a new seal-bound mint or
an officially documented migration; do not assume an existing non-seal token can
gain an `agentSeal` in place.

Before enabling any TEE claim, require an official mainnet TappRegistry,
SandboxServing, attestor, KMS, sandbox provider, real oracle, remote-attestation
policy, framework hashes, monitoring, incident response, and key rotation. All
mock modes must be false and every address must be verified from official
deployment artifacts.

## Official references

- [0G mainnet network details](https://docs.0g.ai/developer-hub/mainnet/mainnet-overview)
- [Official ERC-8004 deployments](https://github.com/erc-8004/erc-8004-contracts/blob/master/README.md#0g-mainnet)
- [ERC-8004 specification](https://eips.ethereum.org/EIPS/eip-8004)
- [Official AgenticID contracts](https://github.com/0gfoundation/0g-agentic-id)
- [Pinned AgenticID deployment guide](https://github.com/0gfoundation/0g-agentic-id/blob/afc4d0e94af94ad5f2351215ed32c94e2fe7a54e/contracts/DEPLOYMENT.md)
- [AgenticID SDK mainnet-status note](https://github.com/0gfoundation/0g-agentic-id/blob/afc4d0e94af94ad5f2351215ed32c94e2fe7a54e/sdk/typescript/src/constants.ts#L22-L35)
