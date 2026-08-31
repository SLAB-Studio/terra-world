# Rivergate resident models

Twelve rigged, textured humans derived from **Microsoft Rocketbox**, under the MIT
license reproduced in `LICENSE-Microsoft.txt`.

Upstream: https://github.com/microsoft/Microsoft-Rocketbox

Pinned revision: `0943055db6ec570bcef9f2c8b41c9e5467c808f9`.

| Game asset      | Original asset                          |
| --------------- | --------------------------------------- |
| man-denim       | Assets/Avatars/Adults/Male_Adult_12     |
| man-casual      | Assets/Avatars/Adults/Male_Adult_06     |
| woman-casual    | Assets/Avatars/Adults/Female_Adult_01   |
| woman-knit      | Assets/Avatars/Adults/Female_Adult_11   |
| boy             | Assets/Avatars/Children/Male_Child_01   |
| girl            | Assets/Avatars/Children/Female_Child_01 |
| elder-man       | Assets/Avatars/Adults/Male_Adult_03     |
| man-jacket      | Assets/Avatars/Adults/Male_Adult_04     |
| woman-purple    | Assets/Avatars/Adults/Female_Adult_03   |
| woman-headscarf | Assets/Avatars/Adults/Female_Adult_06   |
| man-tee         | Assets/Avatars/Adults/Male_Adult_09     |
| boy-sport       | Assets/Avatars/Children/Male_Child_02   |

The expansion preserves six different source faces and wardrobes: a grey-haired
man in a tweed blazer; a bearded man with textured, voluminous hair, a leather
hoodie and olive trousers; a woman with a black bob and purple tunic; a woman in a
white headscarf and olive tunic; a man with a ponytail, black tee and jeans; and a
dark-skinned boy in an orange tee and shorts. These were selected by inspecting
the official preview renders, then checked again in renders of the converted
GLBs. Skin, hair and clothing use original source textures, not whole-body tints.
The elder is an actual grey-haired source model; adult assets are not relabeled
as elderly women. Asset appearance does not assign nationality or religion.

Animation sources are the `m_` and `f_` variants of `walk_neutral_01.max.fbx`
from `Assets/Animations/all_animations_max_motextr_xy`, plus
`idle_breathe_01.max.fbx` and `gestic_talk_neutral_01.max.fbx` from
`Assets/Animations/all_animations_max_motextr_static`. The same MIT license applies.

## Changes made for Terra World

- Retargeted anatomical rotations to each character's original skeleton; retained
  their limb lengths and skinning, removed horizontal root motion, grounded feet.
- Baked three clips: idle, walk, talk. Authored route distance controls walk phase;
  short pose blends handle walking/stopping transitions.
- Diffuse textures resized to 512px and embedded in GLB, with JPEG for opaque
  clothing/face maps and PNG for hair alpha. No runtime external texture requests.
- Retained full geometry nearby up to an 8,990 triangle cap; produced a 25% triangle version for distant
  crowds. Every model has 80 bones and only two or three material primitives.
- Removed normal/specular maps, facial morph targets, lights and cameras. The
  city's existing lighting handles the people.

Full models: 6,660–8,990 triangles. Distant models: 1,665–2,301 triangles.
All twenty-four GLBs total 25,766,752 bytes; the twelve distant models total 11,422,408
bytes and load initially as needed. Close-up variants load on demand. The models are cached by appearance/detail in
each scene, and instances share their geometry/materials. Two concurrent asset
requests are allowed. This is an asset budget, **not a measured FPS guarantee**.

Clips are sampled manually at distance-dependent rates; cached models do not run
animations. Pose changes are copied to the instance's skeleton only when needed,
so stationary reduced-motion residents reuse their bone matrices between frames.

`conversion.json` records stature, cycle distance, and the selected original asset.
Offline reproduction: run `scripts/fetch-residents.mjs` into a separate empty
temporary folder, then `scripts/convert-residents.py` with Blender Python 4.3
(`bpy==4.3.0`, `numpy<2`). Source downloads and the converter are not game runtime
requirements. Original source files were retrieved 2026-08-30; expansion files
were retrieved 2026-08-31. The fetcher defaults to the pinned revision, verifies
download bytes against Git blob hashes, and can safely resume verified files.
Optional source-model IDs after the revision restrict source downloads; optional
game asset IDs after the converter's output directory restrict conversion. A
partial conversion merges metadata without dropping other residents. Example:

```sh
node scripts/fetch-residents.mjs /private/tmp/terra-resident-source \
  0943055db6ec570bcef9f2c8b41c9e5467c808f9 Male_Adult_03
uv run --python 3.11 --with bpy==4.3.0 --with 'numpy<2' python \
  scripts/convert-residents.py /private/tmp/terra-resident-source \
  apps/web/public/models/residents elder-man
```

The original six GLBs and player running extension were not regenerated for this
expansion. The resident asset tests verify all twelve identities have embedded
textures, bounded geometry, actual varying idle/walk/talk animation channels,
continuous joint curves and closed loops. Increased catalog size does not add
residents or change the live crowd budget.

These are game-ready human assets, not digital doubles of the named fictional
residents. The original deterministic character IDs, roles and routes are kept.
The game falls back to its original people if a model cannot load. No user photos,
faces, account details, or player names are sent to a model-generation service.

## Player running extension

`player-run.json` is a 71,395-byte animation-only addition for the existing
`man-casual` player skeleton (both LODs), not another copy of the model.
Source: `Assets/Animations/all_animations_max_motextr_xy/m_run_neutral_01.max.fbx`
and the same `Male_Adult_06.fbx`, from Microsoft Rocketbox revision
`0943055db6ec570bcef9f2c8b41c9e5467c808f9`, under the MIT license above.
`scripts/convert-player-run.py` reuses the resident converter's retargeting,
grounds the pose and exports compact local-space channels. The cycle covers
2.1118 source metres in 0.7333 seconds; actual player distance controls playback.
Only the player requests this clip. Ordinary NPC idle/walk/talk assets and
behaviors are unchanged.
