import "server-only";

import {
  createZeroGComputeClient,
  type ZeroGComputeClient,
} from "../../../../../packages/zero-g/src/server/compute";
import { loadZeroGServerConfig } from "../../../../../packages/zero-g/src/server/config";

import {
  createAnonymousRateLimiter,
  createGuidePostHandler,
  createPrivateZeroGGuideProvider,
} from "./server";

let computeClient: ZeroGComputeClient | undefined;

export const runtime = "nodejs";

const lazyComputeClient: ZeroGComputeClient = Object.freeze({
  async createChatCompletion(input) {
    computeClient ??= createZeroGComputeClient(
      loadZeroGServerConfig(process.env),
    );
    return computeClient.createChatCompletion(input);
  },
});

export const POST = createGuidePostHandler({
  callProvider: createPrivateZeroGGuideProvider(lazyComputeClient),
  rateLimiter: createAnonymousRateLimiter({
    capacity: 30,
    windowMs: 60_000,
  }),
  timeoutMs: safeComputeTimeout(process.env.ZERO_G_REQUEST_TIMEOUT_MS),
  cacheTtlMs: 5 * 60_000,
  maxCacheEntries: 128,
});

function safeComputeTimeout(raw: string | undefined): number {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1_000 && value <= 30_000
    ? value
    : 12_000;
}
