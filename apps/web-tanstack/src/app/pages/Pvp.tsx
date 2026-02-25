import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@/router/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { apiAny, useConvexMutation, useConvexQuery } from "@/lib/convexHelpers";
import { TrayNav } from "@/components/layout/TrayNav";
import { AmbientBackground } from "@/components/ui/AmbientBackground";
import { LANDING_BG, MENU_TEXTURE } from "@/lib/blobUrls";

type PvpLobbySummary = {
  matchId: string;
  hostUserId: string;
  hostUsername: string;
  visibility: "public" | "private";
  joinCode: string | null;
  status: "waiting" | "active" | "ended" | "canceled";
  createdAt: number;
  activatedAt: number | null;
  endedAt: number | null;
  pongEnabled: boolean;
  redemptionEnabled: boolean;
};

type JoinResult = {
  matchId: string;
  seat: "away";
  mode: "pvp";
  status: "active";
};

type CreateResult = {
  matchId: string;
  visibility: "public" | "private";
  joinCode: string | null;
  status: "waiting";
  createdAt: number;
};

function createOptimisticLobby(visibility: "public" | "private"): PvpLobbySummary {
  return {
    matchId: `optimistic:${Date.now()}:${Math.floor(Math.random() * 1000)}`,
    hostUserId: "__self__",
    hostUsername: "You",
    visibility,
    joinCode: null,
    status: "waiting",
    createdAt: Date.now(),
    activatedAt: null,
    endedAt: null,
    pongEnabled: false,
    redemptionEnabled: false,
  };
}

export function Pvp() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [pongEnabled, setPongEnabled] = useState(false);
  const [redemptionEnabled, setRedemptionEnabled] = useState(false);

  const myLobby = useConvexQuery(apiAny.game.getMyPvpLobby, {}) as PvpLobbySummary | null | undefined;
  const openLobbies = useConvexQuery(apiAny.game.listOpenPvpLobbies, {}) as PvpLobbySummary[] | undefined;

  const createPvpLobby = useConvexMutation(apiAny.game.createPvpLobby).withOptimisticUpdate(
    (localStore: any, args: { visibility?: "public" | "private" }) => {
      const visibility = args.visibility === "private" ? "private" : "public";
      localStore.setQuery(apiAny.game.getMyPvpLobby, {}, createOptimisticLobby(visibility));
    },
  );
  const joinPvpLobby = useConvexMutation(apiAny.game.joinPvpLobby).withOptimisticUpdate(
    (localStore: any, args: { matchId: string }) => {
      const open = (localStore.getQuery(apiAny.game.listOpenPvpLobbies, {}) ?? []) as PvpLobbySummary[];
      localStore.setQuery(
        apiAny.game.listOpenPvpLobbies,
        {},
        open.filter((lobby) => lobby.matchId !== args.matchId),
      );
    },
  );
  const joinPvpLobbyByCode = useConvexMutation(apiAny.game.joinPvpLobbyByCode);
  const cancelPvpLobby = useConvexMutation(apiAny.game.cancelPvpLobby).withOptimisticUpdate(
    (localStore: any, args: { matchId: string }) => {
      const current = localStore.getQuery(apiAny.game.getMyPvpLobby, {}) as
        | PvpLobbySummary
        | null
        | undefined;
      if (current && current.matchId === args.matchId) {
        localStore.setQuery(apiAny.game.getMyPvpLobby, {}, null);
      }
    },
  );

  const canCreate = !myLobby || myLobby.status !== "waiting";
  const sortedOpenLobbies = useMemo(
    () => [...(openLobbies ?? [])].sort((a, b) => b.createdAt - a.createdAt),
    [openLobbies],
  );

  useEffect(() => {
    if (myLobby?.status === "active") {
      navigate(`/play/${myLobby.matchId}`);
    }
  }, [myLobby?.status, myLobby?.matchId, navigate]);

  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearFlash = useCallback(() => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => {
      setMessage("");
      setCopied("");
      flashTimerRef.current = null;
    }, 1800);
  }, []);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  const resetNotices = useCallback(() => {
    setError("");
    setMessage("");
    setCopied("");
  }, []);

  const handleCreateLobby = useCallback(
    async (visibility: "public" | "private") => {
      resetNotices();
      setBusyKey(`create:${visibility}`);
      try {
        const created = (await createPvpLobby({
          visibility,
          pongEnabled,
          redemptionEnabled,
        })) as CreateResult;
        setMessage(
          visibility === "private"
            ? `Private lobby ready. Join code: ${created.joinCode ?? "n/a"}`
            : "Public lobby created.",
        );
        clearFlash();
      } catch (err: any) {
        setError(err?.message ?? "Failed to create lobby.");
      } finally {
        setBusyKey(null);
      }
    },
    [clearFlash, createPvpLobby, resetNotices],
  );

  const handleJoinLobby = useCallback(
    async (matchId: string) => {
      resetNotices();
      setBusyKey(`join:${matchId}`);
      try {
        const result = (await joinPvpLobby({ matchId })) as JoinResult;
        navigate(`/play/${result.matchId}`);
      } catch (err: any) {
        setError(err?.message ?? "Failed to join lobby.");
      } finally {
        setBusyKey(null);
      }
    },
    [joinPvpLobby, navigate, resetNotices],
  );

  const handleJoinByCode = useCallback(async () => {
    const normalizedCode = joinCode.trim().toUpperCase();
    if (!normalizedCode) {
      setError("Enter a lobby code first.");
      return;
    }

    resetNotices();
    setBusyKey("join:code");
    try {
      const result = (await joinPvpLobbyByCode({
        joinCode: normalizedCode,
      })) as JoinResult;
      navigate(`/play/${result.matchId}`);
    } catch (err: any) {
      setError(err?.message ?? "Failed to join by code.");
    } finally {
      setBusyKey(null);
    }
  }, [joinCode, joinPvpLobbyByCode, navigate, resetNotices]);

  const handleCancelLobby = useCallback(async () => {
    if (!myLobby?.matchId) return;
    resetNotices();
    setBusyKey("cancel");
    try {
      await cancelPvpLobby({ matchId: myLobby.matchId });
      setMessage("Lobby canceled.");
      clearFlash();
    } catch (err: any) {
      setError(err?.message ?? "Failed to cancel lobby.");
    } finally {
      setBusyKey(null);
    }
  }, [cancelPvpLobby, clearFlash, myLobby?.matchId, resetNotices]);

  const handleCopy = useCallback(async (value: string, label: "Join code" | "Match ID") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(`${label} copied.`);
      clearFlash();
    } catch {
      setCopied("Clipboard unavailable.");
      clearFlash();
    }
  }, [clearFlash]);

  return (
    <div
      className="min-h-screen relative bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url('${LANDING_BG}')` }}
    >
      <div className="absolute inset-0 bg-black/75" />
      <AmbientBackground variant="dark" />

      <div className="relative z-10 max-w-4xl mx-auto px-4 md:px-8 py-8 pb-24">
        <header className="text-center mb-6">
          <motion.h1
            className="text-4xl md:text-5xl font-black uppercase tracking-tighter text-white drop-shadow-[3px_3px_0px_rgba(0,0,0,1)]"
            style={{ fontFamily: "Outfit, sans-serif" }}
            initial={{ opacity: 0, y: -15 }}
            animate={{ opacity: 1, y: 0 }}
          >
            PvP Lobby
          </motion.h1>
          <motion.p
            className="text-[#ffcc00] text-sm mt-2"
            style={{ fontFamily: "Special Elite, cursive" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
          >
            Human vs Human duels + Human-hosted invites for Milady agents
          </motion.p>
        </header>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }}
        >

        <motion.section
          variants={{
            hidden: { opacity: 0, y: 16 },
            visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
          }}
          className="relative mb-5 p-5 border-2 border-[#121212]"
          style={{ backgroundImage: `url('${MENU_TEXTURE}')`, backgroundSize: "512px" }}
        >
          <div className="absolute inset-0 bg-white/82 pointer-events-none" />
          <div className="relative">
            <p className="text-xs uppercase tracking-wider font-bold text-[#121212] mb-3">
              Create Lobby
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!canCreate || busyKey !== null}
                onClick={() => handleCreateLobby("public")}
                className="tcg-button-primary px-4 py-2 text-xs disabled:opacity-60"
              >
                {busyKey === "create:public" ? "Creating..." : "Create Public Lobby"}
              </button>
              <button
                type="button"
                disabled={!canCreate || busyKey !== null}
                onClick={() => handleCreateLobby("private")}
                className="tcg-button px-4 py-2 text-xs disabled:opacity-60"
              >
                {busyKey === "create:private" ? "Creating..." : "Create Private Lobby"}
              </button>
            </div>

            {/* House rules toggles */}
            <div className="mt-3 flex flex-wrap gap-4">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={pongEnabled}
                  onChange={(e) => setPongEnabled(e.target.checked)}
                  className="w-4 h-4 accent-[#ffcc00]"
                />
                <span className="text-[11px] font-bold uppercase text-[#121212]">Beer Pong</span>
                <span className="text-[10px] text-[#666]">Pong shots after kills</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={redemptionEnabled}
                  onChange={(e) => setRedemptionEnabled(e.target.checked)}
                  className="w-4 h-4 accent-[#ffcc00]"
                />
                <span className="text-[11px] font-bold uppercase text-[#121212]">Redemption</span>
                <span className="text-[10px] text-[#666]">Loser gets a redemption shot</span>
              </label>
            </div>

            {!canCreate && (
              <p className="text-[11px] text-[#555] mt-2">
                You already have a waiting/active lobby below.
              </p>
            )}
          </div>
        </motion.section>

        <motion.section
          variants={{
            hidden: { opacity: 0, y: 16 },
            visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
          }}
          className="relative mb-5 p-5 border-2 border-[#121212]"
          style={{ backgroundImage: `url('${MENU_TEXTURE}')`, backgroundSize: "512px" }}
        >
          <div className="absolute inset-0 bg-white/82 pointer-events-none" />
          <div className="relative">
            <p className="text-xs uppercase tracking-wider font-bold text-[#121212] mb-3">
              Join Private Lobby
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                placeholder="Enter 6-char code"
                className="border-2 border-[#121212] bg-white px-3 py-2 font-mono text-sm tracking-widest uppercase"
                maxLength={6}
              />
              <button
                type="button"
                onClick={handleJoinByCode}
                disabled={busyKey !== null}
                className="tcg-button px-4 py-2 text-xs disabled:opacity-60"
              >
                {busyKey === "join:code" ? "Joining..." : "Join by Code"}
              </button>
            </div>
          </div>
        </motion.section>

        {myLobby?.status === "waiting" && (
          <motion.section
            variants={{
              hidden: { opacity: 0, y: 16 },
              visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
            }}
            className="relative mb-5 p-5 border-2 border-[#121212] animate-waiting-glow"
            style={{ backgroundImage: `url('${MENU_TEXTURE}')`, backgroundSize: "512px" }}
          >
            <div className="absolute inset-0 bg-white/82 pointer-events-none" />
            <div className="relative">
              <p className="text-xs uppercase tracking-wider font-bold text-[#121212] mb-2 flex items-center gap-2">
                <span className="relative inline-flex items-center justify-center w-4 h-4">
                  <motion.span
                    className="absolute w-2.5 h-2.5 rounded-full bg-[#ffcc00]"
                    animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  />
                  <span className="absolute w-full h-full rounded-full border border-[#ffcc00]/40 animate-radar-ping" />
                  <span className="absolute w-full h-full rounded-full border border-[#ffcc00]/30 animate-radar-ping" style={{ animationDelay: "0.5s" }} />
                </span>
                Your Waiting Lobby
              </p>
              <p className="text-xs text-[#444] mb-1">
                Visibility: <span className="font-bold uppercase">{myLobby.visibility}</span>
              </p>
              {myLobby.joinCode && (
                <p className="text-xs text-[#444] mb-1">
                  Join code: <span className="font-mono font-bold">{myLobby.joinCode}</span>
                </p>
              )}
              <p className="text-xs text-[#444] mb-3">
                Match ID: <span className="font-mono">{myLobby.matchId}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {myLobby.joinCode && (
                  <button
                    type="button"
                    onClick={() => handleCopy(myLobby.joinCode!, "Join code")}
                    className="tcg-button px-3 py-2 text-[10px]"
                  >
                    Copy Join Code
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleCopy(myLobby.matchId, "Match ID")}
                  className="tcg-button px-3 py-2 text-[10px]"
                >
                  Copy Match ID
                </button>
                <button
                  type="button"
                  onClick={handleCancelLobby}
                  disabled={busyKey !== null}
                  className="tcg-button-primary px-3 py-2 text-[10px] disabled:opacity-60"
                >
                  {busyKey === "cancel" ? "Canceling..." : "Cancel Lobby"}
                </button>
              </div>
              <p className="text-[10px] text-[#555] mt-2">
                Agents can join this lobby via <span className="font-mono">JOIN_LTCG_MATCH</span> using the match ID.
              </p>
            </div>
          </motion.section>
        )}

        <motion.section
          variants={{
            hidden: { opacity: 0, y: 16 },
            visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
          }}
          className="relative p-5 border-2 border-[#121212]"
          style={{ backgroundImage: `url('${MENU_TEXTURE}')`, backgroundSize: "512px" }}
        >
          <div className="absolute inset-0 bg-white/82 pointer-events-none" />
          <div className="relative">
            <p className="text-xs uppercase tracking-wider font-bold text-[#121212] mb-3">
              Open Public Lobbies
            </p>
            {sortedOpenLobbies.length === 0 ? (
              <p className="text-xs text-[#555]">No public lobbies are open right now.</p>
            ) : (
              <div className="space-y-2">
                <AnimatePresence mode="popLayout">
                  {sortedOpenLobbies.map((lobby, index) => (
                    <motion.div
                      key={lobby.matchId}
                      className="border border-[#121212]/30 bg-white/70 px-3 py-2 flex items-center justify-between gap-2"
                      initial={{ opacity: 0, x: -20, scale: 0.95 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ delay: index * 0.05, type: "spring", stiffness: 300, damping: 25 }}
                      layout
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">
                          Host: {lobby.hostUsername}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-[11px] text-[#555] font-mono truncate">
                            {lobby.matchId}
                          </p>
                          {lobby.pongEnabled && (
                            <span className="inline-block bg-[#ffcc00] text-[#121212] text-[8px] font-black uppercase px-1.5 py-0.5 tracking-wider">
                              PONG
                            </span>
                          )}
                          {lobby.redemptionEnabled && (
                            <span className="inline-block bg-[#33ccff] text-[#121212] text-[8px] font-black uppercase px-1.5 py-0.5 tracking-wider">
                              REDEMPTION
                            </span>
                          )}
                        </div>
                      </div>
                      <motion.button
                        type="button"
                        onClick={() => handleJoinLobby(lobby.matchId)}
                        disabled={busyKey !== null}
                        className="tcg-button px-3 py-2 text-[10px] shrink-0 disabled:opacity-60"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        {busyKey === `join:${lobby.matchId}` ? "Joining..." : "Join"}
                      </motion.button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </motion.section>

        </motion.div>

        {(error || message || copied) && (
          <div className="mt-4 text-center">
            {error && <p className="text-xs font-bold text-red-300">{error}</p>}
            {!error && message && <p className="text-xs font-bold text-[#ffcc00]">{message}</p>}
            {!error && !message && copied && <p className="text-xs font-bold text-[#ffcc00]">{copied}</p>}
          </div>
        )}
      </div>

      <TrayNav />
    </div>
  );
}
