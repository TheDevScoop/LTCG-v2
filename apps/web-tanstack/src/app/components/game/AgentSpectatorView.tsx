import { useEffect, useMemo, useState } from "react";
import {
  useAgentSpectator,
  type PublicEventLogEntry,
  type PublicSpectatorView,
} from "@/hooks/useAgentSpectator";
import type { IframeChatState } from "@/hooks/useIframeMode";
import type { IframeChatMessage } from "@/lib/iframe";
import type { CardDefinition } from "@/lib/convexTypes";
import type { Phase } from "@/components/game/types";
import { useCardLookup } from "@/hooks/useCardLookup";
import { FieldRow } from "@/components/game/FieldRow";
import { SpellTrapRow } from "@/components/game/SpellTrapRow";
import { LPBar } from "@/components/game/LPBar";
import { PhaseBar } from "@/components/game/PhaseBar";
import {
  spectatorMonstersToBoardCards,
  spectatorSpellTrapsToCards,
} from "@/lib/spectatorAdapter";

interface Props {
  apiKey: string;
  apiUrl: string;
  agentId?: string | null;
  hostChatState?: IframeChatState | null;
  hostChatEvent?: IframeChatMessage | null;
  onSendChat?: (text: string, matchId?: string) => void;
}

const RETAKE_EMBED_BASE = (import.meta.env.VITE_RETAKE_EMBED_BASE_URL as string | undefined) ??
  "https://retake.tv/embed";
const RETAKE_CHANNEL_BASE = (import.meta.env.VITE_RETAKE_CHANNEL_BASE_URL as string | undefined) ??
  "https://retake.tv";

export function AgentSpectatorView({
  apiKey,
  apiUrl,
  agentId,
  hostChatState,
  hostChatEvent,
  onSendChat,
}: Props) {
  const { agent, matchState, timeline, error, loading } = useAgentSpectator({
    apiKey,
    apiUrl,
  });

  const { lookup: cardLookup } = useCardLookup();

  const [chatMessages, setChatMessages] = useState<IframeChatMessage[]>([]);
  const [draft, setDraft] = useState("");

  const isIframeHost = typeof window !== "undefined" && window.self !== window.top;
  const chatEnabled = hostChatState?.enabled !== false;
  const chatReadOnly = !isIframeHost || hostChatState?.readOnly === true || !onSendChat || !chatEnabled;

  useEffect(() => {
    if (!hostChatState?.messages) return;
    setChatMessages(hostChatState.messages);
  }, [hostChatState?.messages]);

  useEffect(() => {
    if (!hostChatEvent) return;
    setChatMessages((current) => {
      if (current.some((entry) => entry.id === hostChatEvent.id)) return current;
      return [...current, hostChatEvent];
    });
  }, [hostChatEvent]);

  const streamEmbedUrl = useMemo(() => {
    if (!agent?.name) return null;
    return `${RETAKE_EMBED_BASE.replace(/\/$/, "")}/${encodeURIComponent(agent.name)}`;
  }, [agent?.name]);

  const streamPageUrl = useMemo(() => {
    if (!agent?.name) return RETAKE_CHANNEL_BASE;
    return `${RETAKE_CHANNEL_BASE.replace(/\/$/, "")}/${encodeURIComponent(agent.name)}`;
  }, [agent?.name]);

  const sendMessage = () => {
    const text = draft.trim();
    if (!text || chatReadOnly || !onSendChat) return;

    onSendChat(text, matchState?.matchId);
    setChatMessages((current) => [
      ...current,
      {
        id: `local-${Date.now()}`,
        role: "user",
        text,
        createdAt: Date.now(),
      },
    ]);
    setDraft("");
  };

  if (loading) return <SpectatorLoading />;
  if (error) return <SpectatorError message={error} />;
  if (!agent) return <SpectatorError message="Could not connect to agent" />;

  return (
    <div className="min-h-screen bg-[#fdfdfb] text-[#121212]">
      <header className="border-b-2 border-[#121212] px-4 py-3 flex items-center justify-between bg-white/90">
        <div>
          <p className="text-[10px] text-[#999] uppercase tracking-wider">Embedded Broadcast</p>
          <h1 className="text-lg leading-tight" style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900 }}>
            {agent.name}
          </h1>
          <p className="text-[10px] text-[#666] font-mono">{agent.apiKeyPrefix}</p>
        </div>
        <span
          className="inline-flex items-center gap-1.5 bg-red-600 text-white text-[10px] font-black px-2 py-0.5 uppercase tracking-wider"
          style={{ fontFamily: "Outfit, sans-serif" }}
        >
          <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
          Live
        </span>
      </header>

      <main className="p-3 md:p-4 grid grid-cols-1 xl:grid-cols-3 gap-3">
        <section className="paper-panel p-3 col-span-1 xl:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] uppercase tracking-wider text-[#666]">Stream</p>
            <a
              href={streamPageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] uppercase tracking-wider font-bold text-[#121212]/70 hover:text-[#121212]"
            >
              Open Channel
            </a>
          </div>
          {streamEmbedUrl ? (
            <iframe
              src={streamEmbedUrl}
              title={`${agent.name} stream`}
              className="w-full aspect-video border-2 border-[#121212]"
              allow="autoplay; fullscreen"
            />
          ) : (
            <div className="w-full aspect-video border-2 border-[#121212] flex items-center justify-center text-xs text-[#666]">
              Stream unavailable
            </div>
          )}
        </section>

        <section className="paper-panel p-3 col-span-1">
          <p className="text-[11px] uppercase tracking-wider text-[#666] mb-2">Chat</p>
          <div className="border border-[#121212]/30 h-56 overflow-auto bg-white/70 p-2 space-y-2">
            {chatMessages.length === 0 ? (
              <p className="text-[11px] text-[#666] italic">No host chat messages yet.</p>
            ) : (
              chatMessages.map((entry) => (
                <div key={entry.id} className="text-[11px]">
                  <p className="font-bold uppercase tracking-wide text-[10px] text-[#666]">
                    {entry.role}
                  </p>
                  <p className="leading-snug">{entry.text}</p>
                </div>
              ))
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") sendMessage();
              }}
              disabled={chatReadOnly}
              placeholder={chatReadOnly ? "Host chat bridge required" : "Send message to host chat"}
              className="flex-1 border-2 border-[#121212] bg-white px-2 py-1 text-xs disabled:opacity-60"
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={chatReadOnly || draft.trim().length === 0}
              className="tcg-button px-3 py-1 text-[10px] disabled:opacity-60"
            >
              Send
            </button>
          </div>
          {chatReadOnly && (
            <p className="text-[10px] text-[#666] mt-2">
              {hostChatState?.reason ??
                (chatEnabled
                  ? "Chat is read-only until the host bridge is connected."
                  : "Host disabled chat for this stream.")}
            </p>
          )}
          {!agentId && (
            <p className="text-[10px] text-[#666] mt-1">
              Agent relay id not provided by host.
            </p>
          )}
        </section>

        <section className="paper-panel p-3 col-span-1 xl:col-span-2">
          <p className="text-[11px] uppercase tracking-wider text-[#666] mb-2">Public Game Board</p>
          {matchState ? (
            <RichPublicBoard state={matchState} cardLookup={cardLookup} agentName={agent.name} />
          ) : (
            <p className="text-xs text-[#666]">Waiting for an active match...</p>
          )}
        </section>

        <section className="paper-panel p-3 col-span-1">
          <p className="text-[11px] uppercase tracking-wider text-[#666] mb-2">Action Timeline</p>
          <Timeline entries={timeline} />
        </section>
      </main>
    </div>
  );
}

const MAX_LP = 4000;
const boardNoop = () => {};

function RichPublicBoard({
  state,
  cardLookup,
  agentName,
}: {
  state: PublicSpectatorView;
  cardLookup: Record<string, CardDefinition>;
  agentName: string;
}) {
  const phase = (state.phase ?? "draw") as Phase;
  const agentMonsters = useMemo(
    () => spectatorMonstersToBoardCards(state.fields.agent.monsters),
    [state.fields.agent.monsters],
  );
  const opponentMonsters = useMemo(
    () => spectatorMonstersToBoardCards(state.fields.opponent.monsters),
    [state.fields.opponent.monsters],
  );
  const agentST = useMemo(
    () => spectatorSpellTrapsToCards(state.fields.agent.spellTraps),
    [state.fields.agent.spellTraps],
  );
  const opponentST = useMemo(
    () => spectatorSpellTrapsToCards(state.fields.opponent.spellTraps),
    [state.fields.opponent.spellTraps],
  );

  return (
    <div className="bg-[#0d0c0a] rounded-sm p-3 space-y-2">
      {/* LP bars */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <LPBar
            lp={state.players.agent.lifePoints}
            maxLp={MAX_LP}
            label={agentName}
            side="player"
            platformTag="AI"
          />
        </div>
        <span className="font-['Outfit'] font-black text-white/30 text-[10px] uppercase">
          T{state.turnNumber}
        </span>
        <div className="flex-1">
          <LPBar
            lp={state.players.opponent.lifePoints}
            maxLp={MAX_LP}
            label="OPPONENT"
            side="opponent"
          />
        </div>
      </div>

      {/* Phase bar */}
      <PhaseBar currentPhase={phase} isMyTurn={false} onAdvance={boardNoop} />

      {/* Board fields */}
      <div className="space-y-1.5">
        <SpellTrapRow cards={opponentST} cardLookup={cardLookup} maxSlots={3} interactive={false} />
        <FieldRow cards={opponentMonsters} cardLookup={cardLookup} maxSlots={3} reversed />
        <div className="flex items-center gap-2 py-0.5">
          <div className="flex-1 h-px bg-white/10" />
          <span className="font-['Special_Elite'] text-white/15 text-[9px]">vs</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>
        <FieldRow cards={agentMonsters} cardLookup={cardLookup} maxSlots={3} />
        <SpellTrapRow cards={agentST} cardLookup={cardLookup} maxSlots={3} interactive={false} />
      </div>

      {/* Compact zone stats */}
      <div className="flex justify-between text-[9px] text-white/25 font-['Special_Elite'] px-1">
        <span>Hand {state.players.agent.handCount} · Deck {state.players.agent.deckCount} · GY {state.players.agent.graveyardCount}</span>
        <span>Hand {state.players.opponent.handCount} · Deck {state.players.opponent.deckCount} · GY {state.players.opponent.graveyardCount}</span>
      </div>
    </div>
  );
}

function Timeline({ entries }: { entries: PublicEventLogEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-xs text-[#666]">No events yet.</p>;
  }

  return (
    <div className="max-h-[420px] overflow-auto space-y-2">
      {entries.slice().reverse().map((entry) => (
        <div key={`${entry.version}-${entry.eventType}-${entry.createdAt ?? 0}`} className="border border-[#121212]/20 bg-white/70 p-2">
          <p className="text-[10px] uppercase tracking-wider text-[#666]">
            {entry.actor} · v{entry.version}
          </p>
          <p className="text-xs font-bold mt-0.5">{entry.summary}</p>
          <p className="text-[11px] text-[#666] mt-1">{entry.rationale}</p>
        </div>
      ))}
    </div>
  );
}

function SpectatorLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fdfdfb]">
      <div className="w-8 h-8 border-4 border-[#121212] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function SpectatorError({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fdfdfb]">
      <div className="text-center">
        <p className="text-sm font-bold text-red-600 mb-2" style={{ fontFamily: "Outfit, sans-serif" }}>
          Connection Failed
        </p>
        <p className="text-xs text-[#666]" style={{ fontFamily: "Special Elite, cursive" }}>
          {message}
        </p>
      </div>
    </div>
  );
}
