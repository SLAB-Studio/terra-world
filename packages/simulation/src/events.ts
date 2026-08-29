import type {
  CampaignEvent,
  CauseEffect,
  CityMetric,
  CityState,
} from "@terra/campaign-schema";

import { eventCauseCode } from "./cause-codes";
import { deterministicHash } from "./hash";

export type ScheduledEventResult = {
  readonly state: CityState;
  readonly causes: readonly CauseEffect[];
  readonly firedEventIds: readonly string[];
};

/** A portable seeded value in [0, 1); it never reads ambient randomness. */
export function seededUnitInterval(seed: string, scope: string): number {
  const hash = deterministicHash({ seed, scope });
  const value = Number.parseInt(hash.slice(0, 13), 16);
  return value / 0x10_0000_0000_0000;
}

/** Stable event ordering makes replays independent of campaign array order. */
export function eventsForTurn(
  events: readonly CampaignEvent[],
  turn: number,
): CampaignEvent[] {
  return events
    .filter((event) => event.scheduledTurn === turn)
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function applyScheduledEvents(
  city: CityState,
  events: readonly CampaignEvent[],
): ScheduledEventResult {
  let state = city;
  const causes: CauseEffect[] = [];
  const firedEventIds: string[] = [];

  for (const event of eventsForTurn(events, city.turn)) {
    const sourceTileIds = eventSourceTiles(state, event);
    const changes: CauseEffect["changes"] = [];

    for (const effect of event.effects) {
      const applied = applyMetricEffect(state, effect.metric, effect.amount);
      state = applied.state;
      changes.push(applied.change);
    }

    causes.push({
      code: eventCauseCode(event.id),
      category: "event",
      severity: eventSeverity(event, changes),
      phase: 6,
      sourceBuildingIds: [],
      sourceTileIds,
      changes,
    });
    firedEventIds.push(event.id);
  }

  return { state, causes, firedEventIds };
}

function eventSourceTiles(city: CityState, event: CampaignEvent): string[] {
  if (event.kind !== "rain" && event.kind !== "storm") return [];

  const ranked = city.tiles
    .map((tile) => ({
      id: tile.id,
      floodRisk: tile.floodRisk,
      tieBreaker: seededUnitInterval(city.seed, `${event.id}:${tile.id}`),
    }))
    .sort(
      (left, right) =>
        right.floodRisk - left.floodRisk ||
        left.tieBreaker - right.tieBreaker ||
        left.id.localeCompare(right.id),
    );
  return ranked
    .slice(0, Math.min(event.magnitude, ranked.length))
    .map(({ id }) => id);
}

function applyMetricEffect(
  city: CityState,
  metric: CityMetric,
  amount: number,
): { state: CityState; change: CauseEffect["changes"][number] } {
  const before = readMetric(city, metric);
  const after = normalizeMetric(metric, before + amount);
  const state = writeMetric(city, metric, after);
  return {
    state,
    change: { metric, before, after, delta: after - before },
  };
}

function readMetric(city: CityState, metric: CityMetric): number {
  if (metric === "population" || metric === "budget") return city[metric];
  if (metric === "pollution") return 100 - city.indicators.nature;
  if (metric === "biodiversity") return city.indicators.nature;
  return city.indicators[metric];
}

function writeMetric(
  city: CityState,
  metric: CityMetric,
  value: number,
): CityState {
  if (metric === "population") return { ...city, population: value };
  if (metric === "budget") return { ...city, budget: value };
  if (metric === "pollution") {
    return {
      ...city,
      indicators: { ...city.indicators, nature: clampPercentage(100 - value) },
    };
  }
  if (metric === "biodiversity") {
    return {
      ...city,
      indicators: { ...city.indicators, nature: clampPercentage(value) },
    };
  }
  return {
    ...city,
    indicators: { ...city.indicators, [metric]: value },
  };
}

function normalizeMetric(metric: CityMetric, value: number): number {
  if (metric === "population") return Math.max(0, Math.round(value));
  if (metric === "budget") return Math.max(0, round(value));
  return clampPercentage(value);
}

function eventSeverity(
  event: CampaignEvent,
  changes: CauseEffect["changes"],
): CauseEffect["severity"] {
  const net = changes.reduce((total, change) => {
    const direction = change.metric === "pollution" ? -1 : 1;
    return total + change.delta * direction;
  }, 0);
  if (net > 0) return "positive";
  if (net === 0) return "neutral";
  return event.magnitude >= 4 ? "critical" : "warning";
}

function clampPercentage(value: number): number {
  return Math.min(100, Math.max(0, round(value)));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
