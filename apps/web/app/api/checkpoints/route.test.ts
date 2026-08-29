import { describe, expect, it, vi } from "vitest";

import type { CheckpointRemoteStorage } from "../../../lib/checkpoints/backup";
import {
  createCheckpointRouteRuntime,
  createMemoryEncryptedCheckpointRemote,
} from "./runtime";

const ORIGIN = "https://terra.world";
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

describe("composable checkpoint Next route", () => {
  it("round-trips only an encrypted envelope in safe demo mode", async () => {
    const runtime = createCheckpointRouteRuntime({
      mode: "demo",
      allowedOrigins: [ORIGIN],
      clock: () => 1_000,
      remote: createMemoryEncryptedCheckpointRemote(),
    });
    const cookie = await beginSession(runtime);
    const prepared = await uploadValues();

    const uploaded = await runtime.checkpointPost(
      apiRequest(
        {
          schemaVersion: 1,
          operation: "upload",
          ...prepared,
        },
        cookie,
        prepared.idempotencyKey,
      ),
    );
    const uploadPayload = (await uploaded.json()) as {
      receipt: { root: string };
    };

    expect(uploaded.status).toBe(200);
    expect(uploaded.headers.get("x-terra-checkpoint-mode")).toBe("demo");
    expect(uploadPayload.receipt.root).toMatch(/^demo:[a-f0-9]{64}$/u);

    const downloaded = await runtime.checkpointPost(
      apiRequest(
        {
          schemaVersion: 1,
          operation: "download",
          root: uploadPayload.receipt.root,
          expectedContentHash: prepared.contentHash,
          expectedByteLength: prepared.byteLength,
        },
        cookie,
      ),
    );
    expect(await downloaded.json()).toEqual({
      ok: true,
      checkpoint: {
        root: uploadPayload.receipt.root,
        contentHash: prepared.contentHash,
        byteLength: prepared.byteLength,
        encryptedEnvelope: ENVELOPE,
      },
    });
  });

  it("keeps sponsored storage behind the authenticated server composition", async () => {
    const prepared = await uploadValues();
    const remote = {
      upload: vi.fn(async () => ({
        root: "0xverified-root",
        contentHash: prepared.contentHash,
        byteLength: prepared.byteLength,
      })),
      download: vi.fn(),
    } satisfies CheckpointRemoteStorage;
    const runtime = createCheckpointRouteRuntime({
      mode: "zero-g",
      allowedOrigins: [ORIGIN],
      remote,
    });

    const unauthorized = await runtime.checkpointPost(
      apiRequest(
        { schemaVersion: 1, operation: "upload", ...prepared },
        null,
        prepared.idempotencyKey,
      ),
    );
    expect(unauthorized.status).toBe(401);
    expect(remote.upload).not.toHaveBeenCalled();

    const cookie = await beginSession(runtime);
    const uploaded = await runtime.checkpointPost(
      apiRequest(
        { schemaVersion: 1, operation: "upload", ...prepared },
        cookie,
        prepared.idempotencyKey,
      ),
    );
    expect(uploaded.status).toBe(200);
    expect(uploaded.headers.get("x-terra-checkpoint-mode")).toBe("zero-g");
    expect(remote.upload).toHaveBeenCalledWith(prepared);
  });

  it("fails closed without storage configuration in disabled mode", async () => {
    const runtime = createCheckpointRouteRuntime({
      mode: "disabled",
      allowedOrigins: [ORIGIN],
    });
    const cookie = await beginSession(runtime);
    const prepared = await uploadValues();
    const response = await runtime.checkpointPost(
      apiRequest(
        { schemaVersion: 1, operation: "upload", ...prepared },
        cookie,
        prepared.idempotencyKey,
      ),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      code: "storage_unavailable",
      retryable: true,
    });
  });

  it("isolates restore references between adult sessions", async () => {
    const runtime = createCheckpointRouteRuntime({
      mode: "demo",
      allowedOrigins: [ORIGIN],
    });
    const firstCookie = await beginSession(runtime);
    const secondCookie = await beginSession(runtime);
    const prepared = await uploadValues();
    const uploaded = await runtime.checkpointPost(
      apiRequest(
        { schemaVersion: 1, operation: "upload", ...prepared },
        firstCookie,
        prepared.idempotencyKey,
      ),
    );
    const payload = (await uploaded.json()) as { receipt: { root: string } };

    const response = await runtime.checkpointPost(
      apiRequest(
        {
          schemaVersion: 1,
          operation: "download",
          root: payload.receipt.root,
          expectedContentHash: prepared.contentHash,
          expectedByteLength: prepared.byteLength,
        },
        secondCookie,
      ),
    );
    expect(response.status).toBe(404);
  });
});

async function beginSession(
  runtime: ReturnType<typeof createCheckpointRouteRuntime>,
): Promise<string> {
  const response = await runtime.sessionPost(
    new Request(`${ORIGIN}/api/checkpoints/session`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({
        schemaVersion: 1,
        operation: "begin-adult-session",
        adultConfirmed: true,
      }),
    }),
  );
  expect(response.status).toBe(201);
  return response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
}

async function uploadValues() {
  const bytes = new TextEncoder().encode(ENVELOPE);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return {
    idempotencyKey: `checkpoint-v1-${hex}`,
    encryptedEnvelope: ENVELOPE,
    contentHash: `sha256:${hex}`,
    byteLength: bytes.byteLength,
  };
}

function apiRequest(
  body: unknown,
  cookie: string | null,
  idempotencyKey?: string,
): Request {
  return new Request(`${ORIGIN}/api/checkpoints`, {
    method: "POST",
    headers: {
      origin: ORIGIN,
      "content-type": "application/json",
      ...(cookie === null ? {} : { cookie }),
      ...(idempotencyKey === undefined
        ? {}
        : { "idempotency-key": idempotencyKey }),
    },
    body: JSON.stringify(body),
  });
}
