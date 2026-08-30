# Rivergate: metropolitan city and day/night

The existing 28 playable homes and their repair progression remain intact. Eight new commercial buildings add a taller skyline: a library, science centre, studios, city hub, bookshop, arts centre, café and makers market. Their façades include storefronts, varied upper floors, rooftop gardens or solar panels, and windows. These commercial buildings are scenery, not additional enterable homes.

The road now carries 18 vehicles, including four buses. All use the existing shared road spline, opposing lanes and safe following-distance simulation. Twenty-four streetlights line the road. Twelve additional adults walk on an authored pedestrian boulevard, bringing the ambient population to 32, plus existing home-help residents. They use the connected, grounded character rigs; no backwards-facing replacement animation was introduced.

## Playing

Choose **Day** or **Night** in the game header, in either Town view or Walk around. Night changes the actual 3D sky, ambient and directional light, clouds, moon and stars, streetlights, commercial windows, vehicle headlights and tail lights. The surrounding interface becomes deep blue with warm, readable text. Day restores the daylight palette.

The switch is a presentation setting, not a game turn: it does not repair power, spend resources, advance a challenge, reset the camera, or change an installed home upgrade. The three main homes keep their existing power-dependent window materials. The setting is temporary and returns to Day after a page reload. Existing saved game progress is unaffected.

## Performance and boundaries

Repeated office windows and façade bands are merged by material. Night uses emissive materials and soft vertex-alpha ground-light footprints, retaining only two actual street point lights rather than adding a dynamic light for every lamp or window. The scene is reused when switching time; meshes, materials and lights do not accumulate.

Commercial building bodies block the walking camera. Their footprints are checked against existing homes, the river and motor roads, and all 28 home approaches remain reachable. Pedestrian paths are scripted, not autonomous crowd navigation. The walking mode's existing limitations still apply: no full physics, vehicle collision or seamless walking through exterior doors.

These presentation features are local and introduce no 0G requests or child data uploads. Existing optional 0G-backed guidance and checkpoint flows are unchanged.

## Verification

`apps/web/lib/immersive-town/metropolis.test.ts` covers building clearances, boulevard clearance, intact house registration, repeated day/night switching, camera preservation, resource counts, 18-vehicle following distances and headlights attached to vehicles. The full suite passes 574 tests across 72 files.

Browser checks cover daylight and nighttime in aerial and walking views, phone and desktop layouts, toggle state, retained challenge progress, and the companion panel's night palette.
