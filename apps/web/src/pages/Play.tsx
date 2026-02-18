import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router";
import * as Sentry from "@sentry/react";
import { apiAny, useConvexQuery, useConvexMutation } from "@/lib/convexHelpers";
import {
  StoryProvider,
  VictoryScreen,
  DialogueBox,
  BattleTransition,
  useStory,
  type DialogueLine,
} from "@/components/story";
import { GameBoard } from "@/components/game/GameBoard";
import { type Seat } from "@/components/game/hooks/useGameState";
import { normalizeMatchId } from "@/lib/matchIds";
import { isTelegramMiniApp } from "@/hooks/auth/useTelegramAuth";
import type { MatchPlatformPresence } from "@/lib/convexTypes";
import { playerPlatformLabels } from "@/lib/platformPresence";

type MatchMeta = {
  status: string;
  hostId: string;
  awayId: string | null;
  mode: string;
  isAIOpponent?: boolean;
  winner?: string;
};

type CurrentUser = {
  _id: string;
};

type StoryCompletion = {
  outcome: "won" | "lost";
  starsEarned: number;
  rewards: { gold: number; xp: number; firstClearBonus: number };
};

type StoryContext = {
  matchId: string;
  userId: string;
  chapterId: string;
  stageNumber: number;
  stageId: string;
  outcome: string | null;
  starsEarned: number | null;
  rewardsGold: number;
  rewardsXp: number;
  firstClearBonus: number;
  opponentName: string;
  preMatchDialogue: DialogueLine[];
  postMatchWinDialogue: DialogueLine[];
  postMatchLoseDialogue: DialogueLine[];
};

type Stage = {
  stageNumber: number;
};

type StoryMatchEnd = {
  result: "win" | "loss" | "draw";
  winner?: string | null;
  playerLP: number;
  opponentLP: number;
};

type StoryLogBatch = {
  version: number;
  events: string;
  seat?: string;
  command?: string;
  createdAt?: number;
};

type ParsedEvent = {
  type?: string;
  [key: string]: unknown;
};

type JoinablePvpMatch = {
  matchId: string;
  joinable: boolean;
  status: string | null;
  mode: string | null;
  hostId: string | null;
  awayId: string | null;
  reason: string | null;
};

export function Play() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { matchId } = useParams<{ matchId: string }>();
  const activeMatchId = normalizeMatchId(matchId);
  const autojoin = searchParams.get("autojoin") === "1";
  const joinPvpLobby = useConvexMutation(apiAny.game.joinPvpLobby);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");
  const autojoinAttemptedRef = useRef(false);
  const client = isTelegramMiniApp() ? "telegram_miniapp" : "web";

  const meta = useConvexQuery(
    apiAny.game.getMatchMeta,
    activeMatchId ? { matchId: activeMatchId } : "skip",
  ) as MatchMeta | null | undefined;

  // Story context — only loads for story mode matches
  const isStory = meta?.mode === "story";
  const storyCtx = useConvexQuery(
    apiAny.game.getStoryMatchContext,
    isStory && activeMatchId ? { matchId: activeMatchId } : "skip",
  ) as StoryContext | null | undefined;

  const currentUser = useConvexQuery(
    apiAny.auth.currentUser,
    {},
  ) as CurrentUser | null | undefined;

  const playerSeat = resolvePlayerSeat(currentUser ?? null, meta, isStory);
  const joinablePvp = useConvexQuery(
    apiAny.game.getJoinablePvpMatch,
    activeMatchId ? { matchId: activeMatchId } : "skip",
  ) as JoinablePvpMatch | undefined;

  const platformPresence = useConvexQuery(
    apiAny.game.getMatchPlatformPresence,
    activeMatchId ? { matchId: activeMatchId } : "skip",
  ) as MatchPlatformPresence | null | undefined;

  const labels = useMemo(
    () => (playerSeat ? playerPlatformLabels(platformPresence ?? null, playerSeat) : null),
    [platformPresence, playerSeat],
  );

  const canJoinMatch =
    Boolean(activeMatchId) &&
    Boolean(currentUser) &&
    Boolean(meta) &&
    !playerSeat &&
    joinablePvp?.joinable === true &&
    meta?.mode === "pvp" &&
    meta?.status === "waiting";

  const joinCurrentMatch = useCallback(async () => {
    if (!activeMatchId || !canJoinMatch || joining) return;
    setJoining(true);
    setJoinError("");
    try {
      await joinPvpLobby({ matchId: activeMatchId, client });
      navigate(`/play/${activeMatchId}`);
    } catch (err: any) {
      Sentry.captureException(err);
      setJoinError(err?.message ?? "Failed to join match.");
    } finally {
      setJoining(false);
    }
  }, [activeMatchId, canJoinMatch, client, joining, joinPvpLobby, navigate]);

  useEffect(() => {
    autojoinAttemptedRef.current = false;
  }, [activeMatchId]);

  useEffect(() => {
    if (!autojoin || autojoinAttemptedRef.current || !canJoinMatch) return;
    autojoinAttemptedRef.current = true;
    void joinCurrentMatch();
  }, [autojoin, canJoinMatch, joinCurrentMatch]);

  // Loading
  if (!activeMatchId) return <CenterMessage>Invalid match ID.</CenterMessage>;
  if (meta === undefined) return <Loading />;
  if (meta === null) return <CenterMessage>Match not found.</CenterMessage>;
  if (currentUser === undefined) return <Loading />;
  if (currentUser === null) return <CenterMessage>Unable to load player.</CenterMessage>;
  if (!playerSeat && joinablePvp === undefined) return <Loading />;
  if (!playerSeat && canJoinMatch) {
    return (
      <JoinMatchGate
        matchId={activeMatchId}
        joining={joining}
        error={joinError}
        onJoin={joinCurrentMatch}
      />
    );
  }
  if (!playerSeat) return <CenterMessage>You are not a player in this match.</CenterMessage>;

  if (!isStory) {
    return (
      <GameBoard
        matchId={activeMatchId}
        seat={playerSeat}
        playerPlatformTag={labels?.playerTag}
        opponentPlatformTag={labels?.opponentTag}
      />
    );
  }

  return (
    <StoryProvider key={`story-play-${activeMatchId}`}>
      <StoryPlayFlow
        matchId={activeMatchId}
        playerSeat={playerSeat}
        meta={meta}
        storyCtx={storyCtx}
      />
      <DialogueBox />
      <BattleTransition />
    </StoryProvider>
  );
}

type StoryPlayFlowProps = {
  matchId: string;
  playerSeat: Seat;
  meta: MatchMeta;
  storyCtx: StoryContext | null | undefined;
};

function StoryPlayFlow({ matchId, playerSeat, meta, storyCtx }: StoryPlayFlowProps) {
  const navigate = useNavigate();
  const { pushEvents } = useStory();
  const completeStage = useConvexMutation(apiAny.game.completeStoryStage);
  const startBattle = useConvexMutation(apiAny.game.startStoryBattle);
  const startBattleForAgent = useConvexMutation(apiAny.game.startStoryBattleForAgent);
  const cancelStoryMatch = useConvexMutation(apiAny.game.cancelWaitingStoryMatch);
  const chapterStages = useConvexQuery(
    apiAny.game.getChapterStages,
    storyCtx?.chapterId ? { chapterId: storyCtx.chapterId } : "skip",
  ) as Stage[] | undefined;
  const [completion, setCompletion] = useState<StoryCompletion | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isStartingNext, setIsStartingNext] = useState(false);
  const [error, setError] = useState("");
  const [agentNextMatchId, setAgentNextMatchId] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState("");
  const [eventCursor, setEventCursor] = useState(0);
  const [eventLog, setEventLog] = useState<string[]>([]);
  const storyDoneRef = useRef(false);
  const dialogueQueuedRef = useRef(false);
  const preMatchQueuedRef = useRef(false);
  const eventCursorRef = useRef(0);

  const rawEvents = useConvexQuery(
    apiAny.game.getRecentEvents,
    matchId ? { matchId, sinceVersion: eventCursor } : "skip",
  ) as StoryLogBatch[] | undefined;

  const outcome = resolveStoryWon(meta?.winner, playerSeat);
  const won = completion ? completion.outcome === "won" : outcome;

  useEffect(() => {
    eventCursorRef.current = 0;
    setEventCursor(0);
    setEventLog([]);
    setCompletion(null);
    setIsCompleting(false);
    setIsStartingNext(false);
    setError("");
    setAgentNextMatchId(null);
    setCopyMessage("");
    storyDoneRef.current = false;
    dialogueQueuedRef.current = false;
    preMatchQueuedRef.current = false;
  }, [matchId]);

  useEffect(() => {
    if (!rawEvents || rawEvents.length === 0) return;

    const lines: string[] = [];
    let nextCursor = eventCursorRef.current;

    for (const batch of rawEvents) {
      if (typeof batch.version === "number") {
        nextCursor = Math.max(nextCursor, batch.version);
      }
      const actor = batch.seat ?? "system";
      const timestamp = batch.createdAt ? formatEventTime(batch.createdAt) : "tbd";
      const resolvedEvents = parseMatchEvents(batch.events);
      const commandType =
        resolvedEvents.length === 0 && batch.command
          ? safeParseCommand(batch.command)?.type ?? "command"
          : "events";
      if (resolvedEvents.length === 0) {
        lines.push(`${timestamp} ${actor} ${commandType}`);
      } else {
        for (const event of resolvedEvents) {
          lines.push(`${timestamp} ${actor} ${formatEngineEvent(event)}`);
        }
      }
    }

    if (lines.length) {
      setEventLog((prev) => [...prev, ...lines].slice(-80));
    }

    if (nextCursor > eventCursorRef.current) {
      eventCursorRef.current = nextCursor;
      setEventCursor(nextCursor);
    }
  }, [rawEvents]);

  const preMatchDialogue = useMemo<DialogueLine[]>(() => {
    if (!storyCtx?.preMatchDialogue) return [];
    return normalizeDialogueLines(storyCtx.preMatchDialogue);
  }, [storyCtx?.preMatchDialogue]);

  useEffect(() => {
    if (completion || preMatchQueuedRef.current) return;
    if (!storyCtx || !preMatchDialogue.length) return;

    pushEvents([{ type: "dialogue", lines: preMatchDialogue }]);
    preMatchQueuedRef.current = true;
  }, [completion, preMatchDialogue, storyCtx, pushEvents]);

  useEffect(() => {
    if (!completion || dialogueQueuedRef.current) return;
    if (!storyCtx) return;

    const nextLines =
      completion.outcome === "won" ? storyCtx.postMatchWinDialogue : storyCtx.postMatchLoseDialogue;
    if (Array.isArray(nextLines) && nextLines.length > 0) {
      pushEvents([{ type: "dialogue", lines: nextLines }]);
    }

    dialogueQueuedRef.current = true;
  }, [completion, storyCtx, pushEvents]);

  const nextStageNumber = useMemo(() => {
    if (!storyCtx?.chapterId || !storyCtx?.stageNumber) return null;
    if (!chapterStages || chapterStages.length === 0) return null;

    const sortedStages = [...chapterStages].sort((a, b) => a.stageNumber - b.stageNumber);
    const maxStage = sortedStages.at(-1)?.stageNumber;
    if (!maxStage) return null;

    const nextStage = storyCtx.stageNumber + 1;
    return nextStage <= maxStage ? nextStage : null;
  }, [storyCtx?.chapterId, storyCtx?.stageNumber, chapterStages]);

  const handleStartNextStage = useCallback(async () => {
    if (!storyCtx?.chapterId) {
      setError("Unable to start the next stage right now.");
      return;
    }

    if (nextStageNumber === null) {
      setError("There are no more stages available in this chapter.");
      return;
    }

    if (!chapterStages) {
      setError("Loading chapter stages to validate the next unlock.");
      return;
    }

    setIsStartingNext(true);
    setError("");

    try {
      if (meta.isAIOpponent) {
        const result = (await startBattle({
          chapterId: storyCtx.chapterId,
          stageNumber: nextStageNumber,
        }) as { matchId?: string });
        const nextMatchId = normalizeMatchId(
          typeof result?.matchId === "string" ? result.matchId : null,
        );
        if (!nextMatchId) {
          throw new Error("No match ID was returned from the next battle.");
        }

        navigate(`/play/${nextMatchId}`);
      } else {
        const result = (await startBattleForAgent({
          chapterId: storyCtx.chapterId,
          stageNumber: nextStageNumber,
        }) as { matchId?: string });
        const nextMatchId = normalizeMatchId(
          typeof result?.matchId === "string" ? result.matchId : null,
        );
        if (!nextMatchId) {
          throw new Error("No match ID was returned from the next battle.");
        }

        setAgentNextMatchId(nextMatchId);
      }
    } catch (err: any) {
      Sentry.captureException(err);
      setError(err.message ?? "Failed to start next stage.");
    } finally {
      setIsStartingNext(false);
    }
  }, [
    nextStageNumber,
    startBattle,
    startBattleForAgent,
    storyCtx,
    chapterStages,
    navigate,
    meta.isAIOpponent,
  ]);

  const handleCopyAgentMatch = useCallback(async () => {
    if (!agentNextMatchId) return;

    try {
      await navigator.clipboard.writeText(agentNextMatchId);
      setCopyMessage("Match ID copied.");
    } catch {
      setCopyMessage("Clipboard not available. Select and copy manually.");
    } finally {
      setTimeout(() => setCopyMessage(""), 2200);
    }
  }, [agentNextMatchId]);

  const handleCancelAgentMatch = useCallback(async () => {
    if (!agentNextMatchId) return;
    try {
      await cancelStoryMatch({ matchId: agentNextMatchId });
      setAgentNextMatchId(null);
      setCopyMessage("");
    } catch (err: any) {
      setError(err.message ?? "Failed to cancel match lobby.");
    }
  }, [agentNextMatchId, cancelStoryMatch]);

  const handleMatchEnd = useCallback(
    async (result: StoryMatchEnd) => {
      if (storyDoneRef.current) return;
      storyDoneRef.current = true;
      setIsCompleting(true);
      pushEvents([
        {
          type: "transition",
          variant: result.result === "win" ? "victory" : "defeat",
        },
      ]);
      try {
        const completed = (await completeStage({ matchId })) as StoryCompletion;
        setCompletion(completed);
      } catch (err: any) {
        Sentry.captureException(err);
        setCompletion({
          outcome: result.result === "win" ? "won" : "lost",
          starsEarned: result.result === "win" ? 1 : 0,
          rewards: { gold: 0, xp: 0, firstClearBonus: 0 },
        });
      } finally {
        setIsCompleting(false);
      }
    },
    [completeStage, matchId, pushEvents],
  );

  if (completion) {
    const nextStageAvailable = won ? Boolean(nextStageNumber) : false;
    return (
      <div className="relative h-screen">
        <VictoryScreen
          won={won}
          starsEarned={completion.starsEarned}
          rewards={completion.rewards}
          storyPath={storyCtx?.chapterId ? `/story/${storyCtx.chapterId}` : "/story"}
          nextStageAvailable={nextStageAvailable && !agentNextMatchId}
          onPlayDialogue={handleStartNextStage}
        />
        {agentNextMatchId && (
          <div className="mt-4 paper-panel p-4 text-xs text-[#666] mx-4 absolute left-2 right-2 top-4">
            <p className="font-bold uppercase tracking-wider text-[#121212] mb-1">
              Autonomous opponent lobby open
            </p>
            <p className="text-[11px]">Share this match ID with the ElizaOS agent:</p>
            <p className="font-mono break-all text-[#111] mt-1 mb-2">{agentNextMatchId}</p>
            <button
              type="button"
              onClick={handleCopyAgentMatch}
              className="text-[10px] font-bold uppercase tracking-wider bg-[#121212] text-[#ffcc00] px-3 py-2 rounded-sm"
            >
              Copy Match ID
            </button>
            <button
              type="button"
              onClick={handleCancelAgentMatch}
              className="text-[10px] font-bold uppercase tracking-wider bg-[#ffcc00] text-[#121212] px-3 py-2 rounded-sm ml-2"
            >
              Cancel Lobby
            </button>
            {copyMessage && <p className="mt-1 text-[#38a169] font-bold">{copyMessage}</p>}
            <p className="text-[10px] mt-2">Agent should call JOIN_LTCG_MATCH with this ID.</p>
          </div>
        )}
        {error && <p className="mt-2 text-center text-xs text-[#666]">{error}</p>}
        <StoryEventLog log={eventLog} />
      </div>
    );
  }

  if (isCompleting) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#fdfdfb] gap-2">
        <div className="w-8 h-8 border-4 border-[#121212] border-t-transparent rounded-full animate-spin" />
        <p className="text-xs uppercase tracking-wider font-bold text-[#666]">
          Resolving story stage...
        </p>
        {error && <p className="text-red-600 text-xs mt-2">{error}</p>}
        <StoryEventLog log={eventLog} />
      </div>
    );
  }

  if (isStartingNext) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#fdfdfb] gap-2">
        <div className="w-8 h-8 border-4 border-[#121212] border-t-transparent rounded-full animate-spin" />
        <p className="text-xs uppercase tracking-wider font-bold text-[#666]">
          Loading next stage...
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-screen">
      <GameBoard matchId={matchId} seat={playerSeat} onMatchEnd={handleMatchEnd} />
      <StoryEventLog log={eventLog} />
    </div>
  );
}

function StoryEventLog({ log }: { log: string[] }) {
  if (log.length === 0) return null;

  return (
    <div className="fixed right-2 left-2 md:left-4 top-2 md:top-3 max-w-xl md:max-w-2xl mx-auto">
      <div className="paper-panel border border-[#121212] p-3 max-h-32 overflow-y-auto bg-white/95 backdrop-blur">
        <p className="text-[10px] font-bold uppercase tracking-wider mb-2 text-[#121212]">
          Match Log
        </p>
        <div className="space-y-1 text-[10px] leading-tight text-[#666] font-mono">
          {log.map((line, index) => (
            <p key={`${index}-${line}`}>{line}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

function normalizeDialogueLines(dialogue: unknown): DialogueLine[] {
  if (!Array.isArray(dialogue)) return [];

  const lines: DialogueLine[] = [];
  for (const line of dialogue) {
    if (!line || typeof line !== "object") continue;

    const entry = line as Record<string, unknown>;
    const speaker = typeof entry.speaker === "string" ? entry.speaker.trim() : "";
    const text = typeof entry.text === "string" ? entry.text.trim() : "";
    if (!speaker || !text) continue;

    const avatar =
      typeof entry.avatar === "string" && entry.avatar.trim()
        ? entry.avatar
        : typeof entry.imageUrl === "string" && entry.imageUrl.trim()
          ? entry.imageUrl
          : undefined;
    lines.push({ speaker, text, avatar });
  }

  return lines;
}

function formatEventTime(createdAt: number) {
  const date = new Date(createdAt);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function parseMatchEvents(raw: string): ParsedEvent[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as ParsedEvent[];
  } catch {
    return [];
  }
}

function safeParseCommand(raw: string): ParsedEvent | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as ParsedEvent;
    }
  } catch {}
  return null;
}

function formatEngineEvent(event: ParsedEvent) {
  if (typeof event.type === "string") {
    const target = typeof event.target === "string" ? ` ${event.target}` : "";
    return `${event.type}${target}`.trim();
  }
  return "event";
}

function resolveStoryWon(winner: string | null | undefined, seat: Seat): boolean {
  if (!winner) return false;
  return winner === seat;
}

function resolvePlayerSeat(
  currentUser: CurrentUser | null,
  meta: MatchMeta | null | undefined,
  isStory: boolean,
): Seat | null {
  if (!currentUser || !meta) return null;
  if (currentUser._id === meta.hostId) return "host";
  if (currentUser._id === meta.awayId) return "away";
  if (isStory && meta.isAIOpponent && meta.awayId === "cpu") return "host";
  if (isStory && meta.isAIOpponent && meta.hostId === "cpu") return "away";
  return null;
}

function JoinMatchGate({
  matchId,
  joining,
  error,
  onJoin,
}: {
  matchId: string;
  joining: boolean;
  error: string;
  onJoin: () => Promise<void>;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fdfdfb] px-4">
      <div className="paper-panel w-full max-w-md p-6">
        <h2
          className="text-2xl font-black uppercase tracking-tight text-[#121212]"
          style={{ fontFamily: "Outfit, sans-serif" }}
        >
          Join Match
        </h2>
        <p
          className="mt-2 text-xs text-[#121212]/70"
          style={{ fontFamily: "Special Elite, cursive" }}
        >
          Waiting PvP lobby detected: <code>{matchId}</code>
        </p>
        <button
          type="button"
          className="tcg-button-primary mt-4 w-full py-2 disabled:opacity-50"
          disabled={joining}
          onClick={() => {
            void onJoin();
          }}
        >
          {joining ? "Joining..." : "Join Match"}
        </button>
        {error ? (
          <p className="mt-3 text-xs font-bold text-[#b91c1c]" style={{ fontFamily: "Outfit, sans-serif" }}>
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fdfdfb]">
      <div className="w-8 h-8 border-4 border-[#121212] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function CenterMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fdfdfb]">
      <p className="text-[#666] font-bold uppercase text-sm">{children}</p>
    </div>
  );
}
