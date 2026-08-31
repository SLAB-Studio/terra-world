# Opening chapter: The other side of Rivergate

The opening chapter is a self-contained, authored East Bridge investigation in
the existing populated 3D city. It adds physical evidence locations, resident
dialogue, three supported responses and recorded consequences. It does not
implement the full living-city roadmap, persistent household economics,
unlimited stories or real-money decisions.

## Start and explore

Start or continue a city game, then select **Begin opening chapter**. An existing
chapter save offers **Continue opening chapter**, or **View completed chapter**
after completion. **Explore freely** dismisses the entry; **Opening chapter**
reopens it while outdoors.

Four in-engine camera shots introduce the river, Maya's bakery, East Bridge and
the player's arrival with LEO. Advance each caption manually or choose **Skip
introduction**. The notebook retains the opening transcript. These are camera
views of the live city, not rendered movie files; reduced motion holds the shots
without their camera drift.

**Walk with Leo** uses a third-person camera, a realistic human player character
and LEO, the female dog companion. Use W/S or Up/Down to move, A/D to step
sideways, Left/Right to turn, and drag to look. Hold Shift while moving or toggle
the on-screen **Run** control. Touch movement controls remain available. Building
entry and exit retain their existing proximity controls; pointer lock is not
required.

Inspect the bridge first, then speak with Maya, Malik and Nia at their locations.
The chapter needs all four evidence records before offering a decision. Walking
there is supported; notebook **Travel** buttons are optional explicit
repositioning actions, not automatic walking or evidence collection. After
arrival, choose **Inspect the bridge** or **Speak with…**. Evidence acceptance is
checked against proximity in the world.

The bridge closure affects the scene: barriers and a walking obstruction block
the unsafe crossing, road traffic turns toward the existing south crossing, and
residents have safe detour crossings. This is bounded local navigation, not a
full traffic or engineering simulation. Resident statements distinguish
observations, briefings and attributed opinions; Nia's caution about the bank is
not presented as a measured water-quality improvement.

## Decide and inspect the result

The chapter starts with 1,500,000 fictional civic credits. Select a response in
the notebook to review its compromise, then use its separate **Commit** button.

| Response                  | Upfront cost | Explicit chapter-time advance | Result and remaining budget                                                                                                                     |
| ------------------------- | ------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Repair East Bridge        | 1,200,000    | 14 days                       | Reopens after the authored repair/safety-check interval; 300,000 remain.                                                                        |
| Fund essential deliveries | 180,000      | 2 days                        | Assigns the existing service vehicle via the south crossing; 1,320,000 remain. The bridge stays closed; this is not full passenger replacement. |
| Formalise the diversion   | 45,000       | 1 day                         | A signed route plan takes effect; 1,455,000 remain. The bridge stays closed, the longer trip remains, and no delivery service is funded.        |

The cost is deducted when committed. Return to the bridge and choose **Advance
chapter time & inspect** to apply the stated interval and observe the result.
Walking, waiting, closing the tab or being away does not advance chapter days.
These intervals are fictional scenario rules, not real construction forecasts.
There are no money transfers, purchases or token charges in chapter decisions.

Authored resident reactions and the notebook record the selected outcome and
its unresolved limits. Closing the chapter records completion; returning to free
exploration leaves that journal available but restores the legacy exploration
world. Chapter closure, service and budget effects are not silently applied to
the older repair game.

## Saves, reading and narration

Chapter state uses version 1 of `rivergate-east-bridge-v1`, saved under
`terra-world:opening-chapter:east-bridge:v1`. It is independent of legacy repair
and campaign saves: no migration, replacement or clearing of those keys occurs.
Loaded state is validated against deterministic action replay. If browser storage
is unavailable, the UI warns that progress is retained only in the open tab.
Clearing browser storage can remove the chapter record.

Dialogue and the notebook pause player movement while reading. Keyboard focus
moves into reading controls, the notebook contains its tab sequence, and closing
or travelling returns focus to the appropriate control/world. **Escape** closes
the notebook or evidence conversation and skips outcome reactions to the result;
the introduction has its explicit **Skip introduction** button.

Captions stay visible regardless of narration. **Voice off** is the default.
Enabling voice uses only installed English browser `speechSynthesis` voices
reported as local services; cloud voices are excluded. This is generic device
narration, not actor recordings, and availability and quality vary by device.
There is no microphone access or remote voice service. Missing or failed voices
leave the text playable. Advancing, closing, pausing or hiding the page cancels
active narration.

## Optional 0G briefings

The notebook offers explicit requests for LEO's next-step or trade-off briefing
through `POST /api/chapter/guide`. A disclosure appears before these controls.
The request contains only the fixed scenario ID, intent and fictional action
log—not the player's name, typed conversation, microphone data or wallet details.
The server validates and replays that log, then derives the permitted facts.

0G selects one or two allowed sentence IDs with the required sentence first.
Validated IDs resolve to authored sentences; arbitrary model-written prose is
not accepted. The model cannot change costs, evidence, decisions or outcomes.
This is facts-only briefing selection, not free-form resident chat.

- Maximum request body: 4,096 bytes; maximum action log: 16 events.
- Provider output cap: 160 tokens; raw output validation cap: 512 characters.
- Identical in-flight requests share one call. A bounded 128-entry cache lasts
  up to five minutes and distinguishes cached 0G output from authored fallback.
- The provider request has a maximum six-second timeout with no retries; the
  handler's provider wait is bounded to seven seconds. The client stops waiting
  after eight seconds and offers **Stop waiting**. Stopping the client does not
  guarantee cancellation of a provider request already sent.
- Shared process-local windows permit at most 10 uncached provider attempts per
  minute and 80 per ten minutes. They are not authenticated per-user quotas,
  distributed spending caps or production billing protection.

Unavailable, invalid or limited service falls back to labelled authored guidance.
The live route uses the existing server-side 0G configuration and private Compute
adapter; device narration is separate. No live paid 0G inference test was
performed for this chapter. Deterministic provider tests do not prove network
connectivity or a paid inference receipt.

`createChapterCheckpointPayload` provides a validated, versioned plaintext local
checkpoint envelope. Creating it is not encryption, a storage upload or a receipt.
There is no automatic chapter Storage upload, NFT mint or chain broadcast. The
existing 0G integration foundations remain unchanged; their production
limitations still apply.

## Local visual and interaction conventions

This feature follows the existing `rivergate-grounded-c5a7af33` direction in
`app/layout.tsx` and the extension comment in `OpeningChapter.tsx`. The live city
remains the main scene; an objective strip, nearby action and on-request notebook
provide the story interface. Unrelated exploration controls recede during the
chapter and focused reading rather than competing with captions.

The local stylesheet uses dark slate panels (`#1a2931`), raised controls
(`#253943`), light text (`#eef2ed`), muted text (`#b8c8cd`) and amber actions/focus
(`#e4bb7b`). Headings retain Barlow City; body text inherits the game's body font.
Buttons have at least 44-pixel height and a visible amber focus outline. Selected
responses use both pressed state and a distinct border, followed by an explicit
commit action. Small screens expand the notebook inside the available viewport;
its contents and long captions scroll. Reduced motion removes notebook arrival
animation and button transitions.

These are observed conventions for this extension, not a replacement global
design system. Root design documents are outside this documentation change.

## Implementation and verification

All implementation paths below are relative to `apps/web`:

- `components/game/OpeningChapter.tsx`, `OpeningChapter.module.css` and
  `OpeningChapterWorld.css`: entry, captions, notebook and focused story layout.
- `components/game/ImmersiveTownMap.tsx`: chapter lifecycle, proximity, travel,
  focus and world integration.
- `lib/opening-chapter/*`: deterministic story, save validation, device voice,
  focus restoration and optional briefing client.
- `lib/immersive-town/opening-chapter-world.ts` and `bridge-closure.ts`: camera
  shots, evidence locations, barriers, navigation and visible outcome state.
- `app/api/chapter/guide/*`: bounded facts-only 0G route and tests.

Implementation verification passed 968 tests across 112 files, `pnpm lint` and
the production build. The manual repair path reached its outcome; separate-save
resume, introduction skip, Escape, travel and focus behavior were checked.
Visual review covered widths of 1280, 715 and 390 pixels. This evidence does not
claim every branch was manually played on every device, measured FPS, universal
hardware performance or live 0G transactions.
