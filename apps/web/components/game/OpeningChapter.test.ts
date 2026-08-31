import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import OpeningChapter, { type OpeningChapterProps } from "./OpeningChapter";
import {
  createChapterState,
  reduceChapter,
  type ChapterState,
} from "../../lib/opening-chapter/story";

// The app uses Next's automatic JSX runtime; this repository's test transform
// defaults to classic JSX, including for the existing shared GameIcon.
beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

function render(
  state: ChapterState | null,
  extra: Partial<OpeningChapterProps> = {},
) {
  return renderToStaticMarkup(
    createElement(OpeningChapter, {
      state,
      onStart: vi.fn(),
      onEvent: vi.fn(),
      onExit: vi.fn(),
      onFocusEvidence: vi.fn(),
      onInspectNearby: vi.fn(),
      ...extra,
    }),
  );
}

function decisionState() {
  let state = reduceChapter(createChapterState(), { type: "skip-intro" });
  for (const id of ["bridge", "maya", "malik", "nia"] as const)
    state = reduceChapter(state, { type: "collect-evidence", id });
  return state;
}

describe("opening chapter overlay", () => {
  it("offers entry without exposing an investigation dashboard", () => {
    const html = render(null);
    expect(html).toContain("Begin opening chapter");
    expect(html).toContain("Explore freely");
    expect(html).not.toContain("Field notebook");
    expect(html).not.toContain("Repair East Bridge");
  });

  it("resumes an existing chapter without accidentally offering a reset", () => {
    const html = render(null, {
      savedState: decisionState(),
      onResume: vi.fn(),
    });
    expect(html).toContain("Continue opening chapter");
    expect(html).not.toContain("Begin opening chapter");
  });

  it("keeps the introduction subtitled and skippable without narration support", () => {
    const html = render(createChapterState());
    expect(html).toContain("Skip introduction");
    expect(html).toContain("Your canine companion");
    expect(html).toContain("So… you&#x27;re the person they sent.");
    expect(html).toContain("Voice off");
    expect(html).not.toContain("AI-generated");
  });

  it("only offers an in-person interaction when close enough, with bridge first", () => {
    const state = reduceChapter(createChapterState(), { type: "skip-intro" });
    expect(render(state)).not.toContain("Inspect the bridge");
    expect(render(state, { nearbyEvidence: "bridge" })).toContain(
      "Inspect the bridge",
    );
    expect(render(state, { nearbyEvidence: "maya" })).not.toContain(
      "Speak with Maya",
    );
    const inspected = reduceChapter(state, {
      type: "collect-evidence",
      id: "bridge",
    });
    expect(render(inspected, { nearbyEvidence: "maya" })).toContain(
      "Speak with Maya",
    );
  });

  it("requires an explicit return to the bridge before observing consequences", () => {
    const state = reduceChapter(decisionState(), {
      type: "choose",
      decision: "repair",
    });
    expect(render(state)).toContain("Travel to the bridge");
    expect(render(state)).not.toContain("Advance chapter time &amp; inspect");
    expect(render(state, { nearbyEvidence: "bridge" })).toContain(
      "Advance chapter time &amp; inspect",
    );
  });

  it("shows the observed result and preserves a clear completed state", () => {
    const chosen = reduceChapter(decisionState(), {
      type: "choose",
      decision: "repair",
    });
    const observed = reduceChapter(chosen, { type: "observe" });
    expect(render(observed)).toContain("East Bridge reopens");
    expect(render(observed)).toContain("Close the opening chapter");
    const complete = reduceChapter(observed, { type: "finish" });
    expect(render(complete)).toContain("Chapter complete");
    expect(render(complete)).toContain("Keep exploring Rivergate");
    expect(render(complete)).not.toContain("Begin opening chapter");
  });
});
