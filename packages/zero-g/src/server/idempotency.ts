import { createHash } from "node:crypto";

const SAFE_SCOPE = /^[a-z][a-z0-9-]{2,47}$/;
const SAFE_OPERATION_ID = /^[A-Za-z0-9:_-]{8,256}$/;

export function createZeroGIdempotencyKey(
  scope: string,
  operationId: string,
): string {
  if (!SAFE_SCOPE.test(scope)) {
    throw new TypeError("Idempotency scope is invalid");
  }
  if (!SAFE_OPERATION_ID.test(operationId)) {
    throw new TypeError("Idempotency operation ID is invalid");
  }
  const digest = createHash("sha256")
    .update(`terra-world:${scope}:${operationId}`, "utf8")
    .digest("hex");
  return `terra-${scope}-${digest}`;
}
