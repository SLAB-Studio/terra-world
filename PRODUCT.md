# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary users are adults who enjoy city restoration, neighbourhood management, and understanding connected urban systems. The experience should respect their time and judgment with clear objectives, grounded feedback, and short, resumable sessions.

## Product Purpose

Terra World is a city restoration and management game set in the already-active city of Rivergate. Players inspect residential service gaps, coordinate upgrades, and restore neighbourhoods after disruption. Success means understanding what changed and completing useful work for residents, not simply accumulating a score.

## Positioning

Terra World pairs a grounded city setting with deterministic, explainable rules. The playable residential campaign focuses on power, clean water, gardens, and recycling. The wider city supplies context; its visible activity must not imply that every building, resident, service, or economic process is independently simulated. AI may explain verified outcomes, but it never controls or rewrites the game rules.

## Operating Context

The MVP is a responsive browser game with mouse, keyboard, and touch support. Ordinary PCs, including integrated-GPU systems, are the performance target. Grounded graphics should use restrained geometry, materials, lighting, and effects with scalable quality; this is a design target, not a claim that every PC or integrated GPU is supported. Performance and minimum requirements need measurement on representative hardware.

Core play must remain available offline once the application and required content are cached. Local saves are authoritative. No wallet connection is required; optional 0G operations remain sponsored behind server-controlled infrastructure.

## Capabilities and Constraints

- The residential campaign contains fifteen missions across five stages, progressing from single-property service assessment to coordinated block restoration.
- Its four core upgrades are solar power, clean water, gardens, and recycling. Mission text must describe these existing rules without inventing budgets, currencies, payments, infrastructure networks, or new simulations.
- Rivergate begins visibly populated. The three campaign properties are Sunny House, Bluebell House, and Mango House; surrounding city activity provides a broader setting.
- The wider deterministic city-building simulation remains part of the codebase; the adult-facing pivot does not change its rules or claim new playable systems.
- City state, action history, events, progression, and endings are deterministic and replayable.
- Existing local saves, campaign IDs, goals, unlock order, and reward rules remain compatible. Display wording may change without resetting progress.
- 0G Compute is limited to grounded advice, explanations, and hints. It does not render graphics, stream a remote game, or simulate the city. Authored guidance remains available when Compute is unavailable or its output fails validation.
- 0G Storage and chain features must not block gameplay. Credentials and sponsored transactions remain server-side.
- Agentic identity belongs to the evolving city or guide, never to the player. The audience change does not relax data minimisation or existing privacy controls.
- No public profiles, wallet prompts, token trading, advertisements, loot boxes, public leaderboards, or streak pressure are introduced into play.

## Brand Commitments

The product name is **Terra World**. The playable city is **Rivergate**. The city advisor is **Leo**. Resident and property names remain consistent, including Ayo, Mina, Tomi, Mr. Sam, Sunny House, Bluebell House, and Mango House. Language should be concise, practical, and respectful, with specific service objectives and readable inspection results. Avoid classroom framing, childish celebration, unsupported technical claims, or manipulative pressure.

## Evidence on Hand

- `architecture.md` defines the existing technical and 0G boundaries. Its original child-audience framing is historical where it conflicts with the adult audience approved here; privacy and deterministic-rule constraints still apply.
- `build-phases.md` tracks MVP implementation; this document establishes the approved adult-facing product direction, not completion of unverified features.
- The deterministic simulation, replay engine, IndexedDB persistence, and campaign state machine are implemented and tested.
- The residential campaign has authored objectives and hint ladders. Optional server-side hints use bounded challenge facts and require private Compute responses with TEE verification requested; failures fall back to authored text.
- Grounded visuals and ordinary-PC performance require direct visual and hardware verification. Do not describe a graphics quality level or performance threshold as proven without measurements.

## Product Principles

1. Let players inspect a concrete need, plan a change, and observe its verified result.
2. Keep rules deterministic, understandable, and playable without AI or a network.
3. Preserve local progress and make revision, rebuilding, and another attempt straightforward.
4. Keep blockchain complexity outside core play and minimise player data by design.
5. Prioritise complete, balanced service coverage over accumulation or pressure to act quickly.
6. Let Leo explain verified conditions and available next actions without claiming authority over the simulation.

## Accessibility & Inclusion

The game must support keyboard, mouse, and touch; clear focus states; reduced motion; readable contrast; concise language; and interaction that does not depend on color alone. Avoid public ability labels or comparative scoring.
