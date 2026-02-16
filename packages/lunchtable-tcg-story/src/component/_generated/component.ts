/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    chapters: {
      createChapter: FunctionReference<
        "mutation",
        "internal",
        {
          actNumber?: number;
          aiDifficulty?:
            | "easy"
            | "medium"
            | "hard"
            | "boss"
            | { hard: number; legendary: number; normal: number };
          aiOpponentDeckCode?: string;
          archetype?: string;
          archetypeImageUrl?: string;
          baseRewards?: { gems?: number; gold: number; xp: number };
          battleCount?: number;
          chapterNumber?: number;
          description: string;
          imageUrl?: string;
          isActive?: boolean;
          loreText?: string;
          number?: number;
          status?: "draft" | "published";
          storyText?: string;
          title: string;
          unlockCondition?: {
            requiredChapterId?: string;
            requiredLevel?: number;
            type: "chapter_complete" | "player_level" | "none";
          };
          unlockRequirements?: {
            minimumLevel?: number;
            previousChapter?: boolean;
          };
        },
        string,
        Name
      >;
      getChapter: FunctionReference<
        "query",
        "internal",
        { chapterId: string },
        any,
        Name
      >;
      getChapterByNumber: FunctionReference<
        "query",
        "internal",
        { actNumber: number; chapterNumber: number },
        any,
        Name
      >;
      getChapters: FunctionReference<
        "query",
        "internal",
        { actNumber?: number; status?: "draft" | "published" },
        any,
        Name
      >;
      updateChapter: FunctionReference<
        "mutation",
        "internal",
        { chapterId: string; updates: any },
        null,
        Name
      >;
    };
    progress: {
      getBattleAttempts: FunctionReference<
        "query",
        "internal",
        { limit?: number; userId: string },
        any,
        Name
      >;
      getChapterProgress: FunctionReference<
        "query",
        "internal",
        { actNumber: number; chapterNumber: number; userId: string },
        any,
        Name
      >;
      getProgress: FunctionReference<
        "query",
        "internal",
        { userId: string },
        any,
        Name
      >;
      getStageProgress: FunctionReference<
        "query",
        "internal",
        { stageId?: string; userId: string },
        any,
        Name
      >;
      recordBattleAttempt: FunctionReference<
        "mutation",
        "internal",
        {
          actNumber: number;
          chapterNumber: number;
          difficulty: "normal" | "hard" | "legendary";
          finalLP: number;
          outcome: "won" | "lost" | "abandoned";
          progressId: string;
          rewardsEarned: { cards?: Array<string>; gold: number; xp: number };
          starsEarned: number;
          userId: string;
        },
        string,
        Name
      >;
      upsertProgress: FunctionReference<
        "mutation",
        "internal",
        {
          actNumber: number;
          bestScore?: number;
          chapterNumber: number;
          difficulty: "normal" | "hard" | "legendary";
          firstCompletedAt?: number;
          lastAttemptedAt?: number;
          starsEarned: number;
          status: "locked" | "available" | "in_progress" | "completed";
          timesAttempted: number;
          timesCompleted: number;
          userId: string;
        },
        string,
        Name
      >;
      upsertStageProgress: FunctionReference<
        "mutation",
        "internal",
        {
          bestScore?: number;
          chapterId: string;
          firstClearClaimed: boolean;
          lastCompletedAt?: number;
          stageId: string;
          stageNumber: number;
          starsEarned: number;
          status: "locked" | "available" | "completed" | "starred";
          timesCompleted: number;
          userId: string;
        },
        string,
        Name
      >;
    };
    seeds: {
      seedChapters: FunctionReference<
        "mutation",
        "internal",
        { chapters: Array<any> },
        number,
        Name
      >;
      seedStages: FunctionReference<
        "mutation",
        "internal",
        { stages: Array<any> },
        number,
        Name
      >;
    };
    stages: {
      createStage: FunctionReference<
        "mutation",
        "internal",
        {
          aiDifficulty?: "easy" | "medium" | "hard" | "boss";
          cardRewardId?: string;
          chapterId: string;
          description: string;
          difficulty?: "easy" | "medium" | "hard" | "boss";
          firstClearBonus?:
            | { gems?: number; gold?: number; xp?: number }
            | number;
          firstClearGems?: number;
          firstClearGold?: number;
          name?: string;
          opponentDeckArchetype?: string;
          opponentDeckId?: string;
          opponentName?: string;
          postMatchLoseDialogue?: Array<{ speaker: string; text: string }>;
          postMatchWinDialogue?: Array<{ speaker: string; text: string }>;
          preMatchDialogue?: Array<{
            imageUrl?: string;
            speaker: string;
            text: string;
          }>;
          repeatGold?: number;
          rewardGold?: number;
          rewardXp?: number;
          stageNumber: number;
          status?: "draft" | "published";
          title?: string;
        },
        string,
        Name
      >;
      getStage: FunctionReference<
        "query",
        "internal",
        { stageId: string },
        any,
        Name
      >;
      getStages: FunctionReference<
        "query",
        "internal",
        { chapterId: string },
        any,
        Name
      >;
      updateStage: FunctionReference<
        "mutation",
        "internal",
        { stageId: string; updates: any },
        null,
        Name
      >;
    };
  };
