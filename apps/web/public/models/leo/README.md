# LEO — Shiba Inu companion

Real textured/skinned dog, not a sprite or primitive stand-in.

Source model: **Animated Dog, Shiba Inu** by **quander**, licensed CC Attribution:
https://sketchfab.com/3d-models/animated-dog-shiba-inu-9abfce885a834399b2c3ccaed51cd474

The GLB variant is also published as **dog :] gltf** by **Godrex (danielgfj)**, CC Attribution:
https://sketchfab.com/3d-models/dog-gltf-e8e5140e4ca04b7f98b9f747ad94914e

Downloaded from the publicly distributed GLB in Edgardcai/pet-avatar at revision
`da5e1d27c2e370c08850b818d8eea7640879747b`:
`frontend/public/models/realistic/dog/dog_shepherd.glb`.
Despite that mirror filename, the mesh and skeleton are a **Shiba Inu**, not a shepherd.

Attribution license: https://creativecommons.org/licenses/by/4.0/
No endorsement by the original artists is implied.

Terra World adaptations: reduced polygon count, capped 1K coat and normal maps,
rough non-metallic fur material, new four-beat walk with offline paw-target IK,
diagonal-pair trot for keeping pace with a running player, and a restrained idle.
Original sitting/shaking/rolling/play-dead clips are not
looped as locomotion. `scripts/convert-leo.py` reproduces the conversion; source
checksum, mesh budget and stride calibration are in `manifest.json`.

All animation and following runs locally. No AI calls, remote model services,
or transactions are triggered by the dog walking.
