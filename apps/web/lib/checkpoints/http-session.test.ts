import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ADULT_SESSION_ENDPOINT,
  ADULT_SESSION_HTTP_LIMITS,
  AdultSessionHttpError,
  createAdultSessionHttpClient,
} from "./http-session";

const EXPIRES_AT = 1_788_230_600_000;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("adult checkpoint session HTTP client", () => {
  it("posts the exact session body to the fixed same-origin route", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ok: true, expiresAt: EXPIRES_AT }));
    const client = createAdultSessionHttpClient({
      fetch: fetcher as typeof fetch,
    });

    await expect(client.begin()).resolves.toEqual({ expiresAt: EXPIRES_AT });
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(ADULT_SESSION_ENDPOINT);
    expect(init).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
    expect(new Headers(init.headers).get("content-type")).toBe(
      "application/json",
    );
    expect(JSON.parse(String(init.body))).toEqual({
      schemaVersion: 1,
      operation: "begin-adult-session",
      adultConfirmed: true,
    });
    expect(JSON.stringify(init)).not.toMatch(
      /token|cookie|wallet|signer|private.?key|bearer/iu,
    );
  });

  it.each([
    ["an extra response key", { ok: true, expiresAt: EXPIRES_AT, token: "x" }],
    ["a missing expiry", { ok: true }],
    ["a non-integer expiry", { ok: true, expiresAt: 1.5 }],
    ["a zero expiry", { ok: true, expiresAt: 0 }],
    ["a false success flag", { ok: false, expiresAt: EXPIRES_AT }],
  ] as const)("rejects %s", async (_label, payload) => {
    const client = createAdultSessionHttpClient({
      fetch: vi.fn().mockResolvedValue(jsonResponse(payload)) as typeof fetch,
    });

    await expect(client.begin()).rejects.toEqual(new AdultSessionHttpError());
  });

  it("rejects non-JSON and oversized responses with the same generic error", async () => {
    const wrongMedia = createAdultSessionHttpClient({
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, expiresAt: EXPIRES_AT }), {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
      ) as typeof fetch,
    });
    const oversized = createAdultSessionHttpClient({
      fetch: vi.fn().mockResolvedValue(
        new Response("{}", {
          status: 200,
          headers: {
            "content-type": "application/json",
            "content-length": String(
              ADULT_SESSION_HTTP_LIMITS.maximumResponseBytes + 1,
            ),
          },
        }),
      ) as typeof fetch,
    });

    await expect(wrongMedia.begin()).rejects.toEqual(
      new AdultSessionHttpError(),
    );
    await expect(oversized.begin()).rejects.toEqual(
      new AdultSessionHttpError(),
    );
  });

  it("does not expose server or transport error details", async () => {
    const rejected = createAdultSessionHttpClient({
      fetch: vi.fn().mockResolvedValue(
        jsonResponse(
          {
            ok: false,
            code: "database_connection_string_was_secret",
            retryable: true,
          },
          503,
        ),
      ) as typeof fetch,
    });
    const offline = createAdultSessionHttpClient({
      fetch: vi
        .fn()
        .mockRejectedValue(
          new Error("upstream host and secret details"),
        ) as typeof fetch,
    });

    for (const client of [rejected, offline]) {
      const error = await client.begin().catch((reason: unknown) => reason);
      expect(error).toEqual(new AdultSessionHttpError());
      expect(String(error)).toBe(
        "AdultSessionHttpError: Adult session is unavailable",
      );
      expect(JSON.stringify(error)).not.toMatch(/database|secret|upstream/iu);
    }
  });

  it("aborts at its bounded timeout", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const client = createAdultSessionHttpClient({
      fetch: fetcher as typeof fetch,
      timeoutMs: 1_000,
    });
    const request = client.begin();
    const rejection = expect(request).rejects.toEqual(
      new AdultSessionHttpError(),
    );

    await vi.advanceTimersByTimeAsync(1_000);
    await rejection;
    expect((fetcher.mock.calls[0]?.[1] as RequestInit).signal?.aborted).toBe(
      true,
    );
    expect(ADULT_SESSION_HTTP_LIMITS.defaultTimeoutMs).toBeLessThanOrEqual(
      30_000,
    );
    expect(() => createAdultSessionHttpClient({ timeoutMs: 30_001 })).toThrow(
      "timeout",
    );
  });

  it("rejects malformed JSON and invalid content-length declarations", async () => {
    const malformed = createAdultSessionHttpClient({
      fetch: vi.fn().mockResolvedValue(
        new Response("not-json", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ) as typeof fetch,
    });
    const invalidLength = createAdultSessionHttpClient({
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, expiresAt: EXPIRES_AT }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "content-length": "unknown",
          },
        }),
      ) as typeof fetch,
    });

    await expect(malformed.begin()).rejects.toEqual(
      new AdultSessionHttpError(),
    );
    await expect(invalidLength.begin()).rejects.toEqual(
      new AdultSessionHttpError(),
    );
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store",
    },
  });
}
