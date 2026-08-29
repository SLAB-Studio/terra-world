import "server-only";

import { createProofGetHandler } from "./server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createProofGetHandler(process.env);
