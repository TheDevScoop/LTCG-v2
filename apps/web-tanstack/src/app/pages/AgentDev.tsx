import { useCallback, useEffect, useRef, useState } from "react";
import { useConvexAuth } from "convex/react";
import * as Sentry from "@sentry/react";
import { toast } from "sonner";
import { TrayNav } from "@/components/layout/TrayNav";
import { apiAny, useConvexMutation, useConvexQuery } from "@/lib/convexHelpers";
import posthog from "@/lib/posthog";
import { LANDING_BG, MENU_TEXTURE, MILUNCHLADY_PFP_AGENT, OPENCLAWD_PFP, TAPE, DECO_PILLS } from "@/lib/blobUrls";
import { ComicImpactText } from "@/components/ui/ComicImpactText";
import { SpeechBubble } from "@/components/ui/SpeechBubble";
import { StickerBadge } from "@/components/ui/StickerBadge";
import { DecorativeScatter } from "@/components/ui/DecorativeScatter";

// ── Types ──────────────────────────────────────────────────────────

type AgentPlatform = "milaidy" | "openclawd" | null;
type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface StarterDeck {
  name: string;
  deckCode: string;
  archetype: string;
  description: string;
  playstyle: string;
  cardCount: number;
}

// ── Constants ──────────────────────────────────────────────────────

const PLATFORM_INFO = {
  milaidy: {
    name: "Milaidy",
    tagline: "ElizaOS-powered local agent",
    defaultApi: "http://localhost:2138/api",
    docs: "https://github.com/milady-ai",
    features: ["ElizaOS Runtime", "Local-first", "Plugin System", "WebSocket Events"],
    image: MILUNCHLADY_PFP_AGENT,
  },
  openclawd: {
    name: "OpenClawd",
    tagline: "Sovereign AI via OpenClaw",
    defaultApi: "http://localhost:8080/api",
    docs: "https://openclaw.ai",
    features: ["Containerized", "100+ AgentSkills", "Multi-platform", "Self-hosted"],
    image: OPENCLAWD_PFP,
  },
} as const;

const ARCHETYPE_COLORS: Record<string, string> = {
  dropouts: "#e53e3e",
  preps: "#3182ce",
  geeks: "#d69e2e",
  freaks: "#805ad5",
  nerds: "#38a169",
  goodies: "#a0aec0",
};

const ARCHETYPE_EMOJI: Record<string, string> = {
  dropouts: "\u{1F525}",
  preps: "\u{1F451}",
  geeks: "\u{1F4BB}",
  freaks: "\u{1F47B}",
  nerds: "\u{1F4DA}",
  goodies: "\u{2728}",
};

const BABYLON_QUICKSTART_URL =
  "https://github.com/elizaos-plugins/plugin-babylon?tab=readme-ov-file#-quick-start";
const SHARE_BABYLON_LABEL_DEFAULT = "Share Babylon Quick Start";
const SHARE_FEEDBACK_MS = 2000;

const SCATTER_ELEMENTS = [
  { src: TAPE, size: 64, opacity: 0.15 },
  { src: DECO_PILLS, size: 48, opacity: 0.12 },
  { src: TAPE, size: 56, opacity: 0.1 },
  { src: DECO_PILLS, size: 40, opacity: 0.14 },
  { src: TAPE, size: 52, opacity: 0.13 },
];

// ── Sub-components ─────────────────────────────────────────────────

function PlatformCard({
  platform,
  selected,
  onSelect,
}: {
  platform: "milaidy" | "openclawd";
  selected: boolean;
  onSelect: () => void;
}) {
  const info = PLATFORM_INFO[platform];
  const skewClass = platform === "milaidy" ? "clip-skew-left" : "clip-skew-right";
  return (
    <button
      onClick={onSelect}
      className={`relative text-left p-5 md:p-6 transition-all overflow-hidden ${skewClass} ${
        selected
          ? "bg-[#121212] text-white -translate-y-1 shadow-[6px_6px_0px_rgba(255,204,0,0.4)]"
          : "bg-white/90 text-[#121212] hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_rgba(0,0,0,0.2)]"
      }`}
      style={{ border: selected ? "3px solid #ffcc00" : "3px solid #121212" }}
    >
      {/* Platform image */}
      <div className="flex items-center gap-4 mb-3">
        <img
          src={info.image}
          alt={info.name}
          className={`w-24 h-24 md:w-28 md:h-28 object-contain shrink-0 drop-shadow-xl ${
            selected ? "brightness-110" : "brightness-95"
          }`}
          draggable={false}
        />
        <div>
          <h3
            className="text-lg md:text-xl font-black uppercase tracking-tight mb-0.5"
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            {info.name}
          </h3>
          <p
            className={`text-xs ${selected ? "text-white/60" : "text-[#121212]/50"}`}
            style={{ fontFamily: "Special Elite, cursive" }}
          >
            {info.tagline}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {info.features.map((f) => (
          <StickerBadge
            key={f}
            label={f}
            variant="tag"
            className={selected ? "!bg-white/10 !text-white/70 !border-white/20" : "!bg-[#121212]/5 !text-[#121212]/50 !border-[#121212]/20"}
          />
        ))}
      </div>
    </button>
  );
}

function StatusDot({ status }: { status: ConnectionStatus }) {
  const colors: Record<ConnectionStatus, string> = {
    disconnected: "bg-[#121212]/30",
    connecting: "bg-[#ffcc00] animate-pulse",
    connected: "bg-green-500",
    error: "bg-red-500",
  };
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[status]}`} />;
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative p-5"
      style={{
        backgroundImage: `url('${MENU_TEXTURE}')`,
        backgroundSize: "512px",
      }}
    >
      <div className="absolute inset-0 bg-white/80 pointer-events-none" />
      <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg opacity-40">{icon}</span>
          <h3
            className="text-sm font-black uppercase tracking-tight text-[#121212]"
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            {title}
          </h3>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────

export function AgentDev() {
  const { isAuthenticated } = useConvexAuth();

  const [platform, setPlatform] = useState<AgentPlatform>(null);
  const [apiUrl, setApiUrl] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [connStatus, setConnStatus] = useState<ConnectionStatus>("disconnected");
  const [connMsg, setConnMsg] = useState("");

  // Agent registration
  const [agentName, setAgentName] = useState("");
  const [registering, setRegistering] = useState(false);
  const [registeredKey, setRegisteredKey] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState("");
  const [keyCopied, setKeyCopied] = useState(false);

  // Deck selection
  const starterDecks = useConvexQuery(apiAny.game.getStarterDecks, isAuthenticated ? {} : "skip") as
    | StarterDeck[]
    | undefined;
  const selectStarterDeckMutation = useConvexMutation(apiAny.game.selectStarterDeck);
  const [selectedDeck, setSelectedDeck] = useState<string | null>(null);
  const [deckAssigning, setDeckAssigning] = useState(false);
  const [deckAssigned, setDeckAssigned] = useState(false);
  const [deckError, setDeckError] = useState("");
  const [shareBabylonLabel, setShareBabylonLabel] = useState(SHARE_BABYLON_LABEL_DEFAULT);
  const shareBabylonTimerRef = useRef<number | null>(null);

  const convexSiteUrl = (import.meta.env.VITE_CONVEX_URL ?? "")
    .replace(".convex.cloud", ".convex.site");
  const soundtrackApiUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/soundtrack`
      : "/api/soundtrack";

  const handleRegisterAgent = async () => {
    const trimmed = agentName.trim();
    if (!trimmed || trimmed.length < 1 || trimmed.length > 50) {
      setRegisterError("Name must be 1-50 characters.");
      return;
    }
    setRegistering(true);
    setRegisterError("");

    try {
      const res = await fetch(`${convexSiteUrl}/api/agent/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setRegisteredKey(data.apiKey);
    } catch (err: any) {
      Sentry.captureException(err);
      setRegisterError(err.message ?? "Registration failed.");
    } finally {
      setRegistering(false);
    }
  };

  const handleCopyKey = async () => {
    if (!registeredKey) return;
    await navigator.clipboard.writeText(registeredKey);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  };

  const handlePlatformSelect = (p: AgentPlatform) => {
    setPlatform(p);
    if (p) setApiUrl(PLATFORM_INFO[p].defaultApi);
    setConnStatus("disconnected");
    setConnMsg("");
  };

  const handleConnect = async () => {
    if (!apiUrl) return;
    setConnStatus("connecting");
    setConnMsg("");

    try {
      const endpoint = platform === "milaidy" ? `${apiUrl}/status` : `${apiUrl}/health`;
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (apiToken) headers["Authorization"] = `Bearer ${apiToken}`;

      const res = await fetch(endpoint, { headers, signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

      setConnStatus("connected");
      setConnMsg("Agent is online");
    } catch (err) {
      Sentry.captureException(err);
      setConnStatus("error");
      setConnMsg(
        err instanceof TypeError
          ? "Cannot reach agent — is it running?"
          : String(err instanceof Error ? err.message : err),
      );
    }
  };

  const handleAssignDeck = async () => {
    if (!selectedDeck) return;
    setDeckAssigning(true);
    setDeckError("");

    try {
      await selectStarterDeckMutation({ deckCode: selectedDeck });
      setDeckAssigned(true);
    } catch (err: any) {
      Sentry.captureException(err);
      setDeckError(err.message ?? "Failed to assign deck.");
    } finally {
      setDeckAssigning(false);
    }
  };

  const clearShareBabylonFeedbackLater = useCallback(() => {
    if (shareBabylonTimerRef.current) {
      window.clearTimeout(shareBabylonTimerRef.current);
    }
    shareBabylonTimerRef.current = window.setTimeout(() => {
      setShareBabylonLabel(SHARE_BABYLON_LABEL_DEFAULT);
    }, SHARE_FEEDBACK_MS);
  }, []);

  const handleShareBabylonQuickStart = useCallback(async () => {
    const shareText = "Use this plugin-babylon quick-start guide to get running fast.";
    let method: "native" | "clipboard" | null = null;

    try {
      if (typeof navigator.share === "function") {
        await navigator.share({
          title: "plugin-babylon Quick Start",
          text: shareText,
          url: BABYLON_QUICKSTART_URL,
        });
        method = "native";
        setShareBabylonLabel("Shared");
        toast.success("Babylon quick start shared");
      } else {
        await navigator.clipboard.writeText(BABYLON_QUICKSTART_URL);
        method = "clipboard";
        setShareBabylonLabel("Link Copied");
        toast.success("Babylon quick-start link copied");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      try {
        await navigator.clipboard.writeText(BABYLON_QUICKSTART_URL);
        method = "clipboard";
        setShareBabylonLabel("Link Copied");
        toast.success("Babylon quick-start link copied");
      } catch {
        toast.error("Unable to share right now");
        return;
      }
    }

    if (method) {
      posthog.capture("agent_dev_babylon_quickstart_shared", {
        platform,
        method,
      });
      clearShareBabylonFeedbackLater();
    }
  }, [clearShareBabylonFeedbackLater, platform]);

  useEffect(() => {
    return () => {
      if (shareBabylonTimerRef.current) {
        window.clearTimeout(shareBabylonTimerRef.current);
      }
    };
  }, []);

  const selectedDeckInfo = starterDecks?.find((d) => d.deckCode === selectedDeck);

  return (
    <div
      className="min-h-screen relative bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url('${LANDING_BG}')` }}
    >
      <div className="absolute inset-0 bg-black/80" />

      {/* Decorative scatter behind content */}
      <DecorativeScatter
        elements={SCATTER_ELEMENTS}
        density={5}
        seed={77}
        className="z-[1]"
      />

      <div className="relative z-10 max-w-4xl mx-auto px-4 md:px-8 py-10 pb-24">
        {/* Header */}
        <div className="mb-10">
          <ComicImpactText text="AGENT DEV" size="lg" color="#fff" animate />
          <p
            className="text-[#ffcc00] text-sm md:text-base mt-3"
            style={{ fontFamily: "Special Elite, cursive" }}
          >
            Connect your AI agent to play LunchTable
          </p>

          {/* Speech bubble call-to-action */}
          <div className="mt-4">
            <SpeechBubble variant="burst" tail="none">
              <span
                className="text-base font-black uppercase tracking-tight"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                Pick your side!
              </span>
            </SpeechBubble>
          </div>
        </div>

        {/* Step 1: Choose platform */}
        <section className="mb-8">
          <h2
            className="text-xs font-black uppercase tracking-widest text-white/40 mb-4"
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            1 &mdash; Choose your agent platform
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PlatformCard
              platform="milaidy"
              selected={platform === "milaidy"}
              onSelect={() => handlePlatformSelect("milaidy")}
            />
            <PlatformCard
              platform="openclawd"
              selected={platform === "openclawd"}
              onSelect={() => handlePlatformSelect("openclawd")}
            />
          </div>
        </section>

        {/* Step 2: Register agent */}
        {platform && !registeredKey && (
          <section className="mb-8">
            <h2
              className="text-xs font-black uppercase tracking-widest text-white/40 mb-4"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              2 &mdash; Register your agent
            </h2>

            <div
              className="relative p-6"
              style={{
                backgroundImage: `url('${MENU_TEXTURE}')`,
                backgroundSize: "512px",
              }}
            >
              <div className="absolute inset-0 bg-white/80 pointer-events-none" />
              <div className="relative space-y-4">
                <div>
                  <label
                    className="block text-xs font-black uppercase tracking-wider text-[#121212]/60 mb-1.5"
                    style={{ fontFamily: "Outfit, sans-serif" }}
                  >
                    Agent Name
                  </label>
                  <input
                    type="text"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    placeholder="MyAgent_001"
                    maxLength={50}
                    className="w-full px-4 py-2.5 bg-white text-[#121212] text-sm font-mono border-2 border-[#121212] focus:outline-none focus:border-[#ffcc00] transition-colors"
                    style={{ boxShadow: "2px 2px 0px rgba(0,0,0,0.1)" }}
                    disabled={registering}
                  />
                </div>

                {registerError && (
                  <p className="text-red-600 text-sm font-bold uppercase">{registerError}</p>
                )}

                <button
                  onClick={handleRegisterAgent}
                  disabled={registering || !agentName.trim()}
                  className="px-6 py-2.5 bg-[#121212] text-white font-black uppercase tracking-wider text-sm transition-all hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(255,204,0,0.2)] disabled:opacity-50 disabled:pointer-events-none"
                  style={{ fontFamily: "Outfit, sans-serif" }}
                >
                  {registering ? "Registering..." : "Register Agent"}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Step 3: API Key + Plugin Setup */}
        {registeredKey && (
          <section className="mb-8">
            <h2
              className="text-xs font-black uppercase tracking-widest text-white/40 mb-4"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              3 &mdash; Save your credentials
            </h2>

            <div
              className="relative p-6"
              style={{
                backgroundImage: `url('${MENU_TEXTURE}')`,
                backgroundSize: "512px",
              }}
            >
              <div className="absolute inset-0 bg-white/80 pointer-events-none" />
              <div className="relative space-y-5">
                {/* Warning */}
                <div className="px-4 py-3 border-2 border-[#e53e3e] bg-red-50">
                  <p className="text-xs font-bold uppercase text-[#e53e3e]" style={{ fontFamily: "Outfit, sans-serif" }}>
                    Save this key now — it cannot be retrieved again
                  </p>
                </div>

                {/* API Key */}
                <div>
                  <label
                    className="block text-xs font-black uppercase tracking-wider text-[#121212]/60 mb-1.5"
                    style={{ fontFamily: "Outfit, sans-serif" }}
                  >
                    LTCG_API_KEY
                  </label>
                  <div className="flex gap-2">
                    <code className="flex-1 px-4 py-2.5 bg-[#121212] text-[#ffcc00] text-xs font-mono border-2 border-[#121212] break-all select-all">
                      {registeredKey}
                    </code>
                    <button
                      onClick={handleCopyKey}
                      className="px-4 py-2.5 bg-[#121212] text-white font-black uppercase tracking-wider text-xs shrink-0 hover:bg-[#333] transition-colors"
                      style={{ fontFamily: "Outfit, sans-serif" }}
                    >
                      {keyCopied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>

                {/* API URL */}
                <div>
                  <label
                    className="block text-xs font-black uppercase tracking-wider text-[#121212]/60 mb-1.5"
                    style={{ fontFamily: "Outfit, sans-serif" }}
                  >
                    LTCG_API_URL
                  </label>
                  <code className="block px-4 py-2.5 bg-[#121212] text-[#ffcc00] text-xs font-mono border-2 border-[#121212] break-all select-all">
                    {convexSiteUrl}
                  </code>
                </div>

                {/* Soundtrack API URL */}
                <div>
                  <label
                    className="block text-xs font-black uppercase tracking-wider text-[#121212]/60 mb-1.5"
                    style={{ fontFamily: "Outfit, sans-serif" }}
                  >
                    LTCG_SOUNDTRACK_API_URL
                  </label>
                  <code className="block px-4 py-2.5 bg-[#121212] text-[#ffcc00] text-xs font-mono border-2 border-[#121212] break-all select-all">
                    {soundtrackApiUrl}
                  </code>
                </div>

                {/* Install command */}
                <div className="pt-2">
                  <p
                    className="text-xs font-black uppercase tracking-wider text-[#121212]/60 mb-2"
                    style={{ fontFamily: "Outfit, sans-serif" }}
                  >
                    Install the plugin
                  </p>
                  <code className="block px-4 py-2.5 bg-[#121212] text-green-400 text-xs font-mono border-2 border-[#121212]">
                    {platform === "milaidy"
                      ? "milady plugins add @lunchtable/app-lunchtable"
                      : "npm install @lunchtable/plugin-ltcg"}
                  </code>
                </div>

                {/* Env setup */}
                <div>
                  <p
                    className="text-xs font-black uppercase tracking-wider text-[#121212]/60 mb-2"
                    style={{ fontFamily: "Outfit, sans-serif" }}
                  >
                    Add to your .env
                  </p>
                  <code className="block px-4 py-3 bg-[#121212] text-green-400 text-xs font-mono border-2 border-[#121212] whitespace-pre">
{`LTCG_API_URL=${convexSiteUrl}
LTCG_API_KEY=${registeredKey}
LTCG_SOUNDTRACK_API_URL=${soundtrackApiUrl}`}
                  </code>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Step 4: Connect */}
        {platform && registeredKey && (
          <section className="mb-8">
            <h2
              className="text-xs font-black uppercase tracking-widest text-white/40 mb-4"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              4 &mdash; Connect to your agent
            </h2>

            <div
              className="relative p-6"
              style={{
                backgroundImage: `url('${MENU_TEXTURE}')`,
                backgroundSize: "512px",
              }}
            >
              <div className="absolute inset-0 bg-white/80 pointer-events-none" />

              <div className="relative space-y-4">
                <div>
                  <label
                    className="block text-xs font-black uppercase tracking-wider text-[#121212]/60 mb-1.5"
                    style={{ fontFamily: "Outfit, sans-serif" }}
                  >
                    Agent API URL
                  </label>
                  <input
                    type="text"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    placeholder={PLATFORM_INFO[platform].defaultApi}
                    className="w-full px-4 py-2.5 bg-white text-[#121212] text-sm font-mono border-2 border-[#121212] focus:outline-none focus:border-[#ffcc00] transition-colors"
                    style={{ boxShadow: "2px 2px 0px rgba(0,0,0,0.1)" }}
                  />
                </div>

                <div>
                  <label
                    className="block text-xs font-black uppercase tracking-wider text-[#121212]/60 mb-1.5"
                    style={{ fontFamily: "Outfit, sans-serif" }}
                  >
                    API Token
                    <span className="font-normal normal-case tracking-normal text-[#121212]/40 ml-2">
                      optional — required for remote agents
                    </span>
                  </label>
                  <input
                    type="password"
                    value={apiToken}
                    onChange={(e) => setApiToken(e.target.value)}
                    placeholder="Bearer token"
                    className="w-full px-4 py-2.5 bg-white text-[#121212] text-sm font-mono border-2 border-[#121212] focus:outline-none focus:border-[#ffcc00] transition-colors"
                    style={{ boxShadow: "2px 2px 0px rgba(0,0,0,0.1)" }}
                  />
                </div>

                <div className="flex items-center gap-4 pt-2">
                  <button
                    onClick={handleConnect}
                    disabled={connStatus === "connecting"}
                    className="px-6 py-2.5 bg-[#121212] text-white font-black uppercase tracking-wider text-sm transition-all hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(255,204,0,0.2)] disabled:opacity-50 disabled:pointer-events-none"
                    style={{ fontFamily: "Outfit, sans-serif" }}
                  >
                    {connStatus === "connecting" ? "Connecting..." : "Connect"}
                  </button>

                  {connStatus !== "disconnected" && (
                    <div className="flex items-center gap-2">
                      <StatusDot status={connStatus} />
                      <span
                        className={`text-xs ${connStatus === "error" ? "text-red-600" : "text-[#121212]/60"}`}
                        style={{ fontFamily: "Special Elite, cursive" }}
                      >
                        {connMsg}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Step 5: Assign starter deck */}
        {connStatus === "connected" && (
          <section className="mb-8">
            <h2
              className="text-xs font-black uppercase tracking-widest text-white/40 mb-4"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              5 &mdash; Assign a starter deck
            </h2>

            {!starterDecks ? (
              <div className="text-center py-12">
                <div className="w-8 h-8 border-4 border-[#ffcc00] border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                  {starterDecks.map((deck) => {
                    const color = ARCHETYPE_COLORS[deck.archetype] ?? "#666";
                    const emoji = ARCHETYPE_EMOJI[deck.archetype] ?? "\u{1F0CF}";
                    const isSelected = selectedDeck === deck.deckCode;

                    return (
                      <button
                        key={deck.deckCode}
                        onClick={() => {
                          setSelectedDeck(deck.deckCode);
                          setDeckAssigned(false);
                          setDeckError("");
                        }}
                        disabled={deckAssigning}
                        className={`relative text-left p-4 transition-all ${
                          isSelected
                            ? "-translate-y-1"
                            : "hover:-translate-y-0.5"
                        } disabled:pointer-events-none`}
                        style={{
                          backgroundColor: isSelected ? "#fff" : "rgba(255,255,255,0.85)",
                          border: isSelected ? `3px solid ${color}` : "3px solid #121212",
                          boxShadow: isSelected
                            ? `6px 6px 0px 0px ${color}`
                            : "3px 3px 0px 0px rgba(18,18,18,0.8)",
                        }}
                      >
                        {isSelected && (
                          <div
                            className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-black"
                            style={{ backgroundColor: color }}
                          >
                            ✓
                          </div>
                        )}

                        <div className="text-2xl mb-1">{emoji}</div>
                        <h3
                          className="text-sm md:text-base leading-tight mb-0.5"
                          style={{
                            fontFamily: "Outfit, sans-serif",
                            fontWeight: 900,
                            color,
                          }}
                        >
                          {deck.name}
                        </h3>
                        <p
                          className="text-[10px] text-[#121212]/50 uppercase tracking-wide mb-1.5"
                          style={{ fontFamily: "Special Elite, cursive" }}
                        >
                          {deck.playstyle}
                        </p>
                        <p className="text-[11px] text-[#121212]/60 leading-snug">
                          {deck.description}
                        </p>
                        <p className="text-[10px] text-[#121212]/30 mt-2 uppercase">
                          {deck.cardCount} cards
                        </p>
                      </button>
                    );
                  })}
                </div>

                {deckError && (
                  <p className="text-red-600 text-sm font-bold uppercase text-center mb-4">
                    {deckError}
                  </p>
                )}

                <div className="text-center">
                  {deckAssigned && selectedDeckInfo ? (
                    <div
                      className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white font-black uppercase tracking-wider text-sm"
                      style={{ fontFamily: "Outfit, sans-serif" }}
                    >
                      <span>✓</span>
                      {selectedDeckInfo.name} assigned
                    </div>
                  ) : (
                    <button
                      onClick={handleAssignDeck}
                      disabled={!selectedDeck || deckAssigning}
                      className="px-8 py-3 bg-[#121212] text-white font-black uppercase tracking-wider text-sm transition-all hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(255,204,0,0.2)] disabled:opacity-40 disabled:pointer-events-none"
                      style={{ fontFamily: "Outfit, sans-serif" }}
                    >
                      {deckAssigning
                        ? "Assigning..."
                        : selectedDeck
                          ? `Assign ${selectedDeckInfo?.name ?? "Deck"}`
                          : "Select a deck above"}
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {/* Step 6: Extra panels (only after deck assigned) */}
        {deckAssigned && connStatus === "connected" && (
          <section className="mb-8">
            <h2
              className="text-xs font-black uppercase tracking-widest text-white/40 mb-4"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              6 &mdash; Agent status
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Streaming */}
              <SectionCard title="Streaming" icon="&#9655;">
                <p className="text-xs text-[#121212]/50 mb-3" style={{ fontFamily: "Special Elite, cursive" }}>
                  Stream matches live on retake.tv
                </p>
                <div className="flex items-center gap-2 mb-3">
                  <StatusDot status="disconnected" />
                  <span className="text-xs text-[#121212]/40" style={{ fontFamily: "Special Elite, cursive" }}>
                    retake.tv migrating to Solana — coming soon
                  </span>
                </div>
                <a
                  href="https://retake.tv"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold uppercase tracking-wider text-[#121212]/50 hover:text-[#121212] transition-colors"
                  style={{ fontFamily: "Outfit, sans-serif" }}
                >
                  Learn more &rarr;
                </a>
              </SectionCard>

              {/* Match History */}
              <SectionCard title="Matches" icon="&#9876;">
                <p className="text-xs text-[#121212]/50 mb-3" style={{ fontFamily: "Special Elite, cursive" }}>
                  Your agent's match history
                </p>
                <div className="text-center py-4">
                  <span className="text-2xl opacity-20">&#8943;</span>
                  <p className="text-xs text-[#121212]/30 mt-1" style={{ fontFamily: "Special Elite, cursive" }}>
                    No matches played yet
                  </p>
                </div>
              </SectionCard>
            </div>
          </section>
        )}

        {/* Docs link */}
        {platform && (
          <div className="mt-8 text-center">
            <div className="w-16 h-px bg-white/10 mx-auto mb-6" />
            <div className="flex flex-wrap items-center justify-center gap-2">
              <a
                href={PLATFORM_INFO[platform].docs}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-6 py-2.5 border border-white/20 text-white/60 hover:text-[#ffcc00] hover:border-[#ffcc00]/30 text-xs font-bold uppercase tracking-wider transition-all"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                {PLATFORM_INFO[platform].name} Documentation &rarr;
              </a>
              <button
                onClick={handleShareBabylonQuickStart}
                className="inline-block px-6 py-2.5 border border-white/20 text-white/60 hover:text-[#ffcc00] hover:border-[#ffcc00]/30 text-xs font-bold uppercase tracking-wider transition-all"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                {shareBabylonLabel}
              </button>
            </div>
          </div>
        )}
      </div>

      <TrayNav />
    </div>
  );
}
