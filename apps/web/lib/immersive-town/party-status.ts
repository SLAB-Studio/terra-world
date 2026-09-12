export type PartyModelStatus =
  "loading" | "ready" | "player-failed" | "leo-failed";

/** One engineer's readiness cannot hide a failed or still-loading partner. */
export function partyModelStatus(
  player: string | undefined,
  leo: string | undefined,
): PartyModelStatus {
  if (player === "fallback") return "player-failed";
  if (leo === "fallback") return "leo-failed";
  return player === "ready" && leo === "ready" ? "ready" : "loading";
}

export function partyLoadMessage(status: PartyModelStatus): string | null {
  switch (status) {
    case "player-failed":
      return "Your character couldn’t load. Reload the game to try again.";
    case "leo-failed":
      return "Leo’s model couldn’t load. You can keep exploring; reload to retry.";
    case "loading":
      return "Getting both engineers ready…";
    case "ready":
      return null;
  }
}
