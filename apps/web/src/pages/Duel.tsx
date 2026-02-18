import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import * as Sentry from "@sentry/react";
import { apiAny, useConvexMutation, useConvexQuery } from "@/lib/convexHelpers";
import { TrayNav } from "@/components/layout/TrayNav";
import { detectClientPlatform, describeClientPlatform } from "@/lib/clientPlatform";
import { normalizeMatchId } from "@/lib/matchIds";
import { useMatchPresence } from "@/hooks/useMatchPresence";
import {
  consumeDiscordPendingJoinMatchId,
  setDiscordActivityMatchContext,
  shareDiscordMatchInvite,
  useDiscordActivity,
} from "@/hooks/useDiscordActivity";

type CurrentUser = {
  _id: string;
};

type MatchMeta = {
  _id: string;
  status: "waiting" | "active" | "ended";
  mode: "pvp" | "story";
  hostId: string;
  awayId: string | null;
};

export function Duel() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isDiscordActivity, sdkReady, pendingJoinMatchId, sdkError } = useDiscordActivity();
  const currentUser = useConvexQuery(apiAny.auth.currentUser, {}) as CurrentUser | null | undefined;
  const activeMatch = useConvexQuery(
    apiAny.game.getActiveMatchByHost,
    currentUser?._id ? { hostId: currentUser._id } : "skip",
  ) as MatchMeta | null | undefined;
  const openLobby = useConvexQuery(
    apiAny.game.getMyOpenPvPLobby,
    currentUser ? {} : "skip",
  ) as MatchMeta | null | undefined;

  const createLobby = useConvexMutation(apiAny.game.createPvPLobby);
  const joinLobby = useConvexMutation(apiAny.game.joinPvPMatch);

  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [discordInviteStatus, setDiscordInviteStatus] = useState("");
  const [discordInviteBusy, setDiscordInviteBusy] = useState(false);

  const waitingLobbyId = useMemo(() => {
    if (!openLobby || openLobby.status !== "waiting") return null;
    return String(openLobby._id);
  }, [openLobby]);

  const incomingJoinMatchId = useMemo(
    () =>
      normalizeMatchId(searchParams.get("join")) ??
      normalizeMatchId(pendingJoinMatchId),
    [searchParams, pendingJoinMatchId],
  );

  useMatchPresence(waitingLobbyId);

  const platform = detectClientPlatform();
  const source = describeClientPlatform();

  useEffect(() => {
    const matchId = normalizeMatchId(pendingJoinMatchId);
    if (!matchId) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("join", matchId);
      return next;
    });
    consumeDiscordPendingJoinMatchId();
  }, [pendingJoinMatchId, setSearchParams]);

  useEffect(() => {
    if (!incomingJoinMatchId) return;
    setJoinCode((current) => current || incomingJoinMatchId);
  }, [incomingJoinMatchId]);

  const handleCreateLobby = async () => {
    setBusy("create");
    setError("");
    try {
      const created = await createLobby({ platform, source }) as { matchId?: string };
      const matchId = normalizeMatchId(created?.matchId ?? null);
      if (!matchId) {
        throw new Error("No match ID was returned.");
      }
      navigate(`/play/${matchId}`);
    } catch (err: any) {
      Sentry.captureException(err);
      setError(err?.message ?? "Failed to create lobby.");
    } finally {
      setBusy(null);
    }
  };

  const joinLobbyByMatchId = async (rawMatchId?: string) => {
    setBusy("join");
    setError("");
    try {
      const matchId = normalizeMatchId(rawMatchId ?? joinCode);
      if (!matchId) {
        throw new Error("Enter a valid match ID.");
      }
      await joinLobby({ matchId, platform, source });
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("join");
        return next;
      });
      navigate(`/play/${matchId}`);
    } catch (err: any) {
      Sentry.captureException(err);
      setError(err?.message ?? "Failed to join lobby.");
    } finally {
      setBusy(null);
    }
  };

  const handleJoinLobby = async () => {
    await joinLobbyByMatchId();
  };

  const handleCopy = async () => {
    if (!waitingLobbyId) return;
    await navigator.clipboard.writeText(waitingLobbyId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const handleShareDiscordInvite = async () => {
    if (!waitingLobbyId) return;
    setDiscordInviteBusy(true);
    setDiscordInviteStatus("");
    try {
      const result = await shareDiscordMatchInvite(waitingLobbyId);
      if (!result) {
        throw new Error("Unable to open Discord invite dialog.");
      }
      if (!result.success) {
        setDiscordInviteStatus("Invite share canceled.");
        return;
      }
      if (result.didSendMessage) {
        setDiscordInviteStatus("Invite sent in Discord.");
      } else if (result.didCopyLink) {
        setDiscordInviteStatus("Invite link copied.");
      } else {
        setDiscordInviteStatus("Invite shared.");
      }
    } catch (err: any) {
      Sentry.captureException(err);
      setDiscordInviteStatus(err?.message ?? "Unable to share invite.");
    } finally {
      setDiscordInviteBusy(false);
    }
  };

  useEffect(() => {
    if (!waitingLobbyId || !isDiscordActivity || !sdkReady) return;
    void setDiscordActivityMatchContext(waitingLobbyId, {
      mode: "lobby",
      currentPlayers: 1,
      maxPlayers: 2,
      state: "Waiting for opponent",
    });
  }, [waitingLobbyId, isDiscordActivity, sdkReady]);

  if (currentUser === undefined || activeMatch === undefined || openLobby === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fdfdfb]">
        <div className="w-8 h-8 border-4 border-[#121212] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const resumableMatchId =
    activeMatch?.status === "active" && activeMatch.mode === "pvp"
      ? String(activeMatch._id)
      : null;

  return (
    <div className="min-h-screen bg-[#fdfdfb] pb-24 px-4 md:px-6">
      <div className="max-w-2xl mx-auto pt-8 space-y-4">
        <header className="paper-panel p-5">
          <p className="text-xs uppercase tracking-wider text-[#666] font-bold">PvP Cross-Platform</p>
          <h1
            className="text-3xl font-black uppercase tracking-tighter text-[#121212]"
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            Duel Lobby
          </h1>
          <p className="text-sm text-[#666] mt-2" style={{ fontFamily: "Special Elite, cursive" }}>
            Web, Telegram, and Discord players can join the same live match.
          </p>
        </header>

        {resumableMatchId && (
          <section className="paper-panel p-4 border-2 border-[#121212]">
            <p className="text-xs uppercase tracking-wider font-bold text-[#121212]">
              Active Duel Found
            </p>
            <p className="text-[11px] text-[#666] font-mono break-all mt-2">{resumableMatchId}</p>
            <button
              type="button"
              onClick={() => navigate(`/play/${resumableMatchId}`)}
              className="tcg-button-primary px-4 py-2 text-xs mt-3"
            >
              Resume Match
            </button>
          </section>
        )}

        <section className="paper-panel p-5 border-2 border-[#121212]">
          <p className="text-xs uppercase tracking-wider font-bold text-[#121212]">Host a Duel</p>
          <p className="text-xs text-[#666] mt-1">
            Create a waiting lobby and share the match ID.
          </p>
          <button
            type="button"
            onClick={handleCreateLobby}
            disabled={busy !== null}
            className="tcg-button-primary px-4 py-2 text-xs mt-3 disabled:opacity-60"
          >
            {busy === "create" ? "Creating..." : "Create Lobby"}
          </button>

          {waitingLobbyId && (
            <div className="mt-4 border-2 border-[#121212] bg-white p-3">
              <p className="text-[10px] uppercase tracking-wider font-bold text-[#666]">
                Waiting Lobby
              </p>
              <p className="font-mono text-xs break-all text-[#121212] mt-1">{waitingLobbyId}</p>
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="tcg-button px-3 py-1 text-[10px]"
                >
                  {copied ? "Copied" : "Copy Match ID"}
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/play/${waitingLobbyId}`)}
                  className="tcg-button-primary px-3 py-1 text-[10px]"
                >
                  Open Match
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="paper-panel p-5 border-2 border-[#121212]">
          <p className="text-xs uppercase tracking-wider font-bold text-[#121212]">Join by Match ID</p>
          <p className="text-xs text-[#666] mt-1">Paste an invite code from any client.</p>
          {incomingJoinMatchId && (
            <div className="mt-3 border-2 border-[#121212] bg-[#fff7e0] px-3 py-2 text-xs text-[#121212]">
              Incoming Discord invite detected for <span className="font-mono">{incomingJoinMatchId}</span>.
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <input
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value)}
              placeholder="match id"
              className="flex-1 border-2 border-[#121212] bg-white px-3 py-2 text-xs font-mono"
            />
            <button
              type="button"
              onClick={handleJoinLobby}
              disabled={busy !== null}
              className="tcg-button-primary px-4 py-2 text-xs disabled:opacity-60"
            >
              {busy === "join" ? "Joining..." : "Join"}
            </button>
          </div>
          {incomingJoinMatchId && (
            <button
              type="button"
              onClick={() => {
                void joinLobbyByMatchId(incomingJoinMatchId);
              }}
              disabled={busy !== null}
              className="tcg-button px-3 py-2 text-xs mt-2 disabled:opacity-60"
            >
              Join Incoming Invite
            </button>
          )}
        </section>

        {isDiscordActivity && waitingLobbyId && (
          <section className="paper-panel p-5 border-2 border-[#121212]">
            <p className="text-xs uppercase tracking-wider font-bold text-[#121212]">Discord Activity Invite</p>
            <p className="text-xs text-[#666] mt-1">
              Share this lobby directly in Discord.
            </p>
            <button
              type="button"
              onClick={handleShareDiscordInvite}
              disabled={discordInviteBusy || !sdkReady}
              className="tcg-button-primary px-4 py-2 text-xs mt-3 disabled:opacity-60"
            >
              {discordInviteBusy ? "Opening..." : sdkReady ? "Invite in Discord" : "Discord SDK Loading..."}
            </button>
            {discordInviteStatus && (
              <p className="text-[11px] text-[#666] mt-2">{discordInviteStatus}</p>
            )}
            {sdkError && (
              <p className="text-[11px] text-red-700 mt-2">{sdkError}</p>
            )}
          </section>
        )}

        {error && (
          <div className="paper-panel border-2 border-red-600 bg-red-50 p-3">
            <p className="text-xs font-bold uppercase text-red-600">{error}</p>
          </div>
        )}
      </div>
      <TrayNav />
    </div>
  );
}
