# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Adults who enjoy city simulation, exploration, memorable characters and choices
with lasting consequences. They want a believable place to inhabit, not a lesson
plan, a sequence of chores or an investment product. Sessions should be resumable
and respect the player's time, curiosity and judgment.

## Product Purpose

Terra World is a 3D living-city game set in Rivergate. The player guides an
already-active city through infrastructure problems, growth, environmental
pressure and competing resident interests. The city's history emerges from
their decisions and the simulation's consequences.

There is no universally correct city or single moral victory. Success is
expressed through the places, livelihoods, relationships and compromises the
player creates—not just a score.

## Positioning

A living city, a thousand stories, your decisions. The distinguishing feature
is a verified connection between decisions, evolving city systems, resident
memory and generated stories.

Leo is the city's curious companion. He can form uncertain theories and admit
mistakes, but neither he nor the story model may invent historical facts.
AI interprets evidence and expresses fictional characters; deterministic,
versioned rules own the world and its consequences.

The canonical cast and opening are in [storyline.md](storyline.md). The current
target systems and 0G commitments are in
[Living-city architecture](docs/living-city-architecture.md).

## Operating Context

A responsive browser game supporting mouse, keyboard and touch. Retain the
current populated 3D city, aerial and first-person views, enterable places,
night default and day/night switch. Do not downgrade the city into a sparse
map or replace its actual 3D scene with an illustrative backdrop.

Ordinary PCs, including integrated-GPU machines, remain the target. Use bounded
geometry, shared assets, appropriate level of detail, scalable effects and
adaptive graphics. This is a target, not a promise of smooth play on every
device; live frame-time and hardware measurements are still required.

Core gameplay stays local-first and can work offline once the necessary app
and content are cached. Save immediately on the device. Optional persistent
city setup and background 0G operations must not require a wallet connection
during ordinary play. A paused or closed game does not accumulate hidden
real-world-time penalties.

## Existing playable foundation

- A populated town with 28 homes, 18 public venues and 32 ambient residents.
- Aerial/first-person exploration, building interiors, day/night and graphics
  controls.
- Local resident journeys, building handoffs, rides and limited authored nearby
  conversations. These are not yet persistent household/economic agents.
- Fifteen residential repair missions across five stages, plus the separate
  deterministic city/campaign packages.
- Four core residential repair effects: solar power, clean water, gardens and
  recycling. Existing mission rules, IDs, rewards and saves must remain valid.
- Replay, local persistence, bounded guide/hint output and optional server-side
  0G Compute/Storage foundations.
- A custom city identity contract and sponsor policy abstraction, not yet proof
  of genuine ERC-7857 integration or successful live deployment.

Do not make the current interface report Project Horizon, citywide rent,
business employment, relationship history or remote AI conversations as
playable facts before their systems are connected.

## New storyline scope

- A bridge crisis with investigation, supported alternatives, costs and delayed
  consequences.
- Four story-rich residents: Maya the bakery owner, Malik the construction
  entrepreneur, Nia the environmental researcher and Sam the older resident.
- Evidence-grounded relationship changes, explicit promises, competing needs
  and resident-specific knowledge.
- Leo's observations, attributed opinions and clearly labelled hypotheses.
- Emerging cases, investigations, Rivergate Times editions and historical memory
  built from actual events.
- A bounded Project Horizon negotiation whose clauses affect later outcomes.
- Continued exploration and optional explicit save branches after major turning
  points, rather than a single YOU WIN screen.

These are implementation requirements, not completed features. Introduce a
versioned living-city mode without silently converting legacy repair saves.
The original build tracker remains historical; use the new architecture's
delivery gates for this pivot.

## 0G commitments and privacy

- **0G Compute** will support Leo, resident dialogue, grounded story narration,
  newspaper text and memory summaries. New tasks need new validated contracts;
  do not bypass the existing guide's restrictions with arbitrary prompts.
- **0G Storage** will retain encrypted city memory, event/story archives and
  checkpoints, plus versioned public scenario content where appropriate.
- **0G Agentic NFT / Agentic ID** will represent the evolving Rivergate city
  intelligence. Leo is its interface. The token does not represent the human
  player, and ordinary residents do not each need an NFT.
- Complete a genuine standards-compatible identity integration and demonstrate
  real receipts, state and restore evidence. Labels such as “configured” must
  never be presented as “verified on 0G.”
- Walking, rendering, daily NPC decisions and simulation updates stay local.
  No per-frame inference, Storage upload or chain write.
- Sponsor keys and Compute credentials stay server-side. Restricted access,
  spending caps, idempotency and explicit ownership/custody rules are required.
- Preserve data minimisation. Do not persist personal chat, entered player names,
  secrets or inferred psychological traits in public metadata or agent history.
- Future remote free-form dialogue requires a truthful disclosure and approved
  data contract before changing the current on-device text boundary.
- Keep fallbacks and local-only mode honest. No player-facing token trading,
  loot boxes, public ability rankings, advertisements or pressure to maintain
  a streak are introduced by this pivot.

## Brand Commitments

The product is **Terra World**; the playable city is **Rivergate**; its companion
is **Leo** (LEO in display headings). The new draft's builder named Leo becomes
**Malik**, retaining the established companion/character distinction.

Maya, Malik, Nia and Sam have the new roles defined in the story bible. Preserve
stable character IDs and actual prior events when introducing those roles.
Physical river names and names such as River Studios remain unchanged.

The tone is grounded, warm and concise. Resident disagreement is specific,
understandable and contextual—not a binary morality system. Avoid classroom
framing, constant explanation, childish celebration, invented consequences
and unsupported claims of realism, autonomy or infrastructure use.

## Evidence on Hand

- The two supplied pivot drafts are consolidated in [storyline.md](storyline.md),
  including the companion rename, populated-city continuity and corrected
  wetlands example.
- [Living-city architecture](docs/living-city-architecture.md) identifies
  existing systems, new work, 0G requirements and verification gates.
- [Resident routines](docs/resident-routines.md) records tested locomotion and
  traffic behavior, including the limits of abstract interior/cabin handoffs.
- [Adult pivot](docs/adult-pivot.md) records the earlier visual and performance
  pass. It does not certify this new narrative implementation.
- Existing implementation tests and headless simulation results do not establish
  live visual quality, device FPS or successful 0G network transactions.

## Product Principles

1. Keep the city populated, explorable and visually legible.
2. Give the player a concrete situation and a discoverable next action.
3. Let different feasible choices produce different, traceable consequences.
4. Preserve observations, hypotheses and opinions as distinct information.
5. Make residents remember recorded events and promises, not invented quest flags.
6. Let learning emerge from curiosity without making the player feel examined.
7. Keep replay, saves, privacy and wallet-free play reliable through the pivot.
8. Use 0G for durable city intelligence and story expression, not as a decorative
   badge or a dependency in the render loop.

## Accessibility & Inclusion

Support keyboard, mouse and touch; clear focus states; reduced motion; readable
contrast; concise dialogue; optional captions/transcripts; and cues that do not
depend on colour alone. Keep opening sequences skippable and journal entries
reviewable. Avoid public labels, comparative scoring and judgments about the
human player's personality.
