import { normalizeMatchId } from "./matchIds";

const DISCORD_JOIN_SECRET_PREFIX = "ltcg:match:";

export function decodeDiscordJoinSecret(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith(DISCORD_JOIN_SECRET_PREFIX)) {
    return normalizeMatchId(trimmed.slice(DISCORD_JOIN_SECRET_PREFIX.length));
  }
  return normalizeMatchId(trimmed);
}

function encodeDuelJoinRedirect(matchId: string) {
  return `/duel?join=${encodeURIComponent(matchId)}`;
}

/**
 * Resolve Discord launch/deep-link entry URLs to the canonical duel join route.
 */
export function resolveDiscordEntryRedirect(pathname: string, search: string) {
  const params = new URLSearchParams(search);

  const joinMatchId = decodeDiscordJoinSecret(params.get("join"));
  if (joinMatchId) return encodeDuelJoinRedirect(joinMatchId);

  const customIdMatchId = decodeDiscordJoinSecret(params.get("custom_id"));
  if (customIdMatchId) return encodeDuelJoinRedirect(customIdMatchId);

  const isDiscordMobileJoinPath = pathname === "/_discord/join" || pathname === "/_discord/join/";
  if (isDiscordMobileJoinPath) {
    const secretMatchId = decodeDiscordJoinSecret(params.get("secret"));
    if (secretMatchId) return encodeDuelJoinRedirect(secretMatchId);
    return "/duel";
  }

  return null;
}
