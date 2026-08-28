import type {
  CampaignEvent,
  CityMetric,
  CityStage,
  CityState,
  Milestone,
  ProgressCondition,
} from "@terra/campaign-schema";

export type StageTransitionDefinition = {
  readonly id: string;
  readonly from: CityStage;
  readonly to: CityStage;
  readonly conditions: readonly ProgressCondition[];
};

export type ProgressionResult = {
  readonly state: CityState;
  readonly earnedMilestoneIds: readonly string[];
  readonly transition: StageTransitionDefinition | null;
};

export type ProgressionContext = {
  readonly milestones?: readonly Milestone[];
  readonly events?: readonly CampaignEvent[];
  readonly transitions?: readonly StageTransitionDefinition[];
};

type Comparison = "eq" | "gte" | "lte" | "gt" | "lt";

export function evaluateProgressCondition(
  city: CityState,
  condition: ProgressCondition,
  events: readonly CampaignEvent[] = [],
): boolean {
  switch (condition.type) {
    case "metric":
      return compare(
        readMetric(city, condition.metric),
        condition.comparison,
        condition.value,
      );
    case "building-count":
      return compare(
        city.buildings.filter(
          (building) => building.definitionId === condition.buildingId,
        ).length,
        condition.comparison,
        condition.value,
      );
    case "event-completed": {
      const event = events.find(
        (candidate) => candidate.id === condition.eventId,
      );
      return event !== undefined && event.scheduledTurn <= city.turn;
    }
    case "milestone-earned":
      return city.milestones.includes(condition.milestoneId);
    case "turn":
      return compare(city.turn, condition.comparison, condition.value);
  }
}

export function detectMilestones(
  city: CityState,
  milestones: readonly Milestone[],
  events: readonly CampaignEvent[] = [],
): { state: CityState; earnedMilestoneIds: readonly string[] } {
  let state = city;
  const earned: string[] = [];
  const remaining = milestones
    .filter((milestone) => !state.milestones.includes(milestone.id))
    .sort((left, right) => left.id.localeCompare(right.id));

  // Iterate so a milestone may explicitly depend on another earned in this pass.
  let changed = true;
  while (changed) {
    changed = false;
    for (const milestone of remaining) {
      if (state.milestones.includes(milestone.id)) continue;
      if (
        milestone.conditions.every((condition) =>
          evaluateProgressCondition(state, condition, events),
        )
      ) {
        state = { ...state, milestones: [...state.milestones, milestone.id] };
        earned.push(milestone.id);
        changed = true;
      }
    }
  }

  return { state, earnedMilestoneIds: earned };
}

export function advanceProgression(
  city: CityState,
  context: ProgressionContext,
): ProgressionResult {
  const milestoneResult = detectMilestones(
    city,
    context.milestones ?? [],
    context.events ?? [],
  );
  const transition = (context.transitions ?? [])
    .filter((candidate) => candidate.from === milestoneResult.state.stage)
    .sort((left, right) => left.id.localeCompare(right.id))
    .find((candidate) =>
      candidate.conditions.every((condition) =>
        evaluateProgressCondition(
          milestoneResult.state,
          condition,
          context.events ?? [],
        ),
      ),
    );

  if (transition === undefined) {
    return { ...milestoneResult, transition: null };
  }
  return {
    state: { ...milestoneResult.state, stage: transition.to },
    earnedMilestoneIds: milestoneResult.earnedMilestoneIds,
    transition,
  };
}

function readMetric(city: CityState, metric: CityMetric): number {
  if (metric === "population" || metric === "budget") return city[metric];
  if (metric === "pollution") return 100 - city.indicators.nature;
  if (metric === "biodiversity") return city.indicators.nature;
  return city.indicators[metric];
}

function compare(
  actual: number,
  comparison: Comparison,
  expected: number,
): boolean {
  switch (comparison) {
    case "eq":
      return actual === expected;
    case "gte":
      return actual >= expected;
    case "lte":
      return actual <= expected;
    case "gt":
      return actual > expected;
    case "lt":
      return actual < expected;
  }
}
