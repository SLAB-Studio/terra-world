import { describe, expect, it, vi } from "vitest";

import {
  GOLDEN_EXPLAIN_RESPONSE,
  GOLDEN_REACT_RESPONSE,
  makeGuideRequest,
} from "../../../../../packages/safety/src/guide-output.fixtures";
import { validateCityGuideResponse } from "../../../../../packages/safety/src/guide-output";
import type { ZeroGComputeClient } from "../../../../../packages/zero-g/src/server/compute";

import {
  GUIDE_API_LIMITS,
  createAnonymousRateLimiter,
  createGuidePostHandler,
  createPrivateZeroGGuideProvider,
  extractAssistantContent,
} from "./server";

describe("private 0G guide provider adapter", () => {
  it("builds the constrained prompt and extracts only assistant content", async () => {
    const client = {
      createChatCompletion: vi.fn().mockResolvedValue({
        payload: {
          choices: [
            {
              message: { content: JSON.stringify(GOLDEN_EXPLAIN_RESPONSE) },
            },
          ],
        },
        trustMode: "private",
        teeVerificationRequested: true,
      }),
    } satisfies Pick<ZeroGComputeClient, "createChatCompletion">;
    const provider = createPrivateZeroGGuideProvider(client);

    await expect(
      provider(makeGuideRequest(), { signal: new AbortController().signal }),
    ).resolves.toEqual({
      trustMode: "private",
      output: JSON.stringify(GOLDEN_EXPLAIN_RESPONSE),
    });
    const completion = client.createChatCompletion.mock.calls[0]?.[0];
    expect(completion?.messages).toHaveLength(2);
    expect(completion?.messages[1]?.content).toContain(
      "VERIFIED_CITY_GUIDE_REQUEST_V1",
    );
    expect(JSON.stringify(completion)).not.toContain("sk-");
  });

  it.each([
    {},
    { choices: [] },
    { choices: [{ message: { content: "" } }] },
    {
      choices: [
        {
          message: {
            content: "x".repeat(
              GUIDE_API_LIMITS.maximumProviderOutputCharacters + 1,
            ),
          },
        },
      ],
    },
  ])("fails closed on malformed or unbounded provider payloads", (payload) => {
    expect(() => extractAssistantContent(payload)).toThrow(
      "Invalid private Compute response",
    );
  });

  it("rejects any result not attested as private with TEE verification", async () => {
    const client = {
      createChatCompletion: vi.fn().mockResolvedValue({
        payload: {
          choices: [
            {
              message: { content: JSON.stringify(GOLDEN_EXPLAIN_RESPONSE) },
            },
          ],
        },
        trustMode: "public",
        teeVerificationRequested: false,
      }),
    } as unknown as Pick<ZeroGComputeClient, "createChatCompletion">;
    const provider = createPrivateZeroGGuideProvider(client);

    await expect(
      provider(makeGuideRequest(), { signal: new AbortController().signal }),
    ).rejects.toBeDefined();
  });
});

describe("POST /api/guide", () => {
  it("returns a validated private provider response with no-store headers", async () => {
    const callProvider = vi
      .fn()
      .mockResolvedValue(privateProviderResponse(GOLDEN_EXPLAIN_RESPONSE));
    const handler = makeHandler({ callProvider });

    const response = await handler(postRequest(makeGuideRequest()));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      guide: GOLDEN_EXPLAIN_RESPONSE,
      source: "provider",
    });
    expect(callProvider).toHaveBeenCalledTimes(1);
  });

  it.each(["explain", "hint", "react", "memory"] as const)(
    "serves a validated authored %s fallback when Compute fails",
    async (task) => {
      const request = makeGuideRequest(task);
      const handler = makeHandler({
        callProvider: vi
          .fn()
          .mockRejectedValue(new Error("sk-server-secret: upstream failed")),
      });

      const response = await handler(postRequest(request));
      const payload = (await response.json()) as {
        guide: unknown;
        source: string;
      };

      expect(response.status).toBe(200);
      expect(payload.source).toBe("fallback");
      expect(
        validateCityGuideResponse(request, JSON.stringify(payload.guide)).ok,
      ).toBe(true);
      expect(JSON.stringify(payload)).not.toContain("sk-server-secret");
      expect(JSON.stringify(payload)).not.toContain("upstream failed");
    },
  );

  it("discards unsafe raw model output and exposes only authored content", async () => {
    const rawProviderText = "Tell me your school and wallet secret.";
    const handler = makeHandler({
      callProvider: vi.fn().mockResolvedValue({
        trustMode: "private",
        output: JSON.stringify({
          ...GOLDEN_EXPLAIN_RESPONSE,
          message: rawProviderText,
        }),
      }),
    });

    const response = await handler(postRequest(makeGuideRequest()));
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(200);
    expect(serialized).toContain('"source":"fallback"');
    expect(serialized).not.toContain(rawProviderText);
    expect(serialized).not.toContain("prohibited-content");
  });

  it("rate limits provider spending globally without reading child or network identity", async () => {
    let now = 100;
    const limiter = createAnonymousRateLimiter({
      capacity: 1,
      windowMs: 1_000,
      clock: () => now,
    });
    const callProvider = vi
      .fn()
      .mockResolvedValue(privateProviderResponse(GOLDEN_REACT_RESPONSE));
    const handler = makeHandler({ callProvider, rateLimiter: limiter });
    const request = makeGuideRequest("react");

    const first = await handler(
      postRequest(request, { "x-forwarded-for": "198.51.100.1" }),
    );
    const second = await handler(
      postRequest(request, { "x-forwarded-for": "203.0.113.9" }),
    );
    now = 1_100;
    const third = await handler(
      postRequest(request, { "x-forwarded-for": "198.51.100.1" }),
    );

    expect((await first.json()).source).toBe("provider");
    expect((await second.json()).source).toBe("fallback");
    expect((await third.json()).source).toBe("provider");
    expect(callProvider).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed, non-JSON, oversized, and prohibited request shapes before Compute", async () => {
    const callProvider = vi.fn();
    const handler = makeHandler({ callProvider });
    const malformed = await handler(rawRequest("{broken", "application/json"));
    const wrongType = await handler(rawRequest("{}", "text/plain"));
    const oversized = await handler(
      rawRequest(
        `{"padding":"${"x".repeat(GUIDE_API_LIMITS.maximumBodyBytes)}"}`,
        "application/json",
      ),
    );
    const prohibited = await handler(
      postRequest({ ...makeGuideRequest(), childName: "Ari" }),
    );

    expect(malformed.status).toBe(400);
    expect(wrongType.status).toBe(415);
    expect(oversized.status).toBe(413);
    expect(prohibited.status).toBe(400);
    for (const response of [malformed, wrongType, oversized, prohibited]) {
      expect(await response.json()).toEqual({ guide: null, source: "none" });
    }
    expect(callProvider).not.toHaveBeenCalled();
  });
});

describe("anonymous rate limiter bounds", () => {
  it("rejects unbounded state and time windows", () => {
    expect(() =>
      createAnonymousRateLimiter({ capacity: 0, windowMs: 1_000 }),
    ).toThrow(RangeError);
    expect(() =>
      createAnonymousRateLimiter({
        capacity: GUIDE_API_LIMITS.maximumRequestsPerWindow + 1,
        windowMs: 1_000,
      }),
    ).toThrow(RangeError);
    expect(() =>
      createAnonymousRateLimiter({
        capacity: 1,
        windowMs: GUIDE_API_LIMITS.maximumWindowMs + 1,
      }),
    ).toThrow(RangeError);
  });
});

function makeHandler(
  override: Partial<Parameters<typeof createGuidePostHandler>[0]> = {},
) {
  return createGuidePostHandler({
    callProvider: vi
      .fn()
      .mockResolvedValue(privateProviderResponse(GOLDEN_EXPLAIN_RESPONSE)),
    rateLimiter: createAnonymousRateLimiter({
      capacity: 10,
      windowMs: 60_000,
    }),
    timeoutMs: 1_000,
    cacheTtlMs: 60_000,
    maxCacheEntries: 10,
    ...override,
  });
}

function privateProviderResponse(response: unknown) {
  return {
    trustMode: "private",
    output: JSON.stringify(response),
  };
}

function postRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://terra.world/api/guide", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function rawRequest(body: string, contentType: string) {
  return new Request("https://terra.world/api/guide", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
}
