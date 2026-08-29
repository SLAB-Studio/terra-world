import type { CityStage } from "@terra/campaign-schema";

/**
 * Authoritative registry for non-instance-specific causes produced or consumed
 * by the deterministic simulation. Add a code here before an engine emitter or
 * evaluator can use it as a typed static cause.
 */
export const RUNTIME_STATIC_CAUSE_CODES = [
  "construction.committed",
  "water.reliability-calculated",
  "energy.reliability-calculated",
  "budget.maintenance-paid",
  "budget.maintenance-shortfall",
  "community.services-impact",
  "community.population-change",
  "community.population-growth",
  "community.resilience-impact",
  "waste.processing-balance",
  "transport.congestion-calculated",
  "nature.pollution-impact",
  "nature.city-impact",
] as const;

export type RuntimeStaticCauseCode =
  (typeof RUNTIME_STATIC_CAUSE_CODES)[number];

export type EventCauseCode<EventId extends string = string> =
  `event.${EventId}`;
export type MilestoneCauseCode<MilestoneId extends string = string> =
  `milestone.${MilestoneId}`;
export type StageTransitionCauseCode<
  From extends CityStage = CityStage,
  To extends CityStage = CityStage,
> = `stage.${From}-to-${To}`;

export type RuntimeDynamicCauseCode =
  EventCauseCode | MilestoneCauseCode | StageTransitionCauseCode;

export type RuntimeCauseCode = RuntimeStaticCauseCode | RuntimeDynamicCauseCode;

export function eventCauseCode<const EventId extends string>(
  eventId: EventId,
): EventCauseCode<EventId> {
  return `event.${eventId}`;
}

export function milestoneCauseCode<const MilestoneId extends string>(
  milestoneId: MilestoneId,
): MilestoneCauseCode<MilestoneId> {
  return `milestone.${milestoneId}`;
}

export function stageTransitionCauseCode<
  const From extends CityStage,
  const To extends CityStage,
>(from: From, to: To): StageTransitionCauseCode<From, To> {
  return `stage.${from}-to-${to}`;
}
