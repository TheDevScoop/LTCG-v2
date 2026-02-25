import { useMemo, useState } from "react";
import { useNavigate } from "@/router/react-router";
import { motion } from "framer-motion";
import { apiAny, useConvexMutation } from "@/lib/convexHelpers";
import { detectClientPlatform, describeClientPlatform } from "@/lib/clientPlatform";
import { TrayNav } from "@/components/layout/TrayNav";
import { PVP_BG, MILUNCHLADY_PFP, OPENCLAWD_PFP, DECO_SHIELD, TAPE } from "@/lib/blobUrls";
import { ComicImpactText } from "@/components/ui/ComicImpactText";
import { SkewedPanel } from "@/components/ui/SkewedPanel";
import { SpeedLines } from "@/components/ui/SpeedLines";
import { StickerBadge } from "@/components/ui/StickerBadge";
import { DecorativeScatter } from "@/components/ui/DecorativeScatter";

function buildOrigin() {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

async function copyToClipboard(value: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard) return false;
  await navigator.clipboard.writeText(value);
  return true;
}

const scatterElements = [
  { src: TAPE, size: 64, opacity: 0.15, rotation: 12 },
  { src: TAPE, size: 48, opacity: 0.1, rotation: -20 },
  { src: TAPE, size: 56, opacity: 0.12, rotation: 35 },
  { src: TAPE, size: 40, opacity: 0.1, rotation: -8 },
];

export function Duel() {
  const navigate = useNavigate();
  const createPvPLobby = useConvexMutation(apiAny.game.createPvPLobby);
  const joinPvPMatch = useConvexMutation(apiAny.game.joinPvPMatch);

  const [joinInput, setJoinInput] = useState("");
  const [activeLobbyId, setActiveLobbyId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  const [copiedLabel, setCopiedLabel] = useState<"web" | "tgMini" | "tgGame" | null>(null);

  const botUsernameRaw = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? "").trim();
  const botUsername = botUsernameRaw.replace(/^@/, "");
  const miniAppShortNameRaw = (import.meta.env.VITE_TELEGRAM_MINIAPP_SHORT_NAME ?? "").trim();
  const miniAppShortName = /^[A-Za-z0-9_]{3,64}$/.test(miniAppShortNameRaw) ? miniAppShortNameRaw : "";
  const gameShortNameRaw = (import.meta.env.VITE_TELEGRAM_GAME_SHORT_NAME ?? "").trim();
  const gameShortName = /^[A-Za-z0-9_]{3,64}$/.test(gameShortNameRaw) ? gameShortNameRaw : "";

  const webJoinLink = useMemo(
    () => (activeLobbyId ? `${buildOrigin()}/play/${activeLobbyId}?autojoin=1` : ""),
    [activeLobbyId],
  );
  const telegramJoinLink = useMemo(
    () =>
      activeLobbyId && botUsername
        ? miniAppShortName
          ? `https://t.me/${botUsername}/${miniAppShortName}?startapp=${encodeURIComponent(
              `m_${activeLobbyId}`,
            )}`
          : `https://t.me/${botUsername}?startapp=${encodeURIComponent(`m_${activeLobbyId}`)}`
        : "",
    [activeLobbyId, botUsername, miniAppShortName],
  );
  const telegramGameLink = useMemo(
    () =>
      botUsername && gameShortName
        ? `https://t.me/${botUsername}?game=${encodeURIComponent(gameShortName)}`
        : "",
    [botUsername, gameShortName],
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

  const handleCopy = async (label: "web" | "tgMini" | "tgGame", value: string) => {
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
    <div
      className="min-h-screen relative pb-20 overflow-hidden"
      style={{
        backgroundImage: `url('${PVP_BG}')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-[#121212]/70" />

      {/* Speed lines radiating from center */}
      <SpeedLines intensity={2} focal={{ x: "50%", y: "50%" }} animated />

      {/* Decorative tape scatter */}
      <DecorativeScatter elements={scatterElements} seed={77} density={6} />

      <div className="relative z-10">
        {/* LIVE PVP sticker badge — top-right */}
        <div className="absolute top-4 right-4 z-20">
          <StickerBadge label="LIVE PVP" variant="stamp" pulse />
        </div>

        <main className="mx-auto max-w-3xl px-4 pt-10">
          {/* CHALLENGE! impact text header */}
          <motion.div
            className="text-center mb-2"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 14 }}
          >
            <ComicImpactText text="CHALLENGE!" size="lg" color="#ffcc00" rotation={-2} animate />
          </motion.div>

          <motion.p
            className="mt-2 text-sm text-white/60 text-center"
            style={{ fontFamily: "Special Elite, cursive" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
          >
            Create a lobby, share a link, and cross-play between web and Telegram.
          </motion.p>

          {/* Panels section */}
          <motion.section
            className="mt-8 relative"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
          >
            <div className="grid gap-8 md:grid-cols-2 items-start">
              {/* Create Lobby — SkewedPanel left */}
              <SkewedPanel direction="left" accent="#ffcc00">
                <div className="flex items-center gap-3 mb-2">
                  <img
                    src={MILUNCHLADY_PFP}
                    alt="Host"
                    className="h-16 w-16 border-2 border-[#121212] object-cover shrink-0"
                    draggable={false}
                  />
                  <h2
                    className="text-lg font-black uppercase"
                    style={{ fontFamily: "Outfit, sans-serif" }}
                  >
                    Create Lobby
                  </h2>
                </div>
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
                  className="tcg-button-primary mt-4 w-full py-2 disabled:opacity-50 hover:shadow-[0_0_20px_rgba(255,204,0,0.3)]"
                >
                  {isBusy ? "Working..." : "Create PvP Lobby"}
                </button>
                {activeLobbyId && (
                  <div className="mt-4 space-y-2 text-xs">
                    <p className="font-bold text-[#121212]">
                      Match ID: <code>{activeLobbyId}</code>
                    </p>
                    {/* Waiting sticker */}
                    <div className="flex items-center gap-2">
                      <StickerBadge label="WAITING..." variant="label" pulse />
                    </div>
                    <button type="button" className="tcg-button w-full py-2" onClick={openLobby}>
                      Open Lobby
                    </button>
                  </div>
                )}
              </SkewedPanel>

              {/* VS visual + DECO_SHIELD — centered in the gap */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none hidden md:flex flex-col items-center gap-2">
                <ComicImpactText text="VS" size="lg" color="#fff" rotation={0} />
                <img
                  src={DECO_SHIELD}
                  alt=""
                  className="h-24 opacity-30"
                  draggable={false}
                />
              </div>

              {/* VS for mobile — shown between panels on small screens */}
              <div className="flex md:hidden items-center justify-center -my-4 z-20">
                <ComicImpactText text="VS" size="lg" color="#fff" rotation={0} />
              </div>

              {/* Join Lobby — SkewedPanel right */}
              <SkewedPanel direction="right" accent="#33ccff">
                <div className="flex items-center gap-3 mb-2">
                  <img
                    src={OPENCLAWD_PFP}
                    alt="Challenger"
                    className="h-16 w-16 border-2 border-[#121212] object-cover shrink-0"
                    draggable={false}
                  />
                  <h2
                    className="text-lg font-black uppercase"
                    style={{ fontFamily: "Outfit, sans-serif" }}
                  >
                    Join by Match ID
                  </h2>
                </div>
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
              </SkewedPanel>
            </div>
          </motion.section>

          {/* Share Invite panel */}
          {activeLobbyId && (
            <motion.section
              className="paper-panel mt-6 p-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
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
                        onClick={() => handleCopy("tgMini", telegramJoinLink)}
                      >
                        {copiedLabel === "tgMini" ? "Copied" : "Copy"}
                      </button>
                    </div>
                  ) : (
                    <p className="mt-1 text-white/40">
                      Set <code>VITE_TELEGRAM_BOT_USERNAME</code> to render the deep link.
                    </p>
                  )}
                </div>
                {telegramGameLink ? (
                  <div>
                    <p className="font-bold text-[#121212]">Telegram Game</p>
                    <div className="mt-1 flex gap-2">
                      <input
                        readOnly
                        value={telegramGameLink}
                        className="w-full border-2 border-[#121212] bg-white px-2 py-1 text-[11px]"
                      />
                      <button
                        type="button"
                        className="tcg-button px-3"
                        onClick={() => handleCopy("tgGame", telegramGameLink)}
                      >
                        {copiedLabel === "tgGame" ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </motion.section>
          )}

          {error && (
            <p className="mt-4 text-sm font-bold text-red-400" style={{ fontFamily: "Outfit, sans-serif" }}>
              {error}
            </p>
          )}
        </main>
      </div>

      <TrayNav />
    </div>
  );
}

export default Duel;
