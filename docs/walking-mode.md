# Walking around Rivergate

Walking is a local extension of the existing town, not a separate world or a redesign.
Outdoor walking uses a second camera in the populated Babylon 3D toy-city scene; entering a home opens its existing interior scene, where you can walk between rooms. Public destinations open their own furnished venue scenes. Walking views are first-person, with no visible player avatar. Night is the default; the existing **Day** toggle remains available.

## Using it

- Select **Walk around** once the 3D town has loaded. Select **Town view** to return to the aerial camera.
- With focus inside the town, use **W / S** or **↑ / ↓** to move forward/back, **A / D** to step sideways, and **← / →** to turn.
- Drag the view with a mouse or finger to look around; pointer lock is not required.
- Hold the **Forward**, **Back**, **Turn left**, or **Turn right** buttons to move continuously. A brief tap or keyboard activation makes a small movement.
- Walk near a home's front door. Its name and **Enter home** appear; choose the button or press **E** to open its existing room tour. A nearby home can also be selected directly in the scene.
- Use the tour's close control or **Back to the neighborhood** to return outside. Movement pauses while the home or another modal is open.

## Visiting public places

- In Town view, click a public destination's visible building, roof, or windows. **Places** also opens a keyboard- and touch-accessible directory of destinations and ordinary homes.
- While walking, approach a registered street entrance and choose **Enter building** or press **E**. Street entry selects the nearest eligible home or venue; clicking a distant building does not bypass walking proximity. The Places directory remains an explicit direct-navigation option.
- Inside, use the same keyboard, drag-to-look, and touch movement controls. Near the exit, **E** or **Go outside** returns to town. **Back to town** is always available, and Escape closes the visit.
- In multi-floor buildings, **Lift to a floor** selects any listed floor, including the roof. Approaching the lift and pressing **E**, or choosing **Choose a floor**, focuses that selector. This is floor selection, not an animated lift journey or stair traversal.
- In either apartment building, **Help these neighbours** opens its existing home-repair dialog. Ordinary homes retain their existing room tours and repair actions.

The catalog contains 18 destinations and 75 listed floors/areas: eight downtown towers, school, clinic, two apartment buildings, market, playground, three bus stops, and dock. The two apartments remain part of the existing 28-home data; the other 26 ordinary homes are still available. These counts are not 75 bespoke environments: upper floors of the same kind reuse a furnished layout with small visual variations and honest shared-use labels.

Enclosed venues have full-height walls and ceilings, with fixtures appropriate to their purpose: reading shelves, laboratory benches, recording desks, offices, gallery displays, cafe tables, workshop benches, classrooms, clinic spaces, and furnished apartments. Roof terraces, market, playground, bus shelters, and dock remain open-air places. Geometry and furnishings are procedural, stylized assets—not photorealistic scanned interiors. Preserve that existing toy-city identity when extending the catalog; do not substitute the unrelated legacy console design system.

### Venue architecture and guardrails

- `venue-catalog.ts` owns destination IDs, floor labels, purposes, and descriptions without importing Babylon. `venues.ts` maps the existing exterior geometry—including detached merged window batches—to those destinations and transforms their street-door positions.
- `town-walker.ts` combines home and venue doors into one proximity choice, preventing apartment entrances from competing with their legacy home entry. `ImmersiveTownMap.tsx` owns map picking, the Places directory, visit state, and preserved outdoor camera state.
- `venue-world.ts` creates only the selected floor, reusing the indoor walker and bounded collision navigation. `BuildingVisit3D.tsx` disposes the floor scene and engine when changing floors or closing. Floor changes start at the new floor's entrance rather than preserving an indoor pose.
- The outdoor town remains mounted, with rendering and movement paused during a venue visit or directory view. Returning restores its street/aerial pose. Loading and failure states offer a route back; failed venue graphics offer **Try again**, not a claim that the 3D visit succeeded.
- Keep existing homes, repairs, progression, and 0G behavior unchanged. Venue rendering, movement, and proximity checks are local; visiting adds no live 0G operation. Existing guide/checkpoint integrations retain their existing boundaries and availability.

## Walking inside a home

- Choose Living, Kitchen, Garden, or Utility from the house overview to enter at eye level. The indoor `UniversalCamera` stays at a fixed height of 2.25 scene units, with no head bob or automatic camera flight.
- Use **W / S** or **↑ / ↓** to move, **A / D** to strafe, and **← / →** to turn. Drag to look; hold the on-screen movement buttons for continuous movement, or tap/activate them for a short step or turn. Pointer lock is not required.
- Walk through the four physically open internal doorways. Crossing a doorway updates the room name and diagnosis without resetting the camera. The optional room picker explicitly moves you to the chosen room's starting position.
- Approach the lamp, tap, planters, or recycling corner. Press **E** or choose the nearby **Help the…** button to apply that room's existing upgrade. Repairs update the scene and diagnosis without moving you; repaired objects show their healthy message instead of offering another repair.
- Select **See all rooms** to leave walking and return to the cutaway overview. If 3D graphics cannot start, room selection and the existing room-repair controls remain available.

Indoor movement uses room boundaries and horizontal collision bounds for walls and major furniture, with short movement steps and edge sliding. Overhead lintels do not block doorways. Permanent, visible sorting stands reserve the recycling bins' space before repair, so installing bins cannot enclose the walker. This is lightweight navigation, not full physics or collision coverage for every decorative object.

The indoor controls retain the existing home visual language. On phones, help, the overview exit, movement buttons, and the nearby repair prompt occupy separate areas of the view. Keyboard movement is scoped to the interior; blur, hidden pages/dialogs, lost focus, and cancelled presses clear held input. Looking with another finger does not release a held movement button. Reduced-motion removes control transitions; walking remains directly user-controlled without forced animation.

## Position and progress

The first walk starts outside a reachable home. Returning from a tour, or switching between walking and Town view, keeps the street position while that town scene remains mounted. The aerial camera also retains its pose.

Street position is temporary: it is not saved across page reloads or scene recreation. Walking does not reset existing upgrades or progress. Starting a walk clears a currently armed or dragged upgrade selection, not an installed upgrade.

Indoor position survives repairs and continuous doorway crossings while the interior remains mounted. Choosing a different room, or entering a room again from the overview, uses that room's starting position. Indoor position is not saved across reloads or reopening the home; installed upgrades continue through the existing progress system.

## Movement boundaries

House bodies, the school/clinic buildings, and tree trunks block movement using horizontal bounding boxes. Movement slides along blocked edges; town limits and the river constrain the walking area, with crossings allowed on the rendered road bridges. Camera height follows roads and selected raised ground.

This is lightweight navigation, not full physics: it does not add jumping, gravity, vehicle collisions, or collision coverage for every decorative object. Entry is a proximity interaction at registered front doors, not physical traversal through an exterior doorway.

## Small screens and input safety

On narrow screens, walking hides the toy box and nonessential neighborhood panels to give the view more room. Touch movement and drag-to-look work together. Releasing a looking finger does not stop a different finger still holding a movement button.

Short narrow screens hide the help text and place home entry beside movement controls. Returning to Town view restores the normal neighborhood controls. Keyboard input is scoped to the town; loss of focus, hidden pages, blocked overlays, and cancelled movement presses clear held input.

## Local behavior

The later [resident-routine extension](resident-routines.md) replaces the five authored walking loops with a shared pedestrian network for 32 residents and 46 entrance destinations. Local deterministic trips include visits, curbside rides, crossing priority and bridge-bank yielding. Facing and footstep timing follow travel; reduced motion holds routine progression. Building visits hand off at exterior thresholds rather than populating the separate player interior scenes with persistent NPCs.

This remains lightweight local navigation, not full crowd/traffic physics. The resident-routine record describes current tests, animation corrections and outstanding live visual/performance acceptance. Earlier `pedestrian-motion.test.ts` coverage remains a historical check of the underlying character motion helpers.

Outdoor and indoor walking, collision checks, camera switching, and proximity checks run locally after the relevant assets load. The feature adds no 0G calls, wallet actions, uploads, or network persistence. Indoor repairs use the existing upgrade callbacks and data pipeline; walking does not change that behavior or make a cold offline page load available.

## Verification

- `apps/web/lib/immersive-town/walking.test.ts`: view-relative and diagonal movement, elapsed-time limits, wall clearance/sliding, river and bridge boundaries, and nearby-door entry.
- `apps/web/lib/immersive-town/town-walker.test.ts`: camera/position preservation, blocked movement and entry, safe approaches for all 28 homes, multi-pointer movement, and blur cleanup.
- `apps/web/lib/immersive-town/interior-navigation.test.ts`: movement normalization, long-frame limits, non-finite input, furniture sliding, boundaries, and same-room repair proximity.
- `apps/web/lib/immersive-town/interior-walker.test.ts`: eye-level camera and position preservation, overview enclosure switching, four-room connectivity and reachable repairs before/after upgrades, reserved bin space, and input cleanup/multi-pointer safety.
- Earlier home-interior implementation verification: 582 tests across 74 files, typecheck, lint, and the production build passed. The build retained existing 0G dynamic-import and ESLint-plugin warnings. Browser checks at desktop 1066×987 and phone 390×844 covered indoor controls; desktop traversal continuously crossed from Living to Garden, and approaching/repairing the lamp changed both scene and diagnosis.
- Prior outdoor browser checks covered desktop and 390×844, 390×568, and 740×390 viewports, including entering a home and returning outside.
- Manual regression checks: switch views repeatedly; move/turn/drag; approach a door and enter; return to the same street position; hold Forward while dragging with another finger; release each finger independently; open/close a modal; verify river and building boundaries and unchanged upgrades.
- Indoor regression checks: cross every internal doorway; approach all four repair targets; repair without a camera jump; move away from newly installed bins; choose another room explicitly; return to overview; verify room-repair controls with graphics unavailable.
- `apps/web/lib/immersive-town/venues.test.ts`: night default, all 18 destination registrations and pickable surfaces, catalog floors matching tower heights, reachable street approaches, nearest-only entry, and blocked entry.
- `apps/web/lib/immersive-town/venue-world.test.ts`: all advertised floors build with safe spawn and entrance-to-lift clearance, bounded movement, place-specific furnishings, honest repeated-floor descriptions, exit/lift proximity, and scene disposal.
- Final venue verification: all 588 tests across 76 files, typecheck, lint, and the production build passed after the review corrections. The build retained the pre-existing 0G dynamic-import and Next ESLint-plugin warnings. Desktop 1066×987 and phone 390×844 checks covered the new UI; live checks confirmed Continue Game defaults to night, direct tower selection opens its interior, the lift changes floors, and Day/Night controls remain available.
- Venue manual checks: click facades, roofs, and windows in Town view; open the Places directory with keyboard and touch; approach every venue street entry; switch ground/upper/roof floors; use the nearby exit and lift actions; return to the same street pose; open apartment repairs; confirm ordinary-home repairs still work; toggle Day/Night; check small-screen controls, focus return, and loading/retry/back behavior.

The bounded home-interior review and the subsequent desktop/mobile venue review each resolved their three findings. The venue review disposition was ready to ship within that inspected scope. This note does not claim every destination was manually traversed on every device, broader device coverage, or full-physics behavior.
