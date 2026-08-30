# Lived-in interiors

## Scope and scenes

Interiors add locally authored everyday activity to the existing city without
changing its density: 28 homes, 18 public venues and 75 advertised venue floors
remain available. Casts are instantiated for the visited interior, not simulated
across every building at once.

- Each home uses four people: two children watching television, an adult cooking
  and an adult tending plants. Homes reuse the existing three house templates.
- The City Hub ground floor has six people: a teller and depositor, a service
  adviser and bill payer, a waiting customer and an ATM user.
- Office floors have four seated desk workers and two people discussing work.
- Apartment living floors, reception, reading rooms, cafes/markets, clinics,
  classrooms, laboratories/workshops, studios, galleries, roofs/playgrounds,
  bus stops and the dock have use-specific casts of three to six people per floor.

Venue casts and furnishings are reusable floor-use templates, not individually
authored households or persistent employees. Non-apartment/non-hub lobby floors
use their venue's activity type; apartment reception remains a lobby.

## Implementation boundaries

- `interior-life-plan.ts`: serializable roles, positions, seating heights,
  activities, held props, world-space hand targets and authored ambient lines.
- `interior-life.ts`: the visited cast, prop attachment, nearby activity selection,
  update clock, power state and additional walking obstacles.
- `interior-routine-plans.ts`: place-specific destinations beside the actual
  fixtures: screen breaks, filing shelves, service queues, kitchen counters,
  bookshelves, planters and other useful stops.
- `indoor-routines.ts`: local task → stand/leave → walk → visit → return →
  settle schedules, furniture routing and moving-person avoidance.
- `interior-resident-poses.ts`: seated posture and equipment-contact poses layered
  over the existing resident animation pipeline.
- `interior-dressing.ts`: use-specific appliances, screens, desk items, receipts,
  table settings and other furnishings, plus television/steam presentation.
- `realistic-residents.ts`: imported joint lookup and pose application before
  synchronizing the displayed skeleton. All modules above are in
  `apps/web/lib/immersive-town/`.

The existing six locally hosted, rigged human appearances are reused, with their
near/far variants and primitive loading fallback. No new human assets or licenses
are introduced. Microsoft Rocketbox provenance and the MIT license remain in
`apps/web/public/models/residents/README.md` and `LICENSE-Microsoft.txt`.

Imported node names are normalized to the canonical `Bip01` prefix, including
`Bip02` rigs. Joint aiming uses the actual parent hierarchy rather than assumed
bone axes. Seated hips are aligned to authored seat heights; thighs, calves and
feet receive a seated pose. Explicit left/right world-space targets use two-bone
arm inverse kinematics for cooking, typing, payments, eating and bench work.
Task-specific props follow the displayed hands while at the task, then fade out
as a resident leaves. Task arms and seated legs blend back into the existing
walking animation; they do not stay fixed to a countertop while walking away.
Gait distance accounts for the actual indoor adult/child height.

## Purposeful indoor routines

Residents start at their everyday activities, then depart on staggered schedules
(first departure after 6–14 active simulation seconds). They choose authored
destinations, pause there, return and resume their original work or seated pose.
Later task periods last 10–24 active seconds; stops have short, finite dwells.
All residents have movement, not just a single showcase character per room.

Children take TV breaks; cooks check another kitchen station; gardeners inspect
planters; office staff visit filing areas; readers browse shelves; bank visitors
check receipts and service points. These are repeatable local routines, not
autonomous work planning or player-driven financial transactions. Ambient chat
uses the existing animation and authored captions, not generated voice dialogue.

Navigation uses indoor furniture/wall bounds, cached visibility graphs, swept
segments and bounded replanning when a moving person blocks a route. People turn
toward travel, accelerate into a walk, stop their gait when waiting and smoothly
stand/sit over 0.9 seconds. Only a short anchor-to-egress connection can ignore a
single containing chair/sofa box; other furniture and walls remain solid. Sofa
cushions inside the existing sofa body are not duplicate walking obstacles.
Home routines remain in their appropriate rooms; venue routines stay on the
visited floor. They do not teleport through doors or switch floors.

## Integration and lifecycle

`house-interior-world.ts` and `venue-world.ts` own their cast and merge its
live obstacles into existing walking bounds. NPC colliders follow their current
positions, not the empty chair they left. The central circulation route and
apartment maintenance access stay usable. House `setInstalled` links TV power,
the watchers' power-related line and cooking steam to the existing `light`
upgrade; the other repair effects remain intact.

`building-traversal.ts` retains one visited interior world on the existing engine
and canvas. Existing door walking, floor selection and street return remain in
place. `ImmersiveTownMap.tsx` renders the visited interior instead of the street
while inside and exposes nearby activity through the existing conversation
preference. Exit/floor replacement disposes the previous interior; scene disposal
releases its resources and removes the life render observer.

Nearby lines select the closest person at their current position within 4.8
world units and rotate every seven seconds of the local activity clock while at
their task. While away, the caption reports their current action without
duplicating it as quoted speech. Home selection is also room-filtered.
These lines are local scripted ambience, not live AI replies, persistent resident
memory or evidence of actual deposits, payments or banking services. Existing
0G integration and its privacy boundaries are untouched; this feature adds no
inference calls, storage uploads or chain writes.

## Rendering and motion budget

Static dressing is merged by a ten-material palette and is non-pickable. Tests
bound representative dressing scenes to ten static batches and fourteen child
meshes; this is not a total interior draw-call or frame-rate guarantee.
Resident poses retain distance-based limits of 30, 12 or 6 updates per second,
with existing near/far asset selection. TV texture redraws are at least 0.18
seconds apart during animation. The activity clock caps each delta at 0.05
seconds and does not advance while blocked, hidden or in reduced-motion mode.
Reduced motion holds routes, poses, television animation, steam and line cycling;
power changes can still refresh the screen. Disposed scenes ignore updates.

## Verification and limits

`interior-life.test.ts` covers floor cast bounds, appropriate task props,
representative dressing budgets, home power/repair behavior, room-filtered nearby
lines, frozen/reduced/disposed updates and apartment repair-desk access.
Real-model tests cover nine equipment-contact scenarios over 100-frame cycles
and seated poses across all six human appearances. Additional real-model tests
check continuous stand/walk/sit transitions and release of the seated gait
override for all six appearances.

`indoor-routines.test.ts` checks route phases, furniture and thin-wall sweeps,
chair egress, facing direction, dynamic obstacles, player avoidance, staggered
timing and finite/pause behavior. `interior-routines-world.test.ts` runs 150
simulated seconds in every one of the 75 venue floors and three house templates.
Each resident must move at least one metre, visit a destination and return;
scene transforms, live colliders and protected entry/lift points are checked
throughout. These offline tests do not claim a measured frame rate on all PCs.

Final indoor-routines verification passed all 829 tests across 94 files with two
workers, TypeScript, scoped ESLint and the production build. Family and bank
routines were inspected in the running game, including bank controls at 390px.
Independent review caught and fixed a diagonal NPC/player collision mismatch;
regressions now check that someone walking past cannot enclose a stationary
player in an impassable collider, including when reduced motion is enabled.
The visual pass also removed duplicated action/quotation captions. Existing
storage-import/lint-config build warnings remain. These checks are not an FPS
or every-device performance guarantee.

The feature supplies populated, furnished game interiors with scripted ambient
people. It does not deliver an expanded financial simulation, persistent indoor
agents, bespoke identities for every building or a photorealism guarantee.
