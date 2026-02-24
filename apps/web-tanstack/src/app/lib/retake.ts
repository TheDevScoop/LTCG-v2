/**
 * retake.tv API client
 *
 * Base URL: https://retake.tv/api/v1
 * Docs:     https://retake.tv/skill.md
 *
 * All authenticated endpoints require `Authorization: Bearer <access_token>`.
 * Public discovery endpoints need no auth.
 */

const BASE = "https://retake.tv/api/v1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RetakeAgent = {
  access_token: string;
  agent_id: string;
  userDbId: string;
  agent_name: string;
  wallet_address: string;
  token_address: string;
  token_ticker: string;
};

export type LiveStreamer = {
  user_id: string;
  username: string;
  avatar_url?: string;
  ticker?: string;
  market_cap?: number;
  viewer_count?: number;
};

export type ActiveSession = {
  session_id: string;
  streamer_id: string;
  streamer_name: string;
  viewer_count: number;
  started_at: string;
};

export type ChatComment = {
  id: string;
  author_wallet: string;
  username: string;
  avatar?: string;
  message: string;
  created_at: string;
};

export type StreamStatus = {
  is_live: boolean;
  viewer_count: number;
};

// ---------------------------------------------------------------------------
// Config — reads env vars that will be set once retake is ready
// ---------------------------------------------------------------------------

export function getRetakeConfig() {
  return {
    apiUrl: import.meta.env.VITE_RETAKE_API_URL || BASE,
    agentToken: import.meta.env.VITE_RETAKE_AGENT_TOKEN || "",
    agentId: import.meta.env.VITE_RETAKE_AGENT_ID || "",
    agentName: import.meta.env.VITE_RETAKE_AGENT_NAME || "milunchlady",
  };
}

function authHeaders(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

// ---------------------------------------------------------------------------
// Public endpoints (no auth)
// ---------------------------------------------------------------------------

/** List currently live streamers */
export async function getLiveStreams(
  apiUrl = BASE,
): Promise<LiveStreamer[]> {
  const res = await fetch(`${apiUrl}/users/live/`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/** Search for an agent by name */
export async function searchAgent(
  query: string,
  apiUrl = BASE,
): Promise<{ user_id: string } | null> {
  const res = await fetch(`${apiUrl}/users/search/${encodeURIComponent(query)}`);
  if (!res.ok) return null;
  return res.json();
}

/** All active streaming sessions */
export async function getActiveSessions(
  apiUrl = BASE,
): Promise<ActiveSession[]> {
  const res = await fetch(`${apiUrl}/sessions/active/`);
  if (!res.ok) return [];
  return res.json();
}

/** Token leaderboard by market cap */
export async function getTopTokens(apiUrl = BASE) {
  const res = await fetch(`${apiUrl}/tokens/top/`);
  if (!res.ok) return [];
  return res.json();
}

/** Recent trades across the platform */
export async function getRecentTrades(apiUrl = BASE) {
  const res = await fetch(`${apiUrl}/trades/recent/`);
  if (!res.ok) return [];
  return res.json();
}

/** Agent metadata / profile */
export async function getAgentMetadata(userId: string, apiUrl = BASE) {
  const res = await fetch(`${apiUrl}/users/metadata/${userId}`);
  if (!res.ok) return null;
  return res.json();
}

// ---------------------------------------------------------------------------
// Authenticated endpoints
// ---------------------------------------------------------------------------

/** Register a new agent on retake.tv */
export async function registerAgent(opts: {
  agent_name: string;
  agent_description: string;
  image_url: string;
  wallet_address: string;
  apiUrl?: string;
}): Promise<RetakeAgent | null> {
  const res = await fetch(`${opts.apiUrl || BASE}/agent/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agent_name: opts.agent_name,
      agent_description: opts.agent_description,
      image_url: opts.image_url,
      wallet_address: opts.wallet_address,
    }),
  });
  if (!res.ok) return null;
  return res.json();
}

/** Check if agent stream is live */
export async function getStreamStatus(
  token: string,
  apiUrl = BASE,
): Promise<StreamStatus | null> {
  const res = await fetch(`${apiUrl}/agent/stream/status`, {
    headers: authHeaders(token),
  });
  if (!res.ok) return null;
  return res.json();
}

/** Get RTMP credentials (always re-fetch before each stream) */
export async function getRtmpCredentials(
  token: string,
  apiUrl = BASE,
): Promise<{ url: string; key: string } | null> {
  const res = await fetch(`${apiUrl}/agent/rtmp`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok) return null;
  return res.json();
}

/** Start a stream session */
export async function startStream(
  token: string,
  apiUrl = BASE,
) {
  const res = await fetch(`${apiUrl}/agent/stream/start`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok) return null;
  return res.json();
}

/** Stop a stream session */
export async function stopStream(
  token: string,
  apiUrl = BASE,
) {
  const res = await fetch(`${apiUrl}/agent/stream/stop`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!res.ok) return null;
  return res.json();
}

/** Send a chat message to a streamer's room */
export async function sendChatMessage(opts: {
  token: string;
  message: string;
  destinationUserId: string;
  apiUrl?: string;
}) {
  const res = await fetch(`${opts.apiUrl || BASE}/agent/stream/chat/send`, {
    method: "POST",
    headers: authHeaders(opts.token),
    body: JSON.stringify({
      message: opts.message,
      destination_user_id: opts.destinationUserId,
      access_token: opts.token,
    }),
  });
  if (!res.ok) return null;
  return res.json();
}

/** Get chat comments for a stream */
export async function getChatComments(opts: {
  userDbId: string;
  limit?: number;
  beforeId?: string;
  apiUrl?: string;
}): Promise<ChatComment[]> {
  const params = new URLSearchParams({
    userDbId: opts.userDbId,
    limit: String(opts.limit || 50),
  });
  if (opts.beforeId) params.set("beforeId", opts.beforeId);

  const res = await fetch(
    `${opts.apiUrl || BASE}/agent/stream/comments?${params}`,
  );
  if (!res.ok) return [];
  return res.json();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the public stream page URL for an agent */
export function streamUrl(agentName: string) {
  return `https://retake.tv/${encodeURIComponent(agentName)}`;
}
