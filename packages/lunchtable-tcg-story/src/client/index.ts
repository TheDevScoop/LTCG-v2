import type {
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";
import type { api } from "../component/_generated/api.js";

type RunQueryCtx = {
  runQuery: GenericQueryCtx<GenericDataModel>["runQuery"];
};
type RunMutationCtx = {
  runMutation: GenericMutationCtx<GenericDataModel>["runMutation"];
};

export type { RunQueryCtx, RunMutationCtx };
export type { api };

/**
 * Client for the @lunchtable-tcg/story Convex component.
 *
 * Usage:
 * ```ts
 * import { components } from "@convex/_generated/api";
 * import { LTCGStory } from "@lunchtable-tcg/story";
 *
 * const story = new LTCGStory(components.ltcgStory);
 *
 * export const myQuery = query({
 *   handler: async (ctx) => {
 *     await story.chapters.getChapters(ctx, {});
 *   }
 * });
 * ```
 */
export class LTCGStory {
  public chapters: ChaptersClient;
  public stages: StagesClient;
  public progress: ProgressClient;
  public seeds: SeedsClient;

  constructor(component: typeof api) {
    this.chapters = new ChaptersClient(component);
    this.stages = new StagesClient(component);
    this.progress = new ProgressClient(component);
    this.seeds = new SeedsClient(component);
  }
}

// ============================================================================
// CHAPTERS CLIENT
// ============================================================================

export class ChaptersClient {
  constructor(private component: typeof api) {}

  async getChapters(
    ctx: RunQueryCtx,
    args?: {
      actNumber?: number;
      status?: "draft" | "published";
    }
  ) {
    return await ctx.runQuery(this.component.chapters.getChapters, {
      actNumber: args?.actNumber,
      status: args?.status as any,
    });
  }

  async getChapter(ctx: RunQueryCtx, chapterId: string) {
    return await ctx.runQuery(this.component.chapters.getChapter, {
      chapterId: chapterId as any,
    });
  }

  async getChapterByNumber(
    ctx: RunQueryCtx,
    actNumber: number,
    chapterNumber: number
  ) {
    return await ctx.runQuery(this.component.chapters.getChapterByNumber, {
      actNumber,
      chapterNumber,
    });
  }

  async createChapter(ctx: RunMutationCtx, chapter: any) {
    return await ctx.runMutation(this.component.chapters.createChapter, chapter);
  }

  async updateChapter(ctx: RunMutationCtx, chapterId: string, updates: any) {
    return await ctx.runMutation(this.component.chapters.updateChapter, {
      chapterId: chapterId as any,
      updates,
    });
  }
}

// ============================================================================
// STAGES CLIENT
// ============================================================================

export class StagesClient {
  constructor(private component: typeof api) {}

  async getStages(ctx: RunQueryCtx, chapterId: string) {
    return await ctx.runQuery(this.component.stages.getStages, {
      chapterId: chapterId as any,
    });
  }

  async getStage(ctx: RunQueryCtx, stageId: string) {
    return await ctx.runQuery(this.component.stages.getStage, {
      stageId: stageId as any,
    });
  }

  async createStage(ctx: RunMutationCtx, stage: any) {
    return await ctx.runMutation(this.component.stages.createStage, stage as any);
  }

  async updateStage(ctx: RunMutationCtx, stageId: string, updates: any) {
    return await ctx.runMutation(this.component.stages.updateStage, {
      stageId: stageId as any,
      updates,
    });
  }
}

// ============================================================================
// PROGRESS CLIENT
// ============================================================================

export class ProgressClient {
  constructor(private component: typeof api) {}

  async getProgress(ctx: RunQueryCtx, userId: string) {
    return await ctx.runQuery(this.component.progress.getProgress, { userId });
  }

  async getChapterProgress(
    ctx: RunQueryCtx,
    userId: string,
    actNumber: number,
    chapterNumber: number
  ) {
    return await ctx.runQuery(this.component.progress.getChapterProgress, {
      userId,
      actNumber,
      chapterNumber,
    });
  }

  async upsertProgress(
    ctx: RunMutationCtx,
    args: {
      userId: string;
      actNumber: number;
      chapterNumber: number;
      difficulty: "normal" | "hard" | "legendary";
      status: "locked" | "available" | "in_progress" | "completed";
      starsEarned: number;
      bestScore?: number;
      timesAttempted: number;
      timesCompleted: number;
      firstCompletedAt?: number;
      lastAttemptedAt?: number;
    }
  ) {
    return await ctx.runMutation(this.component.progress.upsertProgress, {
      ...args,
      difficulty: args.difficulty as any,
      status: args.status as any,
    });
  }

  async recordBattleAttempt(
    ctx: RunMutationCtx,
    args: {
      userId: string;
      progressId: string;
      actNumber: number;
      chapterNumber: number;
      difficulty: "normal" | "hard" | "legendary";
      outcome: "won" | "lost" | "abandoned";
      starsEarned: number;
      finalLP: number;
      rewardsEarned: {
        gold: number;
        xp: number;
        cards?: string[];
      };
    }
  ) {
    return await ctx.runMutation(this.component.progress.recordBattleAttempt, {
      ...args,
      progressId: args.progressId as any,
      difficulty: args.difficulty as any,
      outcome: args.outcome as any,
    });
  }

  async getBattleAttempts(ctx: RunQueryCtx, userId: string, limit?: number) {
    return await ctx.runQuery(this.component.progress.getBattleAttempts, {
      userId,
      limit,
    });
  }

  async getStageProgress(ctx: RunQueryCtx, userId: string, stageId?: string) {
    return await ctx.runQuery(this.component.progress.getStageProgress, {
      userId,
      stageId: stageId as any,
    });
  }

  async upsertStageProgress(
    ctx: RunMutationCtx,
    args: {
      userId: string;
      stageId: string;
      chapterId: string;
      stageNumber: number;
      status: "locked" | "available" | "completed" | "starred";
      starsEarned: number;
      bestScore?: number;
      timesCompleted: number;
      firstClearClaimed: boolean;
      lastCompletedAt?: number;
    }
  ) {
    return await ctx.runMutation(this.component.progress.upsertStageProgress, {
      ...args,
      stageId: args.stageId as any,
      chapterId: args.chapterId as any,
      status: args.status as any,
    });
  }
}

// ============================================================================
// SEEDS CLIENT
// ============================================================================

export class SeedsClient {
  constructor(private component: typeof api) {}

  async seedChapters(ctx: RunMutationCtx, chapters: any[]) {
    return await ctx.runMutation(this.component.seeds.seedChapters, {
      chapters,
    });
  }

  async seedStages(ctx: RunMutationCtx, stages: any[]) {
    return await ctx.runMutation(this.component.seeds.seedStages, {
      stages,
    });
  }
}
