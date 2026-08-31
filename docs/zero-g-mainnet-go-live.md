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
- Official `0gfoundation/0g-agentic-id` source is pinned to a reviewed commit.
- The repository includes a fail-closed plan validator and a Foundry simulation
  runner that accepts no private key and has no broadcast option.
- No AgenticID contract or token has been broadcast from this repository.
- Official 0G mainnet Tapp/Sandbox/attestor deployments are not currently
  published. The prepared path is therefore a non-seal token with a disabled
  verifier. It must not claim a TEE-bound identity, ServeProof, reputation, or
  secure transfer.

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

TERRA_CHECKPOINT_MODE=zero-g
TERRA_APP_ORIGIN=https://REPLACE_WITH_DEPLOYED_ORIGIN
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/terra_world?sslmode=require
TERRA_DATABASE_MAX_CONNECTIONS=4
```

Use a dedicated, limited-balance sponsor wallet. Do not use the Rivergate
governance multisig key and do not paste either secret into an issue, chat,
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

## AgenticID deployment and registration

Follow [`agentic-id-mainnet-runbook.md`](agentic-id-mainnet-runbook.md). The
operation needs public values for a contract-based owner multisig, separate
pauser, dedicated funded deployer, timelock policy, Agent Card URI, finalized
encrypted 0G Storage root, wrapped data key, and recovery evidence.

Deployment and registration are distinct irreversible approvals:

1. Validate the public plan and live chain.
2. Run the pinned source tests and no-broadcast Foundry simulation.
3. Review gas, bytecode, roles, canonical ERC-8004 binding, and manifests with a
   second operator.
4. Explicitly approve and perform the contract deployment outside this repo's
   safety-only tooling.
5. Verify all proxy, beacon, timelock, owner, pauser, and explorer records.
6. Explicitly approve one non-seal Rivergate token registration.
7. Verify ownership, Agent Card, intelligent data, sealed key event, canonical
   ERC-8004 visibility, and the absence of an agent seal.

Routine repairs remain local and inexpensive. At a meaningful milestone, the
server should create a minimal encrypted city-memory artifact, upload it to 0G
Storage, and enqueue one idempotent `updateAt` operation for the Rivergate token.
That milestone worker is not implemented yet because its wrapped-key policy and
deployed AgenticID address/token ID do not exist. A Storage sync is therefore not
labelled as AgenticID-anchored today.

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
- Multisig, pauser, deployer, wrapped-key policy, security review, explicit
  deployment approval, verified AgenticID deployment, and one token registration.
- Durable milestone outbox/worker after the AgenticID address and token ID exist.
- Monitoring and alerts for Router failures, Storage retries, database errors,
  sponsor balance, stuck transactions, and unexpected contract events.

Official references:

- [0G mainnet overview](https://docs.0g.ai/developer-hub/mainnet/mainnet-overview)
- [Compute Router quickstart](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/quickstart)
- [Verifiable execution](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/features/verifiable-execution)
- [0G Storage SDK](https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk)
- [Official AgenticID contracts](https://github.com/0gfoundation/0g-agentic-id)
