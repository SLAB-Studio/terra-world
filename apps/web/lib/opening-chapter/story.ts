/**
 * Rivergate's authored opening, isolated from legacy residential repair saves.
 * These are fictional scenario rules, not a live city economy or model output.
 * Time advances only through an explicit player action; no wall clock is read.
 */
export type ChapterPhase =
  "intro" | "investigate" | "decision" | "aftermath" | "complete";
export type ChapterEvidenceId = "bridge" | "maya" | "malik" | "nia";
export type ChapterDecision = "repair" | "shuttle" | "divert";
export type ChapterShot = "river" | "bakery" | "bridge" | "arrival";
export type ChapterSpeaker =
  "Leo" | "Maya" | "Malik" | "Nia" | "Sam" | "City notice";
export type ChapterDialogueLine = Readonly<{
  speaker: ChapterSpeaker;
  text: string;
  kind: "observation" | "opinion" | "briefing";
}>;
export type ChapterEvent =
  | { type: "advance-intro" }
  | { type: "skip-intro" }
  | { type: "collect-evidence"; id: ChapterEvidenceId }
  | { type: "choose"; decision: ChapterDecision }
  | { type: "observe" }
  | { type: "finish" };
export type ChapterJournalEntry = Readonly<{
  id: string;
  day: number;
  kind: "arrival" | "evidence" | "decision" | "outcome" | "complete";
  title: string;
  text: string;
  evidenceIds: readonly ChapterEvidenceId[];
}>;
export type ChapterState = Readonly<{
  version: 1;
  phase: ChapterPhase;
  introIndex: number;
  evidence: readonly ChapterEvidenceId[];
  decision: ChapterDecision | null;
  budget: number;
  elapsedDays: number;
  outcomeObserved: boolean;
  journal: readonly ChapterJournalEntry[];
  actionLog: readonly ChapterEvent[];
}>;
export type ChapterChoice = Readonly<{
  id: ChapterDecision;
  title: string;
  description: string;
  cost: number;
  durationDays: number;
  tradeoff: string;
}>;
export type ChapterOutcome = Readonly<{
  title: string;
  text: string;
  lines: readonly ChapterDialogueLine[];
  bridgeOpen: boolean;
  serviceActive: boolean;
  diversionActive: boolean;
  remainingBudget: number;
  elapsedDays: number;
  unresolved: string;
}>;

export const CHAPTER_SCENARIO = Object.freeze({
  id: "rivergate-east-bridge-v1",
  title: "The other side of Rivergate",
  availableBudget: 1_500_000,
  affectedResidents: 143,
  currency: "civic credits",
  currencyDisclosure: "Fictional chapter budget. Not real money or tokens.",
});

export const CHAPTER_INTRO: readonly (ChapterDialogueLine & {
  id: string;
  shot: ChapterShot;
})[] = [
  {
    id: "arrival-river",
    speaker: "Leo",
    kind: "opinion",
    shot: "river",
    text: "So… you're the person they sent. Welcome to Rivergate. The city doesn't stop just because someone new is in charge.",
  },
  {
    id: "arrival-bakery",
    speaker: "Leo",
    kind: "briefing",
    shot: "bakery",
    text: "That's Maya's bakery. Ask her about the city and she'll tell you who can still afford to stay. Ask Malik and he'll tell you what needs building. Both are worth hearing.",
  },
  {
    id: "arrival-bridge",
    speaker: "Leo",
    kind: "observation",
    shot: "bridge",
    text: "East Bridge is closed. The inspection notice went up tonight. There's another crossing, but the long way round is still a long way round.",
  },
  {
    id: "arrival-steward",
    speaker: "Leo",
    kind: "opinion",
    shot: "arrival",
    text: "People here want very different things. The good news is that they still care. The difficult part is deciding what we can promise them. Come on. Let's start at the bridge.",
  },
];

type ChapterEvidence = ChapterDialogueLine &
  Readonly<{
    id: ChapterEvidenceId;
    title: string;
    lines: readonly ChapterDialogueLine[];
  }>;

export const CHAPTER_EVIDENCE: Readonly<
  Record<ChapterEvidenceId, ChapterEvidence>
> = {
  bridge: {
    id: "bridge",
    title: "A crossing closed",
    speaker: "City notice",
    kind: "observation",
    text: "East Bridge is closed after a safety inspection. The south crossing remains open. The chapter's access register lists 143 affected residents.",
    lines: [
      {
        speaker: "City notice",
        kind: "observation",
        text: "East Bridge: closed to vehicles and pedestrians. Use the south crossing. Keep clear of the inspection barriers.",
      },
      {
        speaker: "Leo",
        kind: "briefing",
        text: "The estimate is 1.2 million civic credits for a permanent repair. We have 1.5 million available in this chapter's budget.",
      },
      {
        speaker: "Leo",
        kind: "opinion",
        text: "We can afford the repair. We can't afford every other request as well. Let's hear from Maya, Malik and Nia before we decide.",
      },
    ],
  },
  maya: {
    id: "maya",
    title: "Maya · the bakery",
    speaker: "Maya",
    kind: "opinion",
    text: "Maya needs reliable access for her bakery. A delivery service would help with supplies, but would not restore passing customers.",
    lines: [
      {
        speaker: "Maya",
        kind: "opinion",
        text: "I can work around a difficult morning. What I can't plan around is 'we'll see'. Tell me which route my deliveries can use, and when.",
      },
      {
        speaker: "Leo",
        kind: "opinion",
        text: "Would a temporary delivery service help?",
      },
      {
        speaker: "Maya",
        kind: "opinion",
        text: "With supplies, yes. It won't bring back someone who used to stop here on the walk to work. Those are different problems.",
      },
      {
        speaker: "Maya",
        kind: "opinion",
        text: "I'm not asking you to spend everything on my street. Just don't call a detour a solution without asking who has to take it.",
      },
    ],
  },
  malik: {
    id: "malik",
    title: "Malik · the repair estimate",
    speaker: "Malik",
    kind: "briefing",
    text: "Malik's scoped repair takes 14 chapter days and costs 1.2 million civic credits. No choice opens an unsafe crossing immediately.",
    lines: [
      {
        speaker: "Malik",
        kind: "briefing",
        text: "The scoped repair is fourteen days, including the safety check before reopening. The price is 1.2 million. It's a repair, not a new bridge.",
      },
      {
        speaker: "Leo",
        kind: "opinion",
        text: "And if we keep using the other crossing?",
      },
      {
        speaker: "Malik",
        kind: "briefing",
        text: "Then East Bridge stays shut. You can fund an essential-delivery service for 180,000, or formal diversion signs for 45,000. Neither fixes this structure.",
      },
      {
        speaker: "Malik",
        kind: "opinion",
        text: "You don't have to hire my crew today. But don't put an opening date on that barrier unless you've funded the work.",
      },
    ],
  },
  nia: {
    id: "nia",
    title: "Nia · the riverbank",
    speaker: "Nia",
    kind: "opinion",
    text: "Nia asks that repair crews stay within the existing bridge footprint. She distinguishes that precaution from a measured environmental improvement.",
    lines: [
      {
        speaker: "Nia",
        kind: "opinion",
        text: "If you repair it, keep the work inside the existing footprint. The riverbank isn't spare ground for whatever won't fit on the road.",
      },
      {
        speaker: "Leo",
        kind: "opinion",
        text: "Does the closure tell us anything about the river?",
      },
      {
        speaker: "Nia",
        kind: "briefing",
        text: "No. A failed bridge inspection isn't a water-quality result. I won't give you a cleaner-river claim without measurements.",
      },
      {
        speaker: "Nia",
        kind: "opinion",
        text: "Using the south crossing avoids bank work for now. It also moves the traffic somewhere people already live. There's no option that asks nothing of anyone.",
      },
    ],
  },
};

export const CHAPTER_CHOICES: readonly ChapterChoice[] = [
  {
    id: "repair",
    title: "Repair East Bridge",
    description:
      "Fund the scoped repair within the existing bridge footprint. Reopen after the chapter's construction and safety-check interval.",
    cost: 1_200_000,
    durationDays: 14,
    tradeoff:
      "Restores the original crossing; leaves 300,000 civic credits. Traffic uses the south crossing during the work.",
  },
  {
    id: "shuttle",
    title: "Fund essential deliveries",
    description:
      "Assign the existing service vehicle to essential deliveries by the open south crossing. Service begins after two chapter days.",
    cost: 180_000,
    durationDays: 2,
    tradeoff:
      "Leaves 1,320,000 civic credits. East Bridge stays closed; this service is not a full passenger replacement or permanent repair.",
  },
  {
    id: "divert",
    title: "Formalise the diversion",
    description:
      "Install a signed diversion to the existing south crossing. The route plan takes effect after one chapter day.",
    cost: 45_000,
    durationDays: 1,
    tradeoff:
      "Leaves 1,455,000 civic credits. East Bridge stays closed and the longer journey remains; no delivery service is funded.",
  },
];

const EVIDENCE_IDS: readonly ChapterEvidenceId[] = [
  "bridge",
  "maya",
  "malik",
  "nia",
];

export function createChapterState(): ChapterState {
  return {
    version: 1,
    phase: "intro",
    introIndex: 0,
    evidence: [],
    decision: null,
    budget: CHAPTER_SCENARIO.availableBudget,
    elapsedDays: 0,
    outcomeObserved: false,
    journal: [],
    actionLog: [],
  };
}

function appendJournal(state: ChapterState, entry: ChapterJournalEntry) {
  return [...state.journal, entry];
}

function startInvestigation(state: ChapterState): ChapterState {
  return {
    ...state,
    phase: "investigate",
    introIndex: CHAPTER_INTRO.length,
    journal: appendJournal(state, {
      id: "east-bridge:arrival",
      day: 0,
      kind: "arrival",
      title: "Night arrival in Rivergate",
      text: "East Bridge is closed after inspection. The south crossing remains available. Investigate before committing chapter funds.",
      evidenceIds: [],
    }),
  };
}

/** Unknown or out-of-order actions are rejected without changing state. */
export function reduceChapter(
  state: ChapterState,
  event: ChapterEvent,
): ChapterState {
  let next = state;
  switch (event.type) {
    case "advance-intro":
      if (state.phase !== "intro") return state;
      next =
        state.introIndex + 1 >= CHAPTER_INTRO.length
          ? startInvestigation(state)
          : { ...state, introIndex: state.introIndex + 1 };
      break;
    case "skip-intro":
      if (state.phase !== "intro") return state;
      next = startInvestigation(state);
      break;
    case "collect-evidence": {
      if (
        state.phase !== "investigate" ||
        !EVIDENCE_IDS.includes(event.id) ||
        state.evidence.includes(event.id)
      )
        return state;
      if (event.id !== "bridge" && !state.evidence.includes("bridge"))
        return state;
      const evidence = [...state.evidence, event.id];
      const record = CHAPTER_EVIDENCE[event.id];
      next = {
        ...state,
        evidence,
        phase:
          evidence.length === EVIDENCE_IDS.length ? "decision" : "investigate",
        journal: appendJournal(state, {
          id: `east-bridge:evidence:${event.id}`,
          day: 0,
          kind: "evidence",
          title: record.title,
          text: record.text,
          evidenceIds: [event.id],
        }),
      };
      break;
    }
    case "choose": {
      if (
        state.phase !== "decision" ||
        state.decision !== null ||
        !EVIDENCE_IDS.every((id) => state.evidence.includes(id))
      )
        return state;
      const choice = CHAPTER_CHOICES.find(
        (candidate) => candidate.id === event.decision,
      );
      if (!choice || state.budget < choice.cost) return state;
      next = {
        ...state,
        phase: "aftermath",
        decision: choice.id,
        budget: state.budget - choice.cost,
        journal: appendJournal(state, {
          id: "east-bridge:decision",
          day: 0,
          kind: "decision",
          title: choice.title,
          text: `${choice.cost.toLocaleString("en-US")} fictional civic credits committed. ${choice.description}`,
          evidenceIds: [...state.evidence],
        }),
      };
      break;
    }
    case "observe": {
      if (
        state.phase !== "aftermath" ||
        state.outcomeObserved ||
        !state.decision
      )
        return state;
      const choice = CHAPTER_CHOICES.find(
        (candidate) => candidate.id === state.decision,
      );
      if (!choice) return state;
      next = {
        ...state,
        elapsedDays: choice.durationDays,
        outcomeObserved: true,
      };
      const outcome = getChapterOutcome(next)!;
      next = {
        ...next,
        journal: appendJournal(next, {
          id: "east-bridge:outcome",
          day: next.elapsedDays,
          kind: "outcome",
          title: outcome.title,
          text: outcome.text,
          evidenceIds: [...state.evidence],
        }),
      };
      break;
    }
    case "finish":
      if (
        state.phase !== "aftermath" ||
        !state.outcomeObserved ||
        !state.decision
      )
        return state;
      next = {
        ...state,
        phase: "complete",
        journal: appendJournal(state, {
          id: "east-bridge:complete",
          day: state.elapsedDays,
          kind: "complete",
          title: "The city's next morning",
          text: "The opening chapter is recorded. Rivergate remains open to explore; unresolved costs and access limits remain in the journal.",
          evidenceIds: [...state.evidence],
        }),
      };
      break;
    default:
      return state;
  }
  return { ...next, actionLog: [...state.actionLog, canonicalEvent(event)!] };
}

export function getChapterOutcome(state: ChapterState): ChapterOutcome | null {
  if (!state.outcomeObserved || !state.decision) return null;
  const common = {
    bridgeOpen: state.decision === "repair",
    serviceActive: state.decision === "shuttle",
    diversionActive: state.decision !== "repair",
    remainingBudget: state.budget,
    elapsedDays: state.elapsedDays,
  };
  if (state.decision === "repair")
    return {
      ...common,
      title: "East Bridge reopens",
      text: "Fourteen chapter days later, the funded repair and safety-check interval is complete. East Bridge is open again. The chapter budget is 300,000 civic credits.",
      unresolved:
        "Most discretionary funds have been spent. Other requests will need a new budget decision; this chapter does not simulate them.",
      lines: [
        {
          speaker: "Maya",
          kind: "observation",
          text: "The barriers are down. That's a route people can use again. Thank you for seeing the work through.",
        },
        {
          speaker: "Malik",
          kind: "observation",
          text: "The scoped repair is complete. Fourteen days, including the check. That's what we agreed to fund.",
        },
        {
          speaker: "Leo",
          kind: "opinion",
          text: "One crossing restored. Not every problem solved. But this promise has an ending we can point to.",
        },
      ],
    };
  if (state.decision === "shuttle")
    return {
      ...common,
      title: "Essential service begins",
      text: "Two chapter days later, the service vehicle is assigned to essential deliveries on the safe south route. East Bridge remains closed. The chapter budget is 1,320,000 civic credits.",
      unresolved:
        "A service assignment is not proof of a completed delivery. Passenger access, passing trade and the permanent bridge repair remain unresolved.",
      lines: [
        {
          speaker: "Maya",
          kind: "opinion",
          text: "There's a service for supplies now. That gives me something to plan around. It doesn't shorten the walk for my customers.",
        },
        {
          speaker: "Malik",
          kind: "observation",
          text: "The crossing is still closed. Keep the repair on the record; assigning a vehicle doesn't repair the bridge.",
        },
        {
          speaker: "Leo",
          kind: "opinion",
          text: "We funded a way to carry essentials around the problem. We haven't made the problem disappear.",
        },
      ],
    };
  return {
    ...common,
    title: "The long way round",
    text: "One chapter day later, diversion signs direct journeys to the safe south crossing. East Bridge remains closed. The chapter budget is 1,455,000 civic credits.",
    unresolved:
      "The longer route remains necessary. No bridge repair or essential-delivery service has been funded.",
    lines: [
      {
        speaker: "Maya",
        kind: "opinion",
        text: "At least people can find the route. But a sign doesn't give them the extra time the journey takes.",
      },
      {
        speaker: "Nia",
        kind: "observation",
        text: "No riverbank work was commissioned. Traffic still uses the other crossing. Those are the facts; they aren't a verdict on the whole city.",
      },
      {
        speaker: "Leo",
        kind: "opinion",
        text: "We kept most of the budget. We kept the difficult journey too. Both belong in the record.",
      },
    ],
  };
}

export function getChapterObjective(state: ChapterState): string {
  if (state.phase === "intro") return "Arrive in Rivergate with Leo.";
  if (state.phase === "investigate") {
    if (!state.evidence.includes("bridge"))
      return "Walk to East Bridge and read the closure notice.";
    const remaining = EVIDENCE_IDS.filter((id) => !state.evidence.includes(id));
    const names = remaining.map((id) => CHAPTER_EVIDENCE[id].speaker);
    return `Hear from ${names.join(", ")} before committing funds.`;
  }
  if (state.phase === "decision")
    return "Choose a funded response to the East Bridge closure.";
  if (state.phase === "aftermath" && !state.outcomeObserved) {
    const choice = CHAPTER_CHOICES.find(
      (candidate) => candidate.id === state.decision,
    );
    return `Return to East Bridge to advance ${choice?.durationDays ?? 0} chapter days and see the result.`;
  }
  if (state.phase === "aftermath")
    return "Read the result, then close the opening chapter.";
  return "Explore Rivergate. Your bridge decision is kept in the case journal.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Only these authored events may enter a save; raw input or dialogue never does. */
function canonicalEvent(value: unknown): ChapterEvent | null {
  if (!isRecord(value)) return null;
  if (
    value.type === "collect-evidence" &&
    EVIDENCE_IDS.includes(value.id as ChapterEvidenceId)
  ) {
    return { type: value.type, id: value.id as ChapterEvidenceId };
  }
  if (
    value.type === "choose" &&
    CHAPTER_CHOICES.some((choice) => choice.id === value.decision)
  ) {
    return { type: value.type, decision: value.decision as ChapterDecision };
  }
  if (
    ["advance-intro", "skip-intro", "observe", "finish"].includes(
      value.type as string,
    )
  ) {
    return {
      type: value.type as "advance-intro" | "skip-intro" | "observe" | "finish",
    };
  }
  return null;
}

function sameCanonicalValue(value: unknown, canonical: unknown): boolean {
  if (value === canonical) return true;
  if (Array.isArray(canonical))
    return (
      Array.isArray(value) &&
      value.length === canonical.length &&
      canonical.every((item, index) => sameCanonicalValue(value[index], item))
    );
  if (!isRecord(value) || !isRecord(canonical)) return false;
  const keys = Object.keys(canonical);
  return (
    Object.keys(value).length === keys.length &&
    keys.every(
      (key) =>
        Object.hasOwn(value, key) &&
        sameCanonicalValue(value[key], canonical[key]),
    )
  );
}

/** Rebuild through action gates, then reject any mismatched/extra state fields. */
export function validateChapterState(value: unknown): ChapterState | null {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !Array.isArray(value.actionLog) ||
    value.actionLog.length > 16
  )
    return null;
  let replay = createChapterState();
  for (const raw of value.actionLog) {
    const event = canonicalEvent(raw);
    if (!event || !sameCanonicalValue(raw, event)) return null;
    const next = reduceChapter(replay, event);
    if (next === replay) return null;
    replay = next;
  }
  return sameCanonicalValue(value, replay) ? replay : null;
}
