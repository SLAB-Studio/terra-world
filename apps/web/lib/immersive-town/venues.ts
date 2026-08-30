import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import { TOWN_VENUES, type TownVenue } from "./venue-catalog";

export type TownVenueMetadata = Readonly<{
  venue: TownVenue;
  root: TransformNode;
  meshes: readonly AbstractMesh[];
  door: Vector3;
  outward: Vector3;
}>;

/** Register the visible geometry, including window batches detached during merging. */
export function registerTownVenues(scene: Scene) {
  const venues: TownVenueMetadata[] = [];
  const byMesh = new Map<number, TownVenueMetadata>();
  for (const venue of TOWN_VENUES) {
    const root = scene.getTransformNodeByName(venue.rootName);
    if (!root) throw new Error(`Missing town destination: ${venue.rootName}`);
    root.computeWorldMatrix(true);
    const meshes = [
      ...new Set([
        ...root.getChildMeshes(),
        ...scene.meshes.filter((mesh) =>
          ["lit", "dark", "bands"].some(
            (suffix) => mesh.name === `${venue.rootName}-${suffix}`,
          ),
        ),
      ]),
    ];
    const entry: TownVenueMetadata = {
      venue,
      root,
      meshes,
      door: Vector3.TransformCoordinates(
        new Vector3(0, 0, venue.doorZ),
        root.getWorldMatrix(),
      ),
      outward: Vector3.TransformNormal(
        new Vector3(0, 0, -1),
        root.getWorldMatrix(),
      ).normalize(),
    };
    for (const mesh of meshes) {
      mesh.isPickable = true;
      mesh.metadata = { ...mesh.metadata, venueId: venue.id };
      byMesh.set(mesh.uniqueId, entry);
    }
    venues.push(entry);
  }
  return {
    venues,
    getVenueFromMesh: (mesh: AbstractMesh | null) =>
      mesh ? (byMesh.get(mesh.uniqueId) ?? null) : null,
  };
}
