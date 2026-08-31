import { describe, expect, it } from "vitest";
import {
  CHAPTER_CHOICES,
  CHAPTER_INTRO,
  CHAPTER_SCENARIO,
  createChapterState,
  getChapterObjective,
  getChapterOutcome,
  reduceChapter,
  validateChapterState,
  type ChapterDecision,
  type ChapterEvent,
  type ChapterState,
} from "./story";

function investigate(): ChapterState {
  let state = reduceChapter(createChapterState(), { type: "skip-intro" });
  for (const id of ["bridge", "maya", "malik", "nia"] as const) {
    state = reduceChapter(state, { type: "collect-evidence", id });
  }
  return state;
}

describe("the East Bridge opening chapter", () => {
  it("starts at night arrival with an isolated fictional budget", () => {
    const state = createChapterState();
    expect(state).toMatchObject({
      version: 1,
      phase: "intro",
      budget: 1_500_000,
      introIndex: 0,
    });
    expect(CHAPTER_SCENARIO.currencyDisclosure).toContain("Fictional");
    expect(getChapterOutcome(state)).toBeNull();
    expect(CHAPTER_INTRO.map((line) => line.shot)).toEqual([
      "river",
      "bakery",
      "bridge",
      "arrival",
    ]);
  });

  it("supports both a caption-by-caption arrival and a safe skip", () => {
    let state = createChapterState();
    for (let index = 0; index < CHAPTER_INTRO.length; index += 1) {
      expect(state.introIndex).toBe(index);
      state = reduceChapter(state, { type: "advance-intro" });
    }
    expect(state.phase).toBe("investigate");
    const skipped = reduceChapter(createChapterState(), { type: "skip-intro" });
    expect(state.journal).toEqual(skipped.journal);
    expect(state.evidence).toEqual([]);
    expect(validateChapterState(state)).toEqual(state);
    expect(reduceChapter(state, { type: "skip-intro" })).toBe(state);
    expect(reduceChapter(state, { type: "advance-intro" })).toBe(state);
  });

  it("requires the bridge inspection, then every resident, before any decision", () => {
    const arrival = createChapterState();
    expect(
      reduceChapter(arrival, { type: "collect-evidence", id: "bridge" }),
    ).toBe(arrival);
    let state = reduceChapter(arrival, { type: "skip-intro" });
    expect(reduceChapter(state, { type: "collect-evidence", id: "maya" })).toBe(
      state,
    );
    expect(reduceChapter(state, { type: "choose", decision: "repair" })).toBe(
      state,
    );
    expect(reduceChapter(state, { type: "observe" })).toBe(state);
    expect(reduceChapter(state, { type: "finish" })).toBe(state);
    expect(getChapterObjective(state)).toContain("East Bridge");
    state = reduceChapter(state, { type: "collect-evidence", id: "bridge" });
    for (const id of ["nia", "maya"] as const) {
      state = reduceChapter(state, { type: "collect-evidence", id });
      expect(state.phase).toBe("investigate");
      expect(reduceChapter(state, { type: "choose", decision: "repair" })).toBe(
        state,
      );
    }
    expect(getChapterObjective(state)).toContain("Malik");
    state = reduceChapter(state, { type: "collect-evidence", id: "malik" });
    expect(state.phase).toBe("decision");
    expect(state.budget).toBe(CHAPTER_SCENARIO.availableBudget);
  });

  it.each(CHAPTER_CHOICES)(
    "replays the complete $id path with its actual cost and delay",
    (choice) => {
      const before = investigate();
      const chosen = reduceChapter(before, {
        type: "choose",
        decision: choice.id,
      });
      expect(chosen).toMatchObject({
        phase: "aftermath",
        budget: 1_500_000 - choice.cost,
        elapsedDays: 0,
        outcomeObserved: false,
      });
      expect(getChapterOutcome(chosen)).toBeNull();
      expect(getChapterObjective(chosen)).toContain(
        String(choice.durationDays),
      );
      expect(reduceChapter(chosen, { type: "finish" })).toBe(chosen);
      const observed = reduceChapter(chosen, { type: "observe" });
      expect(observed.elapsedDays).toBe(choice.durationDays);
      expect(getChapterOutcome(observed)).toMatchObject({
        bridgeOpen: choice.id === "repair",
        serviceActive: choice.id === "shuttle",
        diversionActive: choice.id !== "repair",
        remainingBudget: 1_500_000 - choice.cost,
        elapsedDays: choice.durationDays,
      });
      const finished = reduceChapter(observed, { type: "finish" });
      expect(finished.phase).toBe("complete");
      expect(finished.journal.at(-1)?.day).toBe(choice.durationDays);
      expect(new Set(finished.journal.map((entry) => entry.id)).size).toBe(
        finished.journal.length,
      );
      const replay = finished.actionLog.reduce(
        reduceChapter,
        createChapterState(),
      );
      expect(replay).toEqual(finished);
      expect(
        validateChapterState(JSON.parse(JSON.stringify(finished))),
      ).toEqual(finished);
      expect(getChapterObjective(finished)).toContain("Explore Rivergate");
      expect(before.budget).toBe(1_500_000);
    },
  );

  it("never charges twice, replaces a decision, or applies a delayed result twice", () => {
    let state = reduceChapter(createChapterState(), { type: "skip-intro" });
    state = reduceChapter(state, { type: "collect-evidence", id: "bridge" });
    expect(
      reduceChapter(state, { type: "collect-evidence", id: "bridge" }),
    ).toBe(state);
    const chosen = reduceChapter(investigate(), {
      type: "choose",
      decision: "shuttle",
    });
    for (const decision of [
      "repair",
      "shuttle",
      "divert",
    ] as ChapterDecision[]) {
      expect(reduceChapter(chosen, { type: "choose", decision })).toBe(chosen);
    }
    const observed = reduceChapter(chosen, { type: "observe" });
    expect(reduceChapter(observed, { type: "observe" })).toBe(observed);
    const complete = reduceChapter(observed, { type: "finish" });
    for (const event of [
      { type: "finish" },
      { type: "observe" },
      { type: "choose", decision: "repair" },
      { type: "collect-evidence", id: "maya" },
      { type: "skip-intro" },
    ] as ChapterEvent[])
      expect(reduceChapter(complete, event)).toBe(complete);
  });

  it("ignores unsupported actions and refuses an unaffordable choice", () => {
    const state = investigate();
    expect(
      reduceChapter(state, {
        type: "choose",
        decision: "invent-a-ferry",
      } as unknown as ChapterEvent),
    ).toBe(state);
    expect(
      reduceChapter(state, {
        type: "arbitrary-ai-command",
      } as unknown as ChapterEvent),
    ).toBe(state);
    const shortBudget = { ...state, budget: 1 };
    expect(
      reduceChapter(shortBudget, { type: "choose", decision: "repair" }),
    ).toBe(shortBudget);
  });

  it("rejects forged phase, outcomes, costs, history, raw chat and incompatible versions", () => {
    const state = investigate();
    for (const invalid of [
      null,
      [],
      { ...state, version: 2 },
      { ...state, budget: 9_000_000 },
      { ...state, phase: "complete" },
      { ...state, decision: "repair" },
      { ...state, elapsedDays: 14 },
      { ...state, outcomeObserved: true },
      { ...state, evidence: ["bridge", "maya", "maya", "nia"] },
      { ...state, playerName: "private name" },
      { ...state, journal: [...state.journal, { text: "raw private chat" }] },
      {
        ...state,
        actionLog: [
          ...state.actionLog,
          { type: "collect-evidence", id: "maya" },
        ],
      },
      {
        ...state,
        actionLog: [
          { type: "skip-intro", playerName: "private name" },
          ...state.actionLog.slice(1),
        ],
      },
      {
        ...state,
        actionLog: Array.from({ length: 100 }, () => ({ type: "skip-intro" })),
      },
    ])
      expect(validateChapterState(invalid)).toBeNull();
  });

  it("rejects a fabricated decision-phase save even if it contains all evidence names", () => {
    const forged = {
      ...createChapterState(),
      phase: "decision",
      evidence: ["bridge", "maya", "malik", "nia"],
    };
    expect(validateChapterState(forged)).toBeNull();
  });

  it("has no wall-clock advancement or hidden offline costs", () => {
    const state = reduceChapter(investigate(), {
      type: "choose",
      decision: "repair",
    });
    const restored = validateChapterState(JSON.parse(JSON.stringify(state)));
    expect(restored?.elapsedDays).toBe(0);
    expect(restored?.budget).toBe(300_000);
    expect(restored?.outcomeObserved).toBe(false);
  });
});
