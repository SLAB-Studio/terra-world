/** Fetch only the licensed source files used by convert-residents.py.
 * node scripts/fetch-residents.mjs <empty-source-directory> [upstream-revision] [source-model-id ...]
 * Conversion is offline. The game never contacts GitHub or a model provider.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import process from "node:process";
import { Buffer } from "node:buffer";
import console from "node:console";
const { fetch, AbortSignal } = globalThis;

const destination = process.argv[2];
if (!destination)
  throw new Error(
    "Provide a separate source directory, outside public assets.",
  );
// Reproduction must not silently follow mutable upstream branches.
const revision = process.argv[3] ?? "0943055db6ec570bcef9f2c8b41c9e5467c808f9";
const repo = "microsoft/Microsoft-Rocketbox";
const base = `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(revision)}/`;
const response = await fetch(
  `https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(revision)}?recursive=1`,
);
if (!response.ok)
  throw new Error(`Cannot read upstream inventory: ${response.status}`);
const inventory = await response.json();
const people = [
  "Male_Adult_12",
  "Male_Adult_06",
  "Female_Adult_01",
  "Female_Adult_11",
  "Male_Child_01",
  "Female_Child_01",
  "Male_Adult_03",
  "Male_Adult_04",
  "Female_Adult_03",
  "Female_Adult_06",
  "Male_Adult_09",
  "Male_Child_02",
];
const requestedPeople = process.argv.slice(4);
if (requestedPeople.some((person) => !people.includes(person)))
  throw new Error("Unknown resident source model ID");
const selectedPeople = requestedPeople.length ? requestedPeople : people;
const clips = [
  "m_walk_neutral_01",
  "f_walk_neutral_01",
  "m_idle_breathe_01",
  "f_idle_breathe_01",
  "m_gestic_talk_neutral_01",
  "f_gestic_talk_neutral_01",
];
const files = inventory.tree.filter(
  (file) =>
    file.type === "blob" &&
    (file.path === "LICENSE.md" ||
      (file.path.startsWith("Assets/Avatars/") &&
        selectedPeople.some((person) => file.path.includes(`/${person}/`)) &&
        (/\/Export\/[^/]+(?<!_facial)\.fbx$/.test(file.path) ||
          /_color\.tga$/.test(file.path))) ||
      clips.some(
        (clip) =>
          file.path ===
          `Assets/Animations/all_animations_max_motextr_${clip.includes("walk") ? "xy" : "static"}/${clip}.max.fbx`,
      )),
);
function isVerified(bytes, file) {
  return (
    bytes.length === file.size &&
    createHash("sha1")
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest("hex") === file.sha
  );
}
let cursor = 0;
await Promise.all(
  Array.from({ length: 2 }, async () => {
    while (cursor < files.length) {
      const file = files[cursor++];
      const target = resolve(destination, file.path);
      if (!target.startsWith(resolve(destination) + "/"))
        throw new Error("Unsafe upstream asset path");
      // Resume a partial source fetch only when its bytes match the pinned
      // Git blob. Never overwrite an unexpected existing source file.
      try {
        const existing = await readFile(target);
        if (!isVerified(existing, file))
          throw new Error(`Unexpected existing asset: ${file.path}`);
        console.log(`Verified ${file.path}`);
        continue;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      let bytes;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const request = await fetch(
            base + file.path.split("/").map(encodeURIComponent).join("/"),
            { signal: AbortSignal.timeout(120_000) },
          );
          if (!request.ok)
            throw new Error(`Cannot download ${file.path}: ${request.status}`);
          bytes = Buffer.from(await request.arrayBuffer());
          if (!isVerified(bytes, file))
            throw new Error(`Incomplete asset: ${file.path}`);
          break;
        } catch (error) {
          if (attempt === 2) throw error;
          console.log(`Retry ${attempt + 1}: ${file.path}`);
        }
      }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes, { flag: "wx" });
      console.log(file.path);
    }
  }),
);
await writeFile(
  resolve(destination, "source-inventory.json"),
  JSON.stringify({ repo, revision, tree: inventory.sha, files }, null, 2) +
    "\n",
  { flag: "wx" },
);
