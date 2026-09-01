import "server-only";

import { verifyRivergateCampaignRun } from "../../../../lib/runs/verify-server";

import {
  createRunVerificationPostHandler,
  createRunVerificationRateLimiter,
} from "./server";

export const runtime = "nodejs";

export const POST = createRunVerificationPostHandler({
  verify: verifyRivergateCampaignRun,
  rateLimiter: createRunVerificationRateLimiter({
    capacity: 20,
    windowMs: 60_000,
  }),
  allowedOrigins: readAllowedOrigins(process.env),
});

function readAllowedOrigins(env: NodeJS.ProcessEnv): readonly string[] {
  if (env.TERRA_APP_ORIGIN) {
    const parsed = new URL(env.TERRA_APP_ORIGIN.trim());
    if (
      parsed.pathname !== "/" ||
      parsed.search !== "" ||
      parsed.hash !== "" ||
      (env.NODE_ENV === "production" && parsed.protocol !== "https:") ||
      !["http:", "https:"].includes(parsed.protocol)
    ) {
      throw new TypeError("TERRA_APP_ORIGIN must be an origin");
    }
    return Object.freeze([parsed.origin]);
  }
  if (env.NODE_ENV === "production") {
    return Object.freeze(["https://unconfigured.terra-world.invalid"]);
  }
  return Object.freeze(["http://localhost:3000", "http://127.0.0.1:3000"]);
}
