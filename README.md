# Terra World

Terra World is a local-first city-building learning game. The browser game uses a deterministic simulation so a city can be replayed and verified without AI or network services.

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
