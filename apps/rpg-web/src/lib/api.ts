export type ApiOptions = {
  apiKey?: string;
};

export type LibraryWorld = {
  _id: string;
  title: string;
  slug: string;
  description: string;
  genre: string;
  tags: string[];
  status: string;
  visibility: string;
  activeVersionId?: string;
  popularityScore?: number;
  ratingAverage?: number;
  ratingCount?: number;
};

const DEFAULT_BASE = "http://localhost:3210";

function getBaseUrl(): string {
  return (import.meta.env.VITE_RPG_API_BASE as string | undefined) ?? DEFAULT_BASE;
}

async function request<T>(path: string, init: RequestInit = {}, options: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };

  if (options.apiKey) {
    headers.Authorization = `Bearer ${options.apiKey}`;
  }

  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers,
  });

  const text = await response.text();
  const json = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = json?.error ?? text ?? `HTTP ${response.status}`;
    throw new Error(message);
  }

  return json as T;
}

export async function listWorlds(limit = 20): Promise<LibraryWorld[]> {
  const result = await request<{ worlds: LibraryWorld[] }>(`/api/rpg/worlds/list?limit=${limit}`);
  return result.worlds;
}

export async function listFeaturedWorlds(limit = 12): Promise<LibraryWorld[]> {
  const result = await request<{ worlds: LibraryWorld[] }>(`/api/rpg/worlds/featured?limit=${limit}`);
  return result.worlds;
}

export async function searchWorlds(query: string, limit = 20): Promise<LibraryWorld[]> {
  const q = encodeURIComponent(query);
  const result = await request<{ worlds: LibraryWorld[] }>(`/api/rpg/worlds/search?q=${q}&limit=${limit}`);
  return result.worlds;
}

export async function bootstrapFlagshipWorlds(options: ApiOptions): Promise<{
  created: Array<{ slug: string; worldId: string; worldVersionId: string }>;
  existing: Array<{ slug: string; worldId: string; worldVersionId: string }>;
  total: number;
}> {
  return request("/api/rpg/worlds/bootstrap", { method: "POST", body: JSON.stringify({}) }, options);
}

export async function createWorld(payload: {
  title: string;
  description: string;
  genre: string;
  tags: string[];
  visibility?: "private" | "unlisted" | "public";
  manifest?: Record<string, unknown>;
}, options: ApiOptions): Promise<{ worldId: string; worldVersionId: string; contentAddress: string }> {
  return request(
    "/api/rpg/worlds/create",
    { method: "POST", body: JSON.stringify(payload) },
    options,
  );
}

export async function generateCampaign(payload: {
  worldId: string;
  title: string;
  stages: number;
}, options: ApiOptions): Promise<{ campaignId: string; graph: unknown }> {
  return request(
    "/api/rpg/campaigns/generate",
    { method: "POST", body: JSON.stringify(payload) },
    options,
  );
}

export async function createSession(payload: {
  worldVersionId: string;
  title: string;
  seatLimit?: number;
}, options: ApiOptions): Promise<{ sessionId: string; status: string }> {
  return request(
    "/api/rpg/sessions/create",
    { method: "POST", body: JSON.stringify(payload) },
    options,
  );
}

export async function joinSession(payload: {
  sessionId: string;
  seat: string;
}, options: ApiOptions): Promise<{ sessionId: string; seat: string; status: string }> {
  return request(
    "/api/rpg/sessions/join",
    { method: "POST", body: JSON.stringify(payload) },
    options,
  );
}

export async function getSessionState(sessionId: string): Promise<any> {
  const id = encodeURIComponent(sessionId);
  return request(`/api/rpg/sessions/state?sessionId=${id}`);
}

export async function applySessionAction(payload: {
  sessionId: string;
  action: Record<string, unknown>;
}, options: ApiOptions): Promise<{ eventId: string; eventIndex: number; status: string }> {
  return request(
    "/api/rpg/sessions/action",
    { method: "POST", body: JSON.stringify(payload) },
    options,
  );
}

export async function rollDice(expression: string): Promise<{ expression: string; roll: { dice: number[]; modifier: number; total: number } }> {
  return request(
    "/api/rpg/dice/roll",
    { method: "POST", body: JSON.stringify({ expression }) },
  );
}
