# Terra World

Terra World is a local-first 3D city game set in Rivergate. Its new adult-facing
direction is a living city shaped by decisions, residents and emerging stories,
with Leo as the companion. The existing playable foundation includes residential
repairs, town exploration, resident routines and deterministic simulation.

The new bridge, economic, relationship and generative-story systems are planned,
not yet implemented. [Read the story bible](storyline.md) and
[the 0G-backed architecture and delivery gates](docs/living-city-architecture.md).
0G Compute, encrypted Storage and a genuine city Agentic NFT have distinct roles;
core play remains wallet-free and local-first.

## Getting started

1. Install Node.js 20.9 or later and pnpm 8.12 or later.
2. Copy `.env.example` to `.env.local` if you need local configuration.
3. Run `pnpm install`.
4. Run `pnpm dev`, then open `http://localhost:3000`.

## Quality checks

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm format:check`

The project is a pnpm workspace: the web app lives in `apps/web`, while shared simulation and campaign packages live in `packages`.
