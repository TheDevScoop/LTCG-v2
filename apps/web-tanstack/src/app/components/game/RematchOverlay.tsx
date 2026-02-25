import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "@/router/react-router";
import { motion } from "framer-motion";
import { apiAny, useConvexMutation, useConvexQuery } from "@/lib/convexHelpers";

const REMATCH_TIMEOUT_SECONDS = 30;

interface RematchOverlayProps {
  matchId: string;
  currentUserId: string;
}

type RematchStatus =
  | { hasRematch: false }
  | { hasRematch: true; rematchMatchId: string; requestedBy: string };

export function RematchOverlay({
  matchId,
  currentUserId,
}: RematchOverlayProps) {
  const navigate = useNavigate();
  const [requesting, setRequesting] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [error, setError] = useState("");
  const [timeLeft, setTimeLeft] = useState(REMATCH_TIMEOUT_SECONDS);
  const autoDeclineRef = useRef(false);
  const intervalRef = useRef<number | null>(null);

  const requestRematch = useConvexMutation(apiAny.rematch.requestRematch);
  const declineRematch = useConvexMutation(apiAny.rematch.declineRematch);
  const joinPvpLobby = useConvexMutation(apiAny.game.joinPvpLobby);

  const rematchStatus = useConvexQuery(
    apiAny.rematch.getRematchStatus,
    matchId ? { matchId } : "skip",
  ) as RematchStatus | undefined;

  const hasRematch = rematchStatus?.hasRematch === true;
  const rematchMatchId = hasRematch ? rematchStatus.rematchMatchId : null;
  const requestedBy = hasRematch ? rematchStatus.requestedBy : null;
  const iRequestedIt = requestedBy === currentUserId;
  const opponentRequested = hasRematch && !iRequestedIt;

  // Auto-decline timer when opponent requests rematch
  useEffect(() => {
    if (!opponentRequested || declined || autoDeclineRef.current) {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    setTimeLeft(REMATCH_TIMEOUT_SECONDS);
    intervalRef.current = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          autoDeclineRef.current = true;
          setDeclined(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [opponentRequested, declined]);

  const handleRequestRematch = useCallback(async () => {
    setRequesting(true);
    setError("");
    try {
      await requestRematch({ matchId });
    } catch (err: any) {
      setError(err?.message ?? "Failed to request rematch.");
    } finally {
      setRequesting(false);
    }
  }, [matchId, requestRematch]);

  const handleAcceptRematch = useCallback(async () => {
    if (!rematchMatchId) return;
    setRequesting(true);
    setError("");
    try {
      await joinPvpLobby({ matchId: rematchMatchId });
      navigate(`/play/${rematchMatchId}`);
    } catch (err: any) {
      setError(err?.message ?? "Failed to join rematch.");
    } finally {
      setRequesting(false);
    }
  }, [rematchMatchId, joinPvpLobby, navigate]);

  const handleDecline = useCallback(async () => {
    setDeclined(true);
    setError("");
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    try {
      await declineRematch({ matchId });
    } catch {
      // Silently fail — the lobby will expire anyway
    }
  }, [matchId, declineRematch]);

  // Don't render if declined
  if (declined) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ delay: 0.6, duration: 0.3 }}
      className="mt-4 space-y-3"
    >
      {/* I requested and waiting */}
      {iRequestedIt && (
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <motion.div
              className="w-2 h-2 bg-[#ffcc00]"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <p
              className="text-sm text-white/60 italic"
              style={{ fontFamily: "Special Elite, cursive" }}
            >
              Waiting for opponent to accept...
            </p>
          </div>
        </div>
      )}

      {/* Opponent requested */}
      {opponentRequested && (
        <div className="space-y-3">
          <div className="text-center">
            <p
              className="text-sm text-[#ffcc00] font-bold uppercase tracking-tight"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              Opponent wants a rematch!
            </p>

            {/* Timer */}
            <div className="mt-2 flex items-center justify-center gap-2">
              <div className="relative w-32 h-1 bg-white/10 border border-white/20 overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-[#ffcc00]"
                  animate={{ width: `${(timeLeft / REMATCH_TIMEOUT_SECONDS) * 100}%` }}
                  transition={{ duration: 0.3, ease: "linear" }}
                />
              </div>
              <span className="font-mono text-xs text-white/40">{timeLeft}s</span>
            </div>
          </div>

          <div className="flex gap-3 justify-center">
            <button
              type="button"
              onClick={handleAcceptRematch}
              disabled={requesting}
              className="bg-[#ffcc00] border-2 border-[#ffcc00] text-[#121212] font-black uppercase tracking-wider text-sm px-6 py-2 hover:bg-[#ffd633] transition-colors disabled:opacity-50"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              {requesting ? "JOINING..." : "ACCEPT"}
            </button>
            <button
              type="button"
              onClick={handleDecline}
              className="bg-white/10 border-2 border-white/20 text-white font-black uppercase tracking-wider text-sm px-6 py-2 hover:bg-white/20 transition-colors"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              DECLINE
            </button>
          </div>
        </div>
      )}

      {/* No rematch yet — show request button */}
      {!hasRematch && !iRequestedIt && (
        <div className="text-center">
          <button
            type="button"
            onClick={handleRequestRematch}
            disabled={requesting}
            className="bg-white/10 border-2 border-white/20 text-white font-black uppercase tracking-wider text-sm px-8 py-3 hover:bg-white/20 transition-colors disabled:opacity-50"
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            {requesting ? "REQUESTING..." : "REQUEST REMATCH"}
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-center text-xs text-red-400 font-bold">{error}</p>
      )}
    </motion.div>
  );
}
