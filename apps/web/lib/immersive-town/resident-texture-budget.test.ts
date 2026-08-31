import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import catalog from "../../public/models/residents/conversion.json";

function imageDimensions(bytes: Buffer, mime: string): [number, number] {
  if (mime === "image/png")
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  if (mime !== "image/jpeg" || bytes.readUInt16BE(0) !== 0xffd8)
    throw new Error("Unexpected embedded resident texture format");
  // JPEG dimensions live in the frame marker, not in its APP/EXIF header.
  for (let offset = 2; offset < bytes.length - 8;) {
    if (bytes[offset] !== 0xff) throw new Error("Malformed JPEG marker");
    const marker = bytes[offset + 1]!;
    if ([0xc0, 0xc1, 0xc2].includes(marker))
      return [bytes.readUInt16BE(offset + 7), bytes.readUInt16BE(offset + 5)];
    offset += bytes.readUInt16BE(offset + 2) + 2;
  }
  throw new Error("Missing JPEG frame dimensions");
}

describe("resident texture and provenance budget", () => {
  it.each(catalog)(
    "$id embeds only 512px source textures in both details",
    ({ id }) => {
      for (const detail of ["near", "far"]) {
        const bytes = readFileSync(
          new URL(
            `../../public/models/residents/${id}-${detail}.glb`,
            import.meta.url,
          ),
        );
        const jsonLength = bytes.readUInt32LE(12);
        const gltf = JSON.parse(
          bytes.subarray(20, 20 + jsonLength).toString("utf8"),
        );
        for (const texture of gltf.images) {
          expect(texture.uri).toBeUndefined();
          const view = gltf.bufferViews[texture.bufferView];
          const start = 28 + jsonLength + (view.byteOffset ?? 0);
          expect(
            imageDimensions(
              bytes.subarray(start, start + view.byteLength),
              texture.mimeType,
            ),
          ).toEqual([512, 512]);
        }
      }
    },
  );

  it("documents every original source under the pinned MIT release", () => {
    const readme = readFileSync(
      new URL("../../public/models/residents/README.md", import.meta.url),
      "utf8",
    );
    const license = readFileSync(
      new URL(
        "../../public/models/residents/LICENSE-Microsoft.txt",
        import.meta.url,
      ),
      "utf8",
    );
    expect(readme).toContain("0943055db6ec570bcef9f2c8b41c9e5467c808f9");
    expect(license).toContain("Permission is hereby granted");
    expect(new Set(catalog.map((entry) => entry.source)).size).toBe(
      catalog.length,
    );
    for (const entry of catalog) {
      expect(entry.license).toBe("MIT");
      expect(readme).toContain(entry.source);
    }
  });
});
