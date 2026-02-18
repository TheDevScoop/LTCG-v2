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

const POLL_INTERVAL = 2000; // 2s for active matches

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

  const apiFetch = useCallback(
    async (path: string) => {
      if (!apiKey || !apiUrl) return null;
      const url = `${apiUrl.replace(/\/$/, "")}${path}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) return null;
      return res.json();
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
        if (!me) {
          setError("Invalid API key");
          setLoading(false);
          return;
        }
        setAgent({ id: me.id, name: me.name, apiKeyPrefix: me.apiKeyPrefix });
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

    async function poll() {
      if (!mountedRef.current) return;

      try {
        // If we have an active match, poll its view
        if (activeMatchId.current) {
          const view = await apiFetch(
            `/api/agent/game/view?matchId=${encodeURIComponent(activeMatchId.current)}${activeMatchSeat.current ? `&seat=${activeMatchSeat.current}` : ""}`,
          );

          if (!mountedRef.current) return;

        if (view) {
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
              const status = await apiFetch(
                `/api/agent/game/match-status?matchId=${encodeURIComponent(activeMatchId.current!)}`,
              );
              if (mountedRef.current && status) {
                setMatchState((prev) =>
                  prev
                    ? {
                        ...prev,
                        mode: status.mode,
                        winner: status.winner,
                        chapterId: status.chapterId,
                        stageNumber: status.stageNumber,
                      }
                    : prev,
                );
              }
              // Keep showing final state, don't clear matchId immediately
            }
            return;
          }
          // View failed — match may have ended, clear it
          activeMatchId.current = null;
          setMatchState(null);
        }

        // No active match — poll /api/agent/active-match to discover one
        const activeMatch = await apiFetch("/api/agent/active-match");
        if (mountedRef.current && activeMatch?.matchId) {
          activeMatchId.current = activeMatch.matchId;
          activeMatchSeat.current = clampSeat(activeMatch.seat) ?? null;
          // Next poll iteration will fetch the view
        }

      } catch {
        // Network error — keep polling
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [agent, apiKey, apiUrl, apiFetch]);

  /** Manually set the match to watch (called when postMessage provides matchId) */
  const watchMatch = useCallback((matchId: string, seat?: Seat) => {
    activeMatchId.current = matchId;
    activeMatchSeat.current = clampSeat(seat);
  }, []);

  return { agent, matchState, error, loading, watchMatch };
}
