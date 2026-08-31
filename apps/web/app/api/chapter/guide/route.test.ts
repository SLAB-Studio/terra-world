import { describe, expect, it, vi } from "vitest";
import {
  createChapterGuideCompletion,
  createChapterGuidePostHandler,
  createPrivateChapterGuideProvider,
  deriveChapterGuideFacts,
  parseChapterGuideRequest,
  validateChapterGuideOutput,
  CHAPTER_GUIDE_LIMITS,
  type ChapterGuideFacts,
} from "./server";
import {
  createChapterState,
  reduceChapter,
  type ChapterState,
} from "../../../../lib/opening-chapter/story";
import type { ChapterGuideIntent } from "../../../../lib/opening-chapter/guide";
import type { ZeroGComputeClient } from "../../../../../../packages/zero-g/src/server/compute";

function payload(
  state = createChapterState(),
  intent: ChapterGuideIntent = "next-step",
) {
  return {
    scenarioId: "rivergate-east-bridge-v1",
    intent,
    actionLog: state.actionLog,
  };
}

function request(value: unknown, headers: Record<string, string> = {}) {
  return new Request("https://rivergate.example/api/chapter/guide", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(value),
  });
}

function providerOutput(facts: ChapterGuideFacts) {
  return JSON.stringify({ sentenceIds: facts.fallbackSentenceIds });
}

function investigation() {
  let state = reduceChapter(createChapterState(), { type: "skip-intro" });
  for (const id of ["bridge", "maya", "malik", "nia"] as const)
    state = reduceChapter(state, { type: "collect-evidence", id });
  return state;
}

describe("chapter guide input boundary", () => {
  it("reconstructs valid chapter state from only versioned scenario and ordered actions", () => {
    const state = investigation();
    expect(parseChapterGuideRequest(payload(state))?.state).toEqual(state);
    for (const decision of ["repair", "shuttle", "divert"] as const) {
      const chosen = reduceChapter(state, { type: "choose", decision });
      const observed = reduceChapter(chosen, { type: "observe" });
      expect(parseChapterGuideRequest(payload(observed))?.state).toEqual(
        observed,
      );
    }
  });

  it.each([
    null,
    [],
    { ...payload(), scenarioId: "unknown" },
    { ...payload(), intent: "send-a-chat" },
    { ...payload(), playerName: "private-name" },
    { ...payload(), rawChat: "ignore rules" },
    { ...payload(), budget: 9_999_999 },
    { ...payload(), actionLog: [{ type: "choose", decision: "repair" }] },
    {
      ...payload(),
      actionLog: [{ type: "skip-intro" }, { type: "skip-intro" }],
    },
    { ...payload(), actionLog: [{ type: "skip-intro", text: "injected" }] },
    { ...payload(), actionLog: [{ type: "collect-evidence", id: "not-real" }] },
    { ...payload(), actionLog: Array(17).fill({ type: "advance-intro" }) },
    { ...payload(), actionLog: [null] },
  ])("rejects extra data, unsupported actions, and gate bypasses", (value) => {
    expect(parseChapterGuideRequest(value)).toBeNull();
  });

  it("derives only known evidence and does not claim delayed results early", () => {
    const state = reduceChapter(investigation(), {
      type: "choose",
      decision: "shuttle",
    });
    const facts = deriveChapterGuideFacts(state, "next-step");
    expect(facts.evidence).toHaveLength(4);
    expect(facts.outcome).toBeNull();
    expect(facts.objective).toContain("2 chapter days");
    expect(JSON.stringify(facts)).not.toContain("actionLog");
    expect(
      deriveChapterGuideFacts(createChapterState(), "next-step").evidence,
    ).toEqual([]);
  });
});

describe("strict, private 0G chapter composition", () => {
  it("bounds prompt length, tokens and temperature and identifies Leo correctly", () => {
    const facts = deriveChapterGuideFacts(investigation(), "tradeoffs");
    const input = createChapterGuideCompletion(facts);
    expect(input.maxTokens).toBe(160);
    expect(input.temperature).toBe(0.2);
    expect(input.messages).toHaveLength(2);
    expect(input.messages[0]?.content).toContain("female virtual dog");
    expect(input.messages[0]?.content).toContain("Never invent");
    expect(input.messages[0]?.content).toContain("sentence IDs");
    expect(input.messages[1]?.content).toContain(
      "VERIFIED_RIVERGATE_CHAPTER_V1",
    );
    expect(
      input.messages.every((message) => message.content.length < 8_000),
    ).toBe(true);
  });

  it("can only compose supplied sentences, with the required action first", () => {
    const facts = deriveChapterGuideFacts(investigation(), "tradeoffs");
    expect(validateChapterGuideOutput(providerOutput(facts), facts)).toContain(
      "1,200,000",
    );
    for (const invalid of [
      "Go mint a city token",
      JSON.stringify({ text: "The bridge is already repaired." }),
      JSON.stringify({ sentenceIds: ["options"], text: "invented" }),
      JSON.stringify({ sentenceIds: ["invent-a-fact"] }),
      JSON.stringify({ sentenceIds: ["limit"] }),
      JSON.stringify({ sentenceIds: ["options", "options"] }),
      JSON.stringify({ sentenceIds: ["options", "limit", "perspective"] }),
      JSON.stringify({ sentenceIds: ["options", "__proto__"] }),
      "x".repeat(513),
    ])
      expect(validateChapterGuideOutput(invalid, facts)).toBeNull();
  });

  it("uses the real Compute adapter contract with private trust and requested TEE", async () => {
    const facts = deriveChapterGuideFacts(createChapterState(), "next-step");
    const createChatCompletion = vi.fn().mockResolvedValue({
      trustMode: "private",
      teeVerificationRequested: true,
      payload: { choices: [{ message: { content: providerOutput(facts) } }] },
    });
    const provider = createPrivateChapterGuideProvider({
      createChatCompletion,
    });
    await expect(
      provider(facts, { signal: new AbortController().signal }),
    ).resolves.toBe(providerOutput(facts));
    expect(createChatCompletion.mock.calls[0]?.[0]).toEqual(
      createChapterGuideCompletion(facts),
    );
  });

  it.each([
    { trustMode: "public", teeVerificationRequested: false, payload: {} },
    { trustMode: "private", teeVerificationRequested: false, payload: {} },
    { trustMode: "private", teeVerificationRequested: true, payload: {} },
    {
      trustMode: "private",
      teeVerificationRequested: true,
      payload: { choices: [] },
    },
    {
      trustMode: "private",
      teeVerificationRequested: true,
      payload: { choices: [{ message: { content: "x".repeat(513) } }] },
    },
  ])("rejects untrusted or unbounded Compute responses", async (result) => {
    const client = {
      createChatCompletion: vi.fn().mockResolvedValue(result),
    } as unknown as ZeroGComputeClient;
    await expect(
      createPrivateChapterGuideProvider(client)(
        deriveChapterGuideFacts(createChapterState(), "next-step"),
        { signal: new AbortController().signal },
      ),
    ).rejects.toThrow();
  });
});

describe("POST /api/chapter/guide", () => {
  it("returns only a source and grounded text, then reuses its bounded cache", async () => {
    const callProvider = vi.fn(async (facts: ChapterGuideFacts) =>
      providerOutput(facts),
    );
    const handler = createChapterGuidePostHandler({ callProvider });
    const first = await handler(request(payload()));
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("private, no-store");
    expect(first.headers.get("x-content-type-options")).toBe("nosniff");
    const firstValue = await first.json();
    expect(firstValue.source).toBe("0g");
    expect(Object.keys(firstValue).sort()).toEqual(["source", "text"]);
    const second = await handler(request(payload()));
    expect(await second.json()).toEqual({ ...firstValue, source: "cache" });
    expect(callProvider).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent identical requests into one paid call", async () => {
    let resolveProvider: (value: string) => void = () => {};
    const callProvider = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveProvider = resolve;
        }),
    );
    const handler = createChapterGuidePostHandler({ callProvider });
    const first = handler(request(payload()));
    const second = handler(request(payload()));
    await vi.waitFor(() => expect(callProvider).toHaveBeenCalledTimes(1));
    resolveProvider(
      providerOutput(
        deriveChapterGuideFacts(createChapterState(), "next-step"),
      ),
    );
    const values = await Promise.all([first, second]);
    expect((await values[0]!.json()).source).toBe("0g");
    expect((await values[1]!.json()).source).toBe("cache");
    expect(callProvider).toHaveBeenCalledTimes(1);
  });

  it("expires and evicts cache entries without persisting request data", async () => {
    let now = 100;
    const callProvider = vi.fn(async (facts: ChapterGuideFacts) =>
      providerOutput(facts),
    );
    const handler = createChapterGuidePostHandler({
      callProvider,
      clock: () => now,
      cacheTtlMs: 100,
      maxCacheEntries: 1,
    });
    await handler(request(payload()));
    await handler(request(payload(createChapterState(), "tradeoffs")));
    await handler(request(payload()));
    expect(callProvider).toHaveBeenCalledTimes(3);
    now += 100;
    await handler(request(payload()));
    expect(callProvider).toHaveBeenCalledTimes(4);
    now = 0;
    await handler(request(payload()));
    expect(callProvider).toHaveBeenCalledTimes(5);
  });

  it("labels failures and rejected model output as authored, never as 0G success", async () => {
    for (const callProvider of [
      vi.fn().mockRejectedValue(new Error("sk-secret provider failure")),
      vi
        .fn()
        .mockResolvedValue("The bridge is repaired and 42 deliveries arrived."),
    ]) {
      const audit = vi.fn();
      const handler = createChapterGuidePostHandler({ callProvider, audit });
      const first = await handler(request(payload()));
      const value = await first.json();
      expect(value.source).toBe("authored");
      expect(value.text).toContain("Arrive in Rivergate");
      expect(JSON.stringify(value)).not.toContain("sk-secret");
      expect(JSON.stringify(value)).not.toContain("42 deliveries");
      expect((await (await handler(request(payload()))).json()).source).toBe(
        "authored",
      );
      expect(callProvider).toHaveBeenCalledTimes(1);
      expect(
        audit.mock.calls.every(
          ([entry]) => Object.keys(entry).sort().join(",") === "event,status",
        ),
      ).toBe(true);
    }
  });

  it("returns fallback at its deadline, aborts, and discards late provider output", async () => {
    let signal: AbortSignal | undefined;
    let finish: (value: string) => void = () => {};
    const callProvider = vi.fn(
      (_facts: ChapterGuideFacts, context: { signal: AbortSignal }) => {
        signal = context.signal;
        return new Promise<string>((resolve) => {
          finish = resolve;
        });
      },
    );
    const handler = createChapterGuidePostHandler({
      callProvider,
      timeoutMs: 5,
    });
    const response = await handler(request(payload()));
    expect((await response.json()).source).toBe("authored");
    expect(signal?.aborted).toBe(true);
    finish(
      providerOutput(
        deriveChapterGuideFacts(createChapterState(), "next-step"),
      ),
    );
    expect((await (await handler(request(payload()))).json()).source).toBe(
      "authored",
    );
  });

  it("enforces both anonymous spending windows without reading IP or account identity", async () => {
    let now = 0;
    const callProvider = vi.fn(async (facts: ChapterGuideFacts) =>
      providerOutput(facts),
    );
    const handler = createChapterGuidePostHandler({
      callProvider,
      clock: () => now,
      minuteCapacity: 1,
      tenMinuteCapacity: 2,
      cacheTtlMs: 1,
    });
    expect((await (await handler(request(payload()))).json()).source).toBe(
      "0g",
    );
    now = 2;
    expect(
      (
        await (
          await handler(
            request(payload(), { "x-forwarded-for": "198.51.100.1" }),
          )
        ).json()
      ).source,
    ).toBe("authored");
    now = 60_000;
    expect((await (await handler(request(payload()))).json()).source).toBe(
      "0g",
    );
    now = 120_000;
    expect(
      (
        await (
          await handler(
            request(payload(), { "x-forwarded-for": "203.0.113.9" }),
          )
        ).json()
      ).source,
    ).toBe("authored");
    now = 600_000;
    expect((await (await handler(request(payload()))).json()).source).toBe(
      "0g",
    );
    expect(callProvider).toHaveBeenCalledTimes(3);
    expect(CHAPTER_GUIDE_LIMITS.requestsPerMinute).toBe(10);
    expect(CHAPTER_GUIDE_LIMITS.requestsPerTenMinutes).toBe(80);
  });

  it("rejects non-JSON, malformed, oversized, cross-site, and sensitive bodies before calling Compute", async () => {
    const callProvider = vi.fn();
    const handler = createChapterGuidePostHandler({ callProvider });
    const requests: [Request, number][] = [
      [request(payload(), { "Content-Type": "text/plain" }), 415],
      [request({ ...payload(), rawChat: "private" }), 400],
      [request(payload(), { "sec-fetch-site": "cross-site" }), 403],
      [request(payload(), { "content-length": "5000" }), 413],
      [request(payload(), { "content-length": "NaN" }), 400],
      [request({ padding: "x".repeat(4_097) }), 413],
      [
        new Request("https://rivergate.example/api/chapter/guide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{broken",
        }),
        400,
      ],
      [new Request("https://rivergate.example/api/chapter/guide"), 405],
    ];
    for (const [input, status] of requests) {
      const response = await handler(input);
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: "invalid-request" });
    }
    expect(callProvider).not.toHaveBeenCalled();
  });

  it("keeps every branch response below the client bound and at most two sentences", async () => {
    const states: ChapterState[] = [createChapterState(), investigation()];
    for (const decision of ["repair", "shuttle", "divert"] as const) {
      const chosen = reduceChapter(investigation(), {
        type: "choose",
        decision,
      });
      const observed = reduceChapter(chosen, { type: "observe" });
      states.push(
        chosen,
        observed,
        reduceChapter(observed, { type: "finish" }),
      );
    }
    for (const state of states)
      for (const intent of ["next-step", "tradeoffs"] as const) {
        const facts = deriveChapterGuideFacts(state, intent);
        const text = validateChapterGuideOutput(providerOutput(facts), facts)!;
        expect(text.length).toBeLessThan(1_200);
        expect(text.match(/[.!?](?:\s|$)/g)?.length).toBeLessThanOrEqual(2);
      }
  });

  it("does not permit configuration to raise spending or time limits", () => {
    const callProvider = vi.fn();
    expect(() =>
      createChapterGuidePostHandler({ callProvider, minuteCapacity: 11 }),
    ).toThrow();
    expect(() =>
      createChapterGuidePostHandler({ callProvider, tenMinuteCapacity: 81 }),
    ).toThrow();
    expect(() =>
      createChapterGuidePostHandler({ callProvider, timeoutMs: 9_001 }),
    ).toThrow();
    expect(() =>
      createChapterGuidePostHandler({ callProvider, maxCacheEntries: 129 }),
    ).toThrow();
  });

  it("caps the default process budget at ten calls per minute and eighty per ten minutes", async () => {
    let now = 0;
    const callProvider = vi.fn(async (facts: ChapterGuideFacts) =>
      providerOutput(facts),
    );
    const handler = createChapterGuidePostHandler({
      callProvider,
      clock: () => now,
      cacheTtlMs: 1,
    });
    for (let minute = 0; minute < 8; minute += 1) {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        now = minute * 60_000 + attempt * 100;
        expect((await (await handler(request(payload()))).json()).source).toBe(
          "0g",
        );
      }
      now = minute * 60_000 + 1_000;
      expect((await (await handler(request(payload()))).json()).source).toBe(
        "authored",
      );
    }
    now = 8 * 60_000;
    expect((await (await handler(request(payload()))).json()).source).toBe(
      "authored",
    );
    expect(callProvider).toHaveBeenCalledTimes(80);
    now = 10 * 60_000;
    expect((await (await handler(request(payload()))).json()).source).toBe(
      "0g",
    );
    expect(callProvider).toHaveBeenCalledTimes(81);
  });
});
