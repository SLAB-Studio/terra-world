# Walk with Leo

The existing Rivergate world now has a third-person walking view: the player
controls a detailed human avatar, accompanied by Leo, a female virtual dog.
The aerial town, populated streets, homes, public venues and existing gameplay
remain in place. This is an extension of that world, not a replacement city.

## Behavior and controls

- Choose **Walk with Leo** to explore with the visible player and dog. Choose
  **Town view** to return to the aerial camera.
- Use W/A/S/D to move, up/down arrows to move forward/back and left/right arrows
  to turn. Drag the view to look. On-screen buttons support held movement and
  turning on touch devices as well as desktop.
- Hold **Shift** while moving to run, or toggle **Run** beside the movement
  buttons. Toggle it off to walk again. Running does not move automatically.
  Streets use 3.6 m/s (walking 1.8); interiors use a controlled 2.6 m/s
  (walking 1.56). Releasing Shift, pausing, losing focus or crossing into a
  building resets the transient input; door transitions start at walking pace.
  Keyboard and touch together cannot double speed, and diagonal movement is
  normalized before selecting pace. Walls still use swept collision checks.
- Approach a door and use E or the entry button. Explore the interior and return
  through the front door or use **Walk outside** when it is available. Leo joins
  the player in street, home, venue and upper-floor scenes.
- Leo prefers a position just beside the player. When that space is obstructed,
  she follows a short trail of the player's route through the navigable space.
  Turns, stopping and walking animate from actual movement distance.
- **Ask Leo** opens the existing conversation surface. Her latest answer also
  appears in a dismissible speech bubble anchored above her in the walking view,
  with a polite screen-reader announcement. The bubble is not a fixed corner
  mascot or an independently generated answer.

Free-form Ask Leo replies are currently authored, on-device responses. Messages
from the existing bounded 0G guide pipeline use the same bubble. This feature
adds no inference, remote model service, Storage upload or chain call for
walking or animation. The planned Agentic identity remains the city
intelligence, not a new dog NFT.

## Assets and performance safeguards

Leo uses a textured, skinned Shiba Inu adapted from **Animated Dog, Shiba Inu**
by quander under CC Attribution. The local asset record preserves the source,
GLB variant/mirror attribution, license and conversion details:
[Leo asset attribution](../apps/web/public/models/leo/README.md).

The shipped dog has 11,349 triangles, textures capped at 1,024 pixels and a
1,066,028-byte GLB. Its idle, four-beat walk and diagonal-pair trot are prepared offline; there is no
runtime paw-target IK solve. Dog skeletal poses update at most 30 times per
second. Following uses bounded breadcrumbs (at most 160), swept collision
checks and a capped timestep rather than a global navigation search per frame.
Inactive parties do not update; scene disposal removes their presenter resources.
Reduced motion suppresses idle swaying while retaining distance-driven walking.
Portrait camera framing reserves horizontal space for both characters.

The player uses Microsoft's authored neutral run, retargeted offline onto the
existing skeleton. The animation-only addition is 71,395 bytes and reuses the
same human geometry and textures. Both running and trotting sample travelled
distance, blend poses on pace changes and stop when collision blocks movement.
Leo's bounded catch-up speed adapts to the player's measured movement. No new
camera shake, zoom effect, network transaction or AI request is added by running.

## Limits and recovery

Leo aims to remain alongside the player, not at a mathematically fixed offset.
Narrow passages can put her behind the player; blocked routes can make her pause.
Scene entry resets the party near the player, while ordinary following has no
catch-up teleport. This is bounded game locomotion, not a general dog simulation
or a guarantee of perfectly planted paws in every situation.

The camera shortens near obstacles, so tight walls can limit full-body framing.
Loading and separate player/dog failures are reported explicitly; no primitive
dog stand-in is substituted. Reload to retry an asset failure. Exploration can
continue when Leo's model fails to load.

## Verification

The implementation pass recorded 878 passing tests across 100 files, plus a
passing production build, typecheck and lint. Focused tests cover straight
following, reversals, narrow passages, stalls, real-GLB paw motion and loop
closure, presenter lifecycle, portrait framing and failure/recovery status.
Browser checks exercised movement controls, home entry/exit, a cafe visit and an
actual Leo answer bubble at 1280×900, 859×987 and mobile 390×844 viewports.
These checks do not establish a device-wide FPS guarantee, perfect motion or
new successful 0G transactions.

The running extension adds keyboard/touch control, diagonal-speed, collision,
interruption, long-run following (30/60/120 Hz), real human run-cycle and dog
trot-cycle checks. All 51 focused animation/movement tests passed, as did the
production build, typecheck and lint. Live checks covered desktop and 390×844
controls, Shift release, Run on/off, conversation interruption, home entry and
indoor movement, with no browser errors reported. The full suite recorded
890/891 passing: the unchanged recovery-code test sometimes creates a
noncanonical base64 code and expects the later decryption error instead of
the earlier validation error. It passed when rerun separately; it was not
changed as part of locomotion work.
