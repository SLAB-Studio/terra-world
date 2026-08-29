import { describe, expect, it, vi } from "vitest";

import { RunVerificationError } from "../../../../lib/runs/verify-server";

import {
  RUN_VERIFICATION_API_LIMITS,
  createRunVerificationPostHandler,
  createRunVerificationRateLimiter,
} from "./server";

const ORIGIN = "https://terra.world";
const VERIFICATION = {
  schemaVersion: 1 as const,
  replayStatus: "verified" as const,
  campaign: {
    campaignId: "rivergate-foundations",
    campaignVersion: 1,
    packageHash: "a".repeat(16),
    rulesetHash: "b".repeat(16),
  },
  turnsReplayed: 15,
  actionLogHash: "c".repeat(16),
  finalStateHash: "d".repeat(16),
  runCommitment: `0x${"e".repeat(64)}`,
};

describe("run verification API", () => {
  it("returns only the verified proof with private no-store headers", async () => {
    const verify = vi.fn().mockResolvedValue(VERIFICATION);
    const response = await makeHandler(verify)(request({ hello: "run" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.json()).toEqual({
      ok: true,
      verification: VERIFICATION,
    });
    expect(verify).toHaveBeenCalledWith({ hello: "run" });
  });

  it.each([
    ["missing origin", { origin: null }, 403],
    ["cross-site origin", { origin: "https://evil.example" }, 403],
    ["wrong content type", { contentType: "text/plain" }, 415],
  ])("rejects %s before replay", async (_label, headers, status) => {
    const verify = vi.fn().mockResolvedValue(VERIFICATION);
    const response = await makeHandler(verify)(request({}, headers));

    expect(response.status).toBe(status);
    expect(verify).not.toHaveBeenCalled();
  });

  it("rejects an oversized body before replay", async () => {
    const verify = vi.fn().mockResolvedValue(VERIFICATION);
    const response = await makeHandler(verify)(
      request(
        {},
        {
          contentLength: String(
            RUN_VERIFICATION_API_LIMITS.maximumBodyBytes + 1,
          ),
        },
      ),
    );

    expect(response.status).toBe(413);
    expect(verify).not.toHaveBeenCalled();
  });

  it("bounds expensive anonymous replay work", async () => {
    const verify = vi.fn().mockResolvedValue(VERIFICATION);
    const limiter = createRunVerificationRateLimiter({
      capacity: 1,
      windowMs: 1_000,
      clock: () => 100,
    });
    const handler = makeHandler(verify, limiter);

    expect((await handler(request({ run: 1 }))).status).toBe(200);
    const limited = await handler(request({ run: 2 }));
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({
      ok: false,
      code: "rate_limited",
      retryable: true,
    });
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["invalid_request", 400],
    ["campaign_not_registered", 404],
    ["replay_rejected", 422],
  ] as const)(
    "maps %s without leaking verifier details",
    async (code, status) => {
      const verify = vi.fn().mockRejectedValue(new RunVerificationError(code));
      const response = await makeHandler(verify)(
        request({ privateCityState: "secret" }),
      );

      expect(response.status).toBe(status);
      const body = JSON.stringify(await response.json());
      expect(body).toBe(`{"ok":false,"code":"${code}","retryable":false}`);
      expect(body).not.toContain("privateCityState");
    },
  );
});

function makeHandler(
  verify: Parameters<typeof createRunVerificationPostHandler>[0]["verify"],
  rateLimiter = createRunVerificationRateLimiter({
    capacity: 10,
    windowMs: 1_000,
  }),
) {
  return createRunVerificationPostHandler({
    verify,
    rateLimiter,
    allowedOrigins: [ORIGIN],
  });
}

function request(
  body: unknown,
  headers: {
    origin?: string | null;
    contentType?: string;
    contentLength?: string;
  } = {},
): Request {
  const origin = headers.origin === undefined ? ORIGIN : headers.origin;
  const values = new Headers();
  if (origin !== null) values.set("origin", origin);
  values.set("content-type", headers.contentType ?? "application/json");
  if (headers.contentLength)
    values.set("content-length", headers.contentLength);
  return new Request(`${ORIGIN}/api/runs/verify`, {
    method: "POST",
    headers: values,
    body: JSON.stringify(body),
  });
}
