import "server-only";

import {
  createZeroGComputeClient,
  type ZeroGComputeClient,
} from "../../../../../packages/zero-g/src/server/compute";
import { loadZeroGComputeConfig } from "../../../../../packages/zero-g/src/server/config";
import { createAnonymousRateLimiter } from "../guide/server";
import {
  LEO_CHAT_LIMITS,
  LeoChatRequestSchema,
  createZeroGLeoChatProvider,
} from "./server";

export const runtime = "nodejs";

let computeClient: ZeroGComputeClient | undefined;

const lazyComputeClient: ZeroGComputeClient = Object.freeze({
  async createChatCompletion(input, options) {
    computeClient ??= createZeroGComputeClient(
      loadZeroGComputeConfig(process.env),
    );
    return computeClient.createChatCompletion(input, options);
  },
});

const provider = createZeroGLeoChatProvider(lazyComputeClient);
const rateLimiter = createAnonymousRateLimiter({
  capacity: 30,
  windowMs: 60_000,
});

export async function POST(request: Request): Promise<Response> {
  if (!hasJsonContentType(request)) return chatResponse(null, 415);

  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    Number(declaredLength) > LEO_CHAT_LIMITS.maximumBodyBytes
  ) {
    return chatResponse(null, 413);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return chatResponse(null, 400);
  }

  const parsed = LeoChatRequestSchema.safeParse(body);
  if (!parsed.success) return chatResponse(null, 400);
  if (!rateLimiter.tryAcquire()) return chatResponse(null, 429);

  try {
    const reply = await provider.reply(parsed.data, request.signal);
    if (reply === null) return chatResponse(null, 503);
    return chatResponse(reply, 200);
  } catch {
    return chatResponse(null, 503);
  }
}

function hasJsonContentType(request: Request): boolean {
  const contentType = request.headers.get("content-type")?.toLowerCase();
  return contentType?.split(";", 1)[0]?.trim() === "application/json";
}

function chatResponse(reply: string | null, status: number): Response {
  return new Response(JSON.stringify({ reply, source: reply ? "provider" : "none" }), {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
