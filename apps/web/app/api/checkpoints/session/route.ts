import "server-only";

import { getCheckpointRouteRuntime } from "../runtime";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return getCheckpointRouteRuntime().sessionPost(request);
}
