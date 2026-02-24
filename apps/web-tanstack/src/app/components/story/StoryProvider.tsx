import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";
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
  unlockRequirements?: {
    previousChapter?: boolean;
    minimumLevel?: number;
    requiredChapterId?: string;
  };
  requiredChapterId?: string;
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

type StoryProgress = {
  chapterId?: string;
  actNumber?: number;
  chapterNumber?: number;
  status?: string;
  timesCompleted?: number;
  starsEarned?: number;
};
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
  isChapterUnlocked: (chapterId: string) => boolean;
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
  const chapterById = useMemo(() => {
    const map = new Map<string, string>();
    (chapters ?? []).forEach((chapter) => {
      if (chapter.actNumber !== undefined && chapter.chapterNumber !== undefined) {
        map.set(`${chapter.actNumber}-${chapter.chapterNumber}`, chapter._id);
      }
    });
    return map;
  }, [chapters]);

  const chapterMetaById = useMemo(() => {
    const map = new Map<string, { actNumber?: number; chapterNumber?: number }>();
    for (const chapter of chapters ?? []) {
      map.set(chapter._id, {
        actNumber: chapter.actNumber,
        chapterNumber: chapter.chapterNumber,
      });
    }
    return map;
  }, [chapters]);

  const sortedChapters = useMemo(() => {
    return [...(chapters ?? [])].sort((a, b) => {
      const actDelta = (a.actNumber ?? 0) - (b.actNumber ?? 0);
      if (actDelta !== 0) return actDelta;
      return (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0);
    });
  }, [chapters]);

  const completedChapters = useMemo(() => {
    const set = new Set<string>();
    for (const p of progress ?? []) {
      if (p.status !== "completed" && p.status !== "starred") continue;
      if (p.chapterId) {
        set.add(p.chapterId);
        continue;
      }

      const chapterId = chapterById.get(`${p.actNumber ?? ""}-${p.chapterNumber ?? ""}`);
      if (chapterId) {
        set.add(chapterId);
      }
    }
    return set;
  }, [chapterById, progress]);

  const storyLevel = useMemo(() => {
    let maxCompletedAct = 0;
    for (const entry of progress ?? []) {
      if (!entry) continue;
      if (entry.status !== "completed" && entry.status !== "starred") continue;

      const chapterMeta = entry.chapterId ? chapterMetaById.get(entry.chapterId) : null;
      const actNumber =
        chapterMeta?.actNumber ??
        (entry.actNumber !== undefined ? Number(entry.actNumber) : NaN);
      if (Number.isFinite(actNumber) && actNumber > maxCompletedAct) {
        maxCompletedAct = actNumber;
      }
    }
    return Math.max(1, maxCompletedAct + 1);
  }, [chapterMetaById, progress]);

  const completedStages = new Set(
    (stageProgress ?? [])
      .filter((p) => p.status === "completed" || p.status === "starred")
      .map((p) => p.stageId),
  );

  const isChapterComplete = useCallback(
    (chapterId: string) => completedChapters.has(chapterId),
    [completedChapters],
  );
  const isChapterUnlocked = useCallback(
    (chapterId: string) => {
      const chapter = sortedChapters.find((item) => item._id === chapterId);
      if (!chapter) return false;
      const requirements = chapter.unlockRequirements ?? {};

      if (typeof requirements.minimumLevel === "number") {
        if (storyLevel < requirements.minimumLevel) return false;
      }

      const hasPreviousChapterRequirement = Boolean(requirements.previousChapter);
      const hasExplicitRequiredChapter =
        typeof requirements.requiredChapterId === "string";

      if (!hasPreviousChapterRequirement && !hasExplicitRequiredChapter) return true;

      const chapterIndex = sortedChapters.findIndex((item) => item._id === chapterId);
      const requiredChapterId = hasExplicitRequiredChapter
        ? requirements.requiredChapterId?.trim?.()
        : hasPreviousChapterRequirement && chapterIndex > 0
          ? sortedChapters[chapterIndex - 1]?._id
          : "";

      if (!requiredChapterId) return false;
      return isChapterComplete(requiredChapterId);
    },
    [isChapterComplete, sortedChapters, storyLevel],
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
    isChapterUnlocked,
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
