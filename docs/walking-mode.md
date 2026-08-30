# Walking around Rivergate

Walking is a local extension of the existing town, not a separate world or a redesign.
It uses a second camera in the same scene and opens the existing home room tour.

## Using it

- Select **Walk around** once the 3D town has loaded. Select **Town view** to return to the aerial camera.
- With focus inside the town, use **W / S** or **↑ / ↓** to move forward/back, **A / D** to step sideways, and **← / →** to turn.
- Drag the view with a mouse or finger to look around; pointer lock is not required.
- Hold the **Forward**, **Back**, **Turn left**, or **Turn right** buttons to move continuously. A brief tap or keyboard activation makes a small movement.
- Walk near a home's front door. Its name and **Enter home** appear; choose the button or press **E** to open its existing room tour. A nearby home can also be selected directly in the scene.
- Use the tour's close control or **Back to the neighborhood** to return outside. Movement pauses while the home or another modal is open.

## Position and progress

The first walk starts outside a reachable home. Returning from a tour, or switching between walking and Town view, keeps the street position while that town scene remains mounted. The aerial camera also retains its pose.

Street position is temporary: it is not saved across page reloads or scene recreation. Walking does not reset existing upgrades or progress. Starting a walk clears a currently armed or dragged upgrade selection, not an installed upgrade.

## Movement boundaries

House bodies, the school/clinic buildings, and tree trunks block movement using horizontal bounding boxes. Movement slides along blocked edges; town limits and the river constrain the walking area, with crossings allowed on the rendered road bridges. Camera height follows roads and selected raised ground.

This is lightweight navigation, not full physics: it does not add jumping, gravity, vehicle collisions, or collision coverage for every decorative object. Entry is a proximity interaction at registered front doors, not physical traversal through an exterior doorway.

## Small screens and input safety

On narrow screens, walking hides the toy box and nonessential neighborhood panels to give the view more room. Touch movement and drag-to-look work together. Releasing a looking finger does not stop a different finger still holding a movement button.

Short narrow screens hide the help text and place home entry beside movement controls. Returning to Town view restores the normal neighborhood controls. Keyboard input is scoped to the town; loss of focus, hidden pages, blocked overlays, and cancelled movement presses clear held input.

## Local behavior

Residents use five authored pedestrian routes, separate from the car lanes. Their facing direction follows travel, with deceleration, a pause, and a turn before returning. Footstep timing follows distance travelled; leg and ankle joints keep the supporting shoe planted and the swinging shoe clear of the path. Heads and arms share the torso hierarchy so body movement cannot separate them. Reduced-motion mode holds each walker at their current route position.

These are scripted neighbourhood routines, not a full autonomous crowd/traffic simulation. Pedestrian route clearance, heading, stopping, joint connections and rendered shoe heights are covered by `pedestrian-motion.test.ts`.

Walking, collision checks, camera switching, and door proximity run locally after the town assets load. The feature adds no 0G calls, wallet actions, uploads, or network persistence. It does not change the existing room tour's data behavior or make a cold offline page load available.

## Verification

- `apps/web/lib/immersive-town/walking.test.ts`: view-relative and diagonal movement, elapsed-time limits, wall clearance/sliding, river and bridge boundaries, and nearby-door entry.
- `apps/web/lib/immersive-town/town-walker.test.ts`: camera/position preservation, blocked movement and entry, safe approaches for all 28 homes, multi-pointer movement, and blur cleanup.
- Implementation verification: 566 tests, typecheck, and lint passed. Browser checks covered desktop and 390×844, 390×568, and 740×390 viewports, including entering a home and returning outside.
- Manual regression checks: switch views repeatedly; move/turn/drag; approach a door and enter; return to the same street position; hold Forward while dragging with another finger; release each finger independently; open/close a modal; verify river and building boundaries and unchanged upgrades.

The bounded review disposition was ready to ship after the short-height layout and multi-pointer fixes. This note does not claim broader device coverage or full-physics behavior.
