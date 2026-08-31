import type {
  ChapterGuideIntent,
  ChapterGuideRequest,
  ChapterGuideResponse,
} from "./guide";
import {
  CHAPTER_CHOICES,
  CHAPTER_SCENARIO,
  getChapterObjective,
  type ChapterEvent,
  type ChapterState,
} from "./story";

export const CHAPTER_GUIDE_TEXT_LIMIT = 1_200;

/** Strip unexpected properties even if a future caller extends its local events. */
export function chapterGuideRequest(
  state: ChapterState,
  intent: ChapterGuideIntent,
): ChapterGuideRequest {
  const actionLog = state.actionLog.map((event): ChapterEvent => {
    switch (event.type) {
      case "collect-evidence":
        return { type: event.type, id: event.id };
      case "choose":
        return { type: event.type, decision: event.decision };
      default:
        return { type: event.type };
    }
  });
  return { scenarioId: CHAPTER_SCENARIO.id, intent, actionLog };
}

/** The server's bounded plain-text response is never rendered as HTML. */
export function validateChapterGuideResponse(
  input: unknown,
): ChapterGuideResponse | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (
    Object.keys(value).length !== 2 ||
    typeof value.source !== "string" ||
    !["0g", "cache", "authored"].includes(value.source) ||
    typeof value.text !== "string" ||
    value.text.trim().length === 0 ||
    value.text.length > CHAPTER_GUIDE_TEXT_LIMIT ||
    Array.from(value.text).some((character) => {
      const code = character.charCodeAt(0);
      return (
        (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127
      );
    })
  )
    return null;
  return {
    source: value.source as ChapterGuideResponse["source"],
    text: value.text.trim(),
  };
}

export function chapterGuideSourceLabel(
  source: ChapterGuideResponse["source"],
) {
  if (source === "0g") return "0G-assisted briefing";
  if (source === "cache") return "Cached 0G briefing";
  return "Authored guidance · 0G unavailable";
}

export function chapterGuideFallback(
  state: ChapterState,
  intent: ChapterGuideIntent,
): ChapterGuideResponse {
  const allEvidence = ["bridge", "maya", "malik", "nia"].every((id) =>
    state.evidence.some((recorded) => recorded === id),
  );
  return {
    source: "authored",
    text:
      intent === "tradeoffs" && allEvidence && state.decision === null
        ? CHAPTER_CHOICES.map(
            (choice) => `${choice.title}: ${choice.tradeoff}`,
          ).join(" ")
        : getChapterObjective(state),
  };
}

export async function fetchChapterGuide(
  request: ChapterGuideRequest,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<ChapterGuideResponse> {
  const response = await fetcher("/api/chapter/guide", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Chapter guidance is unavailable.");
  const result = validateChapterGuideResponse(await response.json());
  if (!result) throw new Error("Chapter guidance could not be verified.");
  return result;
}
