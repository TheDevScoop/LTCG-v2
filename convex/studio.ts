import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { LTCGCards } from "@lunchtable/cards";

const cards = new LTCGCards(components.lunchtable_tcg_cards as any);

const runStatusValidator = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("canceled"),
);

const jobStateValidator = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("canceled"),
);

async function getRunById(ctx: any, runId: string) {
  return await ctx.db
    .query("studioRuns")
    .withIndex("by_run_id", (q: any) => q.eq("runId", runId))
    .first();
}

async function getJobByRunAndId(ctx: any, runId: string, jobId: string) {
  return await ctx.db
    .query("studioRunJobs")
    .withIndex("by_run_job", (q: any) => q.eq("runId", runId).eq("jobId", jobId))
    .first();
}

async function summarizeRun(ctx: any, runId: string) {
  const jobs = await ctx.db
    .query("studioRunJobs")
    .withIndex("by_run", (q: any) => q.eq("runId", runId))
    .collect();

  const totalJobs = jobs.length;
  const completedJobs = jobs.filter((job: any) => job.state === "succeeded").length;
  const failedJobs = jobs.filter((job: any) => job.state === "failed").length;
  const canceledJobs = jobs.filter((job: any) => job.state === "canceled").length;
  const queuedJobs = jobs.filter((job: any) => job.state === "queued").length;
  const runningJobs = jobs.filter((job: any) => job.state === "running").length;

  let status: "queued" | "running" | "completed" | "failed" | "canceled" = "queued";
  if (totalJobs > 0 && canceledJobs === totalJobs) {
    status = "canceled";
  } else if (totalJobs > 0 && completedJobs === totalJobs) {
    status = "completed";
  } else if (failedJobs > 0 && queuedJobs === 0 && runningJobs === 0) {
    status = "failed";
  } else if (runningJobs > 0 || completedJobs > 0) {
    status = "running";
  }

  return {
    status,
    totalJobs,
    completedJobs,
    failedJobs,
    canceledJobs,
  };
}

async function patchRunSummary(ctx: any, runDoc: any) {
  const summary = await summarizeRun(ctx, runDoc.runId);
  await ctx.db.patch(runDoc._id, {
    ...summary,
    updatedAt: Date.now(),
  });
  return {
    ...runDoc,
    ...summary,
    updatedAt: Date.now(),
  };
}

export const createRun = mutation({
  args: {
    runId: v.string(),
    projectName: v.string(),
    jobs: v.array(v.any()),
    batchSize: v.optional(v.number()),
    stopOnBudget: v.optional(v.boolean()),
    budgetUsd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await getRunById(ctx, args.runId);
    if (existing) {
      throw new Error(`run ${args.runId} already exists`);
    }

    const createdAt = Date.now();
    const runDocId = await ctx.db.insert("studioRuns", {
      runId: args.runId,
      projectName: args.projectName,
      status: "queued",
      totalJobs: args.jobs.length,
      completedJobs: 0,
      failedJobs: 0,
      canceledJobs: 0,
      batchSize: args.batchSize ?? 50,
      stopOnBudget: args.stopOnBudget ?? false,
      budgetUsd: args.budgetUsd,
      createdAt,
      updatedAt: createdAt,
    });

    for (let index = 0; index < args.jobs.length; index += 1) {
      const input = args.jobs[index] as Record<string, unknown>;
      await ctx.db.insert("studioRunJobs", {
        runId: args.runId,
        jobId: String(input.jobId ?? `job_${index}`),
        state: "queued",
        attempt: 0,
        maxAttempts: Number(input.maxAttempts ?? 3),
        input,
        output: undefined,
        error: undefined,
        claimToken: undefined,
        claimedAt: undefined,
        startedAt: undefined,
        completedAt: undefined,
      });
    }

    return await ctx.db.get(runDocId);
  },
});

export const getRun = query({
  args: {
    runId: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await getRunById(ctx, args.runId);
    if (!run) return null;

    const jobs = await ctx.db
      .query("studioRunJobs")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();

    return {
      ...run,
      jobs,
    };
  },
});

export const listRuns = query({
  args: {
    status: v.optional(runStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 25, 200));

    if (args.status) {
      return await ctx.db
        .query("studioRuns")
        .withIndex("by_status_updated", (q) => q.eq("status", args.status!))
        .order("desc")
        .take(limit);
    }

    return await ctx.db.query("studioRuns").order("desc").take(limit);
  },
});

export const claimRunWork = mutation({
  args: {
    runId: v.string(),
    chunkSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const run = await getRunById(ctx, args.runId);
    if (!run) throw new Error("run not found");
    if (run.status === "canceled") return { jobs: [] };

    const chunkSize = Math.max(1, Math.min(args.chunkSize ?? run.batchSize ?? 50, 50));

    const queuedJobs = await ctx.db
      .query("studioRunJobs")
      .withIndex("by_run_state", (q) => q.eq("runId", args.runId).eq("state", "queued"))
      .take(chunkSize);

    const claimed = [] as Array<Record<string, unknown>>;
    const now = Date.now();

    for (const job of queuedJobs) {
      const claimToken = `claim_${crypto.randomUUID()}`;
      await ctx.db.patch(job._id, {
        state: "running",
        claimToken,
        claimedAt: now,
        startedAt: now,
      });

      claimed.push({
        jobId: job.jobId,
        attempt: job.attempt,
        input: job.input,
        claimToken,
      });
    }

    if (claimed.length > 0 && run.status !== "running") {
      await ctx.db.patch(run._id, {
        status: "running",
        updatedAt: now,
      });
    }

    return { jobs: claimed };
  },
});

export const completeJob = mutation({
  args: {
    runId: v.string(),
    jobId: v.string(),
    claimToken: v.string(),
    output: v.any(),
  },
  handler: async (ctx, args) => {
    const run = await getRunById(ctx, args.runId);
    if (!run) throw new Error("run not found");

    const job = await getJobByRunAndId(ctx, args.runId, args.jobId);
    if (!job) throw new Error("job not found");

    if (job.state === "succeeded") {
      return { ok: true, idempotent: true };
    }

    if (job.state !== "running") {
      throw new Error(`job ${args.jobId} is not running`);
    }

    if (job.claimToken !== args.claimToken) {
      throw new Error(`job ${args.jobId} claim token mismatch`);
    }

    await ctx.db.patch(job._id, {
      state: "succeeded",
      output: args.output,
      completedAt: Date.now(),
      claimToken: undefined,
      error: undefined,
    });

    await patchRunSummary(ctx, run);
    return { ok: true, idempotent: false };
  },
});

export const failJob = mutation({
  args: {
    runId: v.string(),
    jobId: v.string(),
    claimToken: v.string(),
    error: v.any(),
  },
  handler: async (ctx, args) => {
    const run = await getRunById(ctx, args.runId);
    if (!run) throw new Error("run not found");

    const job = await getJobByRunAndId(ctx, args.runId, args.jobId);
    if (!job) throw new Error("job not found");

    if (job.state === "succeeded" || job.state === "canceled") {
      return { ok: true, idempotent: true };
    }

    if (job.claimToken !== args.claimToken) {
      throw new Error(`job ${args.jobId} claim token mismatch`);
    }

    const nextAttempt = Number(job.attempt) + 1;
    const exhausted = nextAttempt >= Number(job.maxAttempts);

    await ctx.db.patch(job._id, {
      state: exhausted ? "failed" : "queued",
      attempt: nextAttempt,
      error: args.error,
      claimToken: undefined,
      completedAt: exhausted ? Date.now() : undefined,
    });

    await patchRunSummary(ctx, run);
    return { ok: true, exhausted };
  },
});

export const cancelRun = mutation({
  args: {
    runId: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await getRunById(ctx, args.runId);
    if (!run) throw new Error("run not found");

    const openJobs = await ctx.db
      .query("studioRunJobs")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();

    for (const job of openJobs) {
      if (job.state === "queued" || job.state === "running") {
        await ctx.db.patch(job._id, {
          state: "canceled",
          claimToken: undefined,
          completedAt: Date.now(),
        });
      }
    }

    await ctx.db.patch(run._id, {
      status: "canceled",
      updatedAt: Date.now(),
    });

    return await patchRunSummary(ctx, run);
  },
});

export const retryFailedJobs = mutation({
  args: {
    runId: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await getRunById(ctx, args.runId);
    if (!run) throw new Error("run not found");

    const failedJobs = await ctx.db
      .query("studioRunJobs")
      .withIndex("by_run_state", (q) => q.eq("runId", args.runId).eq("state", "failed"))
      .collect();

    for (const job of failedJobs) {
      await ctx.db.patch(job._id, {
        state: "queued",
        claimToken: undefined,
        error: undefined,
        maxAttempts: Math.max(Number(job.maxAttempts), Number(job.attempt) + 1),
      });
    }

    await ctx.db.patch(run._id, {
      status: "queued",
      updatedAt: Date.now(),
    });

    return await patchRunSummary(ctx, run);
  },
});

export const recordPromotionResult = mutation({
  args: {
    promotionId: v.string(),
    runId: v.optional(v.string()),
    tokenHash: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("validated"),
      v.literal("rejected"),
      v.literal("staged"),
      v.literal("failed"),
    ),
    report: v.any(),
    stagedCardIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("studioPromotions")
      .withIndex("by_promotion_id", (q) => q.eq("promotionId", args.promotionId))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        updatedAt: now,
      });
      return await ctx.db.get(existing._id);
    }

    const docId = await ctx.db.insert("studioPromotions", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });

    return await ctx.db.get(docId);
  },
});

export const stageBundleCards = mutation({
  args: {
    bundle: v.any(),
    promotionId: v.string(),
    runId: v.optional(v.string()),
    tokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    const cardsFromBundle = Array.isArray(args.bundle?.cards) ? args.bundle.cards : [];
    const stagedIds: string[] = [];

    for (const card of cardsFromBundle) {
      const gameplay = card?.gameplay;
      if (!gameplay || typeof gameplay !== "object") {
        continue;
      }

      const stagedId = await cards.cards.createCardDefinition(ctx, {
        name: String(gameplay.name ?? card.name ?? "Untitled Card"),
        rarity: String(gameplay.rarity ?? "common"),
        archetype: String(gameplay.archetype ?? "dropouts"),
        cardType: String(gameplay.cardType ?? "stereotype"),
        cost: Number(gameplay.cost ?? 0),
        level: typeof gameplay.level === "number" ? gameplay.level : undefined,
        attack: typeof gameplay.attack === "number" ? gameplay.attack : undefined,
        defense: typeof gameplay.defense === "number" ? gameplay.defense : undefined,
        attribute: typeof gameplay.attribute === "string" ? gameplay.attribute : undefined,
        spellType: typeof gameplay.spellType === "string" ? gameplay.spellType : undefined,
        trapType: typeof gameplay.trapType === "string" ? gameplay.trapType : undefined,
        ability: gameplay.ability,
        flavorText:
          typeof gameplay.flavorText === "string"
            ? gameplay.flavorText
            : typeof card.variables?.flavor === "string"
              ? card.variables.flavor
              : undefined,
        imageUrl:
          typeof gameplay.imageUrl === "string"
            ? gameplay.imageUrl
            : undefined,
      });

      await cards.cards.updateCardDefinition(ctx, stagedId, {
        isActive: false,
      } as any);

      stagedIds.push(stagedId);
    }

    const existingPromotion = await ctx.db
      .query("studioPromotions")
      .withIndex("by_promotion_id", (q: any) => q.eq("promotionId", args.promotionId))
      .first();

    const now = Date.now();
    const promotionPayload = {
      promotionId: args.promotionId,
      runId: args.runId,
      tokenHash: args.tokenHash,
      status: "staged" as const,
      report: {
        stagedCount: stagedIds.length,
      },
      stagedCardIds: stagedIds,
      updatedAt: now,
    };

    if (existingPromotion) {
      await ctx.db.patch(existingPromotion._id, promotionPayload);
    } else {
      await ctx.db.insert("studioPromotions", {
        ...promotionPayload,
        createdAt: now,
      });
    }

    return stagedIds;
  },
});

export const validators = {
  runStatusValidator,
  jobStateValidator,
};
