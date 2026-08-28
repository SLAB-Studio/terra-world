# Terra City MVP — Trackable Build Phases

This checklist breaks the complete MVP into four functional build phases and a fifth dedicated UI/experience phase.

Phases 1–4 may use a plain developer shell for buttons, forms, logs, and map controls. Phase 5 turns the working product into the finished child-facing experience. Basic usability is still required while implementing earlier phases so every feature can be tested.

## MVP completion tracker

| Phase | Outcome | Status |
|---|---|---|
| 1 | Deterministic city foundation | In progress |
| 2 | Complete offline game and campaign | Not started |
| 3 | 0G intelligence, storage, and safety | Not started |
| 4 | Agentic ID, chain, deployment, and full integration | Not started |
| 5 | Finished child-facing UI and demo experience | Not started |

Status values: `Not started`, `In progress`, `Blocked`, `Ready for gate`, or `Complete`.

---

# Phase 1 — Deterministic City Foundation

## Goal

Build the technical foundation and a headless version of the city simulation. By the end of this phase, code—not AI—can create a city, place buildings, run turns, save state, and replay the same result deterministically.

## Deliverables

### Project foundation

- [x] **P1.1 Scaffold the repository**
  - Build: Create the Next.js/TypeScript application, shared packages, formatting, linting, test runner, environment validation, and standard scripts.
  - Acceptance: A fresh install can run the application, tests, type-checking, and production build.
  - Verify: Run install, type-check, lint, unit tests, and production build.

- [x] **P1.2 Define shared game schemas**
  - Build: Define and validate `CityState`, map, tile, building, resource, action-log, campaign, chapter, mission, event, milestone, and cause/effect schemas.
  - Acceptance: Valid fixtures parse successfully; missing fields and unsupported schema versions fail with understandable errors.
  - Verify: Unit tests for valid, boundary, and malformed fixtures.

- [x] **P1.3 Implement seeded world creation**
  - Build: Generate the fixed MVP river-valley map, elevation bands, flood zones, habitat values, and placeable tiles from a scenario seed.
  - Acceptance: The same seed produces the same map and map hash on repeated runs.
  - Verify: Snapshot test and deterministic hash comparison.

### Simulation engine

- [x] **P1.4 Implement the building catalogue**
  - Build: Add data definitions for homes, roads, water pump, treatment plant, solar array, battery, school, clinic, bus stop, recycling centre, wetland, and park/trees.
  - Acceptance: Each item defines footprint, construction cost, maintenance, prerequisites, inputs, outputs, effects, and optional coverage.
  - Verify: Catalogue-schema test and uniqueness test for all IDs.

- [x] **P1.5 Implement placement validation**
  - Build: Validate terrain, occupancy, footprint, flood restrictions, adjacency, connections, budget, and chapter unlocks. Support provisional placement, removal, and undo.
  - Acceptance: Every building can be validly placed; invalid placements return specific reason codes without mutating the city.
  - Verify: Table-driven tests covering valid placement and every rejection reason.

- [x] **P1.6 Implement city networks**
  - Build: Calculate road connectivity, water connections, electricity connections, service radius, and disconnected components.
  - Acceptance: Network coverage updates correctly when infrastructure is placed, moved, or removed.
  - Verify: Graph tests using small known map fixtures.

- [x] **P1.7 Implement turn simulation**
  - Build: Commit placements, deduct construction costs, calculate maintenance, production, demand, utility coverage, population change, and the five indicators.
  - Acceptance: A turn returns a new immutable state plus an ordered structured cause/effect trace.
  - Verify: Golden tests for water, energy, budget, population, and indicator outcomes.

- [x] **P1.8 Implement seeded events and state progression**
  - Build: Add scheduled events, stage transitions, milestone detection, and seeded randomness utilities.
  - Acceptance: Events fire on their scheduled turns and stages advance only when their declared conditions are met.
  - Verify: Scenario tests for settlement, town, city, and resilient-city transitions.

### Persistence and replay

- [x] **P1.9 Implement local persistence**
  - Build: Store current city, action log, campaign cache, settings, and pending sync operations in IndexedDB with migrations.
  - Acceptance: Refreshing or closing the browser preserves the last committed turn; a corrupted save is rejected safely.
  - Verify: Browser persistence test and migration unit tests.

- [x] **P1.10 Implement replay and state hashing**
  - Build: Recreate a city from seed plus ordered actions and produce canonical action-log and final-state hashes.
  - Acceptance: Browser and server executions produce identical states and hashes for the same run.
  - Verify: Replay the same golden scenario in both environments and compare hashes.

## Phase 1 gate

Phase 1 is complete only when:

- [ ] Type-check, lint, tests, and production build pass.
- [ ] A scripted scenario creates a city, places infrastructure, runs multiple turns, saves, reloads, and replays.
- [ ] Repeated runs produce identical final-state hashes.
- [ ] No AI or 0G service is required for the simulation to work.
- [ ] Phase 1 decision log and known limitations are documented.

---

# Phase 2 — Complete Offline Game and Campaign

## Goal

Turn the simulation foundation into the complete playable MVP. By the end of this phase, a child or tester can build Rivergate from empty land, finish all five chapters, experience the final storm, and reach one of three endings entirely offline.

## Deliverables

### Functional gameplay shell

- [ ] **P2.1 Build the functional map playground**
  - Build: Render the river-valley map and placed buildings in Phaser with temporary functional graphics.
  - Acceptance: The map loads from campaign data, pans within bounds, and accurately represents simulation state.
  - Verify: Manual comparison between rendered tiles/buildings and the underlying state fixture.

- [ ] **P2.2 Implement drag-and-drop construction**
  - Build: Add catalogue selection, drag ghost, tile snapping, rotate where applicable, provisional placement, remove, undo, and commit-turn controls for mouse and touch.
  - Acceptance: All twelve items can be placed and manipulated without creating inconsistent state.
  - Verify: Manual mouse/touch path plus automated interaction tests for critical placement flows.

- [ ] **P2.3 Implement functional planning overlays**
  - Build: Display valid/invalid tiles, flood risk, water, electricity, transport, service coverage, habitat impact, and cost impact using temporary visual treatments.
  - Acceptance: Overlay data matches engine calculations and updates during provisional placement.
  - Verify: Known fixture screenshots and engine-to-overlay assertion tests.

### Full learning campaign

- [ ] **P2.4 Implement chapter and mission state machines**
  - Build: Add chapter unlocks, objectives, mission briefing, completion rules, optional objectives, and progression persistence.
  - Acceptance: Players cannot skip required foundations; resuming returns to the correct mission state.
  - Verify: Automated progression tests across all five chapters.

- [ ] **P2.5 Author Chapter 1: Water brings a town to life**
  - Build: Water source, treatment, pipes, first homes, water quality, flood-zone consequences, learning facts, and fallback explanations.
  - Acceptance: At least two valid solutions and three meaningful failure/revision paths exist.
  - Verify: Play and record every intended solution and failure branch.

- [ ] **P2.6 Author Chapter 2: Power the neighbourhood**
  - Build: Solar generation, battery storage, demand, day/night reliability, clinic power, and maintenance trade-offs.
  - Acceptance: Solar-only, solar-plus-storage, and backup alternatives produce distinguishable outcomes.
  - Verify: Golden scenarios for generation, storage, blackout, and stable-grid paths.

- [ ] **P2.7 Author Chapter 3: Care for residents**
  - Build: School, clinic, walking access, road safety, service coverage, population health, and fairness.
  - Acceptance: A city cannot succeed by serving only one neighbourhood or maximising budget alone.
  - Verify: Accessibility and unequal-service scenario tests.

- [ ] **P2.8 Author Chapter 4: Handle growth**
  - Build: Recycling, waste generation, transport, congestion, pollution, maintenance, and growing population demand.
  - Acceptance: Growth creates new costs and trade-offs; at least two viable planning strategies remain.
  - Verify: High-growth, low-budget, waste-heavy, and transit-oriented scenarios.

- [ ] **P2.9 Author Chapter 5: Survive the storm**
  - Build: Final storm, drainage, wetlands, flood exposure, emergency access, backup energy, damage, and recovery.
  - Acceptance: Earlier water, energy, nature, transport, and budget decisions materially change storm outcomes.
  - Verify: At least six cross-system final-storm golden scenarios.

### Completion and learning feedback

- [ ] **P2.10 Implement city explanations without AI**
  - Build: Convert structured cause/effect traces into safe, prewritten explanations, reflective questions, and hints for every mission branch.
  - Acceptance: Every supported outcome has an understandable fallback; gameplay never requires AI.
  - Verify: Coverage test proving no cause/effect code lacks fallback content.

- [ ] **P2.11 Implement endings and learning summary**
  - Build: Add three endings, milestone traits, final city classification, action-history summary, and adult-readable learning summary data.
  - Acceptance: Endings are based on declared deterministic conditions and explain the strongest and weakest city systems.
  - Verify: Golden runs reaching all three endings.

- [ ] **P2.12 Validate the complete offline campaign**
  - Build: Add end-to-end tests and a repeatable manual play script from empty map to final ending.
  - Acceptance: A new player can finish in approximately 20–30 minutes without developer intervention.
  - Verify: Full clean-profile playthrough, reload test, touch test, and automated happy-path run.

## Phase 2 gate

Phase 2 is complete only when:

- [ ] All twelve building types work in the functional shell.
- [ ] All five chapters and the final storm are playable offline.
- [ ] At least three different full runs reach three different endings.
- [ ] Every outcome has a non-AI explanation and hint fallback.
- [ ] Save, close, resume, undo, and replay work throughout the campaign.
- [ ] A clean 20–30 minute MVP playthrough is recorded in testing notes.

---

# Phase 3 — 0G Intelligence, Storage, and Safety

## Goal

Connect the complete offline game to 0G Compute and 0G Storage without making either service a gameplay dependency. By the end of this phase, Rivergate speaks intelligently using verified city facts, campaign content is verifiable, and city checkpoints can be encrypted and backed up.

## Deliverables

### 0G integration foundation

- [ ] **P3.1 Build network and configuration adapters**
  - Build: Add environment validation, testnet/mainnet configuration boundaries, 0G clients, timeouts, retries, idempotency keys, and typed application errors.
  - Acceptance: Missing or invalid secrets fail at server startup; no secret is included in browser bundles.
  - Verify: Configuration tests and production-bundle secret scan.

- [ ] **P3.2 Package and validate Rivergate campaign v1**
  - Build: Produce the manifest, map, chapters, missions, buildings, ruleset, learning facts, localisation, and asset manifest as a versioned package.
  - Acceptance: The package is complete, schema-valid, deterministically hashed, and playable from packaged data alone.
  - Verify: Campaign-validation command and clean-cache playthrough.

- [ ] **P3.3 Publish and retrieve the campaign through 0G Storage**
  - Build: Upload the package, retain the returned root, download with proof verification, validate the manifest, and cache the verified version locally.
  - Acceptance: A fresh client can retrieve and play the campaign; a modified package fails verification.
  - Verify: Upload/download integration test and deliberate tamper test.

### Encrypted checkpoints

- [ ] **P3.4 Implement checkpoint encryption**
  - Build: Serialize verified checkpoint data and encrypt/decrypt in the browser using versioned AES-GCM envelopes.
  - Acceptance: 0G Storage and the application server receive ciphertext only; incorrect keys or modified ciphertext fail authentication.
  - Verify: Encryption round-trip, wrong-key, tamper, and version-migration tests.

- [ ] **P3.5 Implement checkpoint backup and restore**
  - Build: Upload chapter checkpoints to 0G Storage, store roots in the adult-controlled session, restore on a new profile, and integrate the background sync queue.
  - Acceptance: Local gameplay continues during upload failure and later synchronises idempotently.
  - Verify: Offline-save, failed-upload, reconnect, duplicate-retry, and new-device restore tests.

### City intelligence

- [ ] **P3.6 Connect the 0G Compute Router server-side**
  - Build: Create a server-only Router client with private trust mode, model configuration, strict timeout, rate limiting, and provider-unavailable handling.
  - Acceptance: A structured test request produces a valid response; API credentials never reach the browser.
  - Verify: Integration test plus browser network/bundle inspection.

- [ ] **P3.7 Implement structured guide prompts**
  - Build: Convert mission, before-state, action, after-state, causes, allowed facts, relevant city memories, and age band into constrained requests.
  - Acceptance: Requests contain no arbitrary database records or child profile fields.
  - Verify: Snapshot tests and a prohibited-field scanner.

- [ ] **P3.8 Implement guide response validation**
  - Build: Validate JSON structure, reading length, allowed vocabulary, factual grounding, question count, memory format, and prohibited topics before display.
  - Acceptance: Malformed, overlong, ungrounded, or unsafe outputs are discarded in favour of the local fallback.
  - Verify: Adversarial fixture suite and forced-invalid-provider-response tests.

- [ ] **P3.9 Implement Rivergate voice and hint tasks**
  - Build: Add explain, react, reflective-question, graduated-hint, and structured-memory-candidate tasks.
  - Acceptance: Rivergate speaks in the first person, uses only verified city facts, and never claims to change the simulation.
  - Verify: Golden prompt/response evaluations across every chapter.

### Privacy and resilience

- [ ] **P3.10 Implement data-minimisation enforcement**
  - Build: Add allowlisted request projection, no-child-PII checks, content logging policy, and safe operational telemetry.
  - Acceptance: Names, precise ages, school, location, raw child chat, and behavioural profiles cannot enter Compute requests or city memory.
  - Verify: Static schema review plus automated sensitive-field and log tests.

- [ ] **P3.11 Implement Compute fallback and caching**
  - Build: Fall back to campaign-authored content on timeout, no private provider, invalid output, quota, or network failure. Cache only safe, generic explanations keyed by deterministic cause code.
  - Acceptance: No 0G Compute failure blocks a turn or exposes a technical error to the child.
  - Verify: Fault-injection tests for every documented failure mode.

- [ ] **P3.12 Verify complete 0G Storage and Compute flows**
  - Build: Add end-to-end integration tests, usage monitoring, and a test report linking game actions to Storage and Compute evidence.
  - Acceptance: The full campaign remains playable with services enabled, disabled, slow, and intermittently failing.
  - Verify: Four-mode integration matrix and evidence capture.

## Phase 3 gate

Phase 3 is complete only when:

- [ ] Rivergate campaign v1 is uploaded and proof-verified from 0G Storage.
- [ ] Encrypted checkpoints can be backed up and restored.
- [ ] Rivergate produces validated in-character explanations through 0G Compute.
- [ ] Private-provider failure uses the local fallback without silent downgrade.
- [ ] Automated tests demonstrate that child PII cannot reach Compute, Storage plaintext, or logs.
- [ ] The complete game still works with all 0G services disabled.

---

# Phase 4 — Agentic ID, Chain, Deployment, and Full Integration

## Goal

Make Rivergate a persistent evolving city through its Agentic ID, anchor official campaign content and milestones on 0G Chain, verify completed runs, expose judge evidence, and deploy the complete functional MVP.

## Deliverables

### Smart contracts

- [ ] **P4.1 Implement `TerraCampaignRegistry`**
  - Build: Add publisher access control, campaign version registration, storage root, ruleset hash, deprecation status, events, and reads.
  - Acceptance: Only authorised publishers can register versions; previous versions remain auditable.
  - Verify: Contract unit tests for success, duplicate, unauthorised, deprecated, and historical reads.

- [ ] **P4.2 Implement `TerraCityAgent`**
  - Build: Add city minting, owner, authorised executor, encrypted intelligence URI, metadata hash, campaign reference, capabilities, and paused-transfer policy.
  - Acceptance: Only valid owners/executors can perform their permitted operations; direct child/browser mutation is impossible.
  - Verify: Contract tests for mint, ownership, authorisation, metadata update, permission revocation, and transfer pause.

- [ ] **P4.3 Implement milestone commitments**
  - Build: Record milestone ID, salted run commitment, intelligence hash, city token ID, campaign version, and event timestamp.
  - Acceptance: Duplicate or unverified milestone submissions fail; no child data appears in event fields.
  - Verify: Contract tests plus ABI/event privacy review.

- [ ] **P4.4 Deploy and verify contracts on Galileo**
  - Build: Add network configuration, deployment scripts, recorded addresses, source verification, and environment-specific contract loaders.
  - Acceptance: Contracts are deployed, readable, verified where supported, and linked in project documentation.
  - Verify: Deployment smoke test and explorer inspection.

### Sponsored city lifecycle

- [ ] **P4.5 Implement sponsor-wallet controls**
  - Build: Create a server-only transaction service with operation allowlist, per-session rate limits, spending limits, idempotency, nonce handling, monitoring, and emergency pause.
  - Acceptance: The browser cannot request arbitrary transactions, recipients, contracts, or calldata.
  - Verify: Authorisation, rate-limit, replay, malformed-call, and secret-exposure tests.

- [ ] **P4.6 Implement city creation**
  - Build: Create a local/adult session, mint a city Agentic ID, encrypt and upload starting intelligence, attach the URI/hash, and return a normal application `cityId`.
  - Acceptance: The child sees “Create My City” and never sees a wallet or transaction step.
  - Verify: Fresh guest and adult-controlled creation flows plus explorer/storage evidence.

- [ ] **P4.7 Implement authorised city-agent execution**
  - Build: Verify server usage authorisation before loading city intelligence, calling Compute, or proposing a memory update.
  - Acceptance: Revoked or incorrect executors cannot use or update the city Agentic ID.
  - Verify: Valid, revoked, wrong-city, and expired-session integration tests.

- [ ] **P4.8 Implement verified memory evolution**
  - Build: Accept a safe memory candidate, verify its associated deterministic milestone, encrypt the updated intelligence, upload it, and update the Agentic ID commitment.
  - Acceptance: Unverified, duplicated, personal, or free-form memories cannot be committed.
  - Verify: End-to-end valid update plus adversarial rejection tests.

### Completion, APIs, and deployment

- [ ] **P4.9 Implement server replay verification**
  - Build: Resolve the registered campaign/ruleset, replay the submitted ordered actions, compare claimed state, and produce the salted run commitment.
  - Acceptance: Modified state, reordered actions, wrong campaign version, and invalid seed are rejected.
  - Verify: Valid and tampered full-run tests.

- [ ] **P4.10 Complete the application API surface**
  - Build: Finalise typed routes for cities, campaigns, guide, checkpoints, run verification, milestones, adult summary, and proof evidence.
  - Acceptance: Every endpoint has validation, authorisation, documented errors, rate limits, and idempotency where needed.
  - Verify: API contract tests and generated/request-example documentation.

- [ ] **P4.11 Implement proof-mode data aggregation**
  - Build: Return city Agentic ID, capabilities, intelligence commitment, campaign root, ruleset hash, Compute trust evidence, milestone transaction, and replay status.
  - Acceptance: Evidence is derived from live configured services and never exposes encrypted content or child data.
  - Verify: Cross-check every returned value against its explorer, storage root, or replay output.

- [ ] **P4.12 Deploy the complete functional MVP**
  - Build: Deploy application and API, configure domains/secrets, enable monitoring, seed Rivergate v1, set quotas, and publish runbook/rollback notes.
  - Acceptance: A new browser can create a city, complete the full campaign, use 0G Compute, restore a checkpoint, evolve the Agentic ID, survive the storm, and show proof evidence.
  - Verify: Production smoke test from a clean device plus full end-to-end demo rehearsal.

## Phase 4 gate

Phase 4 is complete only when:

- [ ] Official Rivergate content resolves from the registered 0G Storage root.
- [ ] A sponsored city Agentic ID can be created without child wallet interaction.
- [ ] The city intelligence commitment updates after a verified milestone.
- [ ] A full run can be replayed and recorded anonymously on 0G Chain.
- [ ] Sponsor controls reject arbitrary or abusive transaction requests.
- [ ] The deployed functional MVP completes the entire end-to-end path.
- [ ] Proof evidence matches live Storage, Compute, Agentic ID, and Chain data.

---

# Phase 5 — Child-Facing UI, Accessibility, and Demo Polish

## Goal

Replace the developer shell with a cohesive, delightful, accessible child-facing experience while preserving every working Phase 1–4 behaviour.

## Deliverables

### Visual system and game world

- [ ] **P5.1 Establish the Terra City visual system**
  - Build: Define art direction, colour tokens, typography, icon language, elevation, spacing, motion rules, sound direction, and child-readable component states.
  - Acceptance: The system is documented and works at desktop, tablet, and supported mobile-web sizes.
  - Verify: Token/component review against contrast, legibility, touch, and reduced-motion requirements.

- [ ] **P5.2 Create the Rivergate map and building assets**
  - Build: Produce coherent terrain, river, roads, all twelve buildings, construction states, coverage overlays, weather, damage, and restored-state assets.
  - Acceptance: Buildings remain identifiable at gameplay scale and every important state is visually distinct without relying on colour alone.
  - Verify: Asset inventory review at actual in-game sizes and colour-vision simulation.

### Child journey

- [ ] **P5.3 Design and implement onboarding**
  - Build: Welcome, city naming, emblem choice, role selection, AI transparency statement, first placement tutorial, and return-player continuation.
  - Acceptance: A first-time child can reach the first meaningful placement without wallet, account, or technical terminology.
  - Verify: Clean-profile moderated usability test and interaction analytics check.

- [ ] **P5.4 Design and implement the main city-builder layout**
  - Build: City canvas, indicators, budget, turn/storm status, building tray, inspect/build modes, selected-building details, commit button, and navigation.
  - Acceptance: The map remains primary; essential status and next action are understandable without opening technical panels.
  - Verify: Desktop, tablet, touch, keyboard, and narrow-width interaction tests.

- [ ] **P5.5 Polish drag, placement, and overlays**
  - Build: Placement ghost, snap feedback, valid/invalid states, cost preview, coverage animation, collision feedback, undo, and commit transition.
  - Acceptance: Every rejection explains why; children can confidently predict what will happen before committing.
  - Verify: Usability pass across all twelve buildings and all placement rejection codes.

- [ ] **P5.6 Design Rivergate's voice and learning moments**
  - Build: City dialogue, explain/hint controls, reflective question, vocabulary help, memory callbacks, read-aloud, fallback state, and clear computer-character disclosure.
  - Acceptance: Dialogue is brief, interruptible, age-appropriate, and never blocks building.
  - Verify: Content review for every chapter, age band, fallback, and long-text edge case.

- [ ] **P5.7 Design chapter progression and consequences**
  - Build: Mission briefings, objective tracking, run-city sequence, before/after comparison, cause/effect reveal, revision prompt, milestone celebration, final storm, and three endings.
  - Acceptance: Children can connect their action to its visible consequence and understand what they might improve.
  - Verify: Full visual playthrough of every chapter and ending.

### Adult, proof, and edge states

- [ ] **P5.8 Design adult controls and judge proof mode**
  - Build: Adult gate, backup/consent, learning summary, deletion, technical disclosure, and expandable proof evidence.
  - Acceptance: Child play remains free of technical information; adults and judges can inspect the necessary controls/evidence separately.
  - Verify: Child/adult boundary review and live proof-link verification.

- [ ] **P5.9 Implement complete system states**
  - Build: Loading, empty, offline, saved-local, backed-up, Compute fallback, Storage retry, chain pending, invalid campaign, restored session, and safe fatal error states.
  - Acceptance: No expected failure exposes raw technical errors or traps the child.
  - Verify: Fault-injection screenshot matrix.

### Accessibility and finish

- [ ] **P5.10 Complete accessibility and inclusion pass**
  - Build: Keyboard support, focus visibility, semantic labels, screen-reader descriptions, contrast, non-colour indicators, reduced motion, sound controls, read-aloud, and large touch targets.
  - Acceptance: Core campaign is operable without precise pointer input and important information has multiple representations.
  - Verify: Automated accessibility scan plus manual keyboard, screen-reader, reduced-motion, zoom, and touch review.

- [ ] **P5.11 Complete responsive and performance pass**
  - Build: Adapt gameplay for target breakpoints, optimise Phaser/assets, lazy-load noncritical content, bound animation cost, and prevent layout/interaction shifts.
  - Acceptance: Interaction stays responsive on the minimum target device and no essential control is clipped or unreachable.
  - Verify: Batched desktop/tablet/mobile screenshots, performance profile, and real-device smoke test.

- [ ] **P5.12 Prepare the final hackathon experience**
  - Build: Demo seed, guided demo path, screenshots, proof drawer defaults, reset-city control, graceful service fallbacks, presentation copy, and recording checklist.
  - Acceptance: The seven-step demo can be repeated reliably without manual database or contract repair.
  - Verify: Three consecutive timed rehearsals from reset to proof milestone.

## Phase 5 gate

Phase 5—and therefore the MVP—is complete only when:

- [ ] A first-time child can create and build a city without assistance or Web3 knowledge.
- [ ] Drag-and-drop works with mouse, touch, and keyboard-accessible alternatives.
- [ ] Every chapter, consequence, fallback, storm, and ending has finished visuals and copy.
- [ ] Adult controls and proof mode are clearly separated from child play.
- [ ] Accessibility, responsive, performance, and failure-state checks pass.
- [ ] Three consecutive end-to-end demo rehearsals succeed.
- [ ] Final screenshots, demo script, deployment URL, contract links, and 0G evidence are ready.

---

# Final MVP release gate

Do not call the MVP complete until all five phase gates pass and the following release checks are satisfied:

- [ ] Clean install, type-check, lint, tests, and production build pass.
- [ ] No secrets appear in the client bundle, logs, repository, or screenshots.
- [ ] No child PII appears in Compute requests, Storage plaintext, Agentic ID metadata, chain events, or telemetry.
- [ ] A complete offline run and a complete 0G-connected run both succeed.
- [ ] A delayed or failed 0G operation never loses local city progress.
- [ ] Live campaign, Agentic ID, Storage, Compute, and milestone evidence agree.
- [ ] The final storm depends meaningfully on earlier city-building decisions.
- [ ] All three endings are reachable through legitimate strategies.
- [ ] The child never encounters a wallet, token, gas, signature, or transaction prompt.
