import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { useConvexAuth } from "convex/react";
import { apiAny, useConvexQuery } from "@/lib/convexHelpers";

// ── Types ────────────────────────────────────────────────────────

export type DialogueLine = {
  speaker: string;
  text: string;
  avatar?: string;
};

export type CutsceneEvent =
  | { type: "video"; src: string; skippable: boolean }
  | { type: "dialogue"; lines: DialogueLine[]; avatar?: string }
  | { type: "transition"; variant: "battle-start" | "victory" | "defeat" };

export type Chapter = {
  _id: string;
  title: string;
  description?: string;
  chapterNumber?: number;
  actNumber?: number;
  imageUrl?: string;
  archetype?: string;
  status?: string;
};

export type Stage = {
  _id: string;
  stageNumber: number;
  name?: string;
  title?: string;
  description: string;
  opponentName?: string;
  difficulty?: string;
  preMatchDialogue?: DialogueLine[];
  postMatchWinDialogue?: DialogueLine[];
  postMatchLoseDialogue?: DialogueLine[];
  rewardGold?: number;
  rewardXp?: number;
  firstClearBonus?: number | { gold?: number; xp?: number; gems?: number };
};

type StoryProgress = { chapterId: string; completed: boolean };
type StageProgressEntry = {
  stageId: string;
  chapterId: string;
  stageNumber: number;
  status: string;
  starsEarned: number;
  timesCompleted: number;
  firstClearClaimed: boolean;
};

type StoryContextValue = {
  // Data
  chapters: Chapter[] | undefined;
  progress: StoryProgress[] | undefined;
  stageProgress: StageProgressEntry[] | undefined;
  isLoading: boolean;

  // Progression helpers
  isChapterComplete: (chapterId: string) => boolean;
  isStageComplete: (stageId: string) => boolean;
  getStageStars: (stageId: string) => number;
  totalStars: number;

  // Cutscene queue
  queue: CutsceneEvent[];
  currentEvent: CutsceneEvent | null;
  pushEvents: (events: CutsceneEvent[]) => void;
  advanceEvent: () => void;
  skipAll: () => void;
  isPlaying: boolean;
};

// ── Context ──────────────────────────────────────────────────────

const StoryContext = createContext<StoryContextValue | null>(null);

export function useStory() {
  const ctx = useContext(StoryContext);
  if (!ctx) throw new Error("useStory must be used within StoryProvider");
  return ctx;
}

// ── Provider ─────────────────────────────────────────────────────

export function StoryProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const currentUser = useConvexQuery(
    apiAny.auth.currentUser,
    isAuthenticated ? {} : "skip",
  ) as { _id: string } | null | undefined;
  const canLoadProgress = isAuthenticated && Boolean(currentUser?._id);

  const chapters = useConvexQuery(apiAny.game.getChapters, {}) as Chapter[] | undefined;
  const progress = useConvexQuery(
    apiAny.game.getStoryProgress,
    canLoadProgress ? {} : "skip",
  ) as StoryProgress[] | undefined;
  const stageProgress = useConvexQuery(
    apiAny.game.getStageProgress,
    canLoadProgress ? {} : "skip",
  ) as StageProgressEntry[] | undefined;

  // Cutscene queue
  const [queue, setQueue] = useState<CutsceneEvent[]>([]);
  const currentEvent = queue[0] ?? null;
  const isPlaying = queue.length > 0;

  const pushEvents = useCallback((events: CutsceneEvent[]) => {
    setQueue((prev) => [...prev, ...events]);
  }, []);

  const advanceEvent = useCallback(() => {
    setQueue((prev) => prev.slice(1));
  }, []);

  const skipAll = useCallback(() => {
    setQueue([]);
  }, []);

  // Progress helpers
  const completedChapters = new Set(
    (progress ?? []).filter((p) => p.completed).map((p) => p.chapterId),
  );
  const completedStages = new Set(
    (stageProgress ?? [])
      .filter((p) => p.status === "completed" || p.status === "starred")
      .map((p) => p.stageId),
  );

  const isChapterComplete = useCallback(
    (chapterId: string) => completedChapters.has(chapterId),
    [completedChapters],
  );
  const isStageComplete = useCallback(
    (stageId: string) => completedStages.has(stageId),
    [completedStages],
  );
  const getStageStars = useCallback(
    (stageId: string) =>
      (stageProgress ?? []).find((p) => p.stageId === stageId)?.starsEarned ?? 0,
    [stageProgress],
  );
  const totalStars = (stageProgress ?? []).reduce((sum, p) => sum + p.starsEarned, 0);

  const value: StoryContextValue = {
    chapters,
    progress,
    stageProgress,
    isLoading: chapters === undefined || (isAuthenticated && !currentUser?._id),
    isChapterComplete,
    isStageComplete,
    getStageStars,
    totalStars,
    queue,
    currentEvent,
    pushEvents,
    advanceEvent,
    skipAll,
    isPlaying,
  };

  return <StoryContext.Provider value={value}>{children}</StoryContext.Provider>;
}
