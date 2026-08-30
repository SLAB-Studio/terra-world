# City assets: sources, attribution, and delivery budget

These are local, self-contained 3D models and photographed surface maps for Terra World's city scene. They are not AI-generated illustrations. Source material was retrieved on 2026-08-30; `scripts/fetch-city-assets.mjs` records the downloads and `scripts/convert-city-assets.py` produces the runtime derivatives. No third-party runtime asset service is required.

## Asset inventory

| Shipped files | Origin | License |
| --- | --- | --- |
| `broadleaf-near.glb`, `broadleaf-far.glb` | Poly Haven [Island Tree 02](https://polyhaven.com/a/island_tree_02) | CC0 1.0 Universal |
| `fir-near.glb`, `fir-far.glb` | Poly Haven [Fir Sapling](https://polyhaven.com/a/fir_sapling) | CC0 1.0 Universal |
| `crossover-near.glb`, `crossover-far.glb` | [Car Concept](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept), Eric Chadwick / Darmstadt Graphics Group GmbH | CC BY 4.0; attribution below |
| `shuttlebus-near.glb`, `shuttlebus-far.glb` | Original procedural geometry authored for this project in `scripts/convert-city-assets.py` | Project-authored; no third-party model license |
| `asphalt.jpg` | Poly Haven [Asphalt 02](https://polyhaven.com/a/asphalt_02), diffuse map | CC0 1.0 Universal |
| `brick.jpg` | Poly Haven [Red Brick 03](https://polyhaven.com/a/red_brick_03), diffuse map | CC0 1.0 Universal |
| `stone.jpg` | Poly Haven [Concrete Wall 007](https://polyhaven.com/a/concrete_wall_007), diffuse map; local filename is a material slot, not a claim that the source is natural stone | CC0 1.0 Universal |
| `slate.jpg` | Poly Haven [Roof Slates 03](https://polyhaven.com/a/roof_slates_03), diffuse map | CC0 1.0 Universal |
| `grass.jpg` | Poly Haven [Aerial Grass Rock](https://polyhaven.com/a/aerial_grass_rock), diffuse map | CC0 1.0 Universal |

Poly Haven's asset license is [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/), as confirmed by its [asset-license page](https://polyhaven.com/license). This applies to downloaded assets, not to unrelated site content, logos, or preview renders. Credits are retained here for provenance even where attribution is not required.

## Required Car Concept attribution

Car Concept: model and textures by Eric Chadwick, copyright 2024 Darmstadt Graphics Group GmbH, licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/). [Upstream attribution and modification history](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/CarConcept/README.md). The upstream asset derives from [Unity Fan's CC0 concept-car model](https://sketchfab.com/3d-models/free-concept-car-004-public-domain-cc0-4cba124633eb494eadc3bb0c4660ad7e).

Terra World modifications: removed selected hidden mechanical/interior detail, License and Emblem geometry; replaced source materials and textures with six generic opaque material groups; normalized orientation and proportions; consolidated the body and four wheel assemblies; generated simplified near/far geometry. Headlamp and taillamp geometry and their distinct material groups are preserved at both levels of detail. The exported car GLBs contain no image textures. These are modified derivatives, not the unchanged upstream asset. Retain this attribution and the license link when redistributing them.

The upstream file separately identifies Khronos and 3D Commerce logos under [Khronos trademark terms](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/LICENSES/LicenseRef-LegalMark-Khronos.txt). Those logos are not intentionally included in these derivatives: the relevant geometry is removed and all source image materials are replaced. No affiliation, endorsement, trademark grant, or license to a specific automobile brand is claimed. `crossover` is a local asset category, not an assertion of manufacturer identity.

Wheel-motion correction: removed the source front wheels' baked steering pose
before flattening, keeping each hub and spoke orientation intact. Near/far
variants retain the same wheel geometry to prevent a second decimation from
distorting the rolling silhouette. Wheel geometry counts against the existing
total triangle budgets; body detail takes the remaining far-model budget.

## Other modifications and source files

Trees: imported the Poly Haven 1K glTF assets, retained one fir alternative, flattened transforms, centered at ground level, normalized height to approximately 7.2 scene units, simplified geometry into near/far variants, retained base-color imagery at 512 × 512 pixels, and removed normal/ARM material maps. Textures are embedded in the GLBs; no external buffer or image URLs remain. Far models are actual simplified 3D geometry, not image billboards.

The shuttle bus is a project-authored short-wheelbase urban vehicle with body panels, glazing, lamps, mirrors, and four independently addressable wheel assemblies. Its far version is simplified geometry derived from the same model. It does not derive from Car Concept.

All five standalone surface maps were downloaded as 1K diffuse JPEGs, resized to 512 × 512, and JPEG-reencoded. Each shipped JPEG embeds its source URL, CC0 license URL, retrieval date, and modifications in a JPEG comment. The metadata describes a sourced photograph, not a generation prompt. Re-running the converter replaces the JPEGs, so restore this origin metadata after regeneration.

Direct source locations:

- Broadleaf: [1K glTF](https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/island_tree_02/island_tree_02_1k.gltf); its referenced binary and textures are resolved by the download script.
- Fir: [1K glTF](https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/fir_sapling/fir_sapling_1k.gltf); its referenced binary and textures are resolved by the download script.
- Car: [source GLB](https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CarConcept/glTF-Binary/CarConcept.glb).
- Surfaces: [asphalt](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/asphalt_02/asphalt_02_diff_1k.jpg), [brick](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/red_brick_03/red_brick_03_diff_1k.jpg), [concrete](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete_wall_007/concrete_wall_007_diff_1k.jpg), [slate](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/roof_slates_03/roof_slates_03_diff_1k.jpg), [grass](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/aerial_grass_rock/aerial_grass_rock_diff_1k.jpg).

## Measured delivery budget

Counts below were checked against the exported GLBs and `manifest.json` on 2026-08-30. These are per-model geometry counts and uncompressed file bytes, not frame-time, GPU-memory, or whole-scene triangle measurements.

| Model | Triangles | Bytes |
| --- | ---: | ---: |
| `broadleaf-near.glb` | 16,000 | 1,571,196 |
| `broadleaf-far.glb` | 8,000 | 844,528 |
| `fir-near.glb` | 16,000 | 1,687,844 |
| `fir-far.glb` | 8,000 | 873,924 |
| `crossover-near.glb` | 11,997 | 726,108 |
| `crossover-far.glb` | 7,998 | 507,872 |
| `shuttlebus-near.glb` | 5,632 | 180,356 |
| `shuttlebus-far.glb` | 1,775 | 70,900 |

Eight GLBs total **6,462,728 bytes**. Five 512 × 512 surface JPEGs, including embedded provenance, total **417,766 bytes**. Combined media total: **6,880,494 bytes (6.56 MiB)**, excluding this README and the JSON manifest. This is the available asset set; actual transfer depends on which variants the application loads.
