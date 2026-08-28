# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary users are children roughly 8–13 who learn by building and maintaining a city. Parents, teachers, mentors, and hackathon judges are supporting audiences, but the child owns the moment-to-moment play.

## Product Purpose

Terra World is a city-building learning game. A child grows Rivergate from empty land, makes trade-offs across water, energy, nature, transport, public services, and money, then sees clear consequences and improves the city over time. Success means the child can explain why their city changed—not merely achieve a high score.

## Positioning

Terra World teaches interconnected real-world systems through a deterministic city simulation whose outcomes can be replayed and explained. AI may explain verified outcomes, but it never controls or rewrites the game rules.

## Operating Context

The MVP is a responsive browser game designed for short, resumable play sessions with mouse, keyboard, or touch. It must remain fully playable offline. Children never connect a wallet; any future 0G operations are sponsored and hidden behind adult-controlled infrastructure.

## Capabilities and Constraints

- Children place and revise twelve kinds of buildings on a seeded river-valley map.
- Five chapters teach water, energy, community care, responsible growth, and climate resilience.
- City state, action history, events, progression, and endings are deterministic and replayable.
- Local IndexedDB saves are authoritative for offline play.
- 0G Compute is limited to grounded explanations and hints; 0G Storage and chain features must not block gameplay.
- Agentic identity belongs to the evolving city or guide, never to a child.
- No public profiles, wallets, token language, trading, advertisements, loot boxes, public leaderboards, or streak pressure appear in the child experience.

## Brand Commitments

The product name is **Terra World**. The playable city is **Rivergate**. Language should feel encouraging, concrete, curious, and respectful—never babyish, shaming, technical, or manipulative.

## Evidence on Hand

- `architecture.md` defines the product and 0G boundaries.
- `build-phases.md` is the authoritative MVP implementation tracker.
- The deterministic simulation, replay engine, IndexedDB persistence, and campaign state machine are implemented and tested.
- No final artwork, logo system, or approved visual comp exists yet; temporary functional graphics are acceptable until Phase 5.

## Product Principles

1. Let children learn by changing a system and observing consequences.
2. Keep rules deterministic, understandable, and playable without AI or a network.
3. Treat revision as learning: undoing, rebuilding, and trying another plan are positive actions.
4. Hide blockchain complexity and minimize child data by design.
5. Reward balanced, resilient communities rather than accumulation or speed.

## Accessibility & Inclusion

The game must support keyboard, mouse, and touch; clear focus states; reduced motion; readable contrast; concise language; and interaction that does not depend on color alone. Avoid public ability labels or comparative scoring.
