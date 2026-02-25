/**
 * Action: PLAY_LTCG_STORY
 *
 * Plays through a full story mode stage from start to finish:
 * 1. Gets the next playable story stage
 * 2. Fetches stage narrative (pre-match dialogue)
 * 3. Starts the battle
 * 4. Loops turns until game over (with CPU opponent wait)
 * 5. Completes the stage and reports rewards
 *
 * Uses shared turn logic from turnLogic.ts.
 */

import { getClient } from "../client.js";
import { playOneTurn } from "./turnLogic.js";
import { resolveLifePoints, formatDialogue, ensureDeckSelected } from "../utils.js";
import type {
  Action,
  HandlerCallback,
  MatchActive,
  IAgentRuntime,
  Memory,
  State,
  StageData,
} from "../types.js";

/** Max game loop iterations to prevent runaway matches */
const MAX_TURNS = 100;

/** Delay between polls when waiting for opponent (ms) */
const POLL_DELAY = 1500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const playStoryAction: Action = {
  name: "PLAY_LTCG_STORY",
  similes: [
    "PLAY_STORY_MODE",
    "START_STORY",
    "STORY_BATTLE",
    "PLAY_NEXT_STAGE",
  ],
  description:
    "Play through the next story mode stage — starts the battle, plays all turns automatically, and reports the result with rewards. This is the main way for agents to progress through the LunchTable story.",

  validate: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
  ) => {
    try {
      return !getClient().hasActiveMatch;
    } catch {
      return false;
    }
  },

  handler: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ) => {
    const client = getClient();
    const log: string[] = [];

    try {
      // ── 1. Ensure agent has a deck ───────────────────────────
      await ensureDeckSelected();

      // ── 2. Find next stage ───────────────────────────────────
      const nextStage = await client.getNextStoryStage();
      if (nextStage.done) {
        const text = "Story complete — no stages remaining.";
        if (callback) await callback({ text, action: "PLAY_LTCG_STORY" });
        return { success: true, data: { done: true } };
      }
      if (!nextStage.chapterId || !nextStage.stageNumber) {
        throw new Error("Next stage response missing chapterId or stageNumber.");
      }

      const targetChapterId = nextStage.chapterId;
      const targetStageNumber = nextStage.stageNumber;

      // ── 3. Get stage narrative ───────────────────────────────
      let stageData: StageData | null = null;
      try {
        stageData = await client.getStage(targetChapterId, targetStageNumber);
      } catch {
        // Stage data not available — continue without narrative
      }

      const chapterTitle = nextStage.chapterTitle?.trim() || "Unknown";
      const opponentName =
        stageData?.opponentName ?? nextStage.opponentName ?? "CPU Opponent";

      log.push(
        `Chapter "${chapterTitle}" — Stage ${targetStageNumber}: vs ${opponentName}`,
      );

      const preMatchDialogue = stageData?.narrative?.preMatchDialogue;
      if (preMatchDialogue?.length) {
        log.push(formatDialogue(preMatchDialogue));
      }

      if (callback) {
        await callback({
          text: `Starting story battle: ${log[0]}`,
          action: "PLAY_LTCG_STORY",
        });
      }

      // ── 4. Start battle ──────────────────────────────────────
      const result = await client.startBattle(
        targetChapterId,
        targetStageNumber,
      );
      const matchId = result.matchId;
      await client.setMatchWithSeat(matchId);
      const seat = (client.currentSeat ?? "host") as MatchActive["seat"];
      log.push(`Match started: ${matchId}`);

      // ── 5. Game loop — play until game over ──────────────────
      let turnCount = 0;

      for (let i = 0; i < MAX_TURNS; i++) {
        const view = await client.getView(matchId, seat);

        if (view.gameOver) break;

        if (view.currentTurnPlayer !== seat) {
          await sleep(POLL_DELAY);
          continue;
        }

        turnCount++;
        const turnActions = await playOneTurn(matchId, view, seat);
        for (const a of turnActions) log.push(a);
      }

      // ── 6. Check outcome ─────────────────────────────────────
      const finalView = await client.getView(matchId, seat);
      const { myLP, oppLP } = resolveLifePoints(finalView, seat);
      const won = myLP > oppLP;

      log.push(
        `Match ended after ${turnCount} turns — ${won ? "VICTORY" : "DEFEAT"} (LP: ${myLP} vs ${oppLP})`,
      );

      // ── 7. Complete stage ────────────────────────────────────
      try {
        const completion = await client.completeStage(matchId);
        log.push(`Stage complete! ${completion.starsEarned} stars earned.`);
        if (completion.rewards?.gold > 0) {
          log.push(
            `Rewards: ${completion.rewards?.gold ?? 0} gold, ${completion.rewards?.xp ?? 0} XP`,
          );
        }
        if (completion.rewards?.firstClearBonus > 0) {
          log.push(
            `First clear bonus: ${completion.rewards?.firstClearBonus ?? 0}!`,
          );
        }

        if (stageData) {
          const postDialogue = won
            ? stageData.narrative?.postMatchWinDialogue
            : stageData.narrative?.postMatchLoseDialogue;
          if (postDialogue?.length) {
            log.push(formatDialogue(postDialogue));
          }
        }
      } catch (err) {
        log.push(
          `Stage completion failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      client.setMatch(null);

      const summary = log.join("\n");
      if (callback)
        await callback({ text: summary, action: "PLAY_LTCG_STORY" });
      return {
        success: true,
        data: {
          won,
          turnCount,
          myLP,
          oppLP,
          chapterId: targetChapterId,
          stageNumber: targetStageNumber,
        },
      };
    } catch (err) {
      client.setMatch(null);
      const msg = err instanceof Error ? err.message : String(err);
      if (callback) await callback({ text: `Story mode failed: ${msg}` });
      return { success: false, error: msg };
    }
  },

  examples: [
    [
      { name: "{{user1}}", content: { text: "Play story mode" } },
      {
        name: "{{agent}}",
        content: {
          text: "Starting the next story battle!",
          action: "PLAY_LTCG_STORY",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Play the next stage for me" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Let me battle through the next story stage!",
          action: "PLAY_LTCG_STORY",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: { text: "Continue the card game story" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "On it — playing the next story battle now!",
          action: "PLAY_LTCG_STORY",
        },
      },
    ],
  ],
};
