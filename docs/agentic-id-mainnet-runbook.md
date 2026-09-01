# Rivergate AgenticID mainnet runbook

Status: **the Terra World AgenticID contract stack and Rivergate agent `3531123` are registered on 0G mainnet.**

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

The implementation follows the 0G
[Agentic ID integration guide](https://docs.0g.ai/developer-hub/building-on-0g/agentic-id/integration)
for encrypted metadata and lifecycle management, while replacing that guide's
explicit testnet/mock-oracle example with the pinned official contract source
and fail-closed mainnet configuration recorded below.

The separate public registration record is
[`contracts/agentic-id-mainnet/rivergate-registration-mainnet.v1.json`](../contracts/agentic-id-mainnet/rivergate-registration-mainnet.v1.json).
It records the Storage artifact, registration and URI-update receipts, ownership,
Agent Card fields, commitments, and post-registration reads without publishing
the wrapped key or any signing material.

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
- Rivergate canonical agent ID:
  [`3531123`](https://chainscan.0g.ai/token/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/instance/3531123).

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

## Completed Rivergate registration

Rivergate was registered once through the application-managed AgenticID proxy.
That call minted canonical ERC-8004 agent `3531123` into AgenticID custody while
the local AgenticID token is owned by
`0x402eA1d4e1335Cc6BdcB6b1AA1563AD93eb5392e`.

- Registration transaction:
  [`0xab9d0f46348cd6c4cd6512639ede9ceeb106cec542b285ffdc1786abf56b099a`](https://chainscan.0g.ai/tx/0xab9d0f46348cd6c4cd6512639ede9ceeb106cec542b285ffdc1786abf56b099a),
  block `43182149`, receipt status `1`.
- Registration-time Agent Card URI update:
  [`0x40f810ffeb83286b5e3e16ef09cd68da2d1d450048a751fda58e5ef1b4b1a941`](https://chainscan.0g.ai/tx/0x40f810ffeb83286b5e3e16ef09cd68da2d1d450048a751fda58e5ef1b4b1a941),
  block `43182707`, receipt status `1`.
- Registration-time Agent URI hash:
  `0xb2df1da1978f9b99783caac57d31428b7d7512a75c1a054a2a352f97fd7df05a`.
- Local owner: `0x402eA1d4e1335Cc6BdcB6b1AA1563AD93eb5392e`.
- Canonical owner/custodian: AgenticID proxy
  `0x0953a70D8c055799ef55404dE72d1d6c541046a9`.
- Registration mode: non-seal; `getAgentSeal(3531123)` is the zero address.

The initial ERC-8004 registration document is named **Rivergate City Steward**,
has `active: true`, identifies registry
`eip155:16661:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`,
commits to the intelligent-data root below, and declares `sealMode: none`. Local
and canonical `tokenURI` reads are identical and hash to the recorded URI hash.
Its `supportedTrust` list is empty; it does not advertise TEE trust.

## Encrypted intelligence evidence

The registered intelligent-data description is “Rivergate encrypted city
intelligence v1 on 0G Storage.” Its public evidence is:

- 0G Storage root:
  `0x6bec9714b20d3ac73545f3d383de14be75dd267ee5a93b2c31b4f3f48ac96abf`.
- Storage transaction sequence: `211646`.
- Storage transaction:
  [`0x939459398540b3e52bab569d23b22a2e239efc65a47578bcdfdb0580d26a398c`](https://chainscan.0g.ai/tx/0x939459398540b3e52bab569d23b22a2e239efc65a47578bcdfdb0580d26a398c),
  block `43182066`, receipt status `1`, sent to the official mainnet Flow
  contract `0x62D4144dB0F0a6fBBaeb6296c785C71B3D57C526`.
- Ciphertext SHA-256:
  `e8269a892bec02ba0fe28951254e0710f7b738ddf4d0b4535446ee4f2c97ef99`;
  byte length: `2923`.
- Recipient fingerprint:
  `fd70aa7b6b5720db84c9462ccf374167b5b8bee051e712e2f3a40376e091a2f0`.
- Wrapped-key commitment:
  `0xac434a395e98f4a82a8864044214d458763fb8fa728f2c66e434a853dfcb2f30`.
- Matching ciphertext hash and key-recovery test: both complete for this
  registration snapshot.

Only the commitment is public; the wrapped key and signing material are not in
the repository. The registration manifest captures the snapshot-era root and
the commitment of the single on-chain sealed-key entry. The current live root
is the later milestone root recorded below.

Routine city simulation, saves, movement, dialogue, and repairs remain local.
They do not create identity transactions. Meaningful **Sync City** milestones
use the allowlisted server worker to create an encrypted artifact, verify its 0G
Storage root, update index `0`, and reconcile the Agent Card. The first complete
mainnet milestone is recorded in
[`rivergate-milestone-mainnet-2026-09-01T053000Z.v1.json`](../contracts/agentic-id-mainnet/rivergate-milestone-mainnet-2026-09-01T053000Z.v1.json).
Unattended production still requires a durable outbox and managed signer policy.

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
