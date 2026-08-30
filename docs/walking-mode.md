# Walking around Rivergate

Walking is a local extension of the existing town, not a separate world or a redesign.
Outdoor walking uses a second camera in the populated Babylon 3D toy-city scene. Entering a home or public destination opens its hinged exterior door, approaches the doorway, then hands off to a walkable home or furnished venue floor on the same canvas and engine. Walking views are first-person, with no visible player avatar. Night is the default; the existing **Day** toggle remains available.

## Using it

- Select **Walk around** once the 3D town has loaded. Select **Town view** to return to the aerial camera.
- With focus inside the town, use **W / S** or **↑ / ↓** to move forward/back, **A / D** to step sideways, and **← / →** to turn.
- Drag the view with a mouse or finger to look around; pointer lock is not required.
- Hold the **Forward**, **Back**, **Turn left**, or **Turn right** buttons to move continuously. A brief tap or keyboard activation makes a small movement.
- Walk near a home's front door. Its name and **Enter home** appear; choose the button or press **E** to open the door and walk inside. A nearby home can also be selected directly in the scene. Normal entry does not open a room-tour popup, cutaway overview, or room picker.
- Return to the front door and walk across its threshold, or press **E** / choose **Walk outside** nearby. The reverse doorway transition returns you to the original porch/street walking position, facing outward. The HUD identifies the front door when close enough; there is no always-available visit-close shortcut. Blocked overlays pause movement and transitions.

## Visiting public places

- In Town view, click a public destination's visible building, roof, or windows. **Places** also opens a keyboard- and touch-accessible directory of destinations and ordinary homes.
- While walking, approach a registered street entrance and choose **Enter building** or press **E**. Street entry selects the nearest eligible home or venue; clicking a distant building does not bypass walking proximity. The Places directory remains an explicit direct-navigation option.
- Inside, use the same keyboard, drag-to-look, and touch movement controls. Walk across the ground-floor front-door threshold, or use **E** / **Walk outside** near it, to return to street walking. The Places directory remains an optional navigation modal, not the normal entry experience.
- In multi-floor buildings, the **Lift** floor selector is enabled only near the lift at the back. Press **E** or choose **Use lift** there to focus it. Changing floors loads the selected floor and starts you at its lift; this is not an animated lift journey or stair traversal. Return to the ground floor to leave; an upper-floor exit prompt explains this requirement.
- In either apartment building, walk to the lobby reception desk for resident repairs. Its nearby repair action uses that apartment's existing profile and upgrade callback; repairing preserves the current floor, scene, and walking pose. A healthy service shows status without offering another repair. Ordinary homes retain their existing repairs as nearby indoor interactions.

The catalog contains 18 destinations and 75 listed floors/areas: eight downtown towers, school, clinic, two apartment buildings, market, playground, three bus stops, and dock. The two apartments remain part of the existing 28-home data; the other 26 ordinary homes are still available. These counts are not 75 bespoke environments: upper floors of the same kind reuse a furnished layout with small visual variations and honest shared-use labels.

Enclosed venues have full-height walls and ceilings, with fixtures appropriate to their purpose: reading shelves, laboratory benches, recording desks, offices, gallery displays, cafe tables, workshop benches, classrooms, clinic spaces, and furnished apartments. Roof terraces, market, playground, bus shelters, and dock remain open-air places. Geometry and furnishings are procedural, stylized assets—not photorealistic scanned interiors. Preserve that existing toy-city identity when extending the catalog; do not substitute the unrelated legacy console design system.

### Venue architecture and guardrails

- `venue-catalog.ts` owns destination IDs, floor labels, purposes, and descriptions without importing Babylon. `venues.ts` maps the existing exterior geometry—including detached merged window batches—to those destinations and transforms their street-door positions.
- `town-walker.ts` combines home and venue doors into one proximity choice, preventing apartment entrances from competing with their legacy home entry. `ImmersiveTownMap.tsx` owns map picking, the Places directory, visit state, and preserved outdoor camera state.
- `building-traversal.ts` coordinates the hinged door, camera approach, doorway handoff, indoor entry, and reverse exit. It shares the city's canvas and engine, retains the city scene, and keeps one visited home or venue-floor scene loaded. `venue-world.ts` creates the selected floor, reusing the indoor walker and bounded collision navigation. Changing floors disposes the previous floor scene, not the shared engine, and starts at the new floor's lift.
- The portal handoff occurs at the actual exterior door recess; the indoor arrival advances 1.5 scene units through the entrance. These are separate scene coordinate spaces, not a geometrically continuous world. The exterior population and graphics remain unchanged, including the restored neighborhood palette hash.
- The outdoor town stays allocated while its rendering and movement are paused inside. Leaving disposes the interior and restores street walking; the aerial camera's pose is retained for a later switch to Town view. Directory overlays block movement and transitions.
- Implemented error recovery returns a failed interior entry safely outside with a message to try the door again. A failed floor load retains the previous floor and reports that it is still available. These recovery paths are code-backed behavior, not claimed fault-injection or live-browser verification.
- Keep existing homes, repairs, progression, and 0G behavior unchanged. Venue rendering, movement, and proximity checks are local; visiting adds no live 0G operation. Existing guide/checkpoint integrations retain their existing boundaries and availability.

## Walking inside a home

- Enter through the exterior front door at eye level, then walk between Living, Kitchen, Garden, and Utility. The indoor `UniversalCamera` stays at a fixed height of 2.25 scene units, with no head bob. The doorway transition briefly guides the camera; subsequent walking is user-controlled.
- Use **W / S** or **↑ / ↓** to move, **A / D** to strafe, and **← / →** to turn. Drag to look; hold the on-screen movement buttons for continuous movement, or tap/activate them for a short step or turn. Pointer lock is not required.
- Walk through the four physically open internal doorways. Crossing a doorway updates the room name and diagnosis without resetting the camera. Normal doorway entry has no room picker or cutaway overview.
- Approach the lamp, tap, planters, or recycling corner. Press **E** or choose **Restore power**, **Repair water supply**, **Restore garden**, or **Set up recycling** to apply that room's existing upgrade. Repairs update the scene and diagnosis without moving you; repaired objects show their healthy message instead of offering another repair.
- Leave through the front door. If the interior cannot open, the traversal restores you outside and reports the failure instead of showing a successful visit.

Indoor movement uses room boundaries and horizontal collision bounds for walls and major furniture, with short movement steps and edge sliding. Overhead lintels do not block doorways. Permanent, visible sorting stands reserve the recycling bins' space before repair, so installing bins cannot enclose the walker. This is lightweight navigation, not full physics or collision coverage for every decorative object.

The indoor controls retain the existing home visual language. On phones, building status, help, movement buttons, and nearby interaction prompts occupy separate areas of the view. Keyboard movement is scoped to the interior; blur, hidden pages/dialogs, lost focus, and cancelled presses clear held input. Looking with another finger does not release a held movement button. Reduced motion skips the animated doorway travel and door interpolation; ordinary walking remains directly user-controlled.

## Position and progress

The first walk starts outside a reachable home. Leaving a building, or switching between walking and Town view outside, keeps the street position while that town scene remains mounted. The aerial camera also retains its pose. Direct travel from Town view or the Places directory starts at the selected entrance's porch and uses the same doorway transition; exit returns to that porch in walking mode.

Street position is temporary: it is not saved across page reloads or scene recreation. Walking does not reset existing upgrades or progress. Starting a walk clears a currently armed or dragged upgrade selection, not an installed upgrade.

Indoor position survives repairs and continuous internal doorway crossings while the interior remains mounted. Apartment reception repairs also retain the current floor. Explicit floor changes start at the destination lift. Indoor position is not saved across reloads or reopening a building; installed upgrades continue through the existing progress system.

## Movement boundaries

House bodies, the school/clinic buildings, and tree trunks block movement using horizontal bounding boxes. Movement slides along blocked edges; town limits and the river constrain the walking area, with crossings allowed on the rendered road bridges. Camera height follows roads and selected raised ground.

This is lightweight navigation, not full physics: it does not add jumping, gravity, vehicle collisions, or collision coverage for every decorative object. Entry begins with a proximity interaction at a registered front door, followed by hinged-door opening, a camera approach, and a portal handoff into the separate interior scene. Walking across the indoor front-door threshold initiates the return transition.

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
- Indoor regression checks: cross every internal doorway; approach all four repair targets; repair without a camera jump; move away from newly installed bins; return through the front door; verify healthy objects no longer offer a repair.
- `apps/web/lib/immersive-town/venues.test.ts`: night default, all 18 destination registrations and pickable surfaces, catalog floors matching tower heights, reachable street approaches, nearest-only entry, and blocked entry.
- `apps/web/lib/immersive-town/venue-world.test.ts`: all advertised floors build with safe spawn and entrance-to-lift clearance, bounded movement, place-specific furnishings, honest repeated-floor descriptions, exit/lift proximity, and scene disposal.
- Earlier venue implementation verification: all 588 tests across 76 files, typecheck, lint, and the production build passed after its review corrections. The build retained the pre-existing 0G dynamic-import and Next ESLint-plugin warnings. Desktop 1066×987 and phone 390×844 checks covered that UI; live checks confirmed Continue Game defaults to night, direct tower selection opens its interior, the lift changes floors, and Day/Night controls remain available. This is historical evidence for the preceding modal-based implementation, not current doorway acceptance.
- `apps/web/lib/immersive-town/building-traversal.test.ts`: shared hinge and engine, retained city/aerial camera, safe entry and return position, one loaded interior across all home/venue IDs, blocked transitions and reduced motion, refusal of distant walking entry, home repairs without pose reset, threshold exit, lift-only floor changes, ground-floor departure, and both apartments' existing repair callbacks and floor visits without a popup.
- Current doorway verification: all 700 tests across 91 files, full typecheck, lint, and the production build passed. Only the pre-existing 0G dynamic-import and Next ESLint-plugin warnings remain. Desktop 1066×987 and phone 390×844 home entry/exit were captured, and live City Library entry/exit passed. After a browser restart, a fresh check physically walked from Sunny's doorway through the room and around furniture to the **Restore power** prompt; final desktop 1066×987 and phone 390×844 recaptures were viewed, with one canvas and no dialogs. The browser check did not apply a repair, to preserve the player's saved progress; automated tests verify repair mutation and prevention of repeated repairs. The scoped final review is closed with a ship verdict: explicit repair labels and healthy-state action removal, apartment reception repair access, and restored neighborhood templates resolved its three findings.
- Doorway manual regression checklist: click facades, roofs, and windows in Town view; use the optional Places directory with keyboard and touch; approach venue and home street entrances; watch the door and threshold handoff; switch floors only near the lift; return to ground before leaving; use threshold crossing and the nearby exit action; confirm the original porch/street position and retained aerial pose; repair at apartment reception and home objects without a pose reset; verify healthy status without a repair button; toggle Day/Night; check small-screen controls, focus return, and entry/floor-load recovery. This checklist does not imply every item has received live manual verification.

The earlier bounded home-interior review and subsequent desktop/mobile venue review each resolved their three findings; that venue review's ready-to-ship disposition applies to its historical inspected scope. Current doorway evidence is recorded separately above. This note does not claim every destination was manually traversed on every device, a measured FPS target, broader device/performance coverage, a geometrically continuous world, or full-physics behavior.
