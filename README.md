# Terra World

**A living city. A thousand stories. Your decisions.**

Terra World is a browser-based 3D city restoration game set in **Rivergate**.
Explore illuminated streets, step inside homes and public buildings, restore
essential services, and see the neighbourhood respond. **LEO**, Rivergate's female
dog companion, helps you understand what needs attention and what your choices change.

The game combines a populated, explorable world with local-first gameplay and
server-side integration foundations for **0G Compute, 0G Storage and Agentic NFTs**.
Core play does not require a wallet or a live blockchain connection.

## Explore Rivergate

- **Two ways to explore.** Survey the city from above or choose **Walk with Leo**
  for third-person walking with a realistic human character and LEO alongside.
  Walk or run, approach a door, explore the interior and return to the street.
- **A playable opening chapter.** Investigate the East Bridge closure, hear
  Maya, Malik and Nia, then commit to one of three costed responses. Four
  skippable in-engine shots introduce the story; a notebook records evidence,
  choices and explicitly advanced outcomes.
- **A side mission map.** Find your street position and next objective on a
  north-up map, with a compass bearing and straight-line distance. Fold the map
  while keeping the destination visible; it is guidance, not a walking route.
- **A populated city.** Homes, apartment blocks, downtown towers, shops and civic
  spaces share the map with pedestrians, road traffic and public transport.
- **Neighbours with variety.** Twelve textured human models bring different
  faces, complexions, outfits and ages to the streets. Parents and children,
  couples and older residents share the city; walking pairs match their pace,
  wait for each other and use doorways in turn.
- **Interiors with activity.** Furnished rooms, offices and service areas include
  residents cooking, watching television, tending plants, working, waiting and
  moving between tasks.
- **Hands-on restoration.** Inspect properties, drag upgrades onto homes or
  approach repair points indoors. Restore power, clean water, gardens and
  recycling, with visible changes to the world.
- **Progressive challenges.** Work through service assessment, neighbourhood
  maintenance, coordinated repairs, recovery and district restoration.
- **Day and night.** Start in Rivergate after dark, with lit windows, streetlights
  and vehicle lights, or switch to daylight without resetting progress.
- **Local saves.** Continue a saved game on the same device. Network-backed
  recovery is a separate integration, not a prerequisite for playing.

Resident movement, ambient conversations and indoor activities currently use
local game rules and authored routines. They are not continuous AI calls or
real-world services. Expanded economic systems, persistent relationships and
open-ended generative city stories remain planned features. The opening chapter
is a bounded, authored scenario, not a complete household or city economy.

## Run locally

### Requirements

- Node.js **20.9 or later**.
- pnpm **8.12.1** is the version pinned by the workspace.
- A modern browser with WebGL support and hardware acceleration enabled.

```sh
git clone https://github.com/SLAB-Studio/terra-world.git
cd terra-world
pnpm install --frozen-lockfile
pnpm dev
```

Open [localhost:3000](http://localhost:3000), enter a player name and start a game.
Use **Continue game** when a local save is available.

Once the city loads, choose **Begin opening chapter**, or **Continue opening
chapter** for its separate local save. **Explore freely** keeps the existing
exploration mode available; the **Opening chapter** button reopens the entry.
See [Opening chapter](docs/opening-chapter.md) for choices, save boundaries,
optional device narration and 0G briefing limits.

No 0G credentials are needed to explore the local game. AI routes have authored
fallbacks; this is not evidence of a live 0G inference request. Audio may require
an initial click or tap because of browser autoplay restrictions.

To build and serve the production app locally:

```sh
pnpm build
pnpm start
```

### Controls

| Action                         | Control                                                    |
| ------------------------------ | ---------------------------------------------------------- |
| Change perspective             | **Town view** / **Walk with Leo**                          |
| Move while walking             | **W / S** or **Up / Down arrows**                          |
| Step sideways                  | **A / D**                                                  |
| Run                            | Hold **Shift** while moving or toggle **Run**              |
| Turn                           | **Left / Right arrows** or drag the view                   |
| Enter, exit or interact nearby | **E** or the on-screen action                              |
| Find a destination             | **Places** directory                                       |
| Fold or expand the mission map | Select the **Mission map** header                          |
| Visit another floor            | Approach the lift, then use its floor selector             |
| Restore a property             | Drag an upgrade onto a home or use an indoor repair point  |
| Chapter evidence               | Approach the location, then choose **Inspect** / **Speak** |
| Close chapter reading          | **Escape** closes the notebook or conversation             |

On-screen movement controls support touch input. Walking controls apply while
the game has focus; no pointer lock is required. Leave buildings through their
ground-floor entrance. Reduced-motion, sound and text-size settings are available
in the game controls.

LEO's in-world speech bubble adapts to day and night and closes automatically
30 seconds after each reply first appears. Use its close button to dismiss it
sooner. Switching views does not restart the timer; a new reply gets its own
30 seconds. Free-exploration replies also remain available in **Ask Leo**.

## The 0G architecture

The rendering engine handles movement, traffic, doors and immediate game feedback
locally. The 0G integration is intended for intelligence, encrypted persistence
and the identity of an evolving city—not a transaction for every footstep.

| Component                   | Role                                                                | Current implementation                                                                                                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0G Compute**              | Grounded LEO guidance and contextual explanations                   | Mainnet-first server Router client, bounded prompts, guide/hint/chapter routes, cancellation, caching, and strict verification of the returned `x_0g_trace`. A private result is accepted only when `tee_verified` is actually true.        |
| **0G Storage**              | Encrypted city checkpoints and recoverable history                  | Browser AES-GCM encryption, IndexedDB retry queue, authenticated API, official 0G SDK upload/proof-checked download, and a PostgreSQL root index. The **Sync City** control exposes queued, syncing, retry, and confirmed-storage states.   |
| **Agentic NFT on 0G Chain** | One city intelligence whose memory evolves with verified milestones | A pinned official AgenticID mainnet deployment plan, fail-closed validator, live read-only chain checks, and a no-key/no-broadcast simulation runner are included. Deployment, registration, and milestone updates have not been broadcast. |
| **Campaign verification**   | Validate action history and associate progress with its ruleset     | Deterministic replay and contract source exist; local verification is not presented as an on-chain receipt.                                                                                                                                 |

**Integration status:** real Compute and Storage adapters are implemented; local
development deliberately keeps a clearly labelled in-memory demo mode. A
production deployment still needs real server credentials,
a migrated database, a paid live inference check, a finalized upload/download
check, and the separately approved AgenticID deployment. Configuration values
alone do not establish successful inference, storage, or minting.

The public [`/api/proof`](http://localhost:3000/api/proof) endpoint reports
configuration readiness without exposing credentials. It currently checks
configuration shape, not live service health or confirmed transactions.

### LEO and inference budgets

LEO's [guide prompts](packages/safety/src/guide-prompt.ts) restrict responses to
supplied facts and short structured output. Current guide-task output caps range
from 180 to 440 tokens; the challenge-hint route uses a 220-token cap. Eligible
generic explanations can be cached for five minutes.

Input-token budgets, distributed per-player spending limits, and selective
narrative triggers still need implementation. Requests now propagate cancellation,
enforce bounded output, prefer the lowest-price private provider, and reject
provider fallback. The guide currently requests an explanation after each
eligible completed turn, so public paid inference still needs a durable quota.

The separate opening-chapter route is on demand and limited to selecting
chapter-grounded sentences from a replayed action log, with a 160-token output
cap, shared-request caching and bounded timeouts. Its spending windows are
process-local, not distributed per-player billing controls. Authored fallback
guidance is labelled; no live paid 0G test is claimed. See the
[chapter integration notes](docs/opening-chapter.md#optional-0g-briefings).

### Background synchronization

Local saves, encrypted checkpoint queueing, real 0G Storage upload, proof-checked
download, and durable server-side root metadata are implemented. **Sync City**
deduplicates an unchanged city, keeps gameplay responsive, retries after an
offline attempt, and says **Stored on 0G** only after the upload receipt passes
integrity checks. Demo mode says **Local preview — not stored on 0G**. An
ambiguous sponsored-upload timeout is not automatically retried, because the
first transaction may still settle.

Storage confirmation and AgenticID anchoring remain separate states. The UI does
not fabricate an on-chain result. A durable milestone outbox, transaction worker,
and confirmed AgenticID update receipt remain required after the Rivergate token
is deployed and its key-management policy is approved.

## Configure 0G services

From the repository root, create the app's local environment file:

```sh
cp .env.example apps/web/.env.local
```

The file belongs in **`apps/web/.env.local`**, where the Next.js application runs.
For a deployment, set the corresponding server-side environment variables on
the host. Never commit credentials or prefix secrets with `NEXT_PUBLIC_`.

| Variable                           | Purpose                                                                                                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ZERO_G_NETWORK`                   | `mainnet` by default; use `testnet` only for an explicit Galileo rehearsal.                                                                                       |
| `ZERO_G_REQUIRED`                  | `true` makes 0G-backed AI routes fail with 503 unless a verified private Compute result is returned. Keep `false` while authored fallback is desired.             |
| `ZERO_G_COMPUTE_API_KEY`           | Server-only Router inference key beginning with `sk-` or `app-sk-`.                                                                                               |
| `ZERO_G_COMPUTE_MODEL`             | A currently available TeeML model from the selected Router catalog.                                                                                               |
| `ZERO_G_SPONSOR_PRIVATE_KEY`       | Dedicated, limited-balance signer for authorized Storage operations. Never expose it to the browser.                                                              |
| `ZERO_G_STORAGE_UPLOAD_TIMEOUT_MS` | Finality-aware Storage upload deadline; defaults to five minutes. A timeout is an unknown, non-retryable paid outcome until an operator reconciles it.            |
| `TERRA_CHECKPOINT_MODE`            | `demo`, `disabled`, or `zero-g`. `zero-g` selects the real official SDK path and requires the sponsor key plus database.                                          |
| `TERRA_APP_ORIGIN`                 | Exact application origin, such as `https://play.example.com`. Production requires HTTPS.                                                                          |
| `DATABASE_URL`                     | PostgreSQL connection used only for opaque checkpoint session/root metadata when real Storage mode is enabled. Production requires `sslmode=require` or stronger. |

Compute, Storage, chain, and sponsor configuration are loaded independently: a
Storage sync does not require a Compute key. Testnet and mainnet use different
Router keys and balances; do not mix them. Without an explicit checkpoint mode,
development defaults to `demo` and production to `disabled`. Demo backups are
in-memory development data, not 0G uploads.

Apply the checkpoint schema before enabling real Storage:

```sh
DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/terra_world?sslmode=require' pnpm zero-g:db:migrate
```

Only populate `ZERO_G_CITY_AGENT_ADDRESS`, `ZERO_G_CAMPAIGN_REGISTRY_ADDRESS`,
`ZERO_G_RIVERGATE_STORAGE_ROOT` and `ZERO_G_RIVERGATE_STORAGE_TX_HASH` from actual
deployments or confirmed uploads. Optional endpoint, timeout and retry overrides
are documented in [`.env.example`](.env.example).

Useful 0G references:

- [Compute Router setup](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/quickstart)
- [Private inference configuration](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/privacy)
- [Storage SDK](https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk)
- [Agentic IDs and ERC-7857](https://docs.0g.ai/developer-hub/building-on-0g/agentic-id/erc7857)

The exact operator sequence and remaining blockers are documented in the
[0G mainnet go-live checklist](docs/zero-g-mainnet-go-live.md). AgenticID has a
separate [mainnet preparation runbook](docs/agentic-id-mainnet-runbook.md).

## Development

The application uses **Next.js, React and TypeScript**, with **Babylon.js** for the
3D world. Shared packages contain simulation rules, validated campaign schemas,
prompt/output safeguards and the server-side 0G adapters. Solidity contracts use
Foundry for testing.

| Location                      | Contents                                                           |
| ----------------------------- | ------------------------------------------------------------------ |
| `apps/web`                    | Game interface, API routes, browser persistence and 3D integration |
| `apps/web/lib/immersive-town` | World rendering, navigation, residents, vehicles and interiors     |
| `apps/web/public/models`      | Locally hosted 3D assets, textures and attribution                 |
| `packages/simulation`         | Deterministic game rules, campaigns and replay                     |
| `packages/campaign-schema`    | Shared schemas and validation                                      |
| `packages/safety`             | Grounded guide prompts, output validation and orchestration        |
| `packages/zero-g`             | Network configuration, Compute client and Storage adapters         |
| `contracts`                   | Campaign registry, city-contract prototype and Solidity tests      |
| `docs`                        | Architecture and feature implementation notes                      |

Run workspace checks from the repository root:

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
```

With Foundry installed, run the separate contract suite:

```sh
cd contracts
forge test
```

Unit tests use deterministic provider and storage substitutes. Passing those
tests or a production build does not prove live 0G connectivity. Release checks
must also verify real inference, encrypted upload/download and restore, and
confirmed city mint/update transactions.

### Performance

Rivergate uses shared meshes and materials, near/far model detail, bounded asset
loading and distance-based animation updates. Interior scenes are loaded for the
current visit instead of rendering every interior simultaneously.

The target is ordinary PCs, including integrated graphics. A dedicated gaming
GPU is not the design target, but browser support and actual performance depend
on the device. Target-device frame times still need measurement; there is no
universal frame-rate guarantee.

## Project documentation

- [Rivergate story bible](storyline.md)
- [Living-city architecture and release requirements](docs/living-city-architecture.md)
- [Playable opening chapter, narration and local saves](docs/opening-chapter.md)
- [Side mission map, destinations and navigation limits](docs/mission-minimap.md)
- [Walking, building entry and interiors](docs/walking-mode.md)
- [Resident travel and everyday routines](docs/resident-routines.md)
- [Lived-in interiors](docs/interior-life.md)
- [City assets and ambient conversations](docs/city-assets-and-conversations.md)

## Asset credits

Runtime assets are hosted with the application. Resident models derive from
Microsoft Rocketbox; city assets include Poly Haven resources, a modified Car
Concept model and project-authored geometry. Their licenses and redistribution
requirements differ. Preserve the source credits and license notices:

- [Resident model attribution](apps/web/public/models/residents/README.md)
- [City model and texture attribution](apps/web/public/models/city/README.md)

Asset conversion scripts are development tools. Blender and the source-model
downloads are not required to run the game.
