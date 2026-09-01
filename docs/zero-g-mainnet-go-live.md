# Terra World: 0G mainnet go-live

This is the operator checklist for replacing development mode with real 0G
mainnet services. It deliberately separates reversible configuration from
funded, irreversible blockchain operations.

## What is implemented

### 0G Compute

- Server-only Router client using `https://router-api.0g.ai/v1` on chain 16661.
- Private trust requests with TEE verification requested, price-first provider
  sorting, and provider fallback disabled.
- A response is accepted as private only when its returned `x_0g_trace` is valid
  and says `tee_verified: true`.
- Provider, request ID, billing metadata, and the TEE verdict are validated in
  memory. They are not returned to players, but a durable sanitized audit sink
  is still required before production proof/operations claims are made.
- Bounded prompts/outputs, cancellation, retry limits, response validation, and
  explicit authored fallback. `ZERO_G_REQUIRED=true` disables that fallback for
  connected routes and returns 503 when verified Compute is unavailable.

### 0G Storage

- City state is encrypted in the browser with AES-256-GCM before upload.
- An IndexedDB queue, leases, idempotency keys, retry policy, and recovery pack
  already exist.
- The server uses the official 0G TypeScript Storage SDK, calculates the Merkle
  root, sends the funded transaction from a server-only sponsor, validates the
  returned root, transaction sequence and optional new transaction hash, and
  proof-checks downloaded bytes. An empty hash is accepted only for an exact
  root the SDK reports as already finalized.
- PostgreSQL stores only opaque session IDs, roots, content hashes, byte sizes,
  transaction evidence, and timestamps. It never stores plaintext game state
  or recovery keys.
- The in-game **Sync City** control deduplicates unchanged state and reports
  **Stored on 0G** only after a verified upload receipt.
- Development `demo` mode is labelled as a local preview and never as 0G. If a
  sponsored upload reaches its finality deadline, its outcome is treated as
  unknown and terminal—not blindly retried—so a second paid transaction cannot
  be launched automatically while the first may still settle.

The reviewed mainnet deployment tuple is versioned in
`packages/zero-g/deployments/storage-mainnet.v1.json`. Before funding or
enabling the sponsor wallet, run:

```bash
pnpm zero-g:storage:preflight
```

This command is read-only and accepts no arguments or signing material. It
checks the official RPC chain ID, confirms bytecode exists at the pinned Flow
address, discovers the official indexer's trusted nodes, and requires every
distinct trusted node to report the same mainnet chain and Flow contract. Each
request has an eight-second deadline. Any timeout, malformed response,
single-node result, disagreement, or manifest drift fails the command without
printing remote error bodies. Run its deterministic offline tests with
`pnpm zero-g:storage:preflight:test`.

### Rivergate AgenticID

- The intended model is one evolving Rivergate token, not a token per house,
  bridge, resident, or repair.
- An application-managed instance of the official `0gfoundation/0g-agentic-id`
  contracts is deployed on 0G mainnet from pinned commit
  `afc4d0e94af94ad5f2351215ed32c94e2fe7a54e`.
- AgenticID is `0x0953a70D8c055799ef55404dE72d1d6c541046a9`,
  TEEDataVerifier is `0x191DfE1D3Ca2485bD363268286672C989bF57828`,
  AgenticIDReputationRegistry is
  `0x3319604Cd1A1467e9d4419354Bf6259984A7f592`, and the timelock is
  `0x20677959956561cb1034189c77511cA32D36aEfa`.
- The stack is custody-bound to the canonical ERC-8004 IdentityRegistry at
  `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`. The canonical ERC-8004
  ReputationRegistry at `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`
  is also live on 0G mainnet.
- The complete public transaction, block, address, bytecode-hash, governance,
  and wiring record is
  `contracts/agentic-id-mainnet/deployment-mainnet.v1.json`.
- Rivergate City Steward is registered as canonical agent `3531123`. The
  application-managed proxy is the canonical custodian, the public operator is
  the local owner, and the final local/canonical Agent Card URIs match.
- The registration, URI update, encrypted 0G Storage artifact, commitments, and
  live verification results are recorded in
  `contracts/agentic-id-mainnet/rivergate-registration-mainnet.v1.json`.
- The registration is non-seal and `agentSeal` is zero. The verifier oracle is
  also zero, so this identity must not claim a TEE-bound identity, sealed runtime,
  ServeProof, verified AgenticID reputation, or secure transfer.
- The official 0G-hosted AgenticID service remains Galileo-only. This deployed
  stack is not an official 0G-operated mainnet attestor.

## Service configuration

Create `apps/web/.env.local` locally, or use secret environment variables on the
production host. Never commit this file and never use a `NEXT_PUBLIC_` prefix for
any value below.

```dotenv
ZERO_G_NETWORK=mainnet
ZERO_G_REQUIRED=false
ZERO_G_COMPUTE_API_KEY=sk-REPLACE_LOCALLY
ZERO_G_COMPUTE_MODEL=REPLACE_WITH_CURRENT_TEEML_MODEL
ZERO_G_SPONSOR_PRIVATE_KEY=0xREPLACE_LOCALLY
ZERO_G_STORAGE_UPLOAD_TIMEOUT_MS=300000

ZERO_G_RIVERGATE_STORAGE_ROOT=0x6bec9714b20d3ac73545f3d383de14be75dd267ee5a93b2c31b4f3f48ac96abf
ZERO_G_RIVERGATE_STORAGE_TX_HASH=0x939459398540b3e52bab569d23b22a2e239efc65a47578bcdfdb0580d26a398c
ZERO_G_CITY_AGENT_ADDRESS=0x0953a70D8c055799ef55404dE72d1d6c541046a9
ZERO_G_CITY_AGENT_TOKEN_ID=3531123

TERRA_CHECKPOINT_MODE=zero-g
TERRA_APP_ORIGIN=https://REPLACE_WITH_DEPLOYED_ORIGIN
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/terra_world?sslmode=require
TERRA_DATABASE_MAX_CONNECTIONS=4
```

Use a dedicated, limited-balance sponsor wallet. Do not use the Rivergate
governance/operator key and do not paste either secret into an issue, chat,
manifest, screenshot, or browser environment.

0G Compute Router balance is separate from the wallet's native 0G balance.
Create a mainnet Router inference key and fund its Router account, then choose a
currently listed private TeeML model. A native 0G balance alone does not fund
Compute requests.

## Database and Storage activation

1. Provision PostgreSQL with TLS and backups. Production startup fails closed
   unless `DATABASE_URL` sets `sslmode=require` (or the stronger
   `verify-ca`/`verify-full` mode supported by the provider).
2. Apply the idempotent checkpoint schema:

   ```sh
   DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/terra_world?sslmode=require' pnpm zero-g:db:migrate
   ```

3. Deploy with `TERRA_CHECKPOINT_MODE=zero-g` and the exact HTTPS application
   origin.
4. Start a game, change the city, and select **Sync City**. Record the returned
   0G root, transaction sequence, and transaction hash (when a new transaction
   was needed) from the durable reference index—not from a fabricated UI value.
5. From a clean browser session, download the encrypted bytes through the 0G
   indexer, verify the Merkle proof/root and content hash, then complete a
   recovery test with the saved recovery pack.
6. Stop and restart the application and repeat the restore check to prove the
   PostgreSQL reference index is durable.

Do not enable `zero-g` mode without the database migration. It fails closed
instead of silently replacing the durable index with process memory.

## Compute activation

1. Keep `ZERO_G_REQUIRED=false` for the first live smoke test.
2. Request one eligible guide, hint, and chapter briefing. Confirm the server
   accepts only responses whose validated Router trace includes a request ID,
   provider, and `tee_verified: true`; inspect billing metadata when the Router
   supplies it.
3. Confirm an invalid or missing trace is labelled authored fallback and is
   never displayed as verified 0G output.
4. Add a sanitized durable trace/audit sink and verify it records the accepted
   request metadata without prompts, outputs, keys, or raw provider traces.
5. Configure a durable per-player/daily spending limiter before public traffic.
6. Set `ZERO_G_REQUIRED=true` only if the production experience should reject
   guide requests whenever verified Compute is unavailable.

Normal pedestrian movement, traffic, rendering, doors, local saves, and authored
ambient dialogue do not call 0G Compute. This keeps token consumption and latency
away from the frame loop.

## AgenticID identity and governance

Follow [`agentic-id-mainnet-runbook.md`](agentic-id-mainnet-runbook.md). Contract
deployment and Rivergate registration are complete and recorded in separate
versioned public manifests. Current evidence includes:

1. Canonical agent ID `3531123` in registry
   `eip155:16661:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`.
2. Local owner `0x402eA1d4e1335Cc6BdcB6b1AA1563AD93eb5392e`
   and canonical proxy custody at
   `0x0953a70D8c055799ef55404dE72d1d6c541046a9`.
3. Final Agent URI hash
   `0xb2df1da1978f9b99783caac57d31428b7d7512a75c1a054a2a352f97fd7df05a`,
   with identical local and canonical URI reads.
4. Finalized encrypted 0G Storage root
   `0x6bec9714b20d3ac73545f3d383de14be75dd267ee5a93b2c31b4f3f48ac96abf`,
   sequence `211646`, proof-checked download, and successful key recovery.
5. Non-seal mode, zero `agentSeal`, zero verifier oracle, and no advertised TEE
   trust.

Owner, proposer, pauser, and deployer are currently the same public EOA,
`0x402eA1d4e1335Cc6BdcB6b1AA1563AD93eb5392e`. Before unattended production use,
move ownership/proposal authority to reviewed governance and separate the
emergency pauser through an independently reviewed timelock operation.

Routine repairs remain local and inexpensive. At a meaningful milestone, the
server should create a minimal encrypted city-memory artifact, upload it to 0G
Storage, and enqueue one idempotent `updateAt` operation for the Rivergate token.
That milestone worker is not implemented yet. A checkpoint Storage sync is
therefore not labelled as a new AgenticID milestone today, even though the base
Rivergate identity and initial encrypted intelligence registration are complete.

## Remaining release gates

- Real mainnet Router key, current TeeML model, funded Router account, and one
  receipt-verified live request.
- Dedicated sponsor wallet and a finalized encrypted Storage round trip.
- Production PostgreSQL, migration, backup, restart, and recovery test.
- Distributed Compute spend/rate limiting for public traffic.
- Server-verified player/account authorization, distributed sponsor quotas,
  and session-issuance throttling before public **Sync City** access. The
  current self-issued checkpoint session is suitable only for a controlled
  demo and must not guard a funded public sponsor.
- A sanitized durable Compute trace/audit sink.
- Governance migration and a separate emergency pauser before unattended use.
- Durable milestone outbox/allowlisted worker and independently verified update
  receipts before later progress is presented as AgenticID-anchored.
- Monitoring and alerts for Router failures, Storage retries, database errors,
  sponsor balance, stuck transactions, and unexpected contract events.

Official references:

- [0G mainnet overview](https://docs.0g.ai/developer-hub/mainnet/mainnet-overview)
- [Compute Router quickstart](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/quickstart)
- [Verifiable execution](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/features/verifiable-execution)
- [0G Storage SDK](https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk)
- [Official AgenticID contracts](https://github.com/0gfoundation/0g-agentic-id)
- [Official ERC-8004 deployments](https://github.com/erc-8004/erc-8004-contracts/blob/master/README.md#0g-mainnet)
- [ERC-8004 specification](https://eips.ethereum.org/EIPS/eip-8004)
