const RESERVED_MATCH_IDS = new Set(["undefined", "null", "skip"]);

export const normalizeMatchId = (matchId?: string | null): string | null => {
  const trimmed = matchId?.trim();
  if (!trimmed) return null;
  if (RESERVED_MATCH_IDS.has(trimmed.toLowerCase())) return null;
  return trimmed;
};

