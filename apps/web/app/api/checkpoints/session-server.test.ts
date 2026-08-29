import { describe, expect, it } from "vitest";

import {
  ADULT_SESSION_COOKIE,
  createAdultSessionAuthorizer,
  createAdultSessionPostHandler,
  createMemoryAdultCheckpointRepository,
} from "./session-server";

const ORIGIN = "https://terra.world";

describe("privacy-safe adult checkpoint sessions", () => {
  it("issues a bounded HttpOnly cookie and authenticates without exposing its token", async () => {
    const repository = createMemoryAdultCheckpointRepository();
    const clock = () => 1_000;
    const post = createAdultSessionPostHandler({
      repository,
      allowedOrigins: [ORIGIN],
      clock,
      randomBytes: () => Uint8Array.from({ length: 32 }, (_, index) => index),
      sessionTtlMs: 60_000,
    });

    const response = await post(beginRequest());
    const cookie = response.headers.get("set-cookie") ?? "";
    const cookiePair = cookie.split(";", 1)[0] ?? "";

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, expiresAt: 61_000 });
    expect(cookie).toContain(`${ADULT_SESSION_COOKIE}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Path=/api/checkpoints");
    expect(response.headers.get("cache-control")).toBe("private, no-store");

    const authorize = createAdultSessionAuthorizer({ repository, clock });
    const session = await authorize(
      new Request(`${ORIGIN}/api/checkpoints`, {
        headers: { cookie: cookiePair },
      }),
    );
    expect(session?.sessionId).toMatch(/^adult-session:[a-f0-9]{64}$/u);
    expect(session?.sessionId).not.toContain(cookiePair.split("=")[1]);
  });

  it("expires sessions and removes their attached checkpoint references", async () => {
    let now = 5_000;
    const repository = createMemoryAdultCheckpointRepository();
    const post = createAdultSessionPostHandler({
      repository,
      allowedOrigins: [ORIGIN],
      clock: () => now,
      randomBytes: () => new Uint8Array(32).fill(7),
      sessionTtlMs: 60_000,
    });
    const response = await post(beginRequest());
    const cookiePair = response.headers.get("set-cookie")?.split(";", 1)[0];
    const authorize = createAdultSessionAuthorizer({
      repository,
      clock: () => now,
    });
    const request = new Request(`${ORIGIN}/api/checkpoints`, {
      headers: { cookie: cookiePair ?? "" },
    });
    const active = await authorize(request);
    expect(active).not.toBeNull();

    await repository.attach(active!, {
      root: "demo:root",
      contentHash: `sha256:${"a".repeat(64)}`,
      byteLength: 10,
      idempotencyKey: `checkpoint-v1-${"a".repeat(64)}`,
      attachedAt: now,
    });
    now = 65_000;

    expect(await authorize(request)).toBeNull();
    expect(await repository.findByRoot(active!, "demo:root")).toBeNull();
  });

  it.each([
    ["cross-site origin", { origin: "https://evil.example" }, 403],
    ["cross-origin URL", { requestOrigin: "https://other.example" }, 403],
    ["missing origin", { origin: null }, 403],
    ["wrong media type", { contentType: "text/plain" }, 415],
    ["unconfirmed adult", { adultConfirmed: false }, 400],
    ["extra personal field", { childName: "never collect" }, 400],
  ] as const)("rejects %s", async (_label, overrides, status) => {
    const post = createAdultSessionPostHandler({
      repository: createMemoryAdultCheckpointRepository(),
      allowedOrigins: [ORIGIN],
    });
    const response = await post(beginRequest(overrides));

    expect(response.status).toBe(status);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.json()).toEqual({
      ok: false,
      code: "session_rejected",
      retryable: false,
    });
  });
});

function beginRequest(
  overrides: Readonly<{
    origin?: string | null;
    requestOrigin?: string;
    contentType?: string;
    adultConfirmed?: boolean;
    childName?: string;
  }> = {},
): Request {
  const headers = new Headers({
    "content-type": overrides.contentType ?? "application/json",
  });
  if (overrides.origin !== null) {
    headers.set("origin", overrides.origin ?? ORIGIN);
  }
  return new Request(
    `${overrides.requestOrigin ?? ORIGIN}/api/checkpoints/session`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        schemaVersion: 1,
        operation: "begin-adult-session",
        adultConfirmed: overrides.adultConfirmed ?? true,
        ...(overrides.childName === undefined
          ? {}
          : { childName: overrides.childName }),
      }),
    },
  );
}
