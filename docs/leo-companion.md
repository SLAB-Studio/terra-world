# Walk with Leo

The existing Rivergate world now has a third-person walking view: the player
controls a detailed engineer avatar, accompanied by Leo, a fellow human engineer.
The aerial town, populated streets, homes, public venues and existing gameplay
remain in place. This is an extension of that world, not a replacement city.

## Behavior and controls

- Choose **Walk with Leo** to explore with both visible engineers. Choose
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
  the companion follows a short trail of the player's route through the
  navigable space. Turns, stopping and walking animate from actual movement
  distance.
- **Ask Leo** opens the existing conversation surface. Leo's latest answer also
  appears in a dismissible speech bubble anchored above the engineer in the
  walking view, with a polite screen-reader announcement. The bubble is not a
  fixed corner mascot or an independently generated answer.

Free-form Ask Leo replies are currently authored, on-device responses. Messages
from the existing bounded 0G guide pipeline use the same bubble. This feature
adds no inference, remote model service, Storage upload or chain call for
walking or animation. The planned Agentic identity remains the city
intelligence, not a separate identity or token for Leo.

## Character presentation and performance safeguards

Leo and the player use independent wardrobe settings so changing one engineer's
appearance never changes the other. Their default engineer outfits use one
complete skinned worker model with a fitted hard hat, safety vest, work trousers
and boots. Blue and red material instances distinguish them without adding
floating costume meshes. Character animation is prepared offline and skeletal
poses update at a bounded rate. Following uses bounded breadcrumbs (at most 160),
swept collision checks and a capped timestep rather than a global navigation
search per frame.
Inactive parties do not update; scene disposal removes their presenter resources.
Reduced motion suppresses idle swaying while retaining distance-driven walking.
Portrait camera framing reserves horizontal space for both characters.

The default worker model supplies its own idle, walk and wave animation. Fast
movement uses the same seamless, distance-driven walk cycle at a higher pace;
the source model's visibly discontinuous run loop is intentionally not used.
Casual and field player outfits continue to use the separately authored run
animation. Both engineers blend poses on pace changes and stop when collision
blocks movement.
Leo's bounded catch-up speed adapts to the player's measured movement. No new
camera shake, zoom effect, network transaction or AI request is added by running.

## Limits and recovery

Leo aims to remain alongside the player, not at a mathematically fixed offset.
Narrow passages can put Leo behind the player; blocked routes can make the
companion pause. Scene entry resets the party near the player, while ordinary
following has no catch-up teleport. This is bounded game locomotion, not a
guarantee of perfectly planted feet in every situation.

The camera shortens near obstacles, so tight walls can limit full-body framing.
Loading and separate player/companion failures are reported explicitly; no
primitive stand-in is substituted. During a wardrobe change, the current person
stays visible until the complete replacement is ready, and a failed request can
be retried. Exploration can continue when Leo's model fails to load.

## Verification

Automated checks cover straight following, reversals, narrow passages, stalls,
coherent skinned-human motion and loop closure, presenter lifecycle, portrait
framing, wardrobe independence and failure/recovery status.
Browser checks exercised movement controls, home entry/exit, a cafe visit and an
actual Leo answer bubble at 1280×900, 859×987 and mobile 390×844 viewports.
These checks do not establish a device-wide FPS guarantee, perfect motion or
new successful 0G transactions.

The running extension adds keyboard/touch control, diagonal-speed, collision,
interruption, long-run following (30/60/120 Hz), and human locomotion checks.
Live checks cover desktop and mobile controls, Shift release, Run on/off,
conversation interruption, home entry and indoor movement.
