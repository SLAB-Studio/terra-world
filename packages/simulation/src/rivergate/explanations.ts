import type { CauseEffect } from "@terra/campaign-schema";

import {
  eventCauseCode,
  milestoneCauseCode,
  RUNTIME_STATIC_CAUSE_CODES,
  stageTransitionCauseCode,
  type RuntimeCauseCode,
  type RuntimeStaticCauseCode,
} from "../cause-codes";
import { CHAPTER_FOUR_GROWTH_CAUSE_CODES } from "./chapter-4-growth";
import type {
  StormOutcomeBand,
  StormReadiness,
  StormSystem,
} from "./chapter-5-storm";
import { RIVERGATE_FOUNDATIONS_CAMPAIGN } from "./content";
import { RIVERGATE_CAUSE_CODES } from "./scenario-types";
export const RIVERGATE_SCENARIO_FAILURE_BRANCHES = [
  "chapter-1-water.failure.water-source-present",
  "chapter-1-water.failure.treatment-present",
  "chapter-1-water.failure.first-homes-present",
  "chapter-1-water.failure.safe-water-for-demand",
  "chapter-1-water.failure.pipes-reach-every-home",
  "chapter-1-water.failure.treatment-above-flood-zone",
  "chapter-2-power.failure.solar-present",
  "chapter-2-power.failure.day-demand-met",
  "chapter-2-power.failure.night-demand-met",
  "chapter-2-power.failure.clinic-reserve-met",
  "chapter-2-power.failure.maintenance-covered",
] as const;

export const RIVERGATE_CARE_FAILURE_BRANCHES = [
  "chapter-3-care.failure.school-present",
  "chapter-3-care.failure.clinic-present",
  "chapter-3-care.failure.schools-reach-every-neighbourhood",
  "chapter-3-care.failure.clinics-reach-every-neighbourhood",
  "chapter-3-care.failure.safe-walks-reach-every-neighbourhood",
  "chapter-3-care.failure.roads-are-safe-for-every-neighbourhood",
  "chapter-3-care.failure.care-is-fair",
] as const;

export const RIVERGATE_GROWTH_FAILURE_BRANCHES = [
  "chapter-4-growth.failure.growing-neighbourhood-present",
  "chapter-4-growth.failure.recycling-centre-present",
  "chapter-4-growth.failure.waste-keeps-up",
  "chapter-4-growth.failure.transport-plan-present",
  "chapter-4-growth.failure.transport-keeps-up",
  "chapter-4-growth.failure.pollution-kept-low",
  "chapter-4-growth.failure.maintenance-covered",
] as const;

export const RIVERGATE_ENERGY_PATHS = [
  "blackout",
  "solar-only",
  "solar-plus-storage",
  "stable-grid",
] as const;

export const RIVERGATE_GROWTH_STRATEGIES = [
  "recycling-and-transit",
  "recycling-and-roads",
  "overloaded",
  "waste-heavy",
  "underfunded",
  "needs-revision",
] as const;

export const RIVERGATE_STORM_OUTCOMES = [
  "protected",
  "recovering",
  "hard-hit",
] as const satisfies readonly StormOutcomeBand[];

export const RIVERGATE_STORM_SYSTEMS = [
  "water",
  "energy",
  "nature",
  "transport",
  "budget",
] as const satisfies readonly StormSystem[];

export const RIVERGATE_STORM_READINESS = [
  "ready",
  "strained",
  "fragile",
] as const satisfies readonly StormReadiness[];

export const RIVERGATE_DIRECTOR_MILESTONE_IDS = [
  "care-ready",
  "growth-ready",
  "storm-ready",
] as const;

export const RIVERGATE_STAGE_TRANSITIONS = [
  { from: "seed", to: "settlement" },
  { from: "settlement", to: "town" },
  { from: "town", to: "city" },
  { from: "city", to: "resilient-city" },
] as const;

/**
 * Derived coverage contract: shared static registry plus the evaluator and
 * campaign instances that can appear while Rivergate is played.
 */
export const RIVERGATE_REQUIRED_TRACE_CODES: readonly RuntimeCauseCode[] = [
  ...new Set<RuntimeCauseCode>([
    ...RUNTIME_STATIC_CAUSE_CODES,
    ...RIVERGATE_CAUSE_CODES,
    ...CHAPTER_FOUR_GROWTH_CAUSE_CODES,
    ...RIVERGATE_FOUNDATIONS_CAMPAIGN.events.map((event) =>
      eventCauseCode(event.id),
    ),
    ...RIVERGATE_FOUNDATIONS_CAMPAIGN.milestones.map((milestone) =>
      milestoneCauseCode(milestone.id),
    ),
    ...RIVERGATE_DIRECTOR_MILESTONE_IDS.map(milestoneCauseCode),
    ...RIVERGATE_STAGE_TRANSITIONS.map(({ from, to }) =>
      stageTransitionCauseCode(from, to),
    ),
  ]),
].sort((left, right) => left.localeCompare(right));

const OUTCOME_BRANCHES = [
  "chapter-1-water.complete",
  "chapter-2-power.complete",
  ...RIVERGATE_ENERGY_PATHS.map(
    (path) => `chapter-2-power.energy-path.${path}` as const,
  ),
  "chapter-3-care.complete",
  "chapter-4-growth.complete",
  ...RIVERGATE_GROWTH_STRATEGIES.map(
    (strategy) => `chapter-4-growth.strategy.${strategy}` as const,
  ),
  ...RIVERGATE_STORM_OUTCOMES.map(
    (outcome) => `chapter-5-storm.outcome.${outcome}` as const,
  ),
  ...RIVERGATE_STORM_SYSTEMS.flatMap((system) =>
    RIVERGATE_STORM_READINESS.map(
      (readiness) => `chapter-5-storm.system.${system}.${readiness}` as const,
    ),
  ),
  "chapter-5-storm.failure.event-not-completed",
] as const;

export const RIVERGATE_EVALUATION_BRANCH_CODES = [
  ...RIVERGATE_SCENARIO_FAILURE_BRANCHES,
  ...RIVERGATE_CARE_FAILURE_BRANCHES,
  ...RIVERGATE_GROWTH_FAILURE_BRANCHES,
  ...OUTCOME_BRANCHES,
] as const;

export type RivergateEvaluationBranchCode =
  (typeof RIVERGATE_EVALUATION_BRANCH_CODES)[number];

export type RivergateExplanationTemplate = {
  readonly explanationKey: string;
  readonly questionKey: string;
  readonly hintKey: string;
};

export type RenderedRivergateExplanation = RivergateExplanationTemplate & {
  readonly sourceCode: RivergateTraceCode | RivergateEvaluationBranchCode;
  readonly explanation: string;
  readonly question: string;
  readonly hint: string;
};

export type RivergateExplanationResult =
  | { readonly ok: true; readonly value: RenderedRivergateExplanation }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: "unsupported-code" | "missing-localization";
        readonly sourceCode: string;
        readonly missingKeys?: readonly string[];
      };
    };

const trace = (
  name: string,
  topic:
    | "building"
    | "water"
    | "energy"
    | "budget"
    | "care"
    | "nature"
    | "growth"
    | "storm"
    | "milestone"
    | "stage",
): RivergateExplanationTemplate => ({
  explanationKey: `rivergate.explanation.trace.${name}`,
  questionKey: `rivergate.question.${topic}`,
  hintKey: `rivergate.hint.trace.${topic}`,
});

export const RIVERGATE_TRACE_EXPLANATIONS = {
  "construction.committed": trace("construction-committed", "building"),
  "water.reliability-calculated": trace("water-reliability", "water"),
  "energy.reliability-calculated": trace("energy-reliability", "energy"),
  "budget.maintenance-paid": trace("maintenance-paid", "budget"),
  "budget.maintenance-shortfall": trace("maintenance-shortfall", "budget"),
  "community.services-impact": trace("services-impact", "care"),
  "community.population-change": trace("population-change", "growth"),
  "event.chapter-1-river-rain": trace("river-rain", "water"),
  "community.population-growth": trace("population-growth", "growth"),
  "waste.processing-balance": trace("waste-balance", "growth"),
  "transport.congestion-calculated": trace("transport-balance", "growth"),
  "nature.pollution-impact": trace("pollution-impact", "nature"),
  "nature.city-impact": trace("city-nature-impact", "nature"),
  "community.resilience-impact": trace("resilience-impact", "storm"),
  "event.chapter-4-growth-surge": trace("growth-surge", "growth"),
  "event.chapter-5-river-storm": trace("river-storm", "storm"),
  "milestone.water-ready": trace("water-ready", "milestone"),
  "milestone.power-ready": trace("power-ready", "milestone"),
  "milestone.care-ready": trace("care-ready", "milestone"),
  "milestone.growth-ready": trace("growth-ready", "milestone"),
  "milestone.storm-ready": trace("storm-ready", "milestone"),
  "stage.seed-to-settlement": trace("seed-to-settlement", "stage"),
  "stage.settlement-to-town": trace("settlement-to-town", "stage"),
  "stage.town-to-city": trace("town-to-city", "stage"),
  "stage.city-to-resilient-city": trace("city-to-resilient-city", "stage"),
} as const satisfies Record<
  RuntimeStaticCauseCode,
  RivergateExplanationTemplate
> &
  Readonly<Record<string, RivergateExplanationTemplate>>;

export type RivergateTraceCode = keyof typeof RIVERGATE_TRACE_EXPLANATIONS;

/** Derived from the catalogue so the renderer and coverage list cannot drift. */
export const RIVERGATE_TRACE_CODES = Object.keys(
  RIVERGATE_TRACE_EXPLANATIONS,
) as RivergateTraceCode[];

const failure = (
  explanationKey: string,
  questionKey: string,
  hintKey: string,
): RivergateExplanationTemplate => ({ explanationKey, questionKey, hintKey });

const failureEntries = [
  [
    "chapter-1-water.failure.water-source-present",
    "rivergate.fallback.water.no-source",
    "rivergate.question.water",
    "rivergate.hint.water.no-source",
  ],
  [
    "chapter-1-water.failure.treatment-present",
    "rivergate.fallback.water.untreated",
    "rivergate.question.water",
    "rivergate.hint.water.untreated",
  ],
  [
    "chapter-1-water.failure.first-homes-present",
    "rivergate.fallback.water.no-homes",
    "rivergate.question.water",
    "rivergate.hint.water.no-homes",
  ],
  [
    "chapter-1-water.failure.safe-water-for-demand",
    "rivergate.fallback.water.quality",
    "rivergate.question.water",
    "rivergate.hint.water.quality",
  ],
  [
    "chapter-1-water.failure.pipes-reach-every-home",
    "rivergate.fallback.water.disconnected",
    "rivergate.question.water",
    "rivergate.hint.water.disconnected",
  ],
  [
    "chapter-1-water.failure.treatment-above-flood-zone",
    "rivergate.fallback.water.flood-zone",
    "rivergate.question.water",
    "rivergate.hint.water.flood-zone",
  ],
  [
    "chapter-2-power.failure.solar-present",
    "rivergate.fallback.energy.no-solar",
    "rivergate.question.energy",
    "rivergate.hint.energy.no-solar",
  ],
  [
    "chapter-2-power.failure.day-demand-met",
    "rivergate.fallback.energy.day-shortfall",
    "rivergate.question.energy",
    "rivergate.hint.energy.day-shortfall",
  ],
  [
    "chapter-2-power.failure.night-demand-met",
    "rivergate.fallback.energy.night-shortfall",
    "rivergate.question.energy",
    "rivergate.hint.energy.night-shortfall",
  ],
  [
    "chapter-2-power.failure.clinic-reserve-met",
    "rivergate.fallback.energy.clinic",
    "rivergate.question.energy",
    "rivergate.hint.energy.clinic",
  ],
  [
    "chapter-2-power.failure.maintenance-covered",
    "rivergate.fallback.energy.maintenance",
    "rivergate.question.budget",
    "rivergate.hint.energy.maintenance",
  ],
  [
    "chapter-3-care.failure.school-present",
    "rivergate.fallback.care.no-school",
    "rivergate.question.care",
    "rivergate.hint.care.no-school",
  ],
  [
    "chapter-3-care.failure.clinic-present",
    "rivergate.fallback.care.no-clinic",
    "rivergate.question.care",
    "rivergate.hint.care.no-clinic",
  ],
  [
    "chapter-3-care.failure.schools-reach-every-neighbourhood",
    "rivergate.fallback.care.school-coverage",
    "rivergate.question.care",
    "rivergate.hint.care.school-coverage",
  ],
  [
    "chapter-3-care.failure.clinics-reach-every-neighbourhood",
    "rivergate.fallback.care.clinic-coverage",
    "rivergate.question.care",
    "rivergate.hint.care.clinic-coverage",
  ],
  [
    "chapter-3-care.failure.safe-walks-reach-every-neighbourhood",
    "rivergate.fallback.care.walking-access",
    "rivergate.question.care",
    "rivergate.hint.care.walking-access",
  ],
  [
    "chapter-3-care.failure.roads-are-safe-for-every-neighbourhood",
    "rivergate.fallback.care.road-safety",
    "rivergate.question.care",
    "rivergate.hint.care.road-safety",
  ],
  [
    "chapter-3-care.failure.care-is-fair",
    "rivergate.fallback.care.unfair",
    "rivergate.question.care",
    "rivergate.hint.care.unfair",
  ],
  [
    "chapter-4-growth.failure.growing-neighbourhood-present",
    "rivergate.fallback.growth.not-growing-yet",
    "rivergate.question.growth",
    "rivergate.hint.growth.not-growing-yet",
  ],
  [
    "chapter-4-growth.failure.recycling-centre-present",
    "rivergate.fallback.growth.no-recycling",
    "rivergate.question.growth",
    "rivergate.hint.growth.no-recycling",
  ],
  [
    "chapter-4-growth.failure.waste-keeps-up",
    "rivergate.fallback.growth.waste-pile",
    "rivergate.question.growth",
    "rivergate.hint.growth.waste-pile",
  ],
  [
    "chapter-4-growth.failure.transport-plan-present",
    "rivergate.fallback.growth.no-transport-plan",
    "rivergate.question.growth",
    "rivergate.hint.growth.no-transport-plan",
  ],
  [
    "chapter-4-growth.failure.transport-keeps-up",
    "rivergate.fallback.growth.congestion",
    "rivergate.question.growth",
    "rivergate.hint.growth.congestion",
  ],
  [
    "chapter-4-growth.failure.pollution-kept-low",
    "rivergate.fallback.growth.pollution",
    "rivergate.question.growth",
    "rivergate.hint.growth.pollution",
  ],
  [
    "chapter-4-growth.failure.maintenance-covered",
    "rivergate.fallback.growth.maintenance",
    "rivergate.question.budget",
    "rivergate.hint.growth.maintenance",
  ],
] as const;

const failureCatalogue = Object.fromEntries(
  failureEntries.map(([code, explanationKey, questionKey, hintKey]) => [
    code,
    failure(explanationKey, questionKey, hintKey),
  ]),
) as Record<
  | (typeof RIVERGATE_SCENARIO_FAILURE_BRANCHES)[number]
  | (typeof RIVERGATE_CARE_FAILURE_BRANCHES)[number]
  | (typeof RIVERGATE_GROWTH_FAILURE_BRANCHES)[number],
  RivergateExplanationTemplate
>;

const outcome = (
  name: string,
  topic: "water" | "energy" | "care" | "growth" | "storm",
): RivergateExplanationTemplate => ({
  explanationKey: `rivergate.explanation.outcome.${name}`,
  questionKey: `rivergate.question.${topic}`,
  hintKey: `rivergate.hint.outcome.${name}`,
});

const outcomeCatalogue = {
  "chapter-1-water.complete": outcome("water-complete", "water"),
  "chapter-2-power.complete": outcome("power-complete", "energy"),
  "chapter-2-power.energy-path.blackout": outcome("energy-blackout", "energy"),
  "chapter-2-power.energy-path.solar-only": outcome(
    "energy-solar-only",
    "energy",
  ),
  "chapter-2-power.energy-path.solar-plus-storage": outcome(
    "energy-solar-plus-storage",
    "energy",
  ),
  "chapter-2-power.energy-path.stable-grid": outcome(
    "energy-stable-grid",
    "energy",
  ),
  "chapter-3-care.complete": outcome("care-complete", "care"),
  "chapter-4-growth.complete": outcome("growth-complete", "growth"),
  "chapter-4-growth.strategy.recycling-and-transit": outcome(
    "growth-recycling-and-transit",
    "growth",
  ),
  "chapter-4-growth.strategy.recycling-and-roads": outcome(
    "growth-recycling-and-roads",
    "growth",
  ),
  "chapter-4-growth.strategy.overloaded": outcome(
    "growth-overloaded",
    "growth",
  ),
  "chapter-4-growth.strategy.waste-heavy": outcome(
    "growth-waste-heavy",
    "growth",
  ),
  "chapter-4-growth.strategy.underfunded": outcome(
    "growth-underfunded",
    "growth",
  ),
  "chapter-4-growth.strategy.needs-revision": outcome(
    "growth-needs-revision",
    "growth",
  ),
  "chapter-5-storm.outcome.protected": outcome("storm-protected", "storm"),
  "chapter-5-storm.outcome.recovering": outcome("storm-recovering", "storm"),
  "chapter-5-storm.outcome.hard-hit": outcome("storm-hard-hit", "storm"),
  "chapter-5-storm.failure.event-not-completed": outcome(
    "storm-event-not-completed",
    "storm",
  ),
  ...Object.fromEntries(
    RIVERGATE_STORM_SYSTEMS.flatMap((system) =>
      RIVERGATE_STORM_READINESS.map((readiness) => {
        const messageSuffix = readiness === "ready" ? "ready" : "strained";
        return [
          `chapter-5-storm.system.${system}.${readiness}`,
          {
            explanationKey: `rivergate.storm.finding.${system}-${messageSuffix}`,
            questionKey: `rivergate.question.storm-system.${system}`,
            hintKey: `rivergate.hint.storm-system.${system}`,
          },
        ] as const;
      }),
    ),
  ),
} as Record<(typeof OUTCOME_BRANCHES)[number], RivergateExplanationTemplate>;

export const RIVERGATE_EVALUATION_EXPLANATIONS = {
  ...failureCatalogue,
  ...outcomeCatalogue,
} as const satisfies Record<
  RivergateEvaluationBranchCode,
  RivergateExplanationTemplate
>;

export const RIVERGATE_EXPLANATION_MESSAGES: Readonly<Record<string, string>> =
  {
    "rivergate.question.building":
      "What need did this new building help, and what new cost did it add?",
    "rivergate.question.water":
      "Which part of the water journey should you improve first: source, treatment, connection, or safety?",
    "rivergate.question.energy":
      "What changes between the sunny daytime and the night-time power plan?",
    "rivergate.question.budget":
      "Which service must be cared for each turn, and how much money should you save for it?",
    "rivergate.question.care":
      "Can children and families in both neighbourhoods reach the same care safely?",
    "rivergate.question.nature":
      "Where could the city make more room for clean air, plants, and rainwater?",
    "rivergate.question.growth":
      "As more neighbours arrive, which city system feels the extra pressure first?",
    "rivergate.question.storm":
      "Which earlier city choice helped most during the storm, and which choice would you revise?",
    "rivergate.question.milestone":
      "Which connected choices helped Rivergate earn this milestone?",
    "rivergate.question.stage":
      "What can a larger city do now that it could not do before?",
    "rivergate.question.storm-system.water":
      "Did safe water still reach homes after the river rose?",
    "rivergate.question.storm-system.energy":
      "Could stored power keep pumps and the clinic working?",
    "rivergate.question.storm-system.nature":
      "Where did wetlands and open ground slow the rain?",
    "rivergate.question.storm-system.transport":
      "Could helpers still reach homes and important services?",
    "rivergate.question.storm-system.budget":
      "Was enough repair money left after regular upkeep?",

    "rivergate.hint.trace.building":
      "Check the new building's connections, construction cost, and upkeep before the next turn.",
    "rivergate.hint.trace.water":
      "Follow the route from river source to treatment and then to every home.",
    "rivergate.hint.trace.energy":
      "Compare daytime generation, night demand, and stored energy.",
    "rivergate.hint.trace.budget":
      "Keep enough money for every building's regular upkeep.",
    "rivergate.hint.trace.care":
      "Inspect school, clinic, and safe-walking coverage for both neighbourhoods.",
    "rivergate.hint.trace.nature":
      "Try wetlands, trees, or a layout that leaves safer open ground.",
    "rivergate.hint.trace.growth":
      "Compare population demand with waste and transport capacity.",
    "rivergate.hint.trace.storm":
      "Strengthen the weakest of water, power, nature, emergency routes, and repair money.",
    "rivergate.hint.trace.milestone":
      "Keep the successful systems connected while you build the next part of town.",
    "rivergate.hint.trace.stage":
      "Review the newly unlocked choices before placing the next building.",

    "rivergate.explanation.trace.construction-committed":
      "The planned buildings are now part of Rivergate, and their construction cost has been paid.",
    "rivergate.explanation.trace.water-reliability":
      "Rivergate compared treated water, demand, and connected homes to update water reliability.",
    "rivergate.explanation.trace.energy-reliability":
      "Rivergate compared available electricity with demand to update energy reliability.",
    "rivergate.explanation.trace.maintenance-paid":
      "The city paid the upkeep needed to keep its buildings working this turn.",
    "rivergate.explanation.trace.maintenance-shortfall":
      "The city could not pay all of its upkeep, so some systems are under extra strain.",
    "rivergate.explanation.trace.services-impact":
      "Schools, clinics, safe routes, and transport changed how well the community is served.",
    "rivergate.explanation.trace.population-change":
      "The number of neighbours changed because homes and reliable services changed.",
    "rivergate.explanation.trace.river-rain":
      "River rain tested whether water equipment was placed on safer ground.",
    "rivergate.explanation.trace.population-growth":
      "A growing Rivergate creates more demand for homes, travel, services, and waste collection.",
    "rivergate.explanation.trace.waste-balance":
      "Rivergate compared the waste it made with the amount its recycling system could process.",
    "rivergate.explanation.trace.transport-balance":
      "Rivergate compared daily travel demand with the capacity of roads and shared transport.",
    "rivergate.explanation.trace.pollution-impact":
      "Waste and transport choices changed the city's pollution level.",
    "rivergate.explanation.trace.city-nature-impact":
      "Buildings and green spaces changed how much room Rivergate has for nature.",
    "rivergate.explanation.trace.resilience-impact":
      "Connected services, maintenance, and safer planning changed how ready the city is for trouble.",
    "rivergate.explanation.trace.growth-surge":
      "New neighbours arrived, adding energy to Rivergate and extra pressure on city systems.",
    "rivergate.explanation.trace.river-storm":
      "The final river storm tested water, power, nature, emergency routes, and repair money together.",
    "rivergate.explanation.trace.water-ready":
      "Rivergate earned water readiness by joining a source, treatment, homes, and reliable supply.",
    "rivergate.explanation.trace.power-ready":
      "Rivergate earned power readiness by joining solar generation, storage, and reliable supply.",
    "rivergate.explanation.trace.care-ready":
      "Rivergate earned care readiness because both neighbourhoods can reach learning and healthcare safely.",
    "rivergate.explanation.trace.growth-ready":
      "Rivergate earned growth readiness by balancing homes, waste, travel, pollution, and upkeep.",
    "rivergate.explanation.trace.storm-ready":
      "Rivergate proved it can recover from the storm without leaving its weakest systems behind.",
    "rivergate.explanation.trace.seed-to-settlement":
      "The first connected homes and services have turned the empty land into a settlement.",
    "rivergate.explanation.trace.settlement-to-town":
      "More neighbours and shared services have helped the settlement grow into a town.",
    "rivergate.explanation.trace.town-to-city":
      "Connected systems and a larger community have helped the town become a city.",
    "rivergate.explanation.trace.city-to-resilient-city":
      "Rivergate has become a resilient city by preparing its systems to work together through challenges.",

    "rivergate.explanation.outcome.water-complete":
      "Safe treated water reaches Rivergate's first homes, and the important equipment is away from the deepest flood risk.",
    "rivergate.hint.outcome.water-complete":
      "Keep checking water demand as you add more homes.",
    "rivergate.explanation.outcome.power-complete":
      "Rivergate can make daytime power, store energy for night, protect the clinic plan, and afford upkeep.",
    "rivergate.hint.outcome.power-complete":
      "Keep some stored energy and upkeep money ready as demand grows.",
    "rivergate.explanation.outcome.energy-blackout":
      "Electricity supply cannot meet the neighbourhood's daytime need yet.",
    "rivergate.hint.outcome.energy-blackout":
      "Add or reconnect solar generation before planning storage.",
    "rivergate.explanation.outcome.energy-solar-only":
      "Solar power helps in daylight, but there is no working battery plan for night.",
    "rivergate.hint.outcome.energy-solar-only":
      "Store spare daytime electricity in a connected battery.",
    "rivergate.explanation.outcome.energy-solar-plus-storage":
      "Solar and a battery are present, but night demand, clinic power, or upkeep still needs work.",
    "rivergate.hint.outcome.energy-solar-plus-storage":
      "Check night demand, the clinic reserve, and maintenance one at a time.",
    "rivergate.explanation.outcome.energy-stable-grid":
      "Daytime generation and stored night power reliably cover the neighbourhood and clinic plan.",
    "rivergate.hint.outcome.energy-stable-grid":
      "Protect this balance when new homes increase demand.",
    "rivergate.explanation.outcome.care-complete":
      "School, clinic, and safe walking access reach both Rivergate neighbourhoods fairly.",
    "rivergate.hint.outcome.care-complete":
      "Keep comparing both neighbourhoods as the city grows.",
    "rivergate.explanation.outcome.growth-complete":
      "Rivergate's homes, recycling, travel, pollution, and upkeep are in balance for growth.",
    "rivergate.hint.outcome.growth-complete":
      "Keep capacity a little ahead of demand before welcoming more neighbours.",
    "rivergate.explanation.outcome.growth-recycling-and-transit":
      "Recycling and shared bus trips form the main plan for handling Rivergate's growth.",
    "rivergate.hint.outcome.growth-recycling-and-transit":
      "Keep the bus route connected to homes and important services.",
    "rivergate.explanation.outcome.growth-recycling-and-roads":
      "Recycling and enough connected roads form a workable growth plan without a bus stop.",
    "rivergate.hint.outcome.growth-recycling-and-roads":
      "Watch pollution and upkeep as the road network expands.",
    "rivergate.explanation.outcome.growth-overloaded":
      "Travel demand is greater than the connected transport plan can carry.",
    "rivergate.hint.outcome.growth-overloaded":
      "Add a bus stop or improve connected road capacity.",
    "rivergate.explanation.outcome.growth-waste-heavy":
      "Rivergate is making waste faster than the recycling system can process it.",
    "rivergate.hint.outcome.growth-waste-heavy":
      "Increase connected recycling capacity before adding more homes.",
    "rivergate.explanation.outcome.growth-underfunded":
      "The growth plan works only until its upkeep bill arrives.",
    "rivergate.hint.outcome.growth-underfunded":
      "Simplify the plan or save enough money for maintenance.",
    "rivergate.explanation.outcome.growth-needs-revision":
      "One or more parts of the growth plan still need a careful revision.",
    "rivergate.hint.outcome.growth-needs-revision":
      "Review homes, waste, travel, pollution, and upkeep in that order.",
    "rivergate.explanation.outcome.storm-protected":
      "Rivergate's connected systems protected most homes and services during the storm.",
    "rivergate.hint.outcome.storm-protected":
      "Study the strongest system, then use its lesson to improve another one.",
    "rivergate.explanation.outcome.storm-recovering":
      "The storm caused damage, but Rivergate has enough working systems to recover.",
    "rivergate.hint.outcome.storm-recovering":
      "Repair the weakest system first so it does not slow the others.",
    "rivergate.explanation.outcome.storm-hard-hit":
      "Several city systems were too fragile together, so recovery will take longer.",
    "rivergate.hint.outcome.storm-hard-hit":
      "Revise one weak system at a time, then run the storm again.",
    "rivergate.explanation.outcome.storm-event-not-completed":
      "Rivergate has not completed the final storm turn yet, so its recovery cannot be judged.",
    "rivergate.hint.outcome.storm-event-not-completed":
      "Finish preparing, then run the city on the scheduled storm turn.",
    "rivergate.hint.storm-system.water":
      "Improve treatment connections and move critical water equipment away from deeper flood risk.",
    "rivergate.hint.storm-system.energy":
      "Store enough energy for pumps and the clinic when clouds reduce solar power.",
    "rivergate.hint.storm-system.nature":
      "Add wetland drainage and leave open ground where rain can slow down and soak in.",
    "rivergate.hint.storm-system.transport":
      "Keep at least one safer connected route to homes and essential services.",
    "rivergate.hint.storm-system.budget":
      "Pay regular upkeep and keep a separate reserve for storm repairs.",
  };

export function branchCodeForFailure(
  chapterId:
    | "chapter-1-water"
    | "chapter-2-power"
    | "chapter-3-care"
    | "chapter-4-growth",
  ruleId: string,
): string {
  return `${chapterId}.failure.${ruleId}`;
}

export function renderRivergateCause(
  cause: CauseEffect,
  messages: Readonly<Record<string, string>>,
): RivergateExplanationResult {
  return renderFromCatalogue(
    cause.code,
    RIVERGATE_TRACE_EXPLANATIONS,
    messages,
  );
}

export function renderRivergateEvaluationBranch(
  branchCode: string,
  messages: Readonly<Record<string, string>>,
): RivergateExplanationResult {
  return renderFromCatalogue(
    branchCode,
    RIVERGATE_EVALUATION_EXPLANATIONS,
    messages,
  );
}

function renderFromCatalogue(
  sourceCode: string,
  catalogue: Readonly<Record<string, RivergateExplanationTemplate>>,
  messages: Readonly<Record<string, string>>,
): RivergateExplanationResult {
  const template = catalogue[sourceCode];
  if (template === undefined) {
    return { ok: false, error: { code: "unsupported-code", sourceCode } };
  }
  const keys = [
    template.explanationKey,
    template.questionKey,
    template.hintKey,
  ];
  const missingKeys = keys.filter((key) => {
    const value = messages[key];
    return typeof value !== "string" || value.trim().length === 0;
  });
  if (missingKeys.length > 0) {
    return {
      ok: false,
      error: { code: "missing-localization", sourceCode, missingKeys },
    };
  }
  return {
    ok: true,
    value: {
      sourceCode: sourceCode as
        RivergateTraceCode | RivergateEvaluationBranchCode,
      ...template,
      explanation: messages[template.explanationKey]!,
      question: messages[template.questionKey]!,
      hint: messages[template.hintKey]!,
    },
  };
}
