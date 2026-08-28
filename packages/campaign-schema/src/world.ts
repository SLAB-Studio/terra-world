import { z } from "zod";

import {
  CoordinateSchema,
  IdentifierSchema,
  SchemaVersionSchema,
  UnitIntervalSchema,
} from "./primitives";

export const TerrainTypeSchema = z.enum([
  "river",
  "floodplain",
  "meadow",
  "forest",
  "wetland",
  "hillside",
  "rock",
]);

export const ElevationBandSchema = z.enum(["low", "middle", "high"]);
export const ConnectionTypeSchema = z.enum(["road", "water", "electricity"]);

export const TileConnectionsSchema = z
  .object({ road: z.boolean(), water: z.boolean(), electricity: z.boolean() })
  .strict();

export const TileStateSchema = z
  .object({
    id: IdentifierSchema,
    coordinate: CoordinateSchema,
    terrain: TerrainTypeSchema,
    elevation: ElevationBandSchema,
    floodRisk: UnitIntervalSchema,
    habitatValue: UnitIntervalSchema,
    placeable: z.boolean(),
    occupantId: IdentifierSchema.nullable(),
    connections: TileConnectionsSchema,
  })
  .strict();

export const MapMetadataSchema = z
  .object({
    schemaVersion: SchemaVersionSchema,
    id: IdentifierSchema,
    seed: z.string().min(1).max(120),
    width: z.number().int().min(5).max(128),
    height: z.number().int().min(5).max(128),
    mapHash: z.string().regex(/^[a-f0-9]{16}$/),
  })
  .strict();

export const WorldMapSchema = MapMetadataSchema.extend({
  tiles: z.array(TileStateSchema).min(1),
}).superRefine((map, context) => {
  const expectedTileCount = map.width * map.height;
  if (map.tiles.length !== expectedTileCount) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["tiles"],
      message: `Map must contain exactly ${expectedTileCount} tiles`,
    });
  }

  const ids = new Set<string>();
  const coordinates = new Set<string>();
  for (const [index, tile] of map.tiles.entries()) {
    if (ids.has(tile.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tiles", index, "id"],
        message: `Duplicate tile id: ${tile.id}`,
      });
    }
    ids.add(tile.id);

    const coordinateKey = `${tile.coordinate.x},${tile.coordinate.y}`;
    if (coordinates.has(coordinateKey)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tiles", index, "coordinate"],
        message: `Duplicate tile coordinate: ${coordinateKey}`,
      });
    }
    coordinates.add(coordinateKey);

    if (tile.coordinate.x >= map.width || tile.coordinate.y >= map.height) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tiles", index, "coordinate"],
        message: "Tile coordinate is outside map bounds",
      });
    }
  }
});

export type TerrainType = z.infer<typeof TerrainTypeSchema>;
export type ElevationBand = z.infer<typeof ElevationBandSchema>;
export type ConnectionType = z.infer<typeof ConnectionTypeSchema>;
export type TileConnections = z.infer<typeof TileConnectionsSchema>;
export type TileState = z.infer<typeof TileStateSchema>;
export type MapMetadata = z.infer<typeof MapMetadataSchema>;
export type WorldMap = z.infer<typeof WorldMapSchema>;
