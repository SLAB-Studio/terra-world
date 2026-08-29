import { describe, expect, it } from "vitest";

import {
  CITY_GUIDE_RESPONSE_LIMITS,
  CityGuideResponseSchema,
  resolveCityGuideResponse,
  validateCityGuideResponse,
} from "./guide-output";
import {
  FORCED_INVALID_PROVIDER_FIXTURES,
  GOLDEN_EXPLAIN_RESPONSE,
  GOLDEN_HINT_RESPONSE,
  GOLDEN_MEMORY_RESPONSE,
  GOLDEN_REACT_RESPONSE,
  makeGuideRequest,
} from "./guide-output.fixtures";

describe("CityGuide provider output validation", () => {
  it.each([
    ["explain", GOLDEN_EXPLAIN_RESPONSE],
    ["hint", GOLDEN_HINT_RESPONSE],
    ["react", GOLDEN_REACT_RESPONSE],
    ["memory", GOLDEN_MEMORY_RESPONSE],
  ] as const)("accepts the golden %s response", (task, response) => {
    expect(
      validateCityGuideResponse(
        makeGuideRequest(task),
        JSON.stringify(response),
      ),
    ).toEqual({ ok: true, value: response });
  });

  it.each(FORCED_INVALID_PROVIDER_FIXTURES)(
    "rejects forced-invalid provider output: $label",
    ({ output }) => {
      expect(
        validateCityGuideResponse(makeGuideRequest("explain"), output).ok,
      ).toBe(false);
    },
  );

  it("requires strict JSON rather than parsed objects or fenced content", () => {
    expect(
      validateCityGuideResponse(makeGuideRequest(), GOLDEN_EXPLAIN_RESPONSE),
    ).toEqual({ ok: false, code: "not-json" });
    expect(
      validateCityGuideResponse(
        makeGuideRequest(),
        `${JSON.stringify(GOLDEN_EXPLAIN_RESPONSE)} trailing prose`,
      ),
    ).toEqual({ ok: false, code: "not-json" });
  });

  it("enforces age-specific reading limits", () => {
    const tooManyWords = Array.from(
      { length: CITY_GUIDE_RESPONSE_LIMITS.messageWords["8-10"] + 1 },
      () => "water",
    ).join(" ");
    const result = validateCityGuideResponse(
      makeGuideRequest("explain", "8-10"),
      JSON.stringify({
        ...GOLDEN_EXPLAIN_RESPONSE,
        message: tooManyWords,
      }),
    );
    expect(result).toEqual({ ok: false, code: "reading-limit" });
  });

  it("allows at most one properly formed reflective question", () => {
    expect(
      validateCityGuideResponse(
        makeGuideRequest("explain"),
        JSON.stringify({
          ...GOLDEN_EXPLAIN_RESPONSE,
          reflectiveQuestion: "What changed? What could happen next?",
        }),
      ),
    ).toEqual({ ok: false, code: "reading-limit" });

    expect(
      validateCityGuideResponse(
        makeGuideRequest("hint"),
        JSON.stringify({
          ...GOLDEN_HINT_RESPONSE,
          reflectiveQuestion: "What should you inspect?",
        }),
      ),
    ).toEqual({ ok: false, code: "wrong-task-shape" });
  });

  it("requires exactly three different ordered hints for hint tasks", () => {
    expect(
      validateCityGuideResponse(
        makeGuideRequest("hint"),
        JSON.stringify({ ...GOLDEN_HINT_RESPONSE, hints: ["Look nearby."] }),
      ),
    ).toEqual({ ok: false, code: "schema-invalid" });

    expect(
      validateCityGuideResponse(
        makeGuideRequest("hint"),
        JSON.stringify({
          ...GOLDEN_HINT_RESPONSE,
          hints: ["Look nearby.", "Look nearby.", "Look nearby."],
        }),
      ),
    ).toEqual({ ok: false, code: "schema-invalid" });

    expect(
      validateCityGuideResponse(
        makeGuideRequest("explain"),
        JSON.stringify(GOLDEN_HINT_RESPONSE),
      ),
    ).toEqual({ ok: false, code: "wrong-task-shape" });
  });

  it("grounds structured memories in the verified milestone and turn", () => {
    expect(
      validateCityGuideResponse(
        makeGuideRequest("memory"),
        JSON.stringify({
          ...GOLDEN_MEMORY_RESPONSE,
          memoryCandidate: {
            ...GOLDEN_MEMORY_RESPONSE.memoryCandidate,
            milestoneId: "invented-milestone",
          },
        }),
      ),
    ).toEqual({ ok: false, code: "ungrounded" });

    expect(() =>
      CityGuideResponseSchema.parse({
        ...GOLDEN_MEMORY_RESPONSE,
        memoryCandidate: {
          ...GOLDEN_MEMORY_RESPONSE.memoryCandidate,
          personalNote: "The child likes risky choices",
        },
      }),
    ).toThrow();
  });

  it("rejects prohibited data, personal solicitation, links, and unsafe topics", () => {
    for (const message of [
      "Email me at child@example.com.",
      "What is your home address?",
      "Join me on Discord for more hints.",
      "Let us talk about gambling instead.",
    ]) {
      const result = validateCityGuideResponse(
        makeGuideRequest("explain"),
        JSON.stringify({ ...GOLDEN_EXPLAIN_RESPONSE, message }),
      );
      expect(result).toEqual({ ok: false, code: "prohibited-content" });
    }
  });

  it("uses an authored fallback without returning provider text or errors", () => {
    const result = resolveCityGuideResponse({
      request: makeGuideRequest("explain"),
      providerOutput: JSON.stringify({
        ...GOLDEN_EXPLAIN_RESPONSE,
        message: "Tell me your name before I explain.",
      }),
      fallback: GOLDEN_EXPLAIN_RESPONSE,
    });

    expect(result).toEqual({
      ok: true,
      source: "fallback",
      value: GOLDEN_EXPLAIN_RESPONSE,
    });
    expect(JSON.stringify(result)).not.toContain("Tell me your name");
    expect(JSON.stringify(result)).not.toContain("prohibited-content");
  });

  it("returns a content-free failure when even the supplied fallback is invalid", () => {
    expect(
      resolveCityGuideResponse({
        request: makeGuideRequest("react"),
        providerOutput: "not json",
        fallback: { message: "also malformed" },
      }),
    ).toEqual({ ok: false, source: "none" });
  });
});
