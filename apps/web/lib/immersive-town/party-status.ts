export type PartyModelStatus =
  "loading" | "ready" | "player-failed" | "dog-failed";

/** Dog readiness cannot hide a failed or still-loading human avatar. */
export function partyModelStatus(
  player: string | undefined,
  dog: "loading" | "ready" | "failed",
): PartyModelStatus {
  if (player === "fallback") return "player-failed";
  if (dog === "failed") return "dog-failed";
  return player === "ready" && dog === "ready" ? "ready" : "loading";
}

export function partyLoadMessage(status: PartyModelStatus): string | null {
  switch (status) {
    case "player-failed":
      return "Your character couldn’t load. Reload the game to try again.";
    case "dog-failed":
      return "Leo’s model couldn’t load. You can keep exploring; reload to retry.";
    case "loading":
      return "Getting your character and Leo ready…";
    case "ready":
      return null;
  }
}
