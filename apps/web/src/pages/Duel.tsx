import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { apiAny, useConvexMutation } from "@/lib/convexHelpers";
import { detectClientPlatform, describeClientPlatform } from "@/lib/clientPlatform";
import { TrayNav } from "@/components/layout/TrayNav";

function buildOrigin() {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

async function copyToClipboard(value: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard) return false;
  await navigator.clipboard.writeText(value);
  return true;
}

export function Duel() {
  const navigate = useNavigate();
  const createPvPLobby = useConvexMutation(apiAny.game.createPvPLobby);
  const joinPvPMatch = useConvexMutation(apiAny.game.joinPvPMatch);

  const [joinInput, setJoinInput] = useState("");
  const [activeLobbyId, setActiveLobbyId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  const [copiedLabel, setCopiedLabel] = useState<"web" | "tg" | null>(null);

  const botUsernameRaw = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? "").trim();
  const botUsername = botUsernameRaw.replace(/^@/, "");

  const webJoinLink = useMemo(
    () => (activeLobbyId ? `${buildOrigin()}/play/${activeLobbyId}?autojoin=1` : ""),
    [activeLobbyId],
  );
  const telegramJoinLink = useMemo(
    () =>
      activeLobbyId && botUsername
        ? `https://t.me/${botUsername}?startapp=m_${encodeURIComponent(activeLobbyId)}`
        : "",
    [activeLobbyId, botUsername],
  );

  const handleCreateLobby = async () => {
    setIsBusy(true);
    setError("");
    try {
      const result = await createPvPLobby({
        platform: detectClientPlatform(),
        source: describeClientPlatform(),
      });
      setActiveLobbyId(result.matchId);
    } catch (err: any) {
      setError(err?.message ?? "Failed to create lobby.");
    } finally {
      setIsBusy(false);
    }
  };

  const openLobby = () => {
    if (!activeLobbyId) return;
    navigate(`/play/${activeLobbyId}`);
  };

  const handleJoinLobby = async () => {
    const matchId = joinInput.trim();
    if (!matchId) {
      setError("Enter a valid match ID.");
      return;
    }
    setIsBusy(true);
    setError("");
    try {
      await joinPvPMatch({
        matchId,
        platform: detectClientPlatform(),
        source: describeClientPlatform(),
      });
      navigate(`/play/${matchId}`);
    } catch (err: any) {
      setError(err?.message ?? "Failed to join lobby.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleCopy = async (label: "web" | "tg", value: string) => {
    try {
      const copied = await copyToClipboard(value);
      if (copied) {
        setCopiedLabel(label);
        setTimeout(() => setCopiedLabel((prev) => (prev === label ? null : prev)), 1400);
      }
    } catch {
      setCopiedLabel(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#fdfdfb] pb-20">
      <main className="mx-auto max-w-3xl px-4 pt-10">
        <h1
          className="text-4xl font-black uppercase tracking-tight text-[#121212]"
          style={{ fontFamily: "Outfit, sans-serif" }}
        >
          PvP Duel
        </h1>
        <p
          className="mt-2 text-sm text-[#121212]/70"
          style={{ fontFamily: "Special Elite, cursive" }}
        >
          Create a lobby, share a link, and cross-play between web and Telegram.
        </p>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="paper-panel p-4">
            <h2 className="text-lg font-black uppercase" style={{ fontFamily: "Outfit, sans-serif" }}>
              Create Lobby
            </h2>
            <p
              className="mt-1 text-xs text-[#121212]/70"
              style={{ fontFamily: "Special Elite, cursive" }}
            >
              Host starts in waiting state until away joins.
            </p>
            <button
              type="button"
              onClick={handleCreateLobby}
              disabled={isBusy}
              className="tcg-button-primary mt-4 w-full py-2 disabled:opacity-50"
            >
              {isBusy ? "Working..." : "Create PvP Lobby"}
            </button>
            {activeLobbyId && (
              <div className="mt-4 space-y-2 text-xs">
                <p className="font-bold text-[#121212]">
                  Match ID: <code>{activeLobbyId}</code>
                </p>
                <button type="button" className="tcg-button w-full py-2" onClick={openLobby}>
                  Open Lobby
                </button>
              </div>
            )}
          </div>

          <div className="paper-panel p-4">
            <h2 className="text-lg font-black uppercase" style={{ fontFamily: "Outfit, sans-serif" }}>
              Join by Match ID
            </h2>
            <p
              className="mt-1 text-xs text-[#121212]/70"
              style={{ fontFamily: "Special Elite, cursive" }}
            >
              Paste an invite code from web or Telegram.
            </p>
            <input
              value={joinInput}
              onChange={(event) => setJoinInput(event.target.value)}
              placeholder="e.g. k6d9n..."
              className="mt-4 w-full border-2 border-[#121212] bg-white px-3 py-2 text-sm outline-none"
              style={{ fontFamily: "Outfit, sans-serif" }}
            />
            <button
              type="button"
              onClick={handleJoinLobby}
              disabled={isBusy}
              className="tcg-button mt-3 w-full py-2 disabled:opacity-50"
            >
              Join Match
            </button>
          </div>
        </section>

        {activeLobbyId && (
          <section className="paper-panel mt-4 p-4">
            <h2 className="text-lg font-black uppercase" style={{ fontFamily: "Outfit, sans-serif" }}>
              Share Invite
            </h2>
            <div className="mt-3 space-y-3 text-xs">
              <div>
                <p className="font-bold text-[#121212]">Web Invite</p>
                <div className="mt-1 flex gap-2">
                  <input
                    readOnly
                    value={webJoinLink}
                    className="w-full border-2 border-[#121212] bg-white px-2 py-1 text-[11px]"
                  />
                  <button
                    type="button"
                    className="tcg-button px-3"
                    onClick={() => handleCopy("web", webJoinLink)}
                  >
                    {copiedLabel === "web" ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
              <div>
                <p className="font-bold text-[#121212]">Telegram Mini App</p>
                {telegramJoinLink ? (
                  <div className="mt-1 flex gap-2">
                    <input
                      readOnly
                      value={telegramJoinLink}
                      className="w-full border-2 border-[#121212] bg-white px-2 py-1 text-[11px]"
                    />
                    <button
                      type="button"
                      className="tcg-button px-3"
                      onClick={() => handleCopy("tg", telegramJoinLink)}
                    >
                      {copiedLabel === "tg" ? "Copied" : "Copy"}
                    </button>
                  </div>
                ) : (
                  <p className="mt-1 text-[#121212]/65">
                    Set <code>VITE_TELEGRAM_BOT_USERNAME</code> to render the deep link.
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        {error && (
          <p className="mt-4 text-sm font-bold text-[#b91c1c]" style={{ fontFamily: "Outfit, sans-serif" }}>
            {error}
          </p>
        )}
      </main>

      <TrayNav />
    </div>
  );
}

export default Duel;
