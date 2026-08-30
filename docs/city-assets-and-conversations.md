# City assets and resident conversations

Implementation record, 2026-08-30. This is a narrow extension of Rivergate's existing adult, muted 3D city—not a replacement visual system or a new simulation.

## Scope and preserved behavior

- The populated city, walking controls, building entrances, campaign properties and missions remain the underlying experience.
- Added models are visual children of existing roots; they do not replace navigation, collision shells, traffic rules, garden state, local saves or optional 0G behavior.
- Background conversations are locally authored atmosphere. They do not report verified service conditions, advance missions, invoke AI, access a microphone or make network requests.
- The ordinary-PC target in `PRODUCT.md` remains a target. Neither these assets nor the quality controls establish support for every PC.

## Built city detail

- Cars use simplified derivatives of the sourced Car Concept model. The short urban shuttle bus is project-authored geometry, not a sourced production-bus model.
- Both vehicle families have near/far geometry, separate wheel assemblies, shared per-vehicle paint and lamp materials, existing route-following transforms, distance-based wheel rotation and day/night lamps.
- Broadleaf and fir models replace existing tree visuals in place. Orchard trees retain their existing roots and narrower scale; successful replacements remove the old fallback meshes.
- Five local photographed maps cover asphalt, brick, concrete (the `stone` material slot), slate and grass. Wood and fabric keep generated surfaces.
- Road edge paint, kerbs and drains follow the existing driving spline. Road texture coordinates are mapped in world space; kerbs and drains are merged by material.
- Eight downtown building roots gain entrance canopies, supporting metalwork and batched rooftop equipment. These are decorative additions, not new interiors or collision shells.

The canonical [asset inventory, provenance, modifications, attribution and licenses](../apps/web/public/models/city/README.md) must travel with redistributed assets. In particular, retain the modified Car Concept's CC BY 4.0 attribution. That README also records exact per-model triangle counts and delivery sizes; the asset commit `ffac1c6` was already pushed to `SLAB-Studio/main` by `darahub`.

## Loading, detail and fallback budgets

- Every city model starts with its real, simplified far variant. Near variants are selected by camera distance with separate enter/exit thresholds to reduce repeated switching.
- With shadows enabled, trees enter near detail below 28 units and leave above 36; vehicles enter below 26 and leave above 36. Without shadows, the corresponding thresholds are 14/20 for trees and 12/18 for vehicles. Tree distance checks run every 0.75 seconds.
- Residents, vehicles and trees share one scene-scoped GLB loader: at most two active jobs, one cached promise per local URL and a 20-second request timeout. Scene disposal aborts requests and disposes cached containers.
- The two-job limit applies to GLBs, not the separately loaded surface JPEGs. Photographed textures are shared once per surface type per scene; generated textures remain until a photograph loads successfully.
- Failed initial model loads leave procedural vehicles or trees usable. A failed upgrade retains the current model. Models arriving after their owner is disposed are discarded.
- Eight city GLBs plus five 512-pixel surface JPEGs total about 6.52 MiB; actual transfer depends on loaded variants. This is file delivery size, not scene memory or frame-time measurement.
- Existing Auto, Performance and Balanced controls remain available. Performance reduces resolution and disables dynamic shadows without removing places or people; it also uses the shorter near-detail thresholds above.

## Resident conversations

- Three existing resident pairs converse at Market square, School gardens and River promenade. Each has separate day and night text.
- A 54-second cycle provides three alternating seven-second turns, short gaps between lines and a longer quiet interval. Pair offsets keep their cycles staggered.
- Only the nearest active speaker in front of the camera is selected: within 28 units while walking, or 95 units in the overview camera.
- One depth-tested, camera-facing caption is attached above the speaker. It names the resident, wraps the line and scales within bounded sizes as distance changes. Buildings can occlude it; it is not an always-on-top overlay.
- The render-settings panel repeats the current speaker, place and line as ordinary text with automatic screen-reader announcements disabled. Its Resident conversations checkbox hides both the bubble and current transcript when off; the control is disabled until the scene is ready.
- Residents face their conversation partner. Speaking gestures are suppressed under reduced motion.
- Dialogue has a separate reading clock: turns continue with reduced motion even when decorative motion is stopped, and pause when gameplay animation is paused. Reduced motion does not freeze a single line indefinitely.

## Implementation map

| Area | Source |
| --- | --- |
| Settings, transcript and runtime integration | `apps/web/components/game/ImmersiveTownMap.tsx` |
| Model instances, tree replacement and detail selection | `apps/web/lib/immersive-town/city-models.ts` |
| Vehicle replacement, tires and lighting | `apps/web/lib/immersive-town/vehicles-3d.ts` |
| Photographed maps and generated fallbacks | `apps/web/lib/immersive-town/materials.ts` |
| Roads and entrance detail | `apps/web/lib/immersive-town/streetscape.ts` |
| Authored text and nearby captions | `apps/web/lib/immersive-town/conversations.ts`, `conversations-3d.ts` |
| Reading clock and world lifecycle | `apps/web/lib/immersive-town/animation.ts`, `create-town-world.ts` |
| Shared bounded loading and cache | `apps/web/lib/immersive-town/resident-assets.ts` |

## Verification status and commands

Two review findings are resolved: separating the dialogue clock from decorative motion and disabling the conversation toggle during loading. Final lint and production build passed after both fixes; the build also validated types. The final single-worker test run passed all 638 tests across 85 files. An initial parallel run timed out on seven heavy tests under host contention without assertion failures; the complete single-worker rerun passed. Existing build warnings remain for the dynamic dependency in `storage-sdk-driver.ts` and Next.js ESLint plugin configuration.

Run from the project root:

```sh
pnpm typecheck
pnpm lint
pnpm build
pnpm exec vitest run apps/web/lib/immersive-town/city-models.test.ts apps/web/lib/immersive-town/conversations.test.ts apps/web/lib/immersive-town/animation.test.ts
pnpm exec vitest run --maxWorkers=1 --minWorkers=1
```

Focused checks cover actual local model files, lower-detail geometry, wheels, load failure, disposal, tree-root preservation, authored conversation timing/proximity/toggles and reduced-motion/pause behavior. Headless checks do not establish the in-game appearance.

An offline asset preview was inspected; it is an asset preview, not a game capture. Browser capture was blocked by policy and no workaround was used. Live composition, engine-rendered appearance and representative-hardware FPS remain unverified.

## Manual in-game verification checklist

- [ ] Inspect day and night in overview and walking modes: surface scale, tree silhouettes, readable streets, car lights and entrance visibility.
- [ ] Watch cars and buses on straight roads, corners and slopes: correct forward orientation, four tires contacting the road and wheel rotation around the intended axle.
- [ ] Walk to campaign properties and downtown entrances; confirm entry/exit prompts, collision clearances and existing missions/save behavior.
- [ ] Approach and retreat from vehicles and trees in Balanced and Performance: verify near/far swaps, no missing models, stable roots and retained population.
- [ ] Visit all three conversation pairs; observe alternating turns, quiet gaps, day/night text, speaker attachment, building occlusion and transcript readability.
- [ ] Turn conversations off/on and reload while the scene loads: bubble and transcript agree with the checkbox, and the loading control cannot create a mismatched state.
- [ ] Enable reduced motion: gestures and decorative movement stop while dialogue advances; pause/resume play and confirm dialogue pauses/resumes too.
- [ ] Simulate unavailable city assets and verify usable fallbacks; record frame rate and hardware in both quality modes before making performance claims.
