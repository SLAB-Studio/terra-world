import { describe, expect, it, vi } from "vitest";

import {
  CheckpointRemoteError,
  type CheckpointRemoteStorage,
  type CheckpointUploadRequest,
} from "../../../lib/checkpoints/backup";
import { createCheckpointHttpRemoteStorage } from "../../../lib/checkpoints/http-remote";
import {
  CHECKPOINT_API_LIMITS,
  createAdultSessionRateLimiter,
  createCheckpointPostHandler,
  type AdultCheckpointSessionStore,
  type AdultCheckpointStorageReference,
  type AdultSession,
} from "./server";

const ORIGIN = "https://terra.world";
const SESSION: AdultSession = { sessionId: "adult-session-1" };
const OTHER_SESSION: AdultSession = { sessionId: "adult-session-2" };
const ROOT = `0x${"11".repeat(32)}`;
const CONTENT_HASH = `sha256:${"a".repeat(64)}`;
const IDEMPOTENCY_KEY = `checkpoint-v1-${"a".repeat(64)}`;
const ENVELOPE = JSON.stringify({
  schemaVersion: 1,
  algorithm: "AES-GCM",
  keyId: "adult-device-key",
  iv: "AAAAAAAAAAAAAAAA",
  aad: {
    schemaVersion: 1,
    checkpointSchemaVersion: 1,
    cityId: "rivergate",
    campaignId: "rivergate-restoration",
    campaignVersion: 1,
    createdAt: 1_000,
  },
  ciphertext: "AAAAAAAAAAAAAAAAAAAAAA",
});
const BYTE_LENGTH = new TextEncoder().encode(ENVELOPE).byteLength;

describe("authenticated checkpoint API contract", () => {
  it("uploads ciphertext, attaches the root to the adult session, and returns no-store data", async () => {
    const remote = fakeRemote();
    const sessions = new MemoryAdultCheckpointSessions();
    const handler = makeHandler({ remote, sessions });

    const response = await handler(uploadRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.json()).toEqual({
      ok: true,
      receipt: {
        root: ROOT,
        contentHash: CONTENT_HASH,
        byteLength: BYTE_LENGTH,
      },
    });
    expect(remote.upload).toHaveBeenCalledWith({
      idempotencyKey: IDEMPOTENCY_KEY,
      encryptedEnvelope: ENVELOPE,
      contentHash: CONTENT_HASH,
      byteLength: BYTE_LENGTH,
    });
    expect(JSON.stringify(sessions.records)).not.toMatch(
      /ciphertext|wallet|private.?key/iu,
    );
    await expect(
      sessions.findByIdempotency(SESSION, IDEMPOTENCY_KEY),
    ).resolves.toMatchObject({
      root: ROOT,
      checkpointSavedAt: 1_000,
      attachedAt: 1_000,
    });
  });

  it("returns the adult session's existing root for an idempotent duplicate without spending again", async () => {
    const remote = fakeRemote();
    const sessions = new MemoryAdultCheckpointSessions();
    const handler = makeHandler({ remote, sessions });

    const first = await handler(uploadRequest());
    const duplicate = await handler(uploadRequest());

    expect(first.status).toBe(200);
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toEqual(await first.json());
    expect(remote.upload).toHaveBeenCalledTimes(1);
  });

  it("restores only a reference attached to the authenticated adult session", async () => {
    const remote = fakeRemote();
    const sessions = new MemoryAdultCheckpointSessions();
    const handler = makeHandler({ remote, sessions });
    await handler(uploadRequest());

    const own = await handler(downloadRequest());
    const other = await handler(
      downloadRequest({ cookie: `adult=${OTHER_SESSION.sessionId}` }),
    );

    expect(own.status).toBe(200);
    expect(await own.json()).toEqual({
      ok: true,
      checkpoint: {
        root: ROOT,
        contentHash: CONTENT_HASH,
        byteLength: BYTE_LENGTH,
        encryptedEnvelope: ENVELOPE,
      },
    });
    expect(remote.download).toHaveBeenCalledWith({
      root: ROOT,
      expectedContentHash: CONTENT_HASH,
      expectedByteLength: BYTE_LENGTH,
    });
    expect(other.status).toBe(404);
    expect(await other.json()).toEqual({
      ok: false,
      code: "not_found",
      retryable: false,
    });
    expect(remote.download).toHaveBeenCalledTimes(1);
  });

  it("round-trips the safe browser adapter through the authenticated contract", async () => {
    const handler = makeHandler();
    const fetcher: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set("origin", ORIGIN);
      headers.set("cookie", `adult=${SESSION.sessionId}`);
      return handler(
        new Request(`${ORIGIN}${String(input)}`, { ...init, headers }),
      );
    };
    const browser = createCheckpointHttpRemoteStorage({ fetch: fetcher });
    const upload: CheckpointUploadRequest = {
      idempotencyKey: IDEMPOTENCY_KEY,
      encryptedEnvelope: ENVELOPE,
      contentHash: CONTENT_HASH,
      byteLength: BYTE_LENGTH,
    };

    await expect(browser.upload(upload)).resolves.toMatchObject({ root: ROOT });
    await expect(
      browser.download({
        root: ROOT,
        expectedContentHash: CONTENT_HASH,
        expectedByteLength: BYTE_LENGTH,
      }),
    ).resolves.toMatchObject({
      root: ROOT,
      encryptedEnvelope: ENVELOPE,
    });
  });

  it("rejects restore metadata that differs from the adult-owned reference", async () => {
    const remote = fakeRemote();
    const handler = makeHandler({ remote });
    await handler(uploadRequest());

    const response = await handler(
      downloadRequest({}, { expectedContentHash: `sha256:${"b".repeat(64)}` }),
    );

    expect(response.status).toBe(409);
    expect(remote.download).not.toHaveBeenCalled();
  });

  it.each([
    ["missing origin", { origin: null }, 403],
    ["cross-site origin", { origin: "https://evil.example" }, 403],
    ["missing adult session", { cookie: null }, 401],
    ["wrong media type", { contentType: "text/plain" }, 415],
    [
      "wrong idempotency header",
      { idempotencyKey: "checkpoint-v1-wrong" },
      400,
    ],
  ] as const)(
    "rejects %s before sponsored storage",
    async (_label, headers, status) => {
      const remote = fakeRemote();
      const response = await makeHandler({ remote })(uploadRequest(headers));

      expect(response.status).toBe(status);
      expect(remote.upload).not.toHaveBeenCalled();
    },
  );

  it("rejects an allowed Origin header when the request URL is cross-origin", async () => {
    const remote = fakeRemote();
    const request = uploadRequest();
    const crossOriginRequest = new Request(
      `https://unexpected.example${new URL(request.url).pathname}`,
      request,
    );

    const response = await makeHandler({ remote })(crossOriginRequest);

    expect(response.status).toBe(403);
    expect(remote.upload).not.toHaveBeenCalled();
  });

  it("rejects oversized and extra-field bodies before sponsored storage", async () => {
    const remote = fakeRemote();
    const handler = makeHandler({ remote });
    const oversized = await handler(
      uploadRequest({
        contentLength: String(CHECKPOINT_API_LIMITS.maximumBodyBytes + 1),
      }),
    );
    const extra = await handler(
      uploadRequest({}, { plaintext: { cityId: "never-accept" } }),
    );

    expect(oversized.status).toBe(413);
    expect(extra.status).toBe(400);
    expect(remote.upload).not.toHaveBeenCalled();
  });

  it("bounds sponsored requests per authenticated adult session", async () => {
    const remote = fakeRemote();
    const limiter = createAdultSessionRateLimiter({
      capacity: 1,
      windowMs: 1_000,
      clock: () => 100,
    });
    const handler = makeHandler({ remote, rateLimiter: limiter });

    expect((await handler(uploadRequest())).status).toBe(200);
    const limited = await handler(uploadRequest());
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({
      ok: false,
      code: "rate_limited",
      retryable: true,
    });
    expect(remote.upload).toHaveBeenCalledTimes(1);
  });

  it("exposes retryability without leaking upstream errors or ciphertext", async () => {
    const remote = fakeRemote({
      upload: vi
        .fn()
        .mockRejectedValue(
          new CheckpointRemoteError("secret-upstream-detail", true),
        ),
    });
    const response = await makeHandler({ remote })(uploadRequest());
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(503);
    expect(serialized).toBe(
      '{"ok":false,"code":"storage_unavailable","retryable":true}',
    );
    expect(serialized).not.toContain(ENVELOPE);
    expect(serialized).not.toContain("secret-upstream-detail");
  });
});

function makeHandler(
  overrides: Partial<Parameters<typeof createCheckpointPostHandler>[0]> = {},
) {
  const sessions = overrides.sessions ?? new MemoryAdultCheckpointSessions();
  return createCheckpointPostHandler({
    remote: fakeRemote(),
    sessions,
    authorizeAdultSession: async (request) => {
      const match = /(?:^|;\s*)adult=([^;]+)/u.exec(
        request.headers.get("cookie") ?? "",
      );
      return match?.[1] ? { sessionId: match[1] } : null;
    },
    rateLimiter: createAdultSessionRateLimiter({
      capacity: 20,
      windowMs: 60_000,
    }),
    allowedOrigins: [ORIGIN],
    clock: () => 1_000,
    ...overrides,
  });
}

function fakeRemote(
  overrides: Partial<CheckpointRemoteStorage> = {},
): CheckpointRemoteStorage & {
  upload: ReturnType<typeof vi.fn<CheckpointRemoteStorage["upload"]>>;
  download: ReturnType<typeof vi.fn<CheckpointRemoteStorage["download"]>>;
} {
  return {
    upload:
      (overrides.upload as ReturnType<
        typeof vi.fn<CheckpointRemoteStorage["upload"]>
      >) ??
      vi.fn(async () => ({
        root: ROOT,
        contentHash: CONTENT_HASH,
        byteLength: BYTE_LENGTH,
      })),
    download:
      (overrides.download as ReturnType<
        typeof vi.fn<CheckpointRemoteStorage["download"]>
      >) ??
      vi.fn(async () => ({
        root: ROOT,
        contentHash: CONTENT_HASH,
        byteLength: BYTE_LENGTH,
        encryptedEnvelope: ENVELOPE,
      })),
  };
}

class MemoryAdultCheckpointSessions implements AdultCheckpointSessionStore {
  readonly records = new Map<string, AdultCheckpointStorageReference>();

  async findByIdempotency(
    session: AdultSession,
    idempotencyKey: string,
  ): Promise<AdultCheckpointStorageReference | null> {
    return (
      this.records.get(`${session.sessionId}:id:${idempotencyKey}`) ?? null
    );
  }

  async attach(
    session: AdultSession,
    reference: AdultCheckpointStorageReference,
  ): Promise<void> {
    this.records.set(
      `${session.sessionId}:id:${reference.idempotencyKey}`,
      reference,
    );
    this.records.set(`${session.sessionId}:root:${reference.root}`, reference);
  }

  async findByRoot(
    session: AdultSession,
    root: string,
  ): Promise<AdultCheckpointStorageReference | null> {
    return this.records.get(`${session.sessionId}:root:${root}`) ?? null;
  }
}

type HeaderOverrides = Readonly<{
  origin?: string | null;
  cookie?: string | null;
  contentType?: string;
  idempotencyKey?: string;
  contentLength?: string;
}>;

function uploadRequest(
  headerOverrides: HeaderOverrides = {},
  bodyOverrides: Record<string, unknown> = {},
): Request {
  const headers = baseHeaders(headerOverrides);
  headers.set(
    "idempotency-key",
    headerOverrides.idempotencyKey ?? IDEMPOTENCY_KEY,
  );
  if (headerOverrides.contentLength) {
    headers.set("content-length", headerOverrides.contentLength);
  }
  return new Request(`${ORIGIN}/api/checkpoints`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      schemaVersion: 1,
      operation: "upload",
      idempotencyKey: IDEMPOTENCY_KEY,
      encryptedEnvelope: ENVELOPE,
      contentHash: CONTENT_HASH,
      byteLength: BYTE_LENGTH,
      ...bodyOverrides,
    }),
  });
}

function downloadRequest(
  headerOverrides: HeaderOverrides = {},
  bodyOverrides: Record<string, unknown> = {},
): Request {
  return new Request(`${ORIGIN}/api/checkpoints`, {
    method: "POST",
    headers: baseHeaders(headerOverrides),
    body: JSON.stringify({
      schemaVersion: 1,
      operation: "download",
      root: ROOT,
      expectedContentHash: CONTENT_HASH,
      expectedByteLength: BYTE_LENGTH,
      ...bodyOverrides,
    }),
  });
}

function baseHeaders(overrides: HeaderOverrides): Headers {
  const headers = new Headers({
    "content-type": overrides.contentType ?? "application/json",
  });
  if (overrides.origin !== null) {
    headers.set("origin", overrides.origin ?? ORIGIN);
  }
  if (overrides.cookie !== null) {
    headers.set("cookie", overrides.cookie ?? `adult=${SESSION.sessionId}`);
  }
  return headers;
}
