export function isRetryableZeroGStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503;
}

export function parseRetryAfterMs(
  value: string | null,
  nowMs = Date.now(),
): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;

  const dateMs = Date.parse(value);
  if (!Number.isFinite(dateMs)) return undefined;
  return Math.max(0, dateMs - nowMs);
}

export function retryDelayMs(attempt: number, retryAfterMs?: number): number {
  if (retryAfterMs !== undefined) return Math.min(retryAfterMs, 60_000);
  const boundedAttempt = Math.max(0, Math.min(attempt, 4));
  return Math.min(500 * 2 ** boundedAttempt, 8_000);
}
