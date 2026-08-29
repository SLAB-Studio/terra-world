# Terra World design system

## Product direction

Terra World should feel like a **community science museum discovery table**:
warm, tactile, optimistic, and information-rich without resembling a school
worksheet or a crypto dashboard. The child is the city planner; Rivergate is a
bounded computer guide that explains verified consequences.

Direction seed: `514fbb03`.

## Experience boundaries

- Child play contains no wallet, token, transaction, account, purchase, public
  score, or personal-data prompt.
- Building the city remains the primary action. Explanations are short,
  interruptible, and never block simulation.
- Adult recovery, accessibility, reset, and technical proof live behind the
  separate **Adults & judges** gate.
- Network features enhance the experience but never replace local play or
  authored learning content.

## Visual language

### Colour

- River greens communicate healthy systems and primary actions.
- Water blues orient the valley and coverage layers.
- Sunflower yellow marks curiosity, progress, and selected details.
- Clay red communicates risk and destructive actions, never ordinary emphasis.
- Warm paper and moss neutrals keep panels tactile and calm.
- Patterns, labels, and shapes always accompany colour-coded state.

### Typography

- Georgia is used sparingly for welcoming and story-led headings.
- The system sans-serif stack handles controls, numbers, instructions, and dense
  game status for reliable loading and strong legibility.
- Child-facing body copy remains short and uses generous line height.

### Shape and depth

- Panels use softened rectangular corners rather than pill-shaped containers.
- Controls have clear borders and restrained shadows, like movable museum-table
  pieces.
- Twelve building types use distinct code-drawn silhouettes at gameplay scale;
  colour is never their only identifier.

## Layout

Desktop uses a three-part planning table: building catalogue, dominant map, and
mission/system panel. The map owns the largest visual area. Tablet and mobile
stack the map first, then the horizontal building tray and planning tools. No
essential control may be clipped or depend on hover.

### Central town board

The child map is one simple, continuous, scrollable aerial landscape—not a
collection of cards, plots, or a detailed simulation. A broad river remains
visible as a persistent landmark. Trees, paths, and gentle ambient life give
the valley warmth without competing with its purpose; reduced-motion removes
all nonessential movement.

Render houses only for actionable family homes. Owner labels and short speech
bubbles show when a repair is needed; a house's details and diagnostics stay
hidden until the child clicks or taps it. Keep River persistent beside the map
on desktop and available from the sticky expert control on small screens.

On desktop, drag an item to an actionable home; click selects a home and opens
its details. On touch, tap a home to select it, then choose the available
action—do not require a drag gesture. Responsive layouts keep the map
continuous and center the entry view on actionable homes, while preserving the
river and avoiding horizontal page overflow.

## Interaction

- Pointer: select or drag a building, snap to a tile, review cost, then run the
  city.
- Keyboard: arrows move the tile cursor; Enter/Space places; R rotates;
  Delete/Backspace removes; Escape clears selection.
- Touch targets are at least 44 pixels in adult controls and approximately
  48 pixels in the main game.
- Provisional changes remain reversible until **Run the city**.
- Reduced-motion preferences remove nonessential animation.

## Learning feedback

Every committed turn produces deterministic cause/effect data. Rivergate may
translate those facts through the private guide route, but the response is
validated and always has a separately authored local fallback. The card follows
one consistent rhythm:

1. What Rivergate noticed
2. Think about it
3. Try next

Read-aloud begins off and can be enabled only in adult controls. No essential
meaning depends on sound.

## Adult and proof mode

The adult dialog uses quieter, denser information than the child game. It shows
learning progress, comfort settings, encrypted recovery, deterministic hashes,
and truthful 0G readiness. It never invents a live root, address, transaction,
or compute proof when the matching service is not configured.

## Accessibility checklist

- Visible focus on all interactive controls
- Semantic headings, regions, labels, status, and live announcements
- Complete keyboard alternative to drag-and-drop
- High-contrast option and non-colour map states
- Adjustable text scale, reduced-motion support, and muted-by-default audio
- Mobile layout without horizontal page overflow
- Technical errors translated into safe, actionable child or adult language
