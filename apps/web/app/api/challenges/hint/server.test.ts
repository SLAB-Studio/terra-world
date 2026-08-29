import { describe, expect, it, vi } from "vitest";

import {
  createChallengeHintPostHandler,
  createPrivateZeroGChallengeHintProvider,
} from "./server";

const VALID_BODY = {
  schemaVersion: 1,
  challengeId: "sunny-after-dark",
  completedGoalIds: [],
  moves: 0,
} as const;

describe("challenge hint API", () => {
  it("returns a validated private 0G hint", async () => {
    const callProvider = vi.fn().mockResolvedValue({
      message: "Let us look for the home that needs clean light.",
      hints: [
        "Look for dark windows.",
        "Ayo needs clean electricity.",
        "Add Sun light to Sunny House.",
      ],
    });
    const handler = createChallengeHintPostHandler({ callProvider });
    const response = await handler(requestFor(VALID_BODY));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      message: "Let us look for the home that needs clean light.",
      hints: [
        "Look for dark windows.",
        "Ayo needs clean electricity.",
        "Add Sun light to Sunny House.",
      ],
      source: "private-compute",
    });
    expect(callProvider).toHaveBeenCalledTimes(1);
  });

  it("falls back to the authored ladder when Compute is unavailable", async () => {
    const handler = createChallengeHintPostHandler({
      callProvider: vi.fn().mockRejectedValue(new Error("offline")),
    });
    const response = await handler(requestFor(VALID_BODY));
    const body = (await response.json()) as { source: string; hints: string[] };

    expect(response.status).toBe(200);
    expect(body.source).toBe("authored-server");
    expect(body.hints).toHaveLength(3);
  });

  it("rejects unknown challenge IDs and extra child data", async () => {
    const callProvider = vi.fn();
    const handler = createChallengeHintPostHandler({ callProvider });

    const unknown = await handler(
      requestFor({ ...VALID_BODY, challengeId: "invented" }),
    );
    const extra = await handler(
      requestFor({ ...VALID_BODY, childName: "do-not-send" }),
    );

    expect(unknown.status).toBe(400);
    expect(extra.status).toBe(400);
    expect(callProvider).not.toHaveBeenCalled();
  });

  it("stops oversized request bodies before parsing or Compute", async () => {
    const callProvider = vi.fn();
    const handler = createChallengeHintPostHandler({ callProvider });
    const response = await handler(
      new Request("http://terra.test/api/challenges/hint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: `{"padding":"${"x".repeat(5_000)}"}`,
      }),
    );

    expect(response.status).toBe(413);
    expect(callProvider).not.toHaveBeenCalled();
  });

  it("requires private, TEE-verified Compute output", async () => {
    const createChatCompletion = vi.fn().mockResolvedValue({
      payload: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                message: "Try one small town clue.",
                hints: [
                  "Look at the windows.",
                  "Find the missing power.",
                  "Add Sun light to Sunny House.",
                ],
              }),
            },
          },
        ],
      },
      trustMode: "private",
      teeVerificationRequested: true,
    });
    const provider = createPrivateZeroGChallengeHintProvider({
      createChatCompletion,
    });
    const handler = createChallengeHintPostHandler({ callProvider: provider });
    const response = await handler(requestFor(VALID_BODY));
    const body = (await response.json()) as { source: string };

    expect(body.source).toBe("private-compute");
    expect(createChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: 220, temperature: 0.2 }),
    );
  });
});

function requestFor(value: unknown): Request {
  return new Request("http://terra.test/api/challenges/hint", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
}
