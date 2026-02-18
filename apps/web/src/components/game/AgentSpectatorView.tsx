/**
 * Agent Spectator View — watches an agent play via HTTP API polling.
 *
 * Used when the LTCG frontend is embedded in milaidy with an ltcg_ API key.
 * Since the API key can't authenticate with Convex real-time subscriptions,
 * this component polls the HTTP API for game state.
 */

import { useAgentSpectator, type SpectatorMatchState } from "@/hooks/useAgentSpectator";
import { useEffect } from "react";

declare global {
  interface Window {
    render_spectator_to_text?: () => string;
  }
}

interface Props {
  apiKey: string;
  apiUrl: string;
}

export function AgentSpectatorView({ apiKey, apiUrl }: Props) {
  const { agent, matchState, error, loading } = useAgentSpectator(apiKey, apiUrl);

  if (loading) return <SpectatorLoading />;
  if (error) return <SpectatorError message={error} />;
  if (!agent) return <SpectatorError message="Could not connect to agent" />;

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Expose a deterministic snapshot for browser automation.
    // This is intentionally small and stable; consumers should treat it as read-only.
    const renderSpectatorToText = () =>
      JSON.stringify({
        mode: "ltcg_spectator",
        agent: {
          id: agent.id,
          name: agent.name,
          apiKeyPrefix: agent.apiKeyPrefix,
        },
        match: matchState
          ? {
              matchId: matchState.matchId,
              phase: matchState.phase,
              gameOver: matchState.gameOver,
              winner: matchState.winner ?? null,
              myLP: matchState.myLP,
              oppLP: matchState.oppLP,
              seat: matchState.seat,
              mode: matchState.mode ?? null,
              chapterId: matchState.chapterId ?? null,
              stageNumber: matchState.stageNumber ?? null,
            }
          : null,
      });

    window.render_spectator_to_text = renderSpectatorToText;

    return () => {
      if (window.render_spectator_to_text === renderSpectatorToText) {
        delete window.render_spectator_to_text;
      }
    };
  }, [agent, matchState]);

  return (
    <div className="min-h-screen bg-[#fdfdfb] flex flex-col">
      {/* Agent header */}
      <header className="border-b-2 border-[#121212] px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] text-[#999] uppercase tracking-wider">
            Spectating
          </p>
          <h1
            className="text-lg leading-tight"
            style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900 }}
          >
            {agent.name}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 bg-red-600 text-white text-[10px] font-black px-2 py-0.5 uppercase tracking-wider"
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            Live
          </span>
        </div>
      </header>

      {/* Match content */}
      {matchState ? (
        <MatchBoard state={matchState} agentName={agent.name} />
      ) : (
        <WaitingForMatch agentName={agent.name} />
      )}
    </div>
  );
}

function MatchBoard({
  state,
  agentName,
}: {
  state: SpectatorMatchState;
  agentName: string;
}) {
  if (state.gameOver) {
    const won = state.winner ? state.winner === state.seat : state.myLP > state.oppLP;
    const draw = state.winner == null && state.myLP === state.oppLP;

    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="paper-panel p-12 text-center max-w-md">
          <h1
            className="text-5xl mb-4"
            style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900 }}
          >
            {draw ? "DRAW" : won ? "VICTORY" : "DEFEAT"}
          </h1>
          <p
            className="text-sm text-[#666] mb-4"
            style={{ fontFamily: "Special Elite, cursive" }}
          >
            {agentName} {draw ? "drew" : won ? "won" : "lost"} — LP: {state.myLP} vs{" "}
            {state.oppLP}
          </p>
          {state.chapterId && (
            <p className="text-xs text-[#999]">
              Story Stage {state.stageNumber}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-4 p-4 max-w-4xl mx-auto w-full">
      {/* Status bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Stat label={agentName} value={state.myLP} />
          <span className="text-[#121212]/30 text-xs">vs</span>
          <Stat label="Opponent" value={state.oppLP} />
        </div>
        <div className="text-right">
          <p className="text-[10px] text-[#999] uppercase tracking-wider">
            {state.phase}
          </p>
          <p
            className="text-xs font-bold"
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            {state.isAgentTurn ? `${agentName}'s turn` : "Opponent's turn"}
          </p>
        </div>
      </div>

      {/* Opponent field */}
      <FieldRow
        label="Opponent"
        monsters={state.opponentField.monsters}
        faceDown
      />

      <div className="h-px bg-[#121212]/20 my-2" />

      {/* Agent field */}
      <FieldRow label={agentName} monsters={state.playerField.monsters} />

      {/* Hand */}
      <div className="mt-4">
        <p
          className="text-xs text-[#999] uppercase tracking-wider mb-2"
          style={{ fontFamily: "Special Elite, cursive" }}
        >
          Hand ({state.hand.length} cards)
        </p>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {state.hand.map((card: any, i: number) => (
            <div
              key={card.instanceId ?? i}
              className="paper-panel p-3 min-w-[120px] shrink-0 text-xs"
            >
              <p
                className="font-bold leading-tight mb-1 line-clamp-2"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                {card.name ?? "???"}
              </p>
              {card.attack !== undefined && (
                <p className="text-[10px] text-[#666]">
                  ATK {card.attack} / DEF {card.defense}
                </p>
              )}
            </div>
          ))}
          {state.hand.length === 0 && (
            <p className="text-xs text-[#999] italic">Empty hand</p>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldRow({
  label,
  monsters,
  faceDown,
}: {
  label: string;
  monsters: any[];
  faceDown?: boolean;
}) {
  const slots = monsters ?? [];
  return (
    <div>
      <p
        className="text-xs text-[#999] uppercase tracking-wider mb-2"
        style={{ fontFamily: "Special Elite, cursive" }}
      >
        {label}
      </p>
      <div className="flex gap-2">
        {[0, 1, 2, 3, 4].map((i) => {
          const card = slots[i];
          return (
            <div
              key={i}
              className={`paper-panel-flat w-20 h-24 flex items-center justify-center text-xs ${
                card ? "" : "opacity-20"
              }`}
            >
              {card ? (
                faceDown && card.faceDown ? (
                  <span className="text-[#999]">?</span>
                ) : (
                  <div className="p-1.5 text-center">
                    <p
                      className="text-[10px] font-bold leading-tight line-clamp-2"
                      style={{ fontFamily: "Outfit, sans-serif" }}
                    >
                      {card.name ?? "Set"}
                    </p>
                    {card.attack !== undefined && (
                      <p className="text-[9px] text-[#666] mt-0.5">
                        {card.attack}/{card.defense}
                      </p>
                    )}
                  </div>
                )
              ) : (
                <span className="text-[#ccc]">&mdash;</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WaitingForMatch({ agentName }: { agentName: string }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-[#121212] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p
          className="text-sm font-bold mb-2"
          style={{ fontFamily: "Outfit, sans-serif" }}
        >
          Waiting for {agentName}
        </p>
        <p
          className="text-xs text-[#999]"
          style={{ fontFamily: "Special Elite, cursive" }}
        >
          The agent will start a match soon...
        </p>
      </div>
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
        <p
          className="text-sm font-bold text-red-600 mb-2"
          style={{ fontFamily: "Outfit, sans-serif" }}
        >
          Connection Failed
        </p>
        <p
          className="text-xs text-[#666]"
          style={{ fontFamily: "Special Elite, cursive" }}
        >
          {message}
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="text-[10px] text-[#999] uppercase tracking-wider">
        {label}
      </p>
      <p
        className="text-lg leading-none"
        style={{ fontFamily: "Outfit, sans-serif", fontWeight: 900 }}
      >
        {value}
      </p>
    </div>
  );
}
