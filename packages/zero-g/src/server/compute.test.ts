import { describe, expect, it, vi } from "vitest";

import type { ZeroGServerConfig } from "./config";
import { createZeroGComputeClient, ZeroGServiceError } from "./index";

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const CONFIG: ZeroGServerConfig = {
  network: "testnet",
  chainId: 16602,
  chainRpcUrl: "https://evmrpc-testnet.0g.ai",
  chainExplorerUrl: "https://chainscan-galileo.0g.ai",
  compute: {
    baseUrl: "https://router-api-testnet.integratenetwork.work/v1",
    apiKey: "sk-server-only-secret",
    model: "private-model",
    trustMode: "private",
    verifyTee: true,
  },
  storage: { indexerUrl: "https://indexer.testnet.example" },
  sponsorPrivateKey: `0x${"12".repeat(32)}`,
  request: { timeoutMs: 1_000, maxRetries: 2 },
};

const INPUT = {
  messages: [
    { role: "system" as const, content: "Use verified city facts only." },
    { role: "user" as const, content: "Explain the water result." },
  ],
  maxTokens: 120,
};

describe("0G Compute Router client", () => {
  it("always requests private, synchronously verified inference", async () => {
    const fetchRequest = vi.fn<FetchLike>(async () =>
      jsonResponse(
        { choices: [{ message: { content: "Water is flowing." } }] },
        200,
        { "x-request-id": "req-private" },
      ),
    );
    const client = createZeroGComputeClient(CONFIG, { fetch: fetchRequest });

    await expect(client.createChatCompletion(INPUT)).resolves.toMatchObject({
      requestId: "req-private",
      trustMode: "private",
      teeVerificationRequested: true,
    });
    expect(fetchRequest).toHaveBeenCalledTimes(1);
    const [url, init] = fetchRequest.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://router-api-testnet.integratenetwork.work/v1/chat/completions",
    );
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer sk-server-only-secret",
      "X-0G-Provider-Trust-Mode": "private",
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "private-model",
      verify_tee: true,
      stream: false,
    });
  });

  it("fails closed when private providers remain unavailable", async () => {
    const fetchRequest = vi.fn<FetchLike>(async () =>
      jsonResponse(
        {
          error: {
            code: "no_provider_for_trust_mode",
            message: "No private provider",
          },
          request_id: "req-no-provider",
        },
        503,
      ),
    );
    const sleep = vi.fn(async () => undefined);
    const client = createZeroGComputeClient(CONFIG, {
      fetch: fetchRequest,
      sleep,
    });

    const rejection = client.createChatCompletion(INPUT);
    await expect(rejection).rejects.toMatchObject({
      name: "ZeroGServiceError",
      code: "PROVIDER_UNAVAILABLE",
      retryable: true,
      status: 503,
      requestId: "req-no-provider",
    });
    expect(fetchRequest).toHaveBeenCalledTimes(3);
    for (const [, init] of fetchRequest.mock.calls) {
      expect(init?.headers).toMatchObject({
        "X-0G-Provider-Trust-Mode": "private",
      });
    }
  });

  it("does not retry authentication or payment failures", async () => {
    const fetchRequest = vi.fn<FetchLike>(async () =>
      jsonResponse({ error: { code: "invalid_api_key" } }, 401),
    );
    const client = createZeroGComputeClient(CONFIG, { fetch: fetchRequest });

    await expect(client.createChatCompletion(INPUT)).rejects.toMatchObject({
      code: "AUTHENTICATION",
      retryable: false,
    });
    expect(fetchRequest).toHaveBeenCalledTimes(1);
  });

  it("honours Retry-After before a successful retry", async () => {
    const fetchRequest = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: "rate_limit_exceeded" } }, 429, {
          "retry-after": "15",
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ choices: [] }, 200));
    const sleep = vi.fn(async () => undefined);
    const client = createZeroGComputeClient(CONFIG, {
      fetch: fetchRequest,
      sleep,
    });

    await expect(client.createChatCompletion(INPUT)).resolves.toBeDefined();
    expect(sleep).toHaveBeenCalledWith(15_000);
    expect(fetchRequest).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid local inputs before spending an inference request", async () => {
    const fetchRequest = vi.fn();
    const client = createZeroGComputeClient(CONFIG, { fetch: fetchRequest });

    await expect(
      client.createChatCompletion({ messages: [], maxTokens: 120 }),
    ).rejects.toThrow("messages");
    await expect(
      client.createChatCompletion({ ...INPUT, maxTokens: 0 }),
    ).rejects.toThrow("maxTokens");
    expect(fetchRequest).not.toHaveBeenCalled();
  });

  it("uses typed errors for invalid JSON responses", async () => {
    const client = createZeroGComputeClient(CONFIG, {
      fetch: async () => new Response("not-json", { status: 200 }),
    });

    await expect(client.createChatCompletion(INPUT)).rejects.toBeInstanceOf(
      ZeroGServiceError,
    );
  });
});

function jsonResponse(
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}
