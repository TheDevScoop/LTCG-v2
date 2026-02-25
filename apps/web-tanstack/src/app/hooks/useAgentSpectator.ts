import { useState, useEffect, useCallback, useMemo } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { apiAny } from "@/lib/convexHelpers";

export type Seat = "host" | "away";

export type PublicSpectatorSlot = {
  lane: number;
  occupied: boolean;
  faceDown: boolean;
  position: "attack" | "defense" | null;
  name: string | null;
  attack: number | null;
  defense: number | null;
  kind: "monster" | "spell" | "trap" | "card" | null;
  definitionId: string | null;
};

export type PublicSpectatorView = {
  matchId: string;
  seat: Seat;
  status: string | null;
  mode: string | null;
  phase: string;
  turnNumber: number;
  gameOver: boolean;
  winner: Seat | null;
  isAgentTurn: boolean;
  chapterId: string | null;
  stageNumber: number | null;
  players: {
    agent: {
      lifePoints: number;
      deckCount: number;
      handCount: number;
      graveyardCount: number;
      banishedCount: number;
    };
    opponent: {
      lifePoints: number;
      deckCount: number;
      handCount: number;
      graveyardCount: number;
      banishedCount: number;
    };
  };
  fields: {
    agent: {
      monsters: PublicSpectatorSlot[];
      spellTraps: PublicSpectatorSlot[];
    };
    opponent: {
      monsters: PublicSpectatorSlot[];
      spellTraps: PublicSpectatorSlot[];
    };
  };
};

export type PublicEventLogEntry = {
  version: number;
  createdAt: number | null;
  actor: "agent" | "opponent" | "system";
  eventType: string;
  summary: string;
  rationale: string;
};

function normalizeText(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function clampSeat(value: unknown): Seat | null {
  return value === "host" || value === "away" ? value : null;
}

export function resolveHostLookupId(args: {
  queryMatchId: string | null;
  queryHostId: string | null;
  agentUserId: string | null;
}) {
  if (args.queryMatchId) return null;
  return args.queryHostId ?? args.agentUserId;
}

export function resolveSpectatorTarget(args: {
  overrideMatchId: string | null;
  overrideSeat: Seat | null;
  queryMatchId: string | null;
  querySeat: Seat | null;
  autoMatchId: string | null;
  autoSeat: Seat | null;
}) {
  const matchId = args.overrideMatchId ?? args.queryMatchId ?? args.autoMatchId ?? null;
  const seat = args.overrideSeat ?? args.querySeat ?? args.autoSeat ?? "host";
  return { matchId, seat };
}

const TIMELINE_LIMIT = 120;

export interface SpectatorAgent {
  id: string;
  userId: string;
  name: string;
  apiKeyPrefix: string;
}

export function useAgentSpectator(args: {
  apiKey: string | null;
  apiUrl: string | null;
  hostId?: string | null;
  matchId?: string | null;
  seat?: Seat | null;
}) {
  const apiKey = normalizeText(args.apiKey);
  const apiUrl = normalizeText(args.apiUrl);
  const queryHostId = normalizeText(args.hostId ?? null);
  const queryMatchId = normalizeText(args.matchId ?? null);
  const querySeat = clampSeat(args.seat ?? null);

  const [agent, setAgent] = useState<SpectatorAgent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [overrideMatchId, setOverrideMatchId] = useState<string | null>(null);
  const [overrideSeat, setOverrideSeat] = useState<Seat | null>(null);

  // One-time HTTP call to identify the agent
  useEffect(() => {
    if (!apiKey || !apiUrl) {
      setAgent(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`${apiUrl.replace(/\/$/, "")}/api/agent/me`, {
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        });
        if (cancelled) return;
        if (!res.ok) { setError("Invalid API key"); setLoading(false); return; }
        const me = await res.json();
        if (cancelled) return;
        setAgent({
          id: String(me.id ?? ""),
          userId: String(me.userId ?? ""),
          name: String(me.name ?? "Agent"),
          apiKeyPrefix: String(me.apiKeyPrefix ?? ""),
        });
        setError(null);
      } catch {
        if (!cancelled) setError("Failed to connect");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [apiKey, apiUrl]);

  // Auto-discover active match by host only when we don't have an explicit match override.
  const hostLookupId = resolveHostLookupId({
    queryMatchId,
    queryHostId,
    agentUserId: agent?.userId ?? null,
  });

  const autoMatch = useQuery(
    apiAny.game.getPublicActiveMatchByHost,
    hostLookupId ? { hostId: hostLookupId } : "skip",
  ) as any;
  const autoSeat = clampSeat(autoMatch?.seat);
  const autoMatchId = normalizeText(typeof autoMatch?.matchId === "string" ? autoMatch.matchId : null);

  const target = resolveSpectatorTarget({
    overrideMatchId,
    overrideSeat,
    queryMatchId,
    querySeat,
    autoMatchId,
    autoSeat,
  });

  const matchArgs = target.matchId ? { matchId: target.matchId, seat: target.seat } : "skip";

  const matchState = useQuery(apiAny.game.getSpectatorView, matchArgs) as PublicSpectatorView | null | undefined;
  const {
    results: pagedEvents,
    status: eventsStatus,
    loadMore: loadMoreEvents,
  } = usePaginatedQuery(apiAny.game.getSpectatorEventsPaginated, matchArgs, {
    initialNumItems: 40,
  });

  // Pull enough history to fill the panel, then stop.
  useEffect(() => {
    if (eventsStatus !== "CanLoadMore") return;
    if (pagedEvents.length >= TIMELINE_LIMIT) return;
    loadMoreEvents(Math.min(40, TIMELINE_LIMIT - pagedEvents.length));
  }, [eventsStatus, pagedEvents.length, loadMoreEvents]);

  const timeline = useMemo(
    // usePaginatedQuery returns newest-first when server query is order("desc").
    // Keep oldest->newest for existing Timeline rendering semantics.
    () => [...(pagedEvents.slice(0, TIMELINE_LIMIT) as PublicEventLogEntry[])].reverse(),
    [pagedEvents],
  );

  const watchMatch = useCallback((id: string, s?: Seat) => {
    setOverrideMatchId(id);
    setOverrideSeat(clampSeat(s));
  }, []);

  return { agent, matchState: matchState ?? null, timeline, error, loading, watchMatch };
}
