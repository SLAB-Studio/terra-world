import type { ChapterEvent } from "./story";

/** Consent is requested in the UI before this fixed, fictional context is sent. */
export type ChapterGuideIntent = "next-step" | "tradeoffs";
export type ChapterGuideRequest = Readonly<{
  scenarioId: "rivergate-east-bridge-v1";
  intent: ChapterGuideIntent;
  actionLog: readonly ChapterEvent[];
}>;
export type ChapterGuideResponse = Readonly<{
  source: "0g" | "cache" | "authored";
  text: string;
}>;

export const CHAPTER_GUIDE_DISCLOSURE =
  "Ask 0G Compute to compose a short briefing from this chapter's fictional actions. No name, typed conversation or wallet details are sent. If unavailable, Leo uses an authored briefing.";
