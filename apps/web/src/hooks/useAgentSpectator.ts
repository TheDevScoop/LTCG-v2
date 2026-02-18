import { useState, useEffect, useRef, useCallback } from "react";

type Seat = "host" | "away";

function clampSeat(value: unknown): Seat | null {
  return value === "host" || value === "away" ? value : null;
}

function resolvePhase(view: any) {
  const phase = view?.currentPhase ?? view?.phase;
  return typeof phase === "string" && phase.trim() ? phase : "unknown";
}

function resolveLifePoints(view: any) {
  return {
    myLP: typeof view?.lifePoints === "number" ? view.lifePoints : 0,
    oppLP: typeof view?.opponentLifePoints === "number" ? view.opponentLifePoints : 0,
  };
}

function mapHand(hand: unknown) {
  const ids = Array.isArray(hand) ? (hand as unknown[]) : [];
  return ids
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((cardId) => ({
      instanceId: cardId,
      cardId,
      name: cardId,
    }));
}

function mapBoard(board: unknown) {
  const cards = Array.isArray(board) ? (board as unknown[]) : [];
  return cards
    .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object")
    .map((raw) => {
      const definitionId = typeof raw.definitionId === "string" ? raw.definitionId : "";
      return {
        ...raw,
        name: definitionId || "Set",
      };
    });
}

/**
 * Spectator mode hook for watching an agent play via the HTTP API.
 *
 * When the LTCG frontend is embedded in milaidy, the host sends an
 * ltcg_ API key (not a Privy JWT). This key can't authenticate with
 * Convex real-time subscriptions, so we poll the HTTP API instead.
 *
 * Flow:
 * 1. GET /api/agent/me — verify key, get agent info
 * 2. GET /api/agent/game/match-status — find active match (poll)
 * 3. GET /api/agent/game/view — get board state (poll)
 */

const BASE_POLL_INTERVAL_MS = 2000; // 2s for active matches
const MAX_POLL_INTERVAL_MS = 30000;
const FETCH_TIMEOUT_MS = 8000;

type ApiFetchResult =
  | { ok: true; data: any }
  | { ok: false; status: number; message?: string };

function jitter(ms: number) {
  // +-10% jitter to avoid thundering herd.
  const delta = Math.floor(ms * 0.1);
  return ms + Math.floor(Math.random() * (delta * 2 + 1)) - delta;
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

export interface SpectatorMatchState {
  matchId: string;
  phase: string;
  gameOver: boolean;
  isAgentTurn: boolean;
  seat: Seat;
  myLP: number;
  oppLP: number;
  hand: any[];
  playerField: { monsters: any[]; spellTraps?: any[] };
  opponentField: { monsters: any[]; spellTraps?: any[] };
  // Match metadata
  mode?: string;
  winner?: string | null;
  chapterId?: string | null;
  stageNumber?: number | null;
}

export interface SpectatorAgent {
  id: string;
  name: string;
  apiKeyPrefix: string;
}

export function useAgentSpectator(apiKey: string | null, apiUrl: string | null) {
  const [agent, setAgent] = useState<SpectatorAgent | null>(null);
  const [matchState, setMatchState] = useState<SpectatorMatchState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const activeMatchId = useRef<string | null>(null);
  const activeMatchSeat = useRef<Seat | null>(null);
  const mountedRef = useRef(true);
  const pollDelayMsRef = useRef(BASE_POLL_INTERVAL_MS);
  const consecutiveFailuresRef = useRef(0);

  const apiFetch = useCallback(
    async (path: string): Promise<ApiFetchResult> => {
      if (!apiKey || !apiUrl) {
        return { ok: false, status: 0, message: "Missing API key or URL" };
      }
      const url = `${apiUrl.replace(/\/$/, "")}${path}`;
      let res: Response;
      try {
        res = await fetchJsonWithTimeout(
          url,
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
          },
          FETCH_TIMEOUT_MS,
        );
      } catch (err: any) {
        const message = err?.name === "AbortError" ? "Request timed out" : "Network error";
        return { ok: false, status: 0, message };
      }

      if (!res.ok) {
        return { ok: false, status: res.status };
      }

      try {
        return { ok: true, data: await res.json() };
      } catch {
        return { ok: false, status: res.status, message: "Invalid JSON response" };
      }
    },
    [apiKey, apiUrl],
  );

  // Verify agent on mount
  useEffect(() => {
    if (!apiKey || !apiUrl) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function verify() {
      try {
        const me = await apiFetch("/api/agent/me");
        if (cancelled) return;
        if (!me.ok) {
          setError("Invalid API key");
          setLoading(false);
          return;
        }
        setAgent({ id: me.data.id, name: me.data.name, apiKeyPrefix: me.data.apiKeyPrefix });
        setError(null);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError("Failed to connect");
          setLoading(false);
        }
      }
    }

    verify();
    return () => { cancelled = true; };
  }, [apiKey, apiUrl, apiFetch]);

  // Poll for match state
  useEffect(() => {
    if (!agent || !apiKey || !apiUrl) return;
    mountedRef.current = true;
    pollDelayMsRef.current = BASE_POLL_INTERVAL_MS;
    consecutiveFailuresRef.current = 0;
    let timeoutId: number | null = null;

    async function poll() {
      if (!mountedRef.current) return;

      try {
        // If we have an active match, poll its view
        if (activeMatchId.current) {
          const viewRes = await apiFetch(
            `/api/agent/game/view?matchId=${encodeURIComponent(activeMatchId.current)}${activeMatchSeat.current ? `&seat=${activeMatchSeat.current}` : ""}`,
          );

          if (!mountedRef.current) return;

          if (viewRes.ok) {
            const view = viewRes.data;
            const mySeat = clampSeat(activeMatchSeat.current) ?? clampSeat(view.mySeat) ?? "host";
            activeMatchSeat.current = mySeat;
            const { myLP, oppLP } = resolveLifePoints(view);
            setMatchState({
              matchId: activeMatchId.current!,
              phase: resolvePhase(view),
              gameOver: Boolean(view.gameOver),
              seat: mySeat,
              isAgentTurn: view.currentTurnPlayer === mySeat,
              myLP,
              oppLP,
              hand: mapHand(view.hand),
              playerField: { monsters: mapBoard(view.board) },
              opponentField: { monsters: mapBoard(view.opponentBoard) },
            });

            // If game is over, fetch match status for metadata then clear
            if (view.gameOver) {
              const statusRes = await apiFetch(
                `/api/agent/game/match-status?matchId=${encodeURIComponent(activeMatchId.current!)}`,
              );
              if (mountedRef.current && statusRes.ok) {
                setMatchState((prev) =>
                  prev
                    ? {
                        ...prev,
                        mode: statusRes.data.mode,
                        winner: statusRes.data.winner,
                        chapterId: statusRes.data.chapterId,
                        stageNumber: statusRes.data.stageNumber,
                      }
                    : prev,
                );
              }
              // Keep showing final state, don't clear matchId immediately
            }
            setError(null);
            consecutiveFailuresRef.current = 0;
            pollDelayMsRef.current = BASE_POLL_INTERVAL_MS;
            return;
          }

          if (viewRes.status === 401 || viewRes.status === 403) {
            setError("Unauthorized (invalid or expired API key)");
          }
          // View failed — match may have ended, clear it
          activeMatchId.current = null;
          setMatchState(null);
        }

        // No active match — poll /api/agent/active-match to discover one
        const activeMatchRes = await apiFetch("/api/agent/active-match");
        if (mountedRef.current && activeMatchRes.ok && activeMatchRes.data?.matchId) {
          activeMatchId.current = activeMatchRes.data.matchId;
          activeMatchSeat.current = clampSeat(activeMatchRes.data.seat) ?? null;
          // Next poll iteration will fetch the view
        }

      } catch {
        setError("Network error while polling");
        consecutiveFailuresRef.current += 1;
        const next = Math.min(
          MAX_POLL_INTERVAL_MS,
          BASE_POLL_INTERVAL_MS * Math.pow(2, Math.min(6, consecutiveFailuresRef.current)),
        );
        pollDelayMsRef.current = next;
      }
    }

    function scheduleNext() {
      if (!mountedRef.current) return;
      const delay = jitter(pollDelayMsRef.current);
      timeoutId = window.setTimeout(async () => {
        await poll();
        scheduleNext();
      }, delay);
    }

    poll().finally(() => scheduleNext());
    return () => {
      mountedRef.current = false;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [agent, apiKey, apiUrl, apiFetch]);

  /** Manually set the match to watch (called when postMessage provides matchId) */
  const watchMatch = useCallback((matchId: string, seat?: Seat) => {
    activeMatchId.current = matchId;
    activeMatchSeat.current = clampSeat(seat);
  }, []);

  return { agent, matchState, error, loading, watchMatch };
}
