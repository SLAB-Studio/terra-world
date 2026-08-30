# Realistic Rivergate residents

This is a visual extension of the existing adult-focused city, not a new crowd
simulation or visual identity. Rigged, textured human models replace the primitive
body meshes once a complete asset is ready. The original character roots, IDs,
roles and local game rules remain intact. The later
[resident-routine extension](resident-routines.md) replaces authored route loops
with deterministic local destination travel, visits and rides.
The asset replacement itself adds no conversation mechanic, player navigation
obstacle, repair action, save field, or 0G request; residents remain non-pickable.
Later routines coordinate residents with one another and traffic. Existing walking,
building entry, camera, and campaign interactions retain their boundaries.

## Implementation and assets

- `characters-3d.ts` retains the character roots and delegates appearance and
  pose updates to `realistic-residents.ts`; current world movement is owned by
  `resident-routines-3d.ts`.
- `resident-models.ts` owns stable appearance selection, detail thresholds, and
  clip timing. `resident-assets.ts` owns the lazy-loaded glTF loader and per-scene
  asset cache.
- Six Microsoft Rocketbox source people supply four adult and two child
  appearances under MIT: `man-denim`, `man-casual`, `woman-casual`, `woman-knit`,
  `boy`, and `girl`. These are shared game assets, not digital doubles of the named
  fictional residents. Exact source mappings, animation provenance, changes, and
  license location are in the [asset README](../apps/web/public/models/residents/README.md).
- Each model includes idle, walk, and talk clips, embedded 512px diffuse textures,
  80 bones, and two or three material primitives. Existing city lighting is used;
  this adds no normal/specular maps, facial morphs, or extra lighting passes.

## Budgets and lifecycle

| Detail | Triangles per person | When used                                              |
| ------ | -------------------: | ------------------------------------------------------ |
| Far    |          1,665–2,224 | Initial asset; distant crowd                           |
| Near   |          6,660–8,896 | Within 20 scene units, or 12 when shadows are disabled |

Near detail remains until distance reaches 26 units (18 with shadows disabled),
avoiding boundary thrashing. Distance checks normally run every 0.5 seconds.
Only near-detail meshes cast resident shadows; both variants receive shadows.
After the retargeting correction, all twelve GLBs total 11,813,068 bytes; the six
far variants total 5,175,564 bytes.
These are asset budgets, not frame-rate measurements.

Registration requires a real rendering canvas; ordinary headless worlds do not
download assets. Each registered resident requests far detail first. Near models
load on demand, with at most two concurrent requests, a 20-second fetch timeout,
and one cached promise per appearance/detail/scene. Instances share geometry and
materials but own skeletons. Cached assets never autoplay animations.

Primitive meshes remain until replacement succeeds. A failed initial request
keeps the original people; a failed near request retains the working far model
and is not retried for that resident. Failed cached requests remain failed for
that scene. Scene disposal aborts requests, settles queued jobs, and disposes
cached containers; resident/detail disposal removes shadow casters and owned
instances. Late completions cannot recreate a disposed resident. Assets are
same-origin, but cold offline availability is not guaranteed; fallback remains
usable if the GLBs have not been cached.

## Motion and accessibility

Walk phase follows travelled distance, adjusted for model stature and cycle
length, rather than wall-clock time. Current clip selection uses speed hysteresis
(walk starts above 0.12 and remains active above 0.06); chat and wave select a
restrained upper-body talk layer over idle. Pose transitions ease over 0.36
seconds. The later [routine/animation correction](resident-routines.md#animation-correction)
fixes stale-parent retargeting and reconciles loop endpoints. Anatomical
retargeting preserves adult/child limb proportions and grounds
feet; a half-turn mount aligns imported forward direction with route headings.
The old primitive body's extra bob is not layered onto the imported animation.

Poses are sampled at 30 updates/second below 22 units, 12 below 60, and 6 beyond
that. This is animation sampling, not a renderer FPS cap. Bone transforms update
only on pose changes. Reduced-motion uses a single idle pose without blending;
the existing scene controllers stop advancing route time, retaining current route
positions. Repeated stationary reduced-motion updates reuse bone matrices.

## Reproduction and checks

The verification counts below record the earlier asset implementation, not the
later resident-routine extension; see its [current scope and checks](resident-routines.md).

From the repository root, with Node 20.9+ and `uv` available:

```sh
resident_source=$(mktemp -d /private/tmp/terra-resident-source.XXXXXX)
resident_output=$(mktemp -d /private/tmp/terra-resident-output.XXXXXX)
node scripts/fetch-residents.mjs "$resident_source" "UPSTREAM_COMMIT"
uv run --python 3.11 --with bpy==4.3.0 --with 'numpy<2' python scripts/convert-residents.py "$resident_source" "$resident_output"
pnpm exec vitest run apps/web/lib/immersive-town/resident-models.test.ts apps/web/lib/immersive-town/realistic-residents.test.ts
```

Replace `UPSTREAM_COMMIT` with the intended Rocketbox revision. The fetch script
defaults to moving `master` if omitted and records the resolved tree in
`source-inventory.json`; retain that inventory for repeatable sourcing. Conversion
is offline after download and outputs twelve GLBs, metadata, and the MIT license.
Review the separate output before replacing shipped assets. Do not pass optional
individual model IDs when rebuilding the complete manifest: filtered conversion
writes metadata only for the selected models. Neither Blender nor source FBXs are
runtime requirements.

An independent verification run passed all nine targeted tests across the two
files above. They cover asset budgets and genuine animated channels, stable
appearance mapping, actual glTF cloning, route-facing/grounding for an adult and
child, lifecycle fallback/disposal, distance thresholds, and motion timing. Four
review findings were resolved: anatomical facing, child retargeting, cached asset
autoplay, and repeated stationary bone-matrix recomputation.

The final repository verification also passed 626 tests across 82 files,
typechecking, lint, and the production build. These checks do not establish
rendered visual quality or target-device performance.

Browser capture was policy-blocked. The separately delivered
`rivergate-resident-assets.png` is an offline studio preview of the actual assets,
not a screenshot of the game. Whole-game visual acceptance, FPS, and representative
integrated-GPU performance remain unverified. Next acceptance checks should cover
street/aerial views, day/night lighting, transitions, reduced motion, and measured
frame times with the populated city on target hardware.
