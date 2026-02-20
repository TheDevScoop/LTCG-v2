/**
 * @lunchtable/plugin-ltcg
 *
 * ElizaOS plugin for playing LunchTable Trading Card Game battles.
 * Enables AI agents (milaidy, ClawDBot, or standalone runtimes) to play
 * story mode and quick-duel matches via the Convex HTTP API.
 *
 * Required config:
 *   LTCG_API_URL — Convex site URL (e.g. https://scintillating-mongoose-458.convex.site)
 *   LTCG_API_KEY — Agent API key from /api/agent/register (starts with ltcg_)
 *
 * Actions:
 *   START_LTCG_DUEL    — Start a quick AI-vs-human duel (no chapter)
 *   START_DUEL         — Compatibility alias for START_LTCG_DUEL
 *   START_LTCG_BATTLE  — Start a story mode battle
 *   START_BATTLE       — Compatibility alias for START_LTCG_BATTLE
 *   JOIN_LTCG_MATCH    — Join an open human-hosted match as the away seat
 *   PLAY_LTCG_TURN     — Auto-play one turn (summon, attack, end)
 *   PLAY_LTCG_STORY    — Play through a full story stage (start → loop → complete)
 *   JOIN_LTCG_MATCH    — Join a waiting match as the away seat
 *   RUN_LTCG_AUTONOMOUS — Deterministic autonomy controller (start/pause/resume/stop)
 *   CHECK_LTCG_STATUS  — Check current match state
 *   SURRENDER_LTCG     — Forfeit the current match
 *   GET_LTCG_SOUNDTRACK — Fetch soundtrack catalog for agent streaming
 *
 * Provider:
 *   ltcg-game-state — Injects board state into agent context
 *
 * Routes:
 *   GET /api/status — Plugin health and match state for monitoring
 *   GET /status — Legacy health endpoint alias for compatibility
 *   GET/POST /api/ltcg/autonomy/* — Autonomy control endpoints
 *
 * Events:
 *   ACTION_STARTED / ACTION_COMPLETED — Logs LTCG action activity
 *   WORLD_CONNECTED — Logs when agent comes online
 */

import { initClient } from "./client.js";
import { gameStateProvider } from "./provider.js";
import { startBattleAction, startBattleAliasAction } from "./actions/startBattle.js";
import { startDuelAction, startDuelAliasAction } from "./actions/startDuel.js";
import { playTurnAction } from "./actions/playTurn.js";
import { getStatusAction } from "./actions/getStatus.js";
import { surrenderAction } from "./actions/surrender.js";
import { playStoryAction } from "./actions/playStory.js";
import { joinMatchAction } from "./actions/joinMatch.js";
import { getSoundtrackAction } from "./actions/getSoundtrack.js";
import {
  runAutonomyAction,
  pauseAutonomyAction,
  resumeAutonomyAction,
  stopAutonomyAction,
  getAutonomyStatusAction,
} from "./actions/autonomy.js";
import { statusRoute, statusRouteLegacy } from "./routes/status.js";
import {
  autonomyStatusRoute,
  autonomyStartRoute,
  autonomyPauseRoute,
  autonomyResumeRoute,
  autonomyStopRoute,
} from "./routes/autonomy.js";
import { ltcgEvents } from "./events.js";
import { getEnvValue } from "./env.js";
import type { Plugin, IAgentRuntime } from "./types.js";

const plugin: Plugin = {
  name: "ltcg",
  description:
    "Play LunchTable Trading Card Game battles via the agent HTTP API",

  config: {
    LTCG_API_URL: getEnvValue("LTCG_API_URL"),
    LTCG_API_KEY: getEnvValue("LTCG_API_KEY"),
    LTCG_SOUNDTRACK_API_URL: getEnvValue("LTCG_SOUNDTRACK_API_URL"),
  },

  async init(config: Record<string, string>, _runtime: IAgentRuntime) {
    const apiUrl =
      config.LTCG_API_URL || getEnvValue("LTCG_API_URL") || "";
    const apiKey = config.LTCG_API_KEY || getEnvValue("LTCG_API_KEY") || "";

    if (!apiUrl) {
      throw new Error(
        "LTCG_API_URL is required. Set it in plugin config or environment.",
      );
    }
    if (!apiKey) {
      throw new Error(
        "LTCG_API_KEY is required. Register at /api/agent/register to get one.",
      );
    }
    if (!apiKey.startsWith("ltcg_")) {
      throw new Error(
        "LTCG_API_KEY must start with 'ltcg_'. Check your API key.",
      );
    }

    const client = initClient(apiUrl, apiKey);

    // Verify credentials
    const me = await client.getMe();
    console.log(`[LTCG] Connected as "${me.name}" (${me.apiKeyPrefix})`);

    // If the agent already has an active match, hydrate it so seat-aware actions work.
    try {
      const activeMatch = await client.getActiveMatch();
      if (activeMatch?.matchId) {
        await client.setMatchWithSeat(activeMatch.matchId);
      }
    } catch {
      // Ignore if no active match endpoint is reachable (initial startup or transient error).
    }
  },

  providers: [gameStateProvider],

  actions: [
    getAutonomyStatusAction,
    runAutonomyAction,
    pauseAutonomyAction,
    resumeAutonomyAction,
    stopAutonomyAction,
    startDuelAliasAction,
    startDuelAction,
    startBattleAliasAction,
    startBattleAction,
    joinMatchAction,
    playTurnAction,
    playStoryAction,
    getStatusAction,
    surrenderAction,
    getSoundtrackAction,
  ],

  routes: [
    statusRoute,
    statusRouteLegacy,
    autonomyStatusRoute,
    autonomyStartRoute,
    autonomyPauseRoute,
    autonomyResumeRoute,
    autonomyStopRoute,
  ],

  events: ltcgEvents,
};

export default plugin;

// Re-export for consumers
export { LTCGClient, LTCGApiError, getClient, initClient } from "./client.js";
export { gameStateProvider } from "./provider.js";
export { startDuelAction } from "./actions/startDuel.js";
export { startDuelAliasAction } from "./actions/startDuel.js";
export { startBattleAction, startBattleAliasAction } from "./actions/startBattle.js";
export { playTurnAction } from "./actions/playTurn.js";
export { joinMatchAction } from "./actions/joinMatch.js";
export { getStatusAction } from "./actions/getStatus.js";
export { surrenderAction } from "./actions/surrender.js";
export { playStoryAction } from "./actions/playStory.js";
export { getSoundtrackAction } from "./actions/getSoundtrack.js";
export {
  runAutonomyAction,
  pauseAutonomyAction,
  resumeAutonomyAction,
  stopAutonomyAction,
  getAutonomyStatusAction,
} from "./actions/autonomy.js";
export { statusRoute, statusRouteLegacy } from "./routes/status.js";
export {
  autonomyStatusRoute,
  autonomyStartRoute,
  autonomyPauseRoute,
  autonomyResumeRoute,
  autonomyStopRoute,
} from "./routes/autonomy.js";
export { ltcgEvents } from "./events.js";
export { getAutonomyController } from "./autonomy/controller.js";
export type {
  AgentInfo,
  BoardCard,
  CardInHand,
  Chapter,
  GameCommand,
  MatchStatus,
  PlayerView,
  MatchJoinResult,
  Route,
  StageCompletionResult,
  StageData,
  StarterDeck,
  StoryNextStageResponse,
  StoryProgress,
} from "./types.js";
