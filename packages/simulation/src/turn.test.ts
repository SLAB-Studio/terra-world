import { describe, expect, it } from "vitest";

import { CauseEffectSchema, CityStateSchema } from "@terra/campaign-schema";

import {
  FULL_COVERAGE,
  makeTestCity,
  planningWithBuildings,
} from "./test-fixtures";
import { simulateTurn } from "./turn";

const FIRST_NEIGHBOURHOOD = [
  "road",
  "home",
  "water-pump",
  "water-treatment-plant",
  "solar-array",
] as const;

describe("immutable turn simulation", () => {
  it("matches the first-neighbourhood resource and indicator golden outcome", () => {
    const city = makeTestCity();
    const before = structuredClone(city);
    const planning = planningWithBuildings(city, FIRST_NEIGHBOURHOOD);

    const result = simulateTurn({ city, planning, network: FULL_COVERAGE });

    expect(result.state).toMatchObject({
      turn: 1,
      budget: 1_149,
      population: 2,
      resources: {
        water: { rawSupply: 24, treatedSupply: 16, demand: 2 },
        energy: { generation: 20, stored: 0, storageCapacity: 0, demand: 6 },
        waste: { generated: 0, processed: 0 },
        transport: { capacity: 10, demand: 0 },
        housingCapacity: 8,
        maintenanceDue: 51,
      },
      indicators: {
        water: 100,
        energy: 100,
        nature: 51,
        community: 0.4,
        resilience: 0.5,
      },
    });
    // No battery means surplus electricity cannot be retained.
    expect(result.state.resources.energy.stored).toBe(0);
    expect(result.state.buildings).toHaveLength(5);
    expect(result.state.actionLog.map((action) => action.type)).toEqual([
      "place-building",
      "place-building",
      "place-building",
      "place-building",
      "place-building",
      "advance-turn",
    ]);
    expect(result.causes.map((cause) => cause.phase)).toEqual([
      1, 2, 3, 3, 4, 4, 4, 5,
    ]);
    expect(
      result.causes.every(
        (cause) => CauseEffectSchema.safeParse(cause).success,
      ),
    ).toBe(true);
    expect(CityStateSchema.safeParse(result.state).success).toBe(true);
    expect(city).toEqual(before);
  });

  it("reports a maintenance shortfall without allowing a negative budget", () => {
    const city = makeTestCity({ budget: 805 });
    const result = simulateTurn({
      city,
      planning: planningWithBuildings(city, FIRST_NEIGHBOURHOOD),
      network: FULL_COVERAGE,
    });

    expect(result.state.budget).toBe(0);
    expect(result.state.resources.maintenanceDue).toBe(51);
    expect(
      result.causes.find(
        (cause) => cause.code === "budget.maintenance-shortfall",
      ),
    ).toMatchObject({ severity: "critical", phase: 2 });
  });

  it("uses the supplied network coverage as a narrow deterministic dependency", () => {
    const city = makeTestCity();
    const planning = planningWithBuildings(city, FIRST_NEIGHBOURHOOD);
    const result = simulateTurn({
      city,
      planning,
      network: {
        ...FULL_COVERAGE,
        waterCoverage: 0.5,
        electricityCoverage: 0.25,
      },
    });

    expect(result.state.indicators.water).toBe(50);
    expect(result.state.indicators.energy).toBe(25);
    expect(result.state.population).toBe(0);
  });

  it("rejects a planning session based on a different state", () => {
    const city = makeTestCity();
    const differentReference = structuredClone(city);
    expect(() =>
      simulateTurn({
        city,
        planning: planningWithBuildings(differentReference, []),
        network: FULL_COVERAGE,
      }),
    ).toThrow("Planning session must be based on the supplied city state");
  });
});
