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
Task-specific props follow the displayed hands. These are stationary task poses,
not NPC navigation, autonomous work planning or player-driven transactions.

## Integration and lifecycle

`house-interior-world.ts` and `venue-world.ts` own their cast and merge its
obstacles into existing walking bounds. The central circulation route and
apartment maintenance access stay usable. House `setInstalled` links TV power,
the watchers' power-related line and cooking steam to the existing `light`
upgrade; the other repair effects remain intact.

`building-traversal.ts` retains one visited interior world on the existing engine
and canvas. Existing door walking, floor selection and street return remain in
place. `ImmersiveTownMap.tsx` renders the visited interior instead of the street
while inside and exposes nearby activity through the existing conversation
preference. Exit/floor replacement disposes the previous interior; scene disposal
releases its resources and removes the life render observer.

Nearby lines select the closest person within 4.8 world units and rotate every
seven seconds of the local activity clock. Home selection is also room-filtered.
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
seconds and does not advance while blocked or in reduced-motion mode.
Reduced motion holds poses, television animation, steam motion and line cycling;
power changes can still refresh the screen. Disposed scenes ignore updates.

## Verification and limits

`interior-life.test.ts` covers floor cast bounds, appropriate task props,
representative dressing budgets, home power/repair behavior, room-filtered nearby
lines, frozen/reduced/disposed updates and apartment repair-desk access.
Real-model tests cover nine equipment-contact scenarios over 100-frame cycles
and seated poses across all six human appearances.

Final verification: all 726 tests across 92 files passed with two test workers,
alongside TypeScript, scoped ESLint and the production build. Family, kitchen,
bank and office scenes were visually checked at 1280px; the family scene and
exploration controls were also checked at 390px. Independent review closed all
three material fixes. Earlier runs hit preview-related timing contention and
an intermittent recovery-code assertion; the isolated and final full reruns
passed without changing that unrelated test. These checks are not an FPS or
every-device performance guarantee. Existing storage-import/lint-config build
warnings remain; disposable cache was freed after a low-disk cache-write warning.

The feature supplies populated, furnished game interiors with scripted ambient
people. It does not deliver an expanded financial simulation, persistent indoor
agents, bespoke identities for every building or a photorealism guarantee.
