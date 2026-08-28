import type { BuildingId } from "../catalogue";

export const RIVERGATE_CAUSE_CODES = [
  "construction.committed",
  "water.reliability-calculated",
  "energy.reliability-calculated",
  "budget.maintenance-paid",
  "budget.maintenance-shortfall",
  "community.services-impact",
  "community.population-change",
  "event.chapter-1-river-rain",
] as const;

export type RivergateCauseCode = (typeof RIVERGATE_CAUSE_CODES)[number];

export type ScenarioRule =
  | {
      readonly type: "building-count";
      readonly id: string;
      readonly buildingId: BuildingId;
      readonly minimum: number;
      readonly causeCode: RivergateCauseCode;
      readonly explanationKey: string;
      readonly hintKey: string;
    }
  | {
      readonly type: "treated-water-balance";
      readonly id: string;
      readonly minimumQuality: number;
      readonly causeCode: RivergateCauseCode;
      readonly explanationKey: string;
      readonly hintKey: string;
    }
  | {
      readonly type: "home-water-connections";
      readonly id: string;
      readonly minimumConnectedHomes: number;
      readonly causeCode: RivergateCauseCode;
      readonly explanationKey: string;
      readonly hintKey: string;
    }
  | {
      readonly type: "maximum-flood-exposure";
      readonly id: string;
      readonly buildingIds: readonly BuildingId[];
      readonly maximumRisk: number;
      readonly causeCode: RivergateCauseCode;
      readonly explanationKey: string;
      readonly hintKey: string;
    }
  | {
      readonly type: "day-generation-balance";
      readonly id: string;
      readonly causeCode: RivergateCauseCode;
      readonly explanationKey: string;
      readonly hintKey: string;
    }
  | {
      readonly type: "night-storage-balance";
      readonly id: string;
      readonly causeCode: RivergateCauseCode;
      readonly explanationKey: string;
      readonly hintKey: string;
    }
  | {
      /** The clinic is a declared critical load, not an extra building mechanic. */
      readonly type: "reserved-clinic-load";
      readonly id: string;
      readonly buildingId: "clinic";
      readonly requiredSupply: number;
      readonly causeCode: RivergateCauseCode;
      readonly explanationKey: string;
      readonly hintKey: string;
    }
  | {
      readonly type: "maintenance-affordable";
      readonly id: string;
      readonly causeCode: RivergateCauseCode;
      readonly explanationKey: string;
      readonly hintKey: string;
    };

export type ScenarioDefinition = {
  readonly id: string;
  readonly chapterId: "chapter-1-water" | "chapter-2-power";
  readonly titleKey: string;
  readonly successCauseCodes: readonly RivergateCauseCode[];
  readonly rules: readonly ScenarioRule[];
};

export type RivergateScenarioSnapshot = {
  readonly buildingCounts: Readonly<Partial<Record<BuildingId, number>>>;
  readonly water: {
    readonly rawSupply: number;
    readonly treatedSupply: number;
    readonly demand: number;
    /** Percentage from 0 to 100 after treatment. */
    readonly quality: number;
    readonly connectedHomes: number;
    readonly homeCount: number;
    /** Highest risk among water buildings, keyed by existing building id. */
    readonly floodRiskByBuilding: Readonly<Partial<Record<BuildingId, number>>>;
  };
  readonly energy: {
    readonly dayGeneration: number;
    readonly dayDemand: number;
    readonly nightGeneration: number;
    readonly nightDemand: number;
    readonly storedAtNight: number;
    readonly storageCapacity: number;
    readonly clinicSupply: number;
  };
  readonly budget: {
    readonly availableForMaintenance: number;
    readonly maintenanceDue: number;
  };
};

export type ScenarioFailure = {
  readonly ruleId: string;
  readonly causeCode: RivergateCauseCode;
  readonly explanationKey: string;
  readonly hintKey: string;
};

export type EnergyPath =
  "blackout" | "solar-only" | "solar-plus-storage" | "stable-grid";

export type ScenarioEvaluation = {
  readonly scenarioId: string;
  readonly complete: boolean;
  readonly passedRuleIds: readonly string[];
  readonly failures: readonly ScenarioFailure[];
  readonly causeCodes: readonly RivergateCauseCode[];
  readonly energyPath: EnergyPath | null;
};
