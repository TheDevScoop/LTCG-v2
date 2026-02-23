export type StreamOverlaySeat = "host" | "away";

export type StreamOverlayParams = {
  apiKey: string | null;
  hostId: string | null;
  matchId: string | null;
  seat: StreamOverlaySeat | null;
};

function normalizeText(value: string | null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeStreamOverlaySeat(value: string | null): StreamOverlaySeat | null {
  const normalized = normalizeText(value)?.toLowerCase();
  if (!normalized) return null;
  if (normalized === "host" || normalized === "away") return normalized;
  return "host";
}

export function parseStreamOverlayParams(params: URLSearchParams): StreamOverlayParams {
  return {
    apiKey: normalizeText(params.get("apiKey")),
    hostId: normalizeText(params.get("hostId")),
    matchId: normalizeText(params.get("matchId")),
    seat: normalizeStreamOverlaySeat(params.get("seat")),
  };
}
