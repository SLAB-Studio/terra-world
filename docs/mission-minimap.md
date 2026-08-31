# Side mission map

The mission map is a small navigation instrument beside the existing 3D city.
It appears during free exploration and chapter play, outside the chapter entry,
introduction and focused reading. The city remains the main playing surface;
the map does not move the player or grant mission progress.

## Read the map

The map stays north-up and uses the world's road, river and measured building
footprints. A white arrow marks the player's street position and facing; an
amber pin marks the next mission destination. In Town view, the arrow remains
the player's street position, not the overhead camera's location.

The destination card shows a compass bearing and straight-line distance in
world metres. These are not turn-by-turn directions, a walkable route or a
promise that a direct crossing is possible. Use the visible streets and safe
crossings. The card changes to **Nearby** within the destination's interaction
radius; inspection, conversation and repair still require their existing actions.

During the chapter, an X marks the East Bridge closure. It clears only after
the repair outcome is observed; delivery and diversion outcomes leave the
bridge closed. The closure marker directs attention to the south crossing,
but does not draw an obstacle-avoiding route.

## Destinations follow the mission

The active mission rules select the pin automatically:

- Chapter investigation points to the first missing evidence record in order:
  East Bridge, Maya at the bakery, Malik's repair estimate, then Nia by the river.
- After committing a chapter response, the pin returns to East Bridge to
  observe the outcome. Decision and completed states do not invent another
  destination; the map can show **No pinned mission** with the current objective.
- Free-exploration repair missions point to the relevant home's actual front
  door. Completing a step lets the existing repair rules select the next target.

Indoors, the map remains a street map: the white marker is anchored to the
building's actual entrance, not an indoor room or floor. **Street map** replaces
the distance and bearing. Guidance asks the player to find the repair point in
the target home, or leave the building to continue outside. This is not an
indoor floorplan or navigation between floors.

## Fold, read and resume

Select the **Mission map** header to fold or expand it. Folding hides the map
and longer instruction while retaining the destination and available distance
or nearby status. The preference lasts for the mounted component's lifetime;
it is not saved across reloads.

The map temporarily hides for the chapter notebook and conversations, resident
journal and **Places** directory. It remains mounted, preserving its folded
state when those panels close. Position sampling pauses while the map is hidden.

## Local implementation and visual conventions

The map is SVG, not a second 3D camera. Static city geometry is built from the
existing world and memoized. A local 180-millisecond poll updates the player's
position and heading without rerendering the whole city for each footstep;
unchanged poses are filtered and background-tab reads are skipped.

There are no new AI requests, 0G Compute calls, Storage uploads or chain
transactions per movement update. The existing optional chapter briefing route
and all existing 0G integration boundaries remain unchanged. See the
[chapter briefing notes](opening-chapter.md#optional-0g-briefings).

The panel uses local slate surfaces (`#1a2931`, `#253943`), light text and amber
guidance/focus (`#e4bb7b`). Its header has a minimum 44-pixel touch height, a
visible keyboard focus outline and an expanded-state label. Map descriptions
and marker labels provide text alternatives; reduced motion removes the header
transition. Responsive placement keeps the instrument beside the city controls.
These conventions describe this extension, not a new global design system.

Implementation paths are relative to `apps/web`:

- `components/game/MissionMinimap.tsx`, `MissionMinimap.module.css` and
  `MissionMinimapPlacement.css`: map rendering, folding and responsive placement.
- `components/game/ImmersiveTownMap.tsx` and `CompoundWorld.tsx`: world geometry,
  street/entrance position, visibility and current repair mission integration.
- `lib/immersive-town/mission-minimap.ts` and `mission-map-guide.ts`: projection,
  bearing, distance and mission-derived destinations.

## Verification boundaries

Implementation verification passed 999 tests across 115 files, lint, typecheck
and the production build. Browser checks covered 1280 × 720, 715 × 983 and
390 × 844 viewports, movement and heading updates, folding through **Places**,
the actual indoor entrance marker, and the Malik-to-Nia target change after
conversation. Mission-progression checks used a separate local test save;
the existing city's repair progress was left intact during navigation checks.

These checks do not establish measured FPS, universal hardware performance or
every mission branch on every device. No new paid 0G test was performed.
