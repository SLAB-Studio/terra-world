# Rivergate resident routines

Implementation record, 2026-08-30. This is a bounded behavior extension of the
existing adult, muted 3D city. It retains the buildings, 28 playable homes,
18 public destinations, 32 ambient residents, existing walking/repair controls,
and optional 0G backend. It does not replace the visual world.

## What changes

Residents now choose local destinations and travel on a shared pedestrian
network instead of repeating short authored walking loops. The current world
registers 46 reachable entrance destinations, plus three social resting places.
Stable resident IDs seed deterministic choices; staggered starts, errands,
visits, pauses and occasional rides produce different activity over time. Night
increases the preference for returning home; it is not a real-time calendar or
an independently simulated daily occupation schedule. Routine state is local to
the scene, not persisted across reloads.

The network respects building/tree obstacles, river boundaries, marked crossings
and the narrow pedestrian strips inside bridge rails. Paths are built and cached
on one shared graph, with at most one resident's new trip planned per simulation
step. There is no per-resident, per-frame graph rebuild. Movement uses bounded
steps, acceleration/deceleration, heading changes and local pedestrian avoidance.

### Crossings and bridges

Residents request traffic stops at the existing marked crossings and wait for
the vehicle envelopes to clear before entering. Narrow route sections are
reserved together so opposing trips do not each hold half of a bridge route.
When people meet on a bridge edge, one can back out to a walkable bank turnout,
let the other pass, then resume. Priority is deterministic, with clearance
checks; the yielding person is not allowed to sidestep into the river or a live
vehicle lane. This is lightweight local coordination, not a full crowd-physics
or city traffic engine.

### Building visits

A resident approaches the registered entrance, pauses while its door opens,
walks to the doorway threshold and hands off to an abstract indoor dwell. The
outdoor actor is hidden while inside, then returns through the same threshold
and resumes outdoor travel. Open-air destinations use an outdoor pause instead.

This is a local NPC visit, not a persistent physical NPC in the player's separate
home/venue interior scene. Door recesses and hinges mark the handoff; they do not
turn the exterior shell into a seamless walk-through interior. Existing player
entry, room tours, floor selection and repair callbacks are unchanged.

### Vehicle rides

Selected cars and buses can be reserved for a single resident's ride. The sequence
is walk to the curb → wait for the vehicle to stop → open door → board → seated
hold → ride → stop/open door → alight → departing hold → release vehicle.

Boarding and alighting require the reserved vehicle at its service point and
effectively stopped. The initial 0.7-second pause allows the door to open. After
boarding, the seated state holds the pickup stop another 0.7 seconds for closing;
after alighting, the departing state holds the drop-off another 0.7 seconds.
The authored vehicle hinge closes over 0.65 seconds. The vehicle does not depart
with the passenger still crossing its doorway. Active doorway detail is retained
during boarding/alighting instead of swapping models underneath the passenger.

Seated and riding residents are hidden outdoor actors, with their logical
position following the reserved vehicle during the ride; a visible seated cabin
model is not implemented. Approach/wait timeouts release abandoned reservations.
Fallback vehicles remain usable if assets fail, but an authored moving door is
available only on a model that provides the supported hinge.

## Animation correction

The resident asset converter previously derived child-bone transforms from stale
evaluated parent transforms while assigning a whole pose hierarchy. That could
produce large hand/finger rotations even when the source animation was sound.
It now computes desired matrices parent-before-child and derives every local
bone transform against the same frame's parent, preserving the target person's
proportions. The shipped resident assets were regenerated with that correction.

Loop endpoints are reconciled: the cropped talk take eases back to its opening
pose, while authored walk/breath cycles retain their motion with final drift
corrected. Runtime walking phase follows distance travelled. Idle/walk selection
uses speed hysteresis (start above 0.12, remain walking above 0.06) and pose changes
ease over 0.36 seconds. Talking is a restrained upper-body layer over idle, keeping
hips and feet in the idle pose. Detail changes retain the active pose/transition.

Authored conversations remain optional local atmosphere. A pair can speak only
when both members are visible, idle and within 3.5 scene units; residents do not
keep conversing across the city while travelling. Their existing reading clock,
day/night text, conversation setting and transcript remain in place.

## Runtime boundaries

- Reduced motion freezes routine progression at the current state and uses the
  resident idle pose without blending. The separate dialogue clock can continue
  for eligible nearby idle pairs. It does not force residents out of buildings
  or vehicles to populate the street.
- Gameplay pause stops routine, traffic and dialogue advancement. Existing
  overlays/visits retain their outdoor pause and camera restoration behavior.
- Navigation, choices, visits, traffic coordination and animation run locally.
  There are no new per-frame 0G calls, AI inference requests, wallet operations,
  uploads or new network persistence. Existing optional backend behavior is
  untouched; asset loading still requires available or cached files.
- Shared path caching, bounded planning and distance-based asset/pose detail are
  workload controls, not measured FPS or an ordinary-PC/integrated-GPU guarantee.
  This is not a GTA-scale open-world simulation or full physical interaction.

## Source map

| Responsibility | Source under `apps/web/lib/immersive-town/` |
| --- | --- |
| Shared pedestrian graph and clearance | `resident-navigation.ts` |
| Choices, visits, priorities and ride state machine | `resident-life.ts` |
| Existing entrances, actor placement and door portals | `resident-routines-3d.ts` |
| Traffic stops and actual vehicle doors | `traffic.ts`, `vehicles-3d.ts`, `vehicle-doors.ts` |
| Clip choice, blending and model lifecycle | `resident-models.ts`, `realistic-residents.ts` |
| Scene lifecycle, pause and dialogue integration | `create-town-world.ts`, `animation.ts`, `conversations-3d.ts` |

Offline retargeting and loop closure live in `scripts/convert-residents.py`.
Asset provenance and licenses remain in the resident and city asset READMEs.

## Verification record and limits

A fresh independent review returned **SHIP within the scoped code/simulation
review**, with 19/19 targeted checks passing. A separate ten-minute simulation of
the actual world retained reachable approaches for all 28 homes and 18 venues.
All 32 residents completed trips: 217 total, with 171 entered, 164 exited,
15 boarded and 14 alighted events. These are event totals at the observation
cutoff; some visits/rides were still in progress. Traffic covered 6,285 metres in
the final simulated minute, showing continued traffic progress—not renderer FPS.

Final repository verification passed 692 tests across 90 files, `pnpm typecheck`,
`pnpm lint` and the production build. The existing dynamic 0G storage-SDK import
and Next.js ESLint-plugin warnings remain. Both material findings from the fresh
review were resolved; its SHIP disposition is limited to code/simulation.

Actual browser game capture was blocked by policy. The available visual evidence
is an older user recording and newer offline previews of the actual assets, not
a new live-game capture. This record does not grant live visual, device or FPS
approval. Earlier verification records in related documents retain their original
scope; their test counts are not this extension's final full-suite result.

Run targeted checks from the project root:

```sh
pnpm exec vitest run apps/web/lib/immersive-town/resident-navigation.test.ts apps/web/lib/immersive-town/resident-life.test.ts apps/web/lib/immersive-town/resident-routines-3d.test.ts apps/web/lib/immersive-town/resident-models.test.ts apps/web/lib/immersive-town/realistic-residents.test.ts apps/web/lib/immersive-town/vehicles-3d.test.ts
```

## Manual acceptance checklist

- [ ] In both Day and Night, inspect aerial and first-person views. Follow several
  residents through start/stop/turn, multiple walk loops and an idle/chat change;
  check hands, feet, grounding, facing and close/far model changes.
- [ ] Follow residents to a home, an enclosed public venue and an open-air place.
  Confirm entrance approach, opening, threshold handoff, dwell and same-door
  return; do not expect the resident in the separate player interior scene.
- [ ] Watch both marked crossings and opposing bridge trips long enough to see
  waiting, traffic clearance, bank yielding and resumed travel without crowding
  into rails, water or active lanes.
- [ ] Observe a car and a bus pickup/drop-off from first person. Confirm the
  vehicle stops before opening, the resident boards/alights through its door,
  and both 0.7-second closing holds finish before departure.
- [ ] Pause/resume during walking and a vehicle stop; open/close Places and a
  building visit. Confirm no hidden time jump, stuck reservation or street-camera
  reset, and check the existing home repairs/save progress still work.
- [ ] Toggle reduced motion while walking, waiting and riding. Confirm routines
  hold, imported poses settle without blending, and eligible idle conversation
  lines still advance; resume and check continued trips without a teleport.
- [ ] On a representative ordinary PC, record CPU/GPU, browser, resolution and
  quality setting. Measure frame times/FPS in populated aerial and first-person
  scenes, day/night and after several minutes, using Balanced and Performance.
  Check input response, asset swaps and memory stability; report measured results
  before claiming device support or smoothness.

Related records: [resident assets](realistic-residents.md),
[walking and building entry](walking-mode.md),
[city assets/conversations](city-assets-and-conversations.md), and
[metropolitan city](metropolitan-city.md).
