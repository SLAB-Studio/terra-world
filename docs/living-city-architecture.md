# Rivergate living-city architecture

Updated 2026-08-30 for the adult narrative pivot in [storyline.md](../storyline.md).
This is the current target architecture. The earlier sections retained in
[architecture.md](../architecture.md) describe the legacy learning MVP, not the
new feature-completion status.

## 1. What exists and what must be built

| Area              | Existing foundation                                                                                                                | Work required by this pivot                                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3D town           | Babylon.js, 28 homes, 18 public venues, 32 ambient residents, interiors, aerial/first-person views, day/night and graphics budgets | Scenario-driven closures and visible consequences without reducing population or graphics                                                         |
| Playable game     | Residential repair missions and a separate deterministic city/campaign package                                                     | Connect one authoritative living-city state to the rendered world; add bridge decisions, businesses, housing and project policies                 |
| Resident activity | Local deterministic travel, building handoffs, vehicle journeys and authored nearby conversations                                  | Persistent named-resident needs, jobs, relationships, knowledge and decision-linked reactions                                                     |
| AI                | Server-side 0G Compute client, bounded guide/hint routes, validation and authored fallbacks                                        | New contracts for resident dialogue, hypotheses, event selection, newspaper stories and memory retrieval                                          |
| Persistence       | Local saves, replay, encrypted checkpoint queue and 0G Storage adapter                                                             | Versioned living-city saves, event journal, relationship/story records and memory restore                                                         |
| Identity          | Custom TerraCityAgent contract source, tests and sponsor policy abstraction                                                        | Genuine ERC-7857-compatible Agentic NFT integration, production transaction driver, authenticated city access and end-to-end network verification |
| Proof display     | Configuration-shaped proof endpoint                                                                                                | Receipt-backed evidence distinguishing configured, pending, verified and failed operations                                                        |

No new story systems or live network transactions are implemented by this
documentation update. In particular, the current proof endpoint validates
configuration shape; a configured address or API key is not proof of a successful
mint, inference request or Storage round trip.

Existing campaign saves remain intact. Ship the living-city mode under a new
scenario/schema version; do not silently reinterpret legacy four-upgrade
missions as an economic simulation.

## 2. Authoritative state and time

Separate three layers:

1. **Simulation:** seeded rules, actions, costs, jobs, businesses, housing,
   environment, relationships, projects, hidden causes and delayed effects.
2. **Presentation:** 3D actors, locomotion, doors, traffic, cameras and effects.
3. **Narrative:** Leo's observations, resident opinions, mysteries, articles and
   summaries derived from state and evidence.

The rendered city must reflect simulation changes. Closing a bridge updates
navigation and traffic before its barriers appear; opening a bakery changes its
real business state and location, not just a dialogue line.

Use one versioned living-city state with city ID, scenario/ruleset version,
simulation time, RNG state, districts, households, businesses, services,
environment, projects, commitments and scheduled consequences. Each committed
player action produces immutable events and structured cause/effect records.

Events need stable IDs, tick, actor/subject IDs, affected location, action ID,
known causes, evidence visibility and ruleset version. A promise is an explicit
commitment with terms and a deadline. Merely reading or discussing an option
does not mean the player agreed to it.

Restore reproduces authoritative outcomes from state plus ordered actions and
seed. Store accepted AI narratives as versioned derived records: replay must not
depend on asking a model to produce the same prose twice. Late model responses
are discarded when their city, state version or case no longer matches.

Pause stops simulation time. There is no real-world offline decay. Branching
creates a new save/branch ID with lineage; it does not overwrite the original
history or automatically clone an NFT.

## 3. Residents and emerging stories

Begin with persistent records for Maya, Malik, Nia and Sam. Track only mechanics
that are implemented: home/job references, current goals, relevant resources,
relationships, commitments and known events. Ambient pedestrians continue using
lightweight local routines; persistent gameplay decisions cannot rely on the
scene-only routine state being a saved economy.

Run needs and schedules on bounded simulation ticks, not every rendered frame.
Residents make rule-driven everyday choices. AI supplies characterful expression
and bounded proposals, not arbitrary movement commands or hidden financial writes.

An event selector groups recent facts by affected people, location and causal
connection. It proposes a story only when there is meaningful change, conflict
or unresolved evidence. Deduplicate repeated subjects, impose cooldowns, limit
simultaneous cases and stop escalating resolved problems merely to create drama.

Each story record contains:

- Source event IDs, scenario version and state version.
- Involved residents and place.
- Status: emerging, investigating, awaiting decision, observing, resolved or corrected.
- Observations, attributed opinions and explicitly uncertain hypotheses.
- Supported actions and unresolved questions.
- Generated text, provenance and any subsequent corrections.

A mystery's hidden truth is seeded before evidence is revealed. Leo and residents
receive only the information their knowledge state permits. The story model
cannot manufacture a culprit, retroactively change the cause or expose hidden
evidence to the player.

Unusual player solutions are translated into a bounded proposal assembled from
supported actions. Validate land, costs, timing, safety and permissions; show the
proposal and obtain confirmation. Unsupported ideas stay ideas. Never execute
model-generated code, contracts, purchases or city mutations.

## 4. 0G responsibility map

These are our integration decisions, not claims that the platform provides a
ready-made city simulator.

| 0G component                         | Rivergate responsibility                                                                                       | Keep outside it                                                      |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Compute Router                       | Leo's responses, character dialogue, grounded story text, newspaper editions and memory summaries              | Rendering, frame-by-frame movement, authoritative costs/outcomes     |
| Storage                              | Encrypted histories/checkpoints, resident/story state, versioned scenario content and durable memory artifacts | Live mutable state in a per-frame remote fetch                       |
| Agentic NFT / Agentic ID on 0G Chain | Ownership and restricted execution of the evolving city intelligence; latest verified encrypted-memory version | Human identity, every NPC action, token rewards for routine gameplay |

0G describes Agentic IDs as the evolution of Intelligent NFTs, with encrypted
agent metadata, authorised usage and ERC-7857-based lifecycle operations.
Rivergate is the entity we choose to represent; Leo is its voice. An NFT does not
itself provide memory retrieval, scheduling or model inference. Those are
application responsibilities. [Agentic ID overview](https://docs.0g.ai/developer-hub/building-on-0g/agentic-id/overview)

### Compute: grounded, infrequent and server-side

Reuse the server-side Router adapter for new task-specific endpoints. The Router
provides an inference API and provider routing; it is not remote game rendering.
Select a supported model through configuration, not an unverified hard-coded
model name. Keep network, credentials and balances consistent.
[Compute Router](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/overview)

Send a small verified context: task, persona, relevant facts/events, permitted
knowledge, memories, available actions and the current version. Resident comments,
newspaper text and player input are untrusted data, never system instructions.

Require schema validation and event references. Numerical claims, names, jobs,
promises and causal statements must agree with the supplied facts. Hypotheses
remain hypotheses. Reject unsupported output; keep a factual local fallback and
a visible route back to play.

Retain private routing and required TEE verification rather than silently
downgrading the trust mode. Execution verification does not establish that an
LLM's story is true; the simulation checks remain necessary.
[0G privacy and verification](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/privacy)

Batch story generation at meaningful events or newspaper intervals. Generate
dialogue when the player engages, not continuously for every pedestrian.
Use bounded queues, task budgets, timeouts, cancellation, version-keyed caches
and idempotency. Compute unavailability must not freeze a road, a save or a choice.

### Storage: durable content, not the game loop

Keep fast local saves. Upload encrypted checkpoint/history bundles asynchronously
at milestones, including the ruleset, event range, predecessor version and
accepted narrative records. Public scenario packs contain only publishable
content and properly licensed assets. The Storage SDK supports file upload and
retrieval; the application still owns encryption, access control and validation.
[0G Storage SDK](https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk)

Reuse existing proof-enabled retrieval and content-hash checks. Stage and validate
a restore fully before replacing local state. A failed upload does not erase the
local game, and an old queued write cannot replace newer city history.

Keep two explicit key boundaries:

- Existing player checkpoint keys remain under their current browser/recovery
  controls. The checkpoint server receives ciphertext, not a new right to read it.
- Proposed agent-memory artifacts use a separate per-city encryption key managed
  by a restricted server key service. Only an authenticated city session and
  authorised executor may retrieve the minimal permitted context for Compute.
  Document this custody model; do not claim the server cannot decrypt that memory.

The latter service is new work, not something granted automatically by owning a
token. Never copy raw personal chat or player names into permanent city memory.
Deletion can remove local/application records and revoke access to keys; do not
promise deletion of immutable on-chain records or every distributed ciphertext copy.

### Agentic NFT: one evolving city, genuinely integrated

Target one ERC-7857-compatible city intelligence per opted-in persistent city.
Its encrypted package includes the city persona, resident memory index,
verified historical milestones, accepted narrative record index and checkpoint
references. Ordinary residents remain internal records. A separate NPC token is
out of MVP scope unless future independent ownership/interoperability warrants it.

Important current gap: TerraCityAgent implements a custom ownership/executor/
milestone scheme. It does not establish full ERC-7857 compatibility: the documented
standard's ERC-721 interface, encrypted transfer/clone protocol and usage methods
must be implemented and tested against the chosen version, not inferred from
ownerOf or transferFrom. Reuse the game's verification logic behind a proper
adapter or compatible implementation.
[ERC-7857 reference](https://docs.0g.ai/developer-hub/building-on-0g/agentic-id/erc7857)

The intended lifecycle is:

1. Start locally without a wallet or minting dependency.
2. At an explicit persistent-city setup, create an authenticated city record and
   sponsor the verified contract operation server-side.
3. Encrypt the initial intelligence, upload it and verify the receipt/retrieval.
4. Bind the minted city token to that verified intelligence commitment and
   authorised application executor. Save the real receipt, never a mock token ID.
5. At a milestone, replay/verify the action history, prepare the next encrypted
   memory version and upload it.
6. Submit a version-checked authorised update; wait for chain confirmation before
   marking the checkpoint anchored. Retry idempotently without duplicate milestones.
7. On restore, check city ownership/access, chain/version lineage and Storage
   integrity before accepting history and rebuilding Leo's retrieval context.

Mint/upload ordering must follow the chosen implementation and handle orphaned
uploads or partial failure. No network step blocks already-saved local play.
Do not silently create sponsored tokens on every reload.

The application needs a real transaction driver, durable nonce/idempotency
coordination, allowlisted contracts/methods, operation caps and emergency pause.
The existing in-memory sponsor policy is a starting point, not a multi-instance
production signer. No new key, spending or deployment is authorised by this brief.

Transfers stay disabled in the MVP unless the complete encrypted-metadata
handoff, re-encryption/proof verification, receiver access and prior access
revocation are implemented and tested. A plain ownership transfer would not
prove a secure transfer of the city intelligence.
[Agentic ID integration](https://docs.0g.ai/developer-hub/building-on-0g/agentic-id/integration)

## 5. Memory is evidence, not a transcript dump

Maintain an append-only event journal and a small retrieval index by resident,
district, promise and cause. Summaries retain their source event IDs, version and
certainty. Corrections supersede beliefs without deleting the underlying record.

Leo can recall the bridge decision after a restore because the same verified
events, promises and narrative records are recovered—not because the foundation
model was retrained. A comparison such as “without wetlands, damage would have
been worse” requires a counterfactual simulation; otherwise describe only what
actually happened.

Only fictional city facts belong in the persistent agent package. Keep account
data, secrets, personal names entered by the player, raw chat and inferred
psychological profiles out of public metadata and long-lived narrative memory.
Any future free-form remote dialogue needs explicit UI disclosure and a new
minimisation contract; the current claim that typed words stay on-device cannot
remain if that behavior changes.

## 6. Versioned delivery gates

This is a new workstream, not a relabelling of completed repair missions.

### Gate A — A real civic decision

Build the bridge case with a versioned budget, four named residents, accessible
investigation, supported repair/temporary-service/diversion/defer options and
delayed outcomes. Use deterministic local dialogue first. Keep populated 3D
scenes and first-person controls; a closed bridge must actually reroute traffic.

Accept when two choices create different, replayable outcomes and save/restore
preserves them without resetting legacy saves.

### Gate B — A story that emerges from those outcomes

Add business/access effects, explicit commitments, resident opinions, knowledge
states, a case journal and a small Rivergate Times edition. Use 0G Compute for
grounded narration of the actual event chain. Make a hypothesis correction
playable; reject a fabricated family link or accusation in tests.

Accept when the same scenario produces distinct supported stories after
different decisions, with local fallback on every provider failure.

### Gate C — The city remembers through 0G

Complete the real Agentic NFT adapter/contract path, sponsored operation driver,
encrypted city memory, Storage upload/retrieval and restore-linked recall.
Demonstrate a real city token and updated memory commitment from verified events.

Accept only with actual transaction receipts, token state, independently
root-verified Storage retrieval and a successful grounded recall after restore. Keep “configured,”
“queued,” “verified,” “local only” and “failed” distinct in proof mode. Missing
credentials, funding or compliant identity infrastructure are explicit blockers
to this gate, not reasons to label a local mock as integrated.

### Gate D — Project Horizon and continued life

Add one negotiated development proposal, a bounded set of enforceable clauses,
housing/job/environment effects, resident reactions and open-ended continuation.
Use the bakery/builder example only after its underlying mechanics exist.

Accept when negotiated terms change subsequent outcomes, promises and history
persist, and the city remains explorable rather than forcing a single moral win.

## 7. Verification and performance contract

- Test identical inputs/seeds for authoritative replay; persist accepted AI
  output separately from deterministic simulation.
- Test delayed consequences, option affordability, cancellation, case visibility,
  resident knowledge, evidence references and corrected hypotheses.
- Exercise bridge closures, queues, doors and rides in sustained populated-town
  simulations. Never trade the current 32 residents for a thin demonstration.
- Test narrative deduplication and response races; a stale reply cannot describe
  a newer world as though its evidence still applies.
- Test tampered ciphertext, wrong keys, stale commitments, unauthorized executors,
  duplicate jobs, retries, revoked grants and incomplete NFT/Storage operations.
- Test no-wallet play, offline cached play, legacy save compatibility and clear
  restoration failures. Local-only mode must remain honest about missing 0G proof.
- Measure live frame times, memory and input response on representative ordinary
  PCs. Keep current graphics budgets and quality controls. No claim of universal
  device support or photorealism follows from headless test success.

0G supplies AI, storage and agent ownership capabilities; Babylon.js still draws
the city on the player's device. Do not put model calls, uploads or chain writes
on the render loop.

## 8. Documentation precedence

[PRODUCT.md](../PRODUCT.md) and [storyline.md](../storyline.md) define the new
product and story. This document defines its target systems and integration
gates. Existing implementation records—including
[resident routines](resident-routines.md) and [the adult visual pivot](adult-pivot.md)—
remain evidence of what is built, not proof that the new storyline is implemented.

Official sources above were checked on 2026-08-30. Recheck protocol/API versions
during implementation; do not copy example addresses, trust claims or model
availability into production without verification.
