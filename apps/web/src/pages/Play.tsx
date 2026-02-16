import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router";
import * as Sentry from "@sentry/react";
import { apiAny, useConvexQuery, useConvexMutation } from "@/lib/convexHelpers";
import { VictoryScreen } from "@/components/story";
import { GameBoard } from "@/components/game/GameBoard";

type MatchMeta = {
  status: string;
  hostId: string;
  awayId: string;
  mode: string;
  isAIOpponent?: boolean;
  winner?: string;
};

type StoryCompletion = {
  outcome: string;
  starsEarned: number;
  rewards: { gold: number; xp: number; firstClearBonus: number };
};

export function Play() {
  const { matchId } = useParams<{ matchId: string }>();

  const meta = useConvexQuery(
    apiAny.game.getMatchMeta,
    matchId ? { matchId } : "skip",
  ) as MatchMeta | null | undefined;

  // Story context — only loads for story mode matches
  const isStory = meta?.mode === "story";
  const storyCtx = useConvexQuery(
    apiAny.game.getStoryMatchContext,
    isStory && matchId ? { matchId } : "skip",
  ) as any | null | undefined;

  const completeStage = useConvexMutation(apiAny.game.completeStoryStage);

  const [completion, setCompletion] = useState<StoryCompletion | null>(null);
  const completingRef = useRef(false);

  // Auto-complete story stage when match ends
  useEffect(() => {
    if (!isStory || !matchId || !meta?.winner || completion || completingRef.current) return;
    if (meta?.status !== "ended") return;

    completingRef.current = true;
    completeStage({ matchId })
      .then((result: StoryCompletion) => setCompletion(result))
      .catch((err: any) => {
        Sentry.captureException(err);
        // Fallback — still show result
        const won = meta?.winner === "host";
        setCompletion({
          outcome: won ? "won" : "lost",
          starsEarned: won ? 1 : 0,
          rewards: { gold: 0, xp: 0, firstClearBonus: 0 },
        });
      });
  }, [isStory, matchId, meta?.status, meta?.winner, completion, completeStage]);

  // Loading
  if (!matchId) return <CenterMessage>No match ID.</CenterMessage>;
  if (meta === undefined) return <Loading />;
  if (meta === null) return <CenterMessage>Match not found.</CenterMessage>;

  // Story mode completion screen
  if (isStory && meta.status === "ended" && completion) {
    const won = meta.winner === "host";
    return (
      <VictoryScreen
        won={won}
        starsEarned={completion.starsEarned}
        rewards={completion.rewards}
        storyPath={storyCtx?.chapterId ? `/story/${storyCtx.chapterId}` : "/story"}
      />
    );
  }

  // Active game (GameBoard handles game over for non-story matches)
  return <GameBoard matchId={matchId} />;
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
