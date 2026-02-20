import { LTCGStory } from "@lunchtable/story";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { internalMutation, query } from "./_generated/server";
import { requireUser } from "./auth";

const story: any = new LTCGStory(components.lunchtable_tcg_story as any);

const chapterStatusValidator = v.union(v.literal("draft"), v.literal("published"));

// ---------------------------------------------------------------------------
// Public content + progress queries
// ---------------------------------------------------------------------------

export const getChapters = query({
  args: {
    actNumber: v.optional(v.number()),
    status: v.optional(chapterStatusValidator),
  },
  handler: async (ctx, args) =>
    story.chapters.getChapters(ctx, {
      actNumber: args.actNumber,
      status: args.status,
    }),
});

export const getChapter = query({
  args: { chapterId: v.string() },
  handler: async (ctx, args) => story.chapters.getChapter(ctx, args.chapterId),
});

export const getChapterByNumber = query({
  args: {
    actNumber: v.number(),
    chapterNumber: v.number(),
  },
  handler: async (ctx, args) =>
    story.chapters.getChapterByNumber(ctx, args.actNumber, args.chapterNumber),
});

export const getStages = query({
  args: { chapterId: v.string() },
  handler: async (ctx, args) => story.stages.getStages(ctx, args.chapterId),
});

export const getStage = query({
  args: { stageId: v.string() },
  handler: async (ctx, args) => story.stages.getStage(ctx, args.stageId),
});

export const getStoryProgress = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return story.progress.getProgress(ctx, user._id);
  },
});

export const getChapterProgress = query({
  args: {
    actNumber: v.number(),
    chapterNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return story.progress.getChapterProgress(
      ctx,
      user._id,
      args.actNumber,
      args.chapterNumber,
    );
  },
});

export const getBattleAttempts = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return story.progress.getBattleAttempts(ctx, user._id, args.limit);
  },
});

export const getStageProgress = query({
  args: { stageId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return story.progress.getStageProgress(ctx, user._id, args.stageId);
  },
});

// ---------------------------------------------------------------------------
// Internal admin / seed wrappers for full component surface coverage
// ---------------------------------------------------------------------------

export const adminCreateChapter = internalMutation({
  args: { chapter: v.any() },
  handler: async (ctx, args) => story.chapters.createChapter(ctx, args.chapter),
});

export const adminUpdateChapter = internalMutation({
  args: {
    chapterId: v.string(),
    updates: v.any(),
  },
  handler: async (ctx, args) =>
    story.chapters.updateChapter(ctx, args.chapterId, args.updates),
});

export const adminCreateStage = internalMutation({
  args: { stage: v.any() },
  handler: async (ctx, args) => story.stages.createStage(ctx, args.stage),
});

export const adminUpdateStage = internalMutation({
  args: {
    stageId: v.string(),
    updates: v.any(),
  },
  handler: async (ctx, args) =>
    story.stages.updateStage(ctx, args.stageId, args.updates),
});

export const adminUpsertProgress = internalMutation({
  args: { progress: v.any() },
  handler: async (ctx, args) => story.progress.upsertProgress(ctx, args.progress),
});

export const adminRecordBattleAttempt = internalMutation({
  args: { attempt: v.any() },
  handler: async (ctx, args) =>
    story.progress.recordBattleAttempt(ctx, args.attempt),
});

export const adminUpsertStageProgress = internalMutation({
  args: { stageProgress: v.any() },
  handler: async (ctx, args) =>
    story.progress.upsertStageProgress(ctx, args.stageProgress),
});

export const seedChapters = internalMutation({
  args: { chapters: v.array(v.any()) },
  handler: async (ctx, args) => story.seeds.seedChapters(ctx, args.chapters),
});

export const seedStages = internalMutation({
  args: { stages: v.array(v.any()) },
  handler: async (ctx, args) => story.seeds.seedStages(ctx, args.stages),
});
