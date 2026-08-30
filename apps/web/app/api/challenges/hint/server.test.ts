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
      message: "Inspect Sunny House's missing power service.",
      hints: [
        "Inspect Sunny House.",
        "Solar power is the missing service.",
        "Add solar power to Sunny House.",
      ],
    });
    const handler = createChallengeHintPostHandler({ callProvider });
    const response = await handler(requestFor(VALID_BODY));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      message: "Inspect Sunny House's missing power service.",
      hints: [
        "Inspect Sunny House.",
        "Solar power is the missing service.",
        "Add solar power to Sunny House.",
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
    const body = (await response.json()) as {
      source: string;
      message: string;
      hints: string[];
    };

    expect(response.status).toBe(200);
    expect(body.source).toBe("authored-server");
    expect(body.message).toBe(
      "Inspect the property services, then address the missing upgrades.",
    );
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

  it("requests grounded adult advice from Leo with private Compute verification", async () => {
    const createChatCompletion = vi.fn().mockResolvedValue({
      payload: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                message: "Inspect the missing service at Sunny House.",
                hints: [
                  "Inspect the property services.",
                  "Find the missing power.",
                  "Add solar power to Sunny House.",
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
    const call = createChatCompletion.mock.calls[0]?.[0] as {
      messages: { role: string; content: string }[];
    };
    const systemPrompt = call.messages[0]?.content;
    expect(systemPrompt).toContain("You are Leo");
    expect(systemPrompt).toContain("game for adults set in Rivergate");
    expect(systemPrompt).toContain("Use only the verified challenge facts");
    expect(systemPrompt).toContain("Do not invent budgets");
    expect(systemPrompt).toContain(
      "Never ask for or mention a player's identity",
    );
    expect(systemPrompt).not.toMatch(/children aged|tiny nudge/iu);
  });

  it.each([
    { trustMode: "standard", teeVerificationRequested: true },
    { trustMode: "private", teeVerificationRequested: false },
  ])(
    "retains authored advice when the Compute privacy boundary fails: %j",
    async (privacy) => {
      const provider = createPrivateZeroGChallengeHintProvider({
        createChatCompletion: vi.fn().mockResolvedValue({
          ...privacy,
          payload: {},
        }),
      });
      const handler = createChallengeHintPostHandler({
        callProvider: provider,
      });
      const response = await handler(requestFor(VALID_BODY));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(
        expect.objectContaining({ source: "authored-server" }),
      );
    },
  );
});

function requestFor(value: unknown): Request {
  return new Request("http://terra.test/api/challenges/hint", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
}
