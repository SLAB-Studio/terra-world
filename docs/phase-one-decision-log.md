# Phase 1 decision log

## Deterministic simulation and AI

The simulation is the authority for placement, network coverage, turns, events,
progression, action IDs, and state hashes. It accepts explicit inputs and uses no
clock, browser state, network response, or ambient randomness. 0G Compute may
power a guide that explains outcomes and proposes child-friendly next steps, but
AI output never mutates city state directly. A suggestion becomes real only
after it is expressed as a validated player action and processed by the
deterministic simulation.

## Network metrics

Each utility or service network is derived from the committed building graph.
Coverage is the total capped coverage strength over placeable tiles divided by
the number of placeable tiles. Water, electricity, education, healthcare,
transport, and nature use the same bounded 0–1 representation so turn logic can
combine reach with supply and demand without hidden weights. Network snapshots
are recalculated from the planned city immediately before a turn; they are not
stored as a second source of truth.

## IndexedDB strategy

IndexedDB is the browser save system. City checkpoints and ordered action logs
are separate versioned records, and both pass privacy and JSON-safety validation
before writing. Opening the database runs explicit schema migrations. The Phase
1 gate uses `fake-indexeddb` to exercise the production adapter, including a
close/reopen cycle, because the Node test runner has no native browser
IndexedDB. Browser-level checks remain necessary for quota, eviction, private
browsing, and multi-tab behaviour. If IndexedDB cannot open, gameplay can fall
back to memory, but that fallback is intentionally non-durable and must be
communicated in the UI.

## Child-data boundary

The local game layer stores opaque profile and city identifiers, game state,
accessibility settings, campaign content, and a deterministic action history.
It rejects identity-shaped fields such as names, age, school, location, chat,
and behavioural profiles. Wallets, Agentic IDs, and public-chain writes are not
part of a child's play session. Any later parent-controlled sync must contain
only encrypted or non-personal payloads and must stay outside the authoritative
turn loop.

## Known Phase 1 limitations

- Network coverage models reach, not pipe direction, voltage, congestion, or
  failure propagation.
- Replay assumes the same versioned campaign rules and building catalogue; a
  campaign migration policy is still required before live content updates.
- IndexedDB integration is emulated in CI; real-browser durability and
  multi-tab conflict tests are deferred.
- The memory fallback does not survive refresh or process exit.
- 0G Compute and Agentic ID integration remain outside this executable gate;
  Phase 1 proves the deterministic boundary they must not bypass.
