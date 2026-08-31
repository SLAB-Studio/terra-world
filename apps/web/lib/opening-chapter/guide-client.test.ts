import { describe, expect, it, vi } from "vitest";
import {
  CHAPTER_GUIDE_TEXT_LIMIT,
  chapterGuideFallback,
  chapterGuideRequest,
  chapterGuideSourceLabel,
  fetchChapterGuide,
  validateChapterGuideResponse,
} from "./guide-client";
import { createChapterState, reduceChapter } from "./story";

describe("opening chapter guide client", () => {
  it("accepts only bounded, attributed plain-text replies", () => {
    for (const source of ["0g", "cache", "authored"])
      expect(
        validateChapterGuideResponse({ source, text: "  Visit the bridge.  " }),
      ).toEqual({ source, text: "Visit the bridge." });
    for (const value of [
      null,
      [],
      {},
      { source: "live", text: "Hello" },
      { source: "0g", text: "" },
      { source: "0g", text: "  " },
      { source: "0g", text: "a".repeat(CHAPTER_GUIDE_TEXT_LIMIT + 1) },
      { source: "0g", text: "hello\u0000" },
      { source: "0g", text: "Hello", metadata: "unexpected" },
    ])
      expect(validateChapterGuideResponse(value)).toBeNull();
  });

  it("sends only the fixed scenario, intent and allowlisted chapter events", () => {
    const state = {
      ...createChapterState(),
      playerName: "Private name",
      chat: "Private chat",
      actionLog: [
        { type: "skip-intro" as const, secret: "do not send" },
        {
          type: "collect-evidence" as const,
          id: "bridge" as const,
          name: "do not send",
        },
      ],
    };
    const request = chapterGuideRequest(state, "next-step");
    expect(request).toEqual({
      scenarioId: "rivergate-east-bridge-v1",
      intent: "next-step",
      actionLog: [
        { type: "skip-intro" },
        { type: "collect-evidence", id: "bridge" },
      ],
    });
    expect(JSON.stringify(request)).not.toMatch(/Private|secret|name|chat/);
  });

  it("keeps source labels honest", () => {
    expect(chapterGuideSourceLabel("0g")).toBe("0G-assisted briefing");
    expect(chapterGuideSourceLabel("cache")).toBe("Cached 0G briefing");
    expect(chapterGuideSourceLabel("authored")).toBe(
      "Authored guidance · 0G unavailable",
    );
  });

  it("falls back to the current objective and only compares options after investigation", () => {
    let state = reduceChapter(createChapterState(), { type: "skip-intro" });
    expect(chapterGuideFallback(state, "tradeoffs").source).toBe("authored");
    expect(chapterGuideFallback(state, "tradeoffs").text).not.toContain(
      "Repair East Bridge:",
    );
    for (const id of ["bridge", "maya", "malik", "nia"] as const)
      state = reduceChapter(state, { type: "collect-evidence", id });
    const fallback = chapterGuideFallback(state, "tradeoffs");
    expect(fallback.text).toContain("Repair East Bridge:");
    expect(fallback.text.length).toBeLessThanOrEqual(CHAPTER_GUIDE_TEXT_LIMIT);
  });

  it("uses a cancellable same-origin POST without hidden context", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ source: "authored", text: "Visit the bridge." }),
        ),
      );
    const signal = new AbortController().signal;
    const request = chapterGuideRequest(createChapterState(), "next-step");
    expect(await fetchChapterGuide(request, signal, fetcher)).toEqual({
      source: "authored",
      text: "Visit the bridge.",
    });
    expect(fetcher).toHaveBeenCalledWith("/api/chapter/guide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
      cache: "no-store",
    });
  });

  it("rejects failed or malformed server responses instead of labelling them verified", async () => {
    const request = chapterGuideRequest(createChapterState(), "next-step");
    const signal = new AbortController().signal;
    await expect(
      fetchChapterGuide(
        request,
        signal,
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response("offline", { status: 503 })),
      ),
    ).rejects.toThrow("unavailable");
    await expect(
      fetchChapterGuide(
        request,
        signal,
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            new Response(JSON.stringify({ source: "0g", text: 13 })),
          ),
      ),
    ).rejects.toThrow("verified");
  });
});
