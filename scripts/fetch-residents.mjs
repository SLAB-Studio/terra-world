/** Fetch only the licensed source files used by convert-residents.py.
 * node scripts/fetch-residents.mjs <empty-source-directory> [upstream-revision]
 * Conversion is offline. The game never contacts GitHub or a model provider.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import process from "node:process";
import { Buffer } from "node:buffer";
import console from "node:console";
const { fetch } = globalThis;

const destination = process.argv[2];
if (!destination)
  throw new Error(
    "Provide a separate source directory, outside public assets.",
  );
const revision = process.argv[3] ?? "master";
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
];
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
        people.some((person) => file.path.includes(`/${person}/`)) &&
        (/\/Export\/[^/]+(?<!_facial)\.fbx$/.test(file.path) ||
          /_color\.tga$/.test(file.path))) ||
      clips.some(
        (clip) =>
          file.path ===
          `Assets/Animations/all_animations_max_motextr_${clip.includes("walk") ? "xy" : "static"}/${clip}.max.fbx`,
      )),
);
let cursor = 0;
await Promise.all(
  Array.from({ length: 2 }, async () => {
    while (cursor < files.length) {
      const file = files[cursor++];
      const target = resolve(destination, file.path);
      if (!target.startsWith(resolve(destination) + "/"))
        throw new Error("Unsafe upstream asset path");
      const request = await fetch(
        base + file.path.split("/").map(encodeURIComponent).join("/"),
      );
      if (!request.ok)
        throw new Error(`Cannot download ${file.path}: ${request.status}`);
      const bytes = Buffer.from(await request.arrayBuffer());
      if (bytes.length !== file.size)
        throw new Error(`Incomplete asset: ${file.path}`);
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
