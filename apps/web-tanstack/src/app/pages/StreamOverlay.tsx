/**
 * StreamOverlay — dedicated page for headless Chromium capture.
 *
 * Route:
 * - /stream-overlay?apiKey=ltcg_...
 * - /stream-overlay?hostId=<userId>
 * - /stream-overlay?matchId=<matchId>&seat=host|away
 *
 * This is what retake.tv viewers actually see: a 1280x720 dark game board
 * with rich card art, archetype frames, LP bars, chat panel, and timeline ticker.
 * No retake.tv iframe embed (avoids recursive stream-in-stream).
 *
 * Uses the app's zine aesthetic: Outfit + Special Elite fonts, ink borders,
 * paper-panel backgrounds, chunky shadows.
 */

import { useSearchParams } from "@/router/react-router";
import { useEffect, useRef, useState } from "react";
import { useStreamOverlay, type StreamChatMessage } from "@/hooks/useStreamOverlay";
import { parseStreamOverlayParams } from "@/lib/streamOverlayParams";
import { FieldRow } from "@/components/game/FieldRow";
import { SpellTrapRow } from "@/components/game/SpellTrapRow";
import { LPBar } from "@/components/game/LPBar";
import { PhaseBar } from "@/components/game/PhaseBar";
import type { BoardCard, Phase } from "@/components/game/types";
import type { PublicEventLogEntry, PublicSpectatorView } from "@/hooks/useAgentSpectator";
import type { CardDefinition } from "@/lib/convexTypes";
import type { SpectatorSpellTrapCard } from "@/lib/spectatorAdapter";
import { ConvexHttpClient } from "convex/browser";
import { apiAny } from "@/lib/convexHelpers";

const MAX_LP = 4000;
const TICKER_COUNT = 5;
const noop = () => {};

function toConvexCloudUrl(url: string) {
  return url.replace(".convex.site", ".convex.cloud");
}

export function StreamOverlay() {
  const [params] = useSearchParams();
  const overlayParams = parseStreamOverlayParams(params);
  const { apiUrl, apiKey, hostId, matchId, seat } = overlayParams;

  const {
    loading,
    error,
    agentName,
    matchState,
    timeline,
    cardLookup,
    chatMessages,
    agentMonsters,
    opponentMonsters,
    agentSpellTraps,
    opponentSpellTraps,
  } = useStreamOverlay(overlayParams);

  const [fallbackMatchState, setFallbackMatchState] = useState<PublicSpectatorView | null>(null);

  useEffect(() => {
    if (matchState) {
      setFallbackMatchState(null);
      return;
    }
    if (!apiUrl || !matchId) {
      setFallbackMatchState(null);
      return;
    }

    let cancelled = false;
    const normalizedApiUrl = apiUrl.replace(/\/$/, "");
    const convexCloudUrl = toConvexCloudUrl(normalizedApiUrl);
    const requestedSeat = seat === "away" ? "away" : "host";

    (async () => {
      try {
        const client = new ConvexHttpClient(convexCloudUrl);
        const view = await client.query(
          apiAny.game.getSpectatorView,
          { matchId, seat: requestedSeat },
        );
        if (cancelled) return;
        if (view) {
          setFallbackMatchState(view as PublicSpectatorView);
          return;
        }
      } catch {
        // Fall through to actor-scoped fallback when possible.
      }

      if (!apiKey || cancelled) {
        if (!cancelled) setFallbackMatchState(null);
        return;
      }

      const query = new URLSearchParams({ matchId, seat: requestedSeat });
      try {
        const response = await fetch(
          `${normalizedApiUrl}/api/agent/game/public-view?${query.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
          },
        );
        if (!response.ok || cancelled) return;
        const payload = (await response.json()) as PublicSpectatorView;
        if (!cancelled) setFallbackMatchState(payload);
      } catch {
        if (!cancelled) setFallbackMatchState(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiUrl, apiKey, matchId, matchState, seat]);

  const effectiveMatchState = matchState ?? fallbackMatchState;

  // Expose snapshot hook for browserObserver compatibility.
  useEffect(() => {
    (window as any).render_spectator_to_text = () =>
      effectiveMatchState ? JSON.stringify(effectiveMatchState) : null;
    return () => {
      delete (window as any).render_spectator_to_text;
    };
  }, [effectiveMatchState]);

  if (!apiKey && !hostId && !matchId) {
    return (
      <OverlayShell>
        <CenterMessage text="Missing apiKey, hostId, or matchId parameter" />
      </OverlayShell>
    );
  }

  if (loading) {
    return (
      <OverlayShell>
        <CenterMessage text="Connecting..." pulse />
      </OverlayShell>
    );
  }

  if (error) {
    return (
      <OverlayShell>
        <CenterMessage text={error} />
      </OverlayShell>
    );
  }

  const phase = (effectiveMatchState?.phase ?? "draw") as Phase;
  const recentEvents = timeline.slice(-TICKER_COUNT);
  const hasMatch = !!effectiveMatchState;

  return (
    <OverlayShell>
      <div className="w-full h-full flex flex-col">
        {/* Header bar */}
        <div className="px-4 pt-2 pb-1 flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-3">
            <h1 className="font-['Outfit'] font-black text-white/80 uppercase tracking-tighter text-sm leading-none">
              {agentName ?? "Agent"}
            </h1>
            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-red-400 font-['Outfit']">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
              Live
            </span>
          </div>
          {hasMatch && (
            <span className="font-['Outfit'] font-black text-white/25 text-[10px] uppercase tracking-wider">
              T{effectiveMatchState.turnNumber}
            </span>
          )}
        </div>

        {/* Main content: board left, chat right */}
        <div className="flex-1 flex min-h-0">
          {/* Left panel: game board or idle state */}
          <div className="flex-1 flex flex-col min-w-0">
            {hasMatch ? (
              <GameBoardPanel
                matchState={effectiveMatchState}
                agentName={agentName}
                phase={phase}
                cardLookup={cardLookup}
                agentMonsters={agentMonsters}
                opponentMonsters={opponentMonsters}
                agentSpellTraps={agentSpellTraps}
                opponentSpellTraps={opponentSpellTraps}
              />
            ) : (
              <IdlePanel agentName={agentName} chatMessages={chatMessages} />
            )}

            {/* Timeline ticker */}
            <div className="px-4 pb-2 pt-1 border-t border-white/5">
              <EventTicker events={recentEvents} />
            </div>
          </div>

          {/* Right panel: chat (always visible) */}
          <div className="w-[280px] flex-shrink-0 border-l border-white/8 flex flex-col">
            <ChatPanel messages={chatMessages} />
          </div>
        </div>
      </div>
    </OverlayShell>
  );
}

// ── Shell ────────────────────────────────────────────────────────

function OverlayShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="w-screen h-screen overflow-hidden flex items-center justify-center"
      style={{ background: "#0d0c0a" }}
    >
      {children}
    </div>
  );
}

function CenterMessage({ text, pulse }: { text: string; pulse?: boolean }) {
  return (
    <p
      className={`font-['Special_Elite'] text-white/40 text-sm ${pulse ? "animate-pulse" : ""}`}
    >
      {text}
    </p>
  );
}

// ── Game Board Panel ─────────────────────────────────────────────

function GameBoardPanel({
  matchState,
  agentName,
  phase,
  cardLookup,
  agentMonsters,
  opponentMonsters,
  agentSpellTraps,
  opponentSpellTraps,
}: {
  matchState: NonNullable<ReturnType<typeof useStreamOverlay>["matchState"]>;
  agentName: string | null;
  phase: Phase;
  cardLookup: Record<string, CardDefinition>;
  agentMonsters: BoardCard[];
  opponentMonsters: BoardCard[];
  agentSpellTraps: SpectatorSpellTrapCard[];
  opponentSpellTraps: SpectatorSpellTrapCard[];
}) {
  return (
    <div className="flex-1 flex flex-col px-4 pt-2">
      {/* LP bars */}
      <div className="flex items-center gap-3 mb-1.5">
        <div className="flex-1">
          <LPBar
            lp={matchState.players.agent.lifePoints}
            maxLp={MAX_LP}
            label={agentName ?? "AGENT"}
            side="player"
            platformTag="AI"
          />
        </div>
        <div className="flex-1">
          <LPBar
            lp={matchState.players.opponent.lifePoints}
            maxLp={MAX_LP}
            label="OPPONENT"
            side="opponent"
          />
        </div>
      </div>

      {/* Phase bar */}
      <PhaseBar currentPhase={phase} isMyTurn={false} onAdvance={noop} />

      {/* Board fields */}
      <div className="flex-1 flex flex-col justify-center gap-1.5 py-2">
        <SpellTrapRow cards={opponentSpellTraps} cardLookup={cardLookup} maxSlots={3} interactive={false} />
        <FieldRow cards={opponentMonsters} cardLookup={cardLookup} maxSlots={3} reversed />
        <div className="flex items-center gap-2 py-0.5">
          <div className="flex-1 h-px bg-white/8" />
          <span className="font-['Special_Elite'] text-white/15 text-[9px]">vs</span>
          <div className="flex-1 h-px bg-white/8" />
        </div>
        <FieldRow cards={agentMonsters} cardLookup={cardLookup} maxSlots={3} />
        <SpellTrapRow cards={agentSpellTraps} cardLookup={cardLookup} maxSlots={3} interactive={false} />
      </div>

      {/* Zone stats */}
      <div className="flex justify-between text-[9px] text-white/20 font-['Special_Elite'] px-1 pb-1">
        <span>Hand {matchState.players.agent.handCount} · Deck {matchState.players.agent.deckCount} · GY {matchState.players.agent.graveyardCount}</span>
        <span>Hand {matchState.players.opponent.handCount} · Deck {matchState.players.opponent.deckCount} · GY {matchState.players.opponent.graveyardCount}</span>
      </div>
    </div>
  );
}

// ── Idle Panel (no match) ────────────────────────────────────────

function IdlePanel({ agentName, chatMessages }: { agentName: string | null; chatMessages: StreamChatMessage[] }) {
  const hasChat = chatMessages.length > 0;

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
      <div className="text-center">
        <p className="font-['Outfit'] font-black text-white/30 uppercase tracking-tighter text-2xl leading-none">
          {agentName ?? "Agent"}
        </p>
        <p className="font-['Special_Elite'] text-white/15 text-xs mt-2">
          {hasChat ? "Between matches" : "Waiting for match..."}
        </p>
      </div>
      {!hasChat && (
        <div className="w-5 h-5 border-2 border-white/15 border-t-white/40 rounded-full animate-spin" />
      )}
      {/* Show agent's recent message as a featured quote when idle */}
      {hasChat && <FeaturedQuote messages={chatMessages} />}
    </div>
  );
}

function FeaturedQuote({ messages }: { messages: StreamChatMessage[] }) {
  const lastAgentMsg = [...messages].reverse().find(m => m.role === "agent");
  if (!lastAgentMsg) return null;
  return (
    <div className="max-w-md border border-white/10 bg-white/[0.03] p-4">
      <p className="font-['Special_Elite'] text-white/40 text-sm leading-relaxed italic">
        "{lastAgentMsg.text}"
      </p>
      <p className="font-['Outfit'] text-white/20 text-[10px] uppercase tracking-wider mt-2">
        — {lastAgentMsg.senderName}
      </p>
    </div>
  );
}

// ── Chat Panel ───────────────────────────────────────────────────

function ChatPanel({ messages }: { messages: StreamChatMessage[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-white/8">
        <p className="font-['Outfit'] font-black text-white/30 text-[10px] uppercase tracking-wider">
          Chat
        </p>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 space-y-2">
        {messages.length === 0 ? (
          <p className="font-['Special_Elite'] text-white/10 text-[11px] pt-2">
            No messages yet
          </p>
        ) : (
          messages.map((msg) => (
            <ChatBubble key={msg._id} message={msg} isAgent={msg.role === "agent"} />
          ))
        )}
      </div>
    </div>
  );
}

function ChatBubble({ message, isAgent }: { message: StreamChatMessage; isAgent: boolean }) {
  const sourceColor = {
    retake: "text-[#ffcc00]/60",
    telegram: "text-blue-400/60",
    discord: "text-indigo-400/60",
    system: "text-white/20",
    other: "text-white/30",
  }[message.source] ?? "text-white/30";

  return (
    <div className={`${isAgent ? "pl-0 pr-1" : "pl-1 pr-0"}`}>
      <div className="flex items-baseline gap-1.5 mb-0.5">
        <span className={`font-['Outfit'] font-bold text-[9px] uppercase tracking-wider ${
          isAgent ? "text-[#ffcc00]/50" : "text-white/40"
        }`}>
          {message.senderName}
        </span>
        <span className={`text-[8px] ${sourceColor}`}>
          {message.source}
        </span>
      </div>
      <p className={`font-['Special_Elite'] text-[11px] leading-snug ${
        isAgent ? "text-white/60" : "text-white/40"
      }`}>
        {message.text}
      </p>
    </div>
  );
}

// ── Event Ticker ─────────────────────────────────────────────────

function EventTicker({ events }: { events: PublicEventLogEntry[] }) {
  if (events.length === 0) {
    return (
      <div className="h-5 flex items-center">
        <p className="font-['Special_Elite'] text-white/10 text-[10px]">
          No events yet
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 overflow-hidden h-5">
      {events.map((e, i) => (
        <span
          key={`${e.version}-${e.eventType}-${i}`}
          className="font-['Special_Elite'] text-white/25 text-[10px] whitespace-nowrap flex-shrink-0"
        >
          <span className="text-white/15 mr-1">v{e.version}</span>
          {e.summary}
          {i < events.length - 1 && (
            <span className="text-white/8 ml-3">&middot;</span>
          )}
        </span>
      ))}
    </div>
  );
}
