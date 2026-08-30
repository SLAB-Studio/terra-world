# Terra World

**A living city. A thousand stories. Your decisions.**

Terra World is a browser-based 3D city restoration game set in **Rivergate**.
Explore illuminated streets, step inside homes and public buildings, restore
essential services, and see the neighbourhood respond. **LEO**, Rivergate's city
advisor, helps you understand what needs attention and what your choices change.

The game combines a populated, explorable world with local-first gameplay and
server-side integration foundations for **0G Compute, 0G Storage and Agentic NFTs**.
Core play does not require a wallet or a live blockchain connection.

## Explore Rivergate

- **Two ways to explore.** Survey the city from above or switch to first-person
  walking. Approach a door, enter the building, explore its interior and return
  to the street.
- **A populated city.** Homes, apartment blocks, downtown towers, shops and civic
  spaces share the map with pedestrians, road traffic and public transport.
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
generative city stories remain planned features.

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

No 0G credentials are needed to explore the local game. AI routes have authored
fallbacks; this is not evidence of a live 0G inference request. Audio may require
an initial click or tap because of browser autoplay restrictions.

To build and serve the production app locally:

```sh
pnpm build
pnpm start
```

### Controls

| Action                         | Control                                                   |
| ------------------------------ | --------------------------------------------------------- |
| Change perspective             | **Town view** / **Walk around**                           |
| Move while walking             | **W / S** or **Up / Down arrows**                         |
| Step sideways                  | **A / D**                                                 |
| Turn                           | **Left / Right arrows** or drag the view                  |
| Enter, exit or interact nearby | **E** or the on-screen action                             |
| Find a destination             | **Places** directory                                      |
| Visit another floor            | Approach the lift, then use its floor selector            |
| Restore a property             | Drag an upgrade onto a home or use an indoor repair point |

On-screen movement controls support touch input. Walking controls apply while
the game has focus; no pointer lock is required. Leave buildings through their
ground-floor entrance. Reduced-motion, sound and text-size settings are available
in the game controls.

## The 0G architecture

The rendering engine handles movement, traffic, doors and immediate game feedback
locally. The 0G integration is intended for intelligence, encrypted persistence
and the identity of an evolving city—not a transaction for every footstep.

| Component                   | Role                                                                | Current implementation                                                                                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **0G Compute**              | Grounded LEO guidance and contextual explanations                   | Server-side Router client, bounded system prompts, guide/hint routes, validation and limited caching. Live credentials and network verification are required; the main LEO chat still uses scripted replies. |
| **0G Storage**              | Encrypted city checkpoints and recoverable history                  | Browser encryption, a local backup queue and an official SDK adapter exist. Production SDK loading and durable account-linked recovery still need completion.                                                |
| **Agentic NFT on 0G Chain** | One city intelligence whose memory evolves with verified milestones | Custom city-contract source and sponsor policies exist. ERC-7857 compatibility, the production transaction driver and deployment verification remain unfinished.                                             |
| **Campaign verification**   | Validate action history and associate progress with its ruleset     | Local deterministic replay and contract source exist; local verification is not an on-chain receipt.                                                                                                         |

**Integration status:** this repository contains real adapter code, but does not
yet provide a verified end-to-end production 0G flow. Configuration values alone
do not establish successful inference, storage or minting.

The public [`/api/proof`](http://localhost:3000/api/proof) endpoint reports
configuration readiness without exposing credentials. It currently checks
configuration shape, not live service health or confirmed transactions.

### LEO and inference budgets

LEO's [guide prompts](packages/safety/src/guide-prompt.ts) restrict responses to
supplied facts and short structured output. Current guide-task output caps range
from 180 to 440 tokens; the challenge-hint route uses a 220-token cap. Eligible
generic explanations can be cached for five minutes.

Input-token budgets, per-player spending limits, end-to-end cancellation and
selective narrative triggers still need implementation. The guide currently
requests an explanation after each eligible completed turn. These limits and
triggers must be hardened before exposing paid inference publicly.

### Background synchronization

Local saves and an encrypted checkpoint queue are implemented. The intended
production flow is to validate and durably queue changes, upload an encrypted
checkpoint, then record the appropriate city milestone on-chain through a
server-side sponsor. Ordinary gameplay should continue while this work runs.

A durable server worker, persistent transaction records and receipt-backed sync
status are still required. Show local saves, remote backups and chain confirmation
as separate states; never label a pending operation as confirmed.

## Configure 0G services

From the repository root, create the app's local environment file:

```sh
cp .env.example apps/web/.env.local
```

The file belongs in **`apps/web/.env.local`**, where the Next.js application runs.
For a deployment, set the corresponding server-side environment variables on
the host. Never commit credentials or prefix secrets with `NEXT_PUBLIC_`.

| Variable                     | Purpose                                                                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `ZERO_G_NETWORK`             | `testnet` or `mainnet`; selects the network defaults.                                                                                         |
| `ZERO_G_COMPUTE_API_KEY`     | Server-only Router inference key beginning with `sk-`.                                                                                        |
| `ZERO_G_COMPUTE_MODEL`       | An available model supporting the configured private trust mode.                                                                              |
| `ZERO_G_SPONSOR_PRIVATE_KEY` | Dedicated, limited-balance signer for authorized Storage and chain operations.                                                                |
| `TERRA_CHECKPOINT_MODE`      | `demo`, `disabled` or `zero-g`. The example selects `demo`; `zero-g` enables the real adapter path but does not resolve its outstanding work. |
| `TERRA_APP_ORIGIN`           | Exact application origin, such as `http://localhost:3000` or the production HTTPS origin.                                                     |

The current shared configuration loader requires both Compute credentials and a
sponsor key for the real adapters. Testnet and mainnet use different keys and
funding; do not mix their configuration. Without an explicit checkpoint mode,
development defaults to `demo` and production to `disabled`. Demo backups are
in-memory development data, not 0G uploads.

Only populate `ZERO_G_CITY_AGENT_ADDRESS`, `ZERO_G_CAMPAIGN_REGISTRY_ADDRESS`,
`ZERO_G_RIVERGATE_STORAGE_ROOT` and `ZERO_G_RIVERGATE_STORAGE_TX_HASH` from actual
deployments or confirmed uploads. Optional endpoint, timeout and retry overrides
are documented in [`.env.example`](.env.example).

Useful 0G references:

- [Compute Router setup](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/quickstart)
- [Private inference configuration](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/privacy)
- [Storage SDK](https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk)
- [Agentic IDs and ERC-7857](https://docs.0g.ai/developer-hub/building-on-0g/agentic-id/erc7857)

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
