# Rivergate city-realism pass

This bounded pass adds street-level detail, a resident repair journal and steadier
automatic graphics adjustment to the existing Babylon.js city. It preserves the
28 homes, 18 public venues, 32 ambient residents, aerial/first-person exploration,
interiors and day/night controls. It does not implement the broader systems in
[the living-city architecture](living-city-architecture.md).

## What is built

### Storefront detail

The café, bookshop, library and workshop receive planted window boxes. The café
also has compact tables, chairs, cups and an awning valance; the bookshop has a
wall-mounted book display; the workshop has cycle stands and a service cabinet.
These details follow the real building transforms and leave the tested doorway
approaches, road lanes and authored pedestrian routes clear.

`urban-detail.ts` groups static geometry by storefront and shared material,
freezes its world matrices, and keeps it non-pickable. The resulting layer adds
21 merged meshes and 5,418 vertices, within its 22-mesh/8,000-vertex budget, with
no added materials, lights, textures or per-frame observers. These are the added
layer's counts, not totals for the city. Props receive existing shadows but add
no shadow casters or collision shells; they are scenery, not new usable seats,
shops or physics objects.

### Resident journal

The **Resident journal** connects authored requests and everyday-life dialogue
to the existing repairs. It contains 37 home/need case keys across 28 homes:
four needs for each of the three core homes, plus one for each of 25 other homes.
These are not 37 unique mechanics. They use the existing power, water, garden
and recycling upgrades.

Each case tracks hearing the request, inspecting the interior, installing the
repair and checking in. Reading a request can record the conversation, but
selecting a destination cannot record an inspection: the map reports it only
after actual interior entry. Installed home upgrades remain the repair authority.
The nearby **Knock & talk** or indoor **Talk to [resident]** action records the
check-in only when the request, inspection and repair requirements are satisfied.
An inspected core-home case remains selected through its repair until check-in.

Open/all-home filters, case notes and previous check-ins make the authored
history reviewable. Keyboard focus moves into the non-modal journal and returns
on close; Escape closes it, and reading does not trigger walking shortcuts.
This is written local game dialogue, not live AI, autonomous household memory,
an economy, relationship simulation or an emerging-story generator.

Journal flags are saved separately in local storage under
`terra-world:resident-casework:v1`; existing repair saves and IDs are unchanged.
New-game/reset paths clear the journal. If a challenge or restored state removes
a completed repair, inspection/check-in must be earned again. Invalid journal
data is preserved without overwriting it, and unavailable storage produces an
honest session-only notice. This journal is not included in a new remote backup
or city-identity integration.

### Adaptive graphics

Auto graphics now backs off when a resolution increase proves too expensive.
An increase is observed for 15 seconds; a failed increase delays the next attempt
by 30 seconds, doubling after repeated failures up to 120 seconds of active
rendering time. Sustained headroom can still restore detail. Warmup, sampling
windows, bounded resolution and explicit quality choices remain intact; resizes
retain the learned Auto resolution within the new viewport's budget.

A synthetic costly-quality-boundary comparison reduced resolution changes from
15 to 6 over 120 seconds. That measures less oscillation, not an FPS gain or a
hardware benchmark. The controller uses local frame timing, not GPU fingerprinting,
telemetry or network calls, and does not remove residents or buildings.

## How to try it

1. Start or continue the local game. Use **Places** and **Walk around** to inspect
   the café, bookshop, library and workshop; compare day and night.
2. Open **Resident journal**, choose a resident and read their request or daily
   routine. Select **Visit**. In Town view the visit opens at the door; while
   walking, reach the home's front door first.
3. Enter the interior, find the indicated room or apartment ground-floor
   maintenance point, and use the existing repair action.
4. Talk at the home after repair. Confirm **Checked in**, read the feedback and
   reopen the journal after a reload to check device persistence.
5. Try Auto graphics, then a fixed quality option. Keep performance observations
   tied to the actual camera, viewport, device and graphics setting.

## Verification and limits

- Full suite: 855 tests across 96 files; typecheck, lint and production build
  passed. The build retains the existing dynamic-import warning in the 0G
  Storage SDK path.
- Focused tests cover geometry budgets, shared-resource disposal, non-pickable
  props, route/door clearance, retained population, case progression and malformed
  saves, repair rollback, and adaptive retry/recovery behavior.
- Animated and reduced-motion café entry/exit regressions verify a walkable
  return position and an escape route along the alley. Backing straight into
  the neighbouring workshop remains a normal wall collision, not a trapped
  spawn. Browser checks also covered café entry, exit and turning along this route.
- Browser validation through visible controls covered Mina's request → Visit →
  actual interior entry → walking from Living to Kitchen → approaching the tap
  → **Repair water supply** → **Talk to Mina**. The scene reported “Clean water
  reaches the sink,” the journal showed **1 of 28 homes checked in** with resident
  feedback, and the existing mission advanced from Bluebell Water Service to
  Mango Recycling Provision. Reading or selecting the case alone did not supply
  inspection, repair or check-in credit. Reloading retained the **1 of 28**
  checked-in state.
- Desktop 1280×800 and phone 390×844 checks verified legible controls after
  correcting journal/Ask Leo overlap and walking-help placement. A final phone
  Town-view check caught implicit grid minimum-content overflow (1,635 px at a
  390 px viewport); a `minmax(0, …)` grid constraint restored viewport, shell and
  header widths to 390 px. These checks cover the observed layouts and flow, not
  all devices or every case. The final independent bounded finish review
  returned **SHIP**, and the final production rebuild passed with the existing
  warning noted above.
- The local pre-change browser baseline at 1280×720 was approximately 60 FPS,
  125% render resolution and 1,445 draw calls. This single setup is not a
  target-device certification, a universal performance guarantee or evidence of
  a before/after speedup.
- A post-change local aerial night-view sample at 1280×720, after resizing from
  phone to desktop, showed approximately 60 FPS with **Balanced**, 100% render
  resolution, an active-mesh readout of 1,317/1,638 and 1,481 draw calls per frame. The game
  had progressed and Auto resolution is dynamic, so this is not a controlled
  comparison with the baseline or evidence of an FPS gain. It describes that
  visible sample only, not sustained performance on other hardware.

Walking, rendering and journal progression remain local. Existing 0G interfaces
are preserved; this pass adds no paid journal inference, uploads, minting or
receipt-backed completion claims. Tests and a successful build do not establish
live 0G connectivity or cold-load offline availability.

## Performance rationale and next work

Static transform freezing and reducing draw calls follow Babylon.js's
[scene optimization guidance](https://raw.githubusercontent.com/BabylonJS/Documentation/master/content/features/featuresDeepDive/scene/optimize_your_scene.md).
Storefront-local batches preserve useful culling boundaries; opaque shared
materials and avoiding extra lights also align with Epic's
[performance guidelines for artists and designers](https://dev.epicgames.com/documentation/en-us/unreal-engine/performance-guidelines-for-artists-and-designers?application_version=4.27).
These are implementation principles, not evidence that another engine's tools
or performance results apply directly to this browser game.

The next optimization should begin with measured CPU/GPU frame profiling on
representative ordinary PCs, then target demonstrated costs such as repeated
geometry suitable for instancing. This pass does not justify a wholesale engine
migration, ray tracing or a claim of photorealism.
