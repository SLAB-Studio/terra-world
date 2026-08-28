import type { CityState, PlacedBuilding } from "@terra/campaign-schema";

import type { PlanningSession } from "./placement";
import { createInitialCityState, createRiverValleyWorld } from "./world";

export function makeTestCity(patch: Partial<CityState> = {}): CityState {
  const world = createRiverValleyWorld("turn-fixture", { width: 8, height: 6 });
  const city = createInitialCityState(world, {
    cityId: "turn-test-city",
    campaignId: "turn-test-campaign",
    campaignVersion: 1,
    budget: 2_000,
  });
  return { ...city, ...patch };
}

export function placedBuilding(
  instanceId: string,
  definitionId: string,
  tileId: string,
  index: number,
): PlacedBuilding {
  return {
    instanceId,
    definitionId,
    anchor: { x: index, y: 0 },
    rotation: 0,
    occupiedTileIds: [tileId],
    placedTurn: 1,
  };
}

export function planningWithBuildings(
  city: CityState,
  definitions: readonly string[],
): PlanningSession {
  return {
    baseState: city,
    operations: definitions.map((definitionId, index) => ({
      type: "place" as const,
      building: placedBuilding(
        `${definitionId}-${index + 1}`,
        definitionId,
        city.tiles[index]?.id ?? `missing-${index}`,
        index,
      ),
    })),
    cursor: definitions.length,
  };
}

export const FULL_COVERAGE = {
  waterCoverage: 1,
  electricityCoverage: 1,
  educationCoverage: 1,
  healthcareCoverage: 1,
  transportCoverage: 1,
  natureCoverage: 0.5,
} as const;
