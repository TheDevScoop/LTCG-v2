import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router";
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
import { postToHost } from "@/lib/iframe";
import { useMatchPresence } from "@/hooks/useMatchPresence";
import { BrandedLoader } from "@/components/layout/BrandedLoader";

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


export function Play() {
  const { matchId } = useParams<{ matchId: string }>();
  const activeMatchId = normalizeMatchId(matchId);
  const matchStartedNotifiedRef = useRef<string | null>(null);
  const matchEndedNotifiedRef = useRef<string | null>(null);

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
  const endResult = resolveMatchResult(meta, playerSeat);

  // Send presence heartbeats so the PvP disconnect timer knows we're connected
  useMatchPresence(activeMatchId);

  useEffect(() => {
    if (!activeMatchId || !meta) return;
    if (meta.status !== "active" && meta.status !== "ended") return;
    if (matchStartedNotifiedRef.current === activeMatchId) return;

    postToHost({ type: "MATCH_STARTED", matchId: activeMatchId });
    matchStartedNotifiedRef.current = activeMatchId;
  }, [activeMatchId, meta]);

  useEffect(() => {
    if (!activeMatchId || !meta) return;
    if (meta.status !== "ended") return;
    if (matchEndedNotifiedRef.current === activeMatchId) return;

    postToHost({
      type: "MATCH_ENDED",
      matchId: activeMatchId,
      result: endResult,
    });
    matchEndedNotifiedRef.current = activeMatchId;
  }, [activeMatchId, meta, endResult]);

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
  const openStoryLobby = useConvexQuery(
    apiAny.game.getMyOpenStoryLobby,
    storyCtx?.chapterId ? {} : "skip",
  ) as { matchId: string; chapterId: string; stageNumber: number } | null | undefined;
  const [completion, setCompletion] = useState<StoryCompletion | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isStartingNext, setIsStartingNext] = useState(false);
  const [error, setError] = useState("");
  const [agentNextMatchId, setAgentNextMatchId] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState("");
  const storyDoneRef = useRef(false);
  const dialogueQueuedRef = useRef(false);
  const preMatchQueuedRef = useRef(false);

  const outcome = resolveStoryWon(meta?.winner, playerSeat);
  const won = completion ? completion.outcome === "won" : outcome;

  useEffect(() => {
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
      if (isCpuStoryMatch(meta)) {
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
    meta,
  ]);

  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!openStoryLobby || !storyCtx?.chapterId || nextStageNumber === null) return;
    if (openStoryLobby.chapterId !== storyCtx.chapterId) return;
    if (openStoryLobby.stageNumber !== nextStageNumber) return;
    setAgentNextMatchId((previous) => previous ?? openStoryLobby.matchId);
  }, [openStoryLobby, storyCtx?.chapterId, nextStageNumber]);

  const handleCopyAgentMatch = useCallback(async () => {
    if (!agentNextMatchId) return;

    try {
      await navigator.clipboard.writeText(agentNextMatchId);
      setCopyMessage("Match ID copied.");
    } catch {
      setCopyMessage("Clipboard not available. Select and copy manually.");
    } finally {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        setCopyMessage("");
        copyTimerRef.current = null;
      }, 2200);
    }
  }, [agentNextMatchId]);

  const handleCancelAgentMatch = useCallback(async () => {
    if (!agentNextMatchId) return;
    const pendingMatchId = agentNextMatchId;
    setAgentNextMatchId(null);
    setCopyMessage("");
    try {
      await cancelStoryMatch({ matchId: pendingMatchId });
    } catch (err: any) {
      setAgentNextMatchId(pendingMatchId);
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
      <div className="relative h-dvh">
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
      </div>
    );
  }

  if (isCompleting) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center bg-[#fdfdfb] gap-2">
        <div className="w-8 h-8 border-4 border-[#121212] border-t-transparent rounded-full animate-spin" />
        <p className="text-xs uppercase tracking-wider font-bold text-[#666]">
          Resolving story stage...
        </p>
        {error && <p className="text-red-600 text-xs mt-2">{error}</p>}
      </div>
    );
  }

  if (isStartingNext) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center bg-[#fdfdfb] gap-2">
        <div className="w-8 h-8 border-4 border-[#121212] border-t-transparent rounded-full animate-spin" />
        <p className="text-xs uppercase tracking-wider font-bold text-[#666]">
          Loading next stage...
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-dvh">
      <GameBoard matchId={matchId} seat={playerSeat} onMatchEnd={handleMatchEnd} />
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

function resolveStoryWon(winner: string | null | undefined, seat: Seat): boolean {
  if (!winner) return false;
  return winner === seat;
}

function resolveMatchResult(
  meta: MatchMeta | null | undefined,
  playerSeat: Seat | null,
): "win" | "loss" | "draw" {
  if (!meta?.winner || !playerSeat) return "draw";
  return meta.winner === playerSeat ? "win" : "loss";
}

function resolvePlayerSeat(
  currentUser: CurrentUser | null,
  meta: MatchMeta | null | undefined,
  isStory: boolean,
): Seat | null {
  if (!currentUser || !meta) return null;
  if (currentUser._id === meta.hostId) return "host";
  if (currentUser._id === meta.awayId) return "away";
  if (isStory && meta.awayId === "cpu") return "host";
  if (isStory && meta.hostId === "cpu") return "away";
  return null;
}

function isCpuStoryMatch(meta: MatchMeta | null | undefined): boolean {
  if (!meta || meta.mode !== "story") return false;
  if (meta.isAIOpponent) return true;
  return meta.hostId === "cpu" || meta.awayId === "cpu";
}

// ── Helpers ──────────────────────────────────────────────────────

function Loading() {
  return <BrandedLoader variant="light" message="Loading match..." />;
}

function CenterMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fdfdfb]">
      <p className="text-[#666] font-bold uppercase text-sm">{children}</p>
    </div>
  );
}
