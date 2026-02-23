/**
 * Data hook for the stream overlay page.
 *
 * Combines agent discovery, spectator view, card lookup, timeline,
 * and stream chat messages into a single hook.
 */

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { apiAny } from "@/lib/convexHelpers";
import {
  useAgentSpectator,
  type PublicSpectatorView,
  type PublicEventLogEntry,
} from "@/hooks/useAgentSpectator";
import type { CardDefinition } from "@/lib/convexTypes";
import {
  spectatorMonstersToBoardCards,
  spectatorSpellTrapsToCards,
} from "@/lib/spectatorAdapter";
import type { BoardCard } from "@/components/game/types";
import type { SpectatorSpellTrapCard } from "@/lib/spectatorAdapter";
import { useCardLookup } from "@/hooks/useCardLookup";
import type { StreamOverlayParams } from "@/lib/streamOverlayParams";

export type StreamChatMessage = {
  _id: string;
  role: "agent" | "viewer" | "system";
  senderName: string;
  text: string;
  source: string;
  createdAt: number;
};

export interface StreamOverlayData {
  loading: boolean;
  error: string | null;
  agentName: string | null;
  agentId: string | null;
  matchState: PublicSpectatorView | null;
  timeline: PublicEventLogEntry[];
  cardLookup: Record<string, CardDefinition>;
  chatMessages: StreamChatMessage[];
  // Pre-adapted board data
  agentMonsters: BoardCard[];
  opponentMonsters: BoardCard[];
  agentSpellTraps: SpectatorSpellTrapCard[];
  opponentSpellTraps: SpectatorSpellTrapCard[];
}

const CONVEX_SITE_URL = (import.meta.env.VITE_CONVEX_URL ?? "")
  .replace(".convex.cloud", ".convex.site");

export function useStreamOverlay(params: StreamOverlayParams): StreamOverlayData {
  const apiUrl = CONVEX_SITE_URL || null;
  const { agent, matchState, timeline, error, loading } = useAgentSpectator({
    apiKey: params.apiKey,
    apiUrl,
    hostId: params.hostId,
    matchId: params.matchId,
    seat: params.seat,
  });

  const { lookup: cardLookup, isLoaded: cardsLoaded } = useCardLookup();

  // Subscribe to stream chat messages (real-time via Convex)
  // The agent._id from useAgentSpectator is the agent doc _id, but we need the
  // userId to find the agent record's _id. The agent object has `id` which is the agent doc _id.
  const agentDocId = agent?.id ?? null;
  const rawMessages = useQuery(
    apiAny.streamChat.getRecentStreamMessages,
    agentDocId ? { agentId: agentDocId, limit: 50 } : "skip",
  ) as StreamChatMessage[] | undefined;
  const chatMessages = rawMessages ?? [];

  // Adapt spectator slots to rich board component shapes
  const agentMonsters = useMemo(
    () => matchState ? spectatorMonstersToBoardCards(matchState.fields.agent.monsters) : [],
    [matchState],
  );
  const opponentMonsters = useMemo(
    () => matchState ? spectatorMonstersToBoardCards(matchState.fields.opponent.monsters) : [],
    [matchState],
  );
  const agentSpellTraps = useMemo(
    () => matchState ? spectatorSpellTrapsToCards(matchState.fields.agent.spellTraps) : [],
    [matchState],
  );
  const opponentSpellTraps = useMemo(
    () => matchState ? spectatorSpellTrapsToCards(matchState.fields.opponent.spellTraps) : [],
    [matchState],
  );

  return {
    loading: loading || !cardsLoaded,
    error,
    agentName: agent?.name ?? null,
    agentId: agentDocId,
    matchState,
    timeline,
    cardLookup,
    chatMessages,
    agentMonsters,
    opponentMonsters,
    agentSpellTraps,
    opponentSpellTraps,
  };
}
