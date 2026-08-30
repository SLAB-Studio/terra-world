# Adult city pivot — implementation and verification

## Status

**Later storyline pivot (2026-08-30):** the new adult living-city direction is
recorded in [the story bible](../storyline.md) and
[living-city architecture](living-city-architecture.md). The material below
records the earlier visual/repair pass; it does not limit the new target to
repair missions or claim the new story systems have been implemented.

This is the first implemented adult-facing visual and performance pass, not a
claim of photorealism or certified support for every PC. The product direction is
recorded in `PRODUCT.md`. Existing `DESIGN.md` describes the historical child UI;
its replacement and rendered sign-off remain pending. Current implemented visual
truth is `apps/web/app/city-experience.css` and the game CSS modules.

On 2026-08-30, type checking, lint, production compilation, and all 617 tests in
80 files passed. A source-only independent review identified five responsive and
contrast defects; its follow-up scored all five resolved. This is not visual
approval: browser screenshot capture was blocked by the browser URL security
policy, so no new screenshots or hardware FPS measurements were collected.

## What changed

- A slate-and-amber interface with self-hosted Barlow Semi Condensed display type
  replaces the main playboard's chunky toy styling. The narrow City tools rail,
  current objective, and on-demand Leo drawer leave more of the 3D world available.
- Start/Continue keeps its local name, saved-progress summary, confirmation before
  resetting, and no-wallet entry. The menu preview renders the actual Rivergate
  scene instead of drawing an illustrative town. It is capped at 24 rendered
  frames/second and 0.8 pixel ratio; pause, reduced motion, offscreen state, hidden
  tabs, and unmounting stop or release its rendering work.
- Shared, deterministic 128px surface textures represent stone, brick, slate,
  timber, asphalt, vegetation, and fabric. Facades gain framed glazing, gutters,
  closed gables, and commercial joinery; interiors gain material and furniture
  detail. Merged geometry limits added draw overhead. These remain efficient
  procedural 3D models, not scanned or high-poly assets.
- Residents have more grounded proportions; night lighting and vegetation use
  quieter colours. The existing populated city is retained: 28 homes, 18 public
  venue entries, road-following traffic, public floors, indoor walking, repairs,
  and day/night switching. Night remains the default.
- The 15 residential missions use practical service-assessment, maintenance, and
  recovery language. All IDs, setups, deterministic goals, rewards, move rules,
  and saved progress remain compatible. This pass does not add a new economic or
  contract simulation.

## Graphics controls

The Graphics disclosure offers Auto, Performance, and Balanced. Preferences stay
on the device and also apply when entering an interior.

| Mode        | Resolution budget                                                                                                                                  | Effects                                                            |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Auto        | Starts at at most 0.9 device-independent pixel ratio; adjusts within 0.65–1.25, also bounded by device ratio and a 1.8-million-pixel render target | Disables dynamic shadows when resolution falls below 0.85          |
| Performance | At most 0.85 pixel ratio and the same render-target ceiling                                                                                        | No dynamic shadows                                                 |
| Balanced    | At most 1.25 pixel ratio and the same render-target ceiling                                                                                        | Low-quality 1024px outdoor shadow map, refreshed every other frame |

The adaptation waits for warmup, needs sustained slow/fast windows, and has a
cooldown so it does not change resolution every frame. No renderer fingerprint,
graphics-card lookup, external telemetry, or high-performance GPU preference is
used. Quality changes do not recreate the city, remove residents or places, or
reset the camera. Hidden/offscreen scenes stop rendering; the city pauses behind
the Places directory and building visits.

Show frame rate exposes measured FPS, resolution, active/total meshes, and draw
calls. These are live local diagnostics, not benchmark claims. Integrated graphics
are the intended target; actual minimum specifications require hardware testing.

## 0G and privacy

0G Compute remains optional, grounded advice and hints from Leo, with authored
fallbacks and the existing bounded schemas. It does not render the game or decide
simulation results. Existing Storage/checkpoint, chain/proof, and city identity
boundaries are retained; this visual pass does not configure credentials or prove
live network use. Names and free-form local chat are not newly transmitted.
Legacy save, privacy, recovery-code, and guide-output protections remain intact.

## Remaining acceptance checks

- Desktop at 1366×768 and the user's own viewport: Start/Continue, a full visible
  map, scrollable tools, objective, camera controls, and no Leo overlay collision.
- 390×844: horizontal tools, reachable actions, no page overflow; open and close
  Leo using keyboard and touch. Check shorter landscape windows separately.
- Day and night: inspect facades, shadows, readable rooms, door approach routes,
  pedestrian gait, street traffic, and material repetition at ground level.
- Enter and exit a home, a public venue, and a tower floor; walk to a repair,
  apply it, and confirm preserved outside camera position and saved progress.
- On representative integrated-GPU PCs, record warm FPS and frame pacing in town
  view, walking, and interiors for all three quality modes. Include transitions,
  first-load compilation, and a hidden-tab/resume cycle; do not infer hardware
  performance from NullEngine tests.
- Complete rendered Flowstate review and update the historical design guide.
- The earlier remote permission block was subsequently resolved and updates
  were pushed to SLAB-Studio/terra-world. Continue verifying each push; a
  successful local build alone is not evidence of remote publication.

## Asset provenance

Barlow Semi Condensed SemiBold is self-hosted from the Google Fonts `google/fonts`
repository, with `Barlow-OFL.txt` alongside the font. Surface textures are generated
in source; no external image downloads, model packs, or paid assets were added.
