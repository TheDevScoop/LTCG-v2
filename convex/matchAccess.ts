export type MatchSeat = "host" | "away";

type MatchMetaLike = {
  hostId?: string | null;
  awayId?: string | null;
} | null | undefined;

export function resolveSeatForUser(
  meta: MatchMetaLike,
  userId: string | null | undefined
): MatchSeat | null {
  if (!meta || !userId) return null;
  if (meta.hostId === userId) return "host";
  if (meta.awayId === userId) return "away";
  return null;
}

export function assertMatchParticipant(
  meta: MatchMetaLike,
  userId: string | null | undefined,
  requestedSeat?: MatchSeat
): MatchSeat {
  const seat = resolveSeatForUser(meta, userId);
  if (!seat) {
    throw new Error("You are not a participant in this match.");
  }
  if (requestedSeat && requestedSeat !== seat) {
    throw new Error("Seat does not match the authenticated player.");
  }
  return seat;
}
