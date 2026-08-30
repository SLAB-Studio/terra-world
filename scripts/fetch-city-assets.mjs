/** Offline sourcing only. Powered by Poly Haven (https://polyhaven.com).
 * node scripts/fetch-city-assets.mjs <empty-source-directory>
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { Buffer } from "node:buffer";
import console from "node:console";
const { fetch } = globalThis;
const root = process.argv[2];
if (!root) throw new Error("Supply a separate empty source directory.");
const inventory = [];
async function save(url, path, expected) {
  const target = resolve(root, path);
  if (!target.startsWith(resolve(root) + "/")) throw new Error("Unsafe path");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const declared = Number(response.headers.get("content-length"));
  if (declared > 60_000_000) throw new Error("Source exceeds asset budget");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (expected && bytes.length !== expected)
    throw new Error("Incomplete asset");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: "wx" });
  inventory.push({ url, path, bytes: bytes.length });
  console.log(path, bytes.length);
}
for (const id of ["island_tree_02", "fir_sapling"]) {
  const info = await (
    await fetch(`https://api.polyhaven.com/files/${id}`)
  ).json();
  const file = info.gltf["1k"].gltf;
  await save(file.url, `${id}/source.gltf`, file.size);
  for (const [path, part] of Object.entries(file.include))
    await save(part.url, `${id}/${path}`, part.size);
}
for (const [name, id] of Object.entries({
  asphalt: "asphalt_02",
  brick: "red_brick_03",
  stone: "concrete_wall_007",
  slate: "roof_slates_03",
  grass: "aerial_grass_rock",
})) {
  const info = await (
    await fetch(`https://api.polyhaven.com/files/${id}`)
  ).json();
  const diffuse = info.diff ?? info.Diffuse;
  await save(
    diffuse["1k"].jpg.url,
    `surfaces/${name}.jpg`,
    diffuse["1k"].jpg.size,
  );
}
const base =
  "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CarConcept/";
await save(base + "glTF-Binary/CarConcept.glb", "car/source.glb");
await save(base + "README.md", "car/UPSTREAM.md");
await writeFile(
  resolve(root, "inventory.json"),
  JSON.stringify(inventory, null, 2),
);
