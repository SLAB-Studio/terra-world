import {
  CauseEffectSchema,
  CityMetricSchema,
  CityStageSchema,
  CityStateSchema,
  IdentifierSchema,
  MessageKeySchema,
  MissionSchema,
  PercentageSchema,
  ProgressConditionSchema,
  RotationSchema,
  TurnActionSchema,
  type CauseEffect,
  type CityState,
  type Mission,
  type ProgressCondition,
  type TurnAction,
} from "@terra/campaign-schema";
import { z } from "zod";

import { assertNoProhibitedComputeData } from "./prohibited-data";

export const CITY_GUIDE_LIMITS = {
  allowedFacts: 12,
  buildingKinds: 24,
  causes: 12,
  causeChanges: 8,
  memories: 5,
  memoryCauseCodes: 6,
  missionObjectives: 8,
  personalityTraits: 3,
} as const;

export const CityGuideAgeBandSchema = z.enum(["8-10", "11-13"]);
export const CityGuideTaskSchema = z.enum([
  "explain",
  "hint",
  "react",
  "memory",
]);

export const CityPersonalityTraitSchema = z.enum([
  "careful-planner",
  "curious-builder",
  "kind-neighbour",
  "nature-friend",
  "resourceful-helper",
  "resilient-thinker",
]);

export const SafeCityPersonalitySchema = z
  .object({
    voice: z.enum(["calm", "cheerful", "curious", "hopeful"]),
    pace: z.enum(["brief", "step-by-step"]),
    traits: z
      .array(CityPersonalityTraitSchema)
      .max(CITY_GUIDE_LIMITS.personalityTraits)
      .superRefine(uniqueValues("personality trait")),
  })
  .strict();

export const SafeCityMemorySchema = z
  .object({
    milestoneId: IdentifierSchema,
    earnedTurn: z.number().int().nonnegative().max(10_000),
    factKey: MessageKeySchema,
    causeCodes: z
      .array(MessageKeySchema)
      .max(CITY_GUIDE_LIMITS.memoryCauseCodes)
      .superRefine(uniqueValues("memory cause code")),
    trait: CityPersonalityTraitSchema.optional(),
  })
  .strict();

const SafeMissionViewSchema = z
  .object({
    missionId: IdentifierSchema,
    titleKey: MessageKeySchema,
    briefingKey: MessageKeySchema,
    objectiveKeys: z
      .array(MessageKeySchema)
      .min(1)
      .max(CITY_GUIDE_LIMITS.missionObjectives),
    objectiveConditions: z
      .array(ProgressConditionSchema)
      .min(1)
      .max(CITY_GUIDE_LIMITS.missionObjectives),
    allowedBuildingIds: z
      .array(IdentifierSchema)
      .max(CITY_GUIDE_LIMITS.buildingKinds)
      .superRefine(uniqueValues("allowed building id")),
  })
  .strict();

const BuildingCountSchema = z
  .object({
    buildingId: IdentifierSchema,
    count: z.number().int().positive(),
  })
  .strict();

const SafeResourceSnapshotSchema = z
  .object({
    rawWaterSupply: z.number().finite().nonnegative(),
    treatedWaterSupply: z.number().finite().nonnegative(),
    waterDemand: z.number().finite().nonnegative(),
    energyGeneration: z.number().finite().nonnegative(),
    storedEnergy: z.number().finite().nonnegative(),
    energyStorageCapacity: z.number().finite().nonnegative(),
    energyDemand: z.number().finite().nonnegative(),
    wasteGenerated: z.number().finite().nonnegative(),
    wasteProcessed: z.number().finite().nonnegative(),
    transportCapacity: z.number().finite().nonnegative(),
    transportDemand: z.number().finite().nonnegative(),
    housingCapacity: z.number().finite().nonnegative(),
    maintenanceDue: z.number().finite().nonnegative(),
  })
  .strict();

const IndicatorSnapshotSchema = z
  .object({
    turn: z.number().int().nonnegative(),
    stage: CityStageSchema,
    population: z.number().int().nonnegative(),
    budget: z.number().finite().nonnegative(),
    indicators: z
      .object({
        water: PercentageSchema,
        energy: PercentageSchema,
        nature: PercentageSchema,
        community: PercentageSchema,
        resilience: PercentageSchema,
      })
      .strict(),
    resources: SafeResourceSnapshotSchema,
    buildings: z
      .array(BuildingCountSchema)
      .max(CITY_GUIDE_LIMITS.buildingKinds),
  })
  .strict();

const SafeActionSummarySchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("place-building"),
      turn: z.number().int().nonnegative(),
      buildingId: IdentifierSchema,
      anchor: z
        .object({
          x: z.number().int().nonnegative(),
          y: z.number().int().nonnegative(),
        })
        .strict(),
      rotation: RotationSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("remove-building"),
      turn: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      type: z.literal("advance-turn"),
      turn: z.number().int().nonnegative(),
    })
    .strict(),
]);

const SafeCauseViewSchema = z
  .object({
    code: MessageKeySchema,
    category: z.enum([
      "construction",
      "water",
      "energy",
      "nature",
      "community",
      "budget",
      "event",
    ]),
    severity: z.enum(["positive", "neutral", "warning", "critical"]),
    changes: z
      .array(
        z
          .object({
            metric: CityMetricSchema,
            before: z.number().finite(),
            after: z.number().finite(),
            delta: z.number().finite(),
          })
          .strict(),
      )
      .max(CITY_GUIDE_LIMITS.causeChanges),
  })
  .strict();

export const CityGuideRequestSchema = z
  .object({
    schemaVersion: z.literal(1),
    ageBand: CityGuideAgeBandSchema,
    task: CityGuideTaskSchema,
    cityPersonality: SafeCityPersonalitySchema,
    mission: SafeMissionViewSchema,
    before: IndicatorSnapshotSchema,
    action: SafeActionSummarySchema,
    after: IndicatorSnapshotSchema,
    causes: z.array(SafeCauseViewSchema).max(CITY_GUIDE_LIMITS.causes),
    allowedFactKeys: z
      .array(MessageKeySchema)
      .max(CITY_GUIDE_LIMITS.allowedFacts)
      .superRefine(uniqueValues("allowed fact key")),
    relevantMemories: z
      .array(SafeCityMemorySchema)
      .max(CITY_GUIDE_LIMITS.memories),
  })
  .strict();

export type CityGuideAgeBand = z.infer<typeof CityGuideAgeBandSchema>;
export type CityGuideTask = z.infer<typeof CityGuideTaskSchema>;
export type SafeCityPersonality = z.infer<typeof SafeCityPersonalitySchema>;
export type SafeCityMemory = z.infer<typeof SafeCityMemorySchema>;
export type CityGuideRequest = z.infer<typeof CityGuideRequestSchema>;

export type CityGuideProjectionInput = {
  readonly ageBand: CityGuideAgeBand;
  readonly task: CityGuideTask;
  readonly cityPersonality: SafeCityPersonality;
  readonly mission: Mission;
  readonly before: CityState;
  readonly action: TurnAction;
  readonly after: CityState;
  readonly causes: readonly CauseEffect[];
  readonly allowedFactKeys: readonly string[];
  readonly relevantMemories: readonly SafeCityMemory[];
};

/**
 * Builds the only object shape that may be serialized for 0G Compute.
 * Full city records are reduced to simulation facts; action identifiers, map
 * data, city IDs, seeds, tiles, and profiles are intentionally not projected.
 */
export function projectCityGuideRequest(
  source: CityGuideProjectionInput,
): CityGuideRequest {
  const mission = MissionSchema.parse(source.mission);
  const before = CityStateSchema.parse(source.before);
  const action = TurnActionSchema.parse(source.action);
  const after = CityStateSchema.parse(source.after);
  const causes = z
    .array(CauseEffectSchema)
    .max(CITY_GUIDE_LIMITS.causes)
    .parse(source.causes);

  validateSourceConsistency({ before, action, after, mission });
  validateAllowedFacts(source.allowedFactKeys, mission);

  const request = CityGuideRequestSchema.parse({
    schemaVersion: 1,
    ageBand: source.ageBand,
    task: source.task,
    cityPersonality: source.cityPersonality,
    mission: {
      missionId: mission.id,
      titleKey: mission.titleKey,
      briefingKey: mission.briefingKey,
      objectiveKeys: mission.objectives.map(
        (objective) => objective.descriptionKey,
      ),
      objectiveConditions: mission.objectives.map((objective) =>
        projectCondition(objective.condition),
      ),
      allowedBuildingIds: [...mission.allowedBuildingIds],
    },
    before: projectSnapshot(before),
    action: projectAction(action),
    after: projectSnapshot(after),
    causes: causes.map((cause) => projectCause(cause)),
    allowedFactKeys: [...source.allowedFactKeys],
    relevantMemories: source.relevantMemories.map((memory) => ({
      milestoneId: memory.milestoneId,
      earnedTurn: memory.earnedTurn,
      factKey: memory.factKey,
      causeCodes: [...memory.causeCodes],
      ...(memory.trait === undefined ? {} : { trait: memory.trait }),
    })),
  });

  assertNoProhibitedComputeData(request);
  return request;
}

/** Serializes a validated, privacy-scanned request for the future Router client. */
export function serializeCityGuideRequest(input: unknown): string {
  const request = CityGuideRequestSchema.parse(input);
  assertNoProhibitedComputeData(request);
  return JSON.stringify(request);
}

function projectSnapshot(
  city: CityState,
): z.infer<typeof IndicatorSnapshotSchema> {
  const counts = new Map<string, number>();
  for (const building of city.buildings) {
    counts.set(
      building.definitionId,
      (counts.get(building.definitionId) ?? 0) + 1,
    );
  }

  return {
    turn: city.turn,
    stage: city.stage,
    population: city.population,
    budget: city.budget,
    indicators: { ...city.indicators },
    resources: {
      rawWaterSupply: city.resources.water.rawSupply,
      treatedWaterSupply: city.resources.water.treatedSupply,
      waterDemand: city.resources.water.demand,
      energyGeneration: city.resources.energy.generation,
      storedEnergy: city.resources.energy.stored,
      energyStorageCapacity: city.resources.energy.storageCapacity,
      energyDemand: city.resources.energy.demand,
      wasteGenerated: city.resources.waste.generated,
      wasteProcessed: city.resources.waste.processed,
      transportCapacity: city.resources.transport.capacity,
      transportDemand: city.resources.transport.demand,
      housingCapacity: city.resources.housingCapacity,
      maintenanceDue: city.resources.maintenanceDue,
    },
    buildings: [...counts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([buildingId, count]) => ({ buildingId, count })),
  };
}

function projectAction(
  action: TurnAction,
): z.infer<typeof SafeActionSummarySchema> {
  if (action.type === "place-building") {
    return {
      type: action.type,
      turn: action.turn,
      buildingId: action.buildingId,
      anchor: { ...action.anchor },
      rotation: action.rotation,
    };
  }

  return { type: action.type, turn: action.turn };
}

function projectCause(cause: CauseEffect): z.infer<typeof SafeCauseViewSchema> {
  return {
    code: cause.code,
    category: cause.category,
    severity: cause.severity,
    changes: cause.changes.map((change) => ({ ...change })),
  };
}

function projectCondition(condition: ProgressCondition): ProgressCondition {
  switch (condition.type) {
    case "metric":
      return {
        type: condition.type,
        metric: condition.metric,
        comparison: condition.comparison,
        value: condition.value,
      };
    case "building-count":
      return {
        type: condition.type,
        buildingId: condition.buildingId,
        comparison: condition.comparison,
        value: condition.value,
      };
    case "event-completed":
      return { type: condition.type, eventId: condition.eventId };
    case "milestone-earned":
      return { type: condition.type, milestoneId: condition.milestoneId };
    case "turn":
      return {
        type: condition.type,
        comparison: condition.comparison,
        value: condition.value,
      };
  }
}

function validateSourceConsistency(input: {
  readonly before: CityState;
  readonly action: TurnAction;
  readonly after: CityState;
  readonly mission: Mission;
}): void {
  const identityFields = [
    "cityId",
    "campaignId",
    "campaignVersion",
    "seed",
    "mapId",
    "mapHash",
  ] as const;
  for (const field of identityFields) {
    if (input.before[field] !== input.after[field]) {
      throw new Error(`Guide city snapshots disagree on ${field}`);
    }
  }

  if (input.after.turn < input.before.turn) {
    throw new Error("Guide after-state cannot precede the before-state");
  }
  if (
    !input.after.actionLog.some((loggedAction) =>
      actionsMatch(loggedAction, input.action),
    )
  ) {
    throw new Error("Guide action is not present in the verified after-state");
  }
  if (
    input.action.type === "place-building" &&
    !input.mission.allowedBuildingIds.includes(input.action.buildingId)
  ) {
    throw new Error("Guide action is not allowed by the verified mission");
  }
}

function actionsMatch(left: TurnAction, right: TurnAction): boolean {
  if (
    left.type !== right.type ||
    left.actionId !== right.actionId ||
    left.turn !== right.turn ||
    left.sequence !== right.sequence
  ) {
    return false;
  }

  if (left.type === "place-building" && right.type === "place-building") {
    return (
      left.buildingId === right.buildingId &&
      left.instanceId === right.instanceId &&
      left.anchor.x === right.anchor.x &&
      left.anchor.y === right.anchor.y &&
      left.rotation === right.rotation
    );
  }
  if (left.type === "remove-building" && right.type === "remove-building") {
    return left.instanceId === right.instanceId;
  }
  return left.type === "advance-turn" && right.type === "advance-turn";
}

function validateAllowedFacts(
  allowedFactKeys: readonly string[],
  mission: Mission,
): void {
  if (allowedFactKeys.length > CITY_GUIDE_LIMITS.allowedFacts) {
    throw new Error("Guide request has too many allowed facts");
  }
  for (const factKey of allowedFactKeys) {
    if (!mission.learningFactKeys.includes(factKey)) {
      throw new Error(
        `Guide fact is not allowlisted by the mission: ${factKey}`,
      );
    }
  }
}

function uniqueValues(label: string) {
  return (values: readonly string[], context: z.RefinementCtx): void => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      if (seen.has(value)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: `Duplicate ${label}: ${value}`,
        });
      }
      seen.add(value);
    });
  };
}
