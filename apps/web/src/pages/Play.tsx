import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router";
import * as Sentry from "@sentry/react";
import { apiAny, useConvexQuery, useConvexMutation } from "@/lib/convexHelpers";
import {
  StoryProvider,
  VictoryScreen,
  DialogueBox,
  BattleTransition,
  useStory,
} from "@/components/story";
import { GameBoard } from "@/components/game/GameBoard";
import { type Seat } from "@/components/game/hooks/useGameState";
import { normalizeMatchId } from "@/lib/matchIds";

type MatchMeta = {
  status: string;
  hostId: string;
  awayId: string;
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
  postMatchWinDialogue: string[];
  postMatchLoseDialogue: string[];
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

export function Play() {
  const { matchId } = useParams<{ matchId: string }>();
  const activeMatchId = normalizeMatchId(matchId);

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

  // Loading
  if (!activeMatchId) return <CenterMessage>Invalid match ID.</CenterMessage>;
  if (meta === undefined) return <Loading />;
  if (meta === null) return <CenterMessage>Match not found.</CenterMessage>;
  if (currentUser === undefined) return <Loading />;
  if (currentUser === null) return <CenterMessage>Unable to load player.</CenterMessage>;
  if (!playerSeat) return <CenterMessage>You are not a player in this match.</CenterMessage>;

  if (!isStory) {
    return <GameBoard matchId={activeMatchId} seat={playerSeat} />;
  }

  return (
    <StoryProvider>
      <StoryPlayFlow matchId={activeMatchId} playerSeat={playerSeat} meta={meta} storyCtx={storyCtx} />
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
  const { pushEvents } = useStory();
  const completeStage = useConvexMutation(apiAny.game.completeStoryStage);
  const [completion, setCompletion] = useState<StoryCompletion | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [eventCursor, setEventCursor] = useState(0);
  const [eventLog, setEventLog] = useState<string[]>([]);
  const storyDoneRef = useRef(false);
  const dialogueQueuedRef = useRef(false);
  const eventCursorRef = useRef(0);

  const rawEvents = useConvexQuery(
    apiAny.game.getRecentEvents,
    matchId ? { matchId, sinceVersion: eventCursor } : "skip",
  ) as StoryLogBatch[] | undefined;

  const outcome = resolveStoryWon(meta?.winner, playerSeat);
  const won = completion ? completion.outcome === "won" : outcome;

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
    return (
      <div className="relative h-screen">
        <VictoryScreen
          won={won}
          starsEarned={completion.starsEarned}
          rewards={completion.rewards}
          storyPath={storyCtx?.chapterId ? `/story/${storyCtx.chapterId}` : "/story"}
        />
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
        <StoryEventLog log={eventLog} />
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
    <div className="fixed right-2 left-2 md:left-4 top-2 md:top-3 max-w-xl md:max-w-2xl mx-auto pointer-events-none">
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
