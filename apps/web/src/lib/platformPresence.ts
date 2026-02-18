import type { ClientPlatform, MatchPlatformPresence, Seat } from "./convexTypes";

export function toPlatformTag(platform: ClientPlatform | null | undefined): string {
  switch (platform) {
    case "telegram_inline":
      return "TG_INLINE";
    case "telegram_miniapp":
      return "TG_MINIAPP";
    case "agent":
      return "AGENT";
    case "cpu":
      return "CPU";
    case "web":
    default:
      return "WEB";
  }
}

export function seatPlatform(
  presence: MatchPlatformPresence | null | undefined,
  seat: Seat,
): ClientPlatform | null {
  if (!presence) return null;
  return seat === "host" ? presence.hostPlatform : presence.awayPlatform;
}

export function playerPlatformLabels(
  presence: MatchPlatformPresence | null | undefined,
  playerSeat: Seat,
) {
  const player = seatPlatform(presence, playerSeat);
  const opponent = seatPlatform(presence, playerSeat === "host" ? "away" : "host");
  return {
    playerTag: toPlatformTag(player),
    opponentTag: toPlatformTag(opponent),
  };
}
