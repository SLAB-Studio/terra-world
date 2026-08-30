# Walking around Rivergate

Walking is a local extension of the existing town, not a separate world or a redesign.
Outdoor walking uses a second camera in the town scene; entering a home opens its existing interior scene, where you can now walk between rooms. Both views are first-person, with no visible player avatar.

## Using it

- Select **Walk around** once the 3D town has loaded. Select **Town view** to return to the aerial camera.
- With focus inside the town, use **W / S** or **↑ / ↓** to move forward/back, **A / D** to step sideways, and **← / →** to turn.
- Drag the view with a mouse or finger to look around; pointer lock is not required.
- Hold the **Forward**, **Back**, **Turn left**, or **Turn right** buttons to move continuously. A brief tap or keyboard activation makes a small movement.
- Walk near a home's front door. Its name and **Enter home** appear; choose the button or press **E** to open its existing room tour. A nearby home can also be selected directly in the scene.
- Use the tour's close control or **Back to the neighborhood** to return outside. Movement pauses while the home or another modal is open.

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

Residents use five authored pedestrian routes, separate from the car lanes. Their facing direction follows travel, with deceleration, a pause, and a turn before returning. Footstep timing follows distance travelled; leg and ankle joints keep the supporting shoe planted and the swinging shoe clear of the path. Heads and arms share the torso hierarchy so body movement cannot separate them. Reduced-motion mode holds each walker at their current route position.

These are scripted neighbourhood routines, not a full autonomous crowd/traffic simulation. Pedestrian route clearance, heading, stopping, joint connections and rendered shoe heights are covered by `pedestrian-motion.test.ts`.

Outdoor and indoor walking, collision checks, camera switching, and proximity checks run locally after the relevant assets load. The feature adds no 0G calls, wallet actions, uploads, or network persistence. Indoor repairs use the existing upgrade callbacks and data pipeline; walking does not change that behavior or make a cold offline page load available.

## Verification

- `apps/web/lib/immersive-town/walking.test.ts`: view-relative and diagonal movement, elapsed-time limits, wall clearance/sliding, river and bridge boundaries, and nearby-door entry.
- `apps/web/lib/immersive-town/town-walker.test.ts`: camera/position preservation, blocked movement and entry, safe approaches for all 28 homes, multi-pointer movement, and blur cleanup.
- `apps/web/lib/immersive-town/interior-navigation.test.ts`: movement normalization, long-frame limits, non-finite input, furniture sliding, boundaries, and same-room repair proximity.
- `apps/web/lib/immersive-town/interior-walker.test.ts`: eye-level camera and position preservation, overview enclosure switching, four-room connectivity and reachable repairs before/after upgrades, reserved bin space, and input cleanup/multi-pointer safety.
- Latest indoor implementation verification: 582 tests across 74 files, typecheck, lint, and the production build passed. The build retained existing 0G dynamic-import and ESLint-plugin warnings. Browser checks at desktop 1066×987 and phone 390×844 covered indoor controls; desktop traversal continuously crossed from Living to Garden, and approaching/repairing the lamp changed both scene and diagnosis.
- Prior outdoor browser checks covered desktop and 390×844, 390×568, and 740×390 viewports, including entering a home and returning outside.
- Manual regression checks: switch views repeatedly; move/turn/drag; approach a door and enter; return to the same street position; hold Forward while dragging with another finger; release each finger independently; open/close a modal; verify river and building boundaries and unchanged upgrades.
- Indoor regression checks: cross every internal doorway; approach all four repair targets; repair without a camera jump; move away from newly installed bins; choose another room explicitly; return to overview; verify room-repair controls with graphics unavailable.

The bounded indoor review disposition was ready to ship after all three findings were resolved. This note does not claim broader device coverage or full-physics behavior.
