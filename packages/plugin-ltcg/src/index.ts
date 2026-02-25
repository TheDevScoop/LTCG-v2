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
 *   REGISTER_RETAKE_STREAM — Register agent on retake.tv for streaming
 *   START_RETAKE_STREAM  — Start a live stream session on retake.tv
 *   STOP_RETAKE_STREAM   — Stop the current retake.tv stream
 *   CHECK_RETAKE_STATUS  — Check if stream is live + viewer count
 *   GET_RTMP_CREDENTIALS — Get RTMP URL + stream key for OBS/ffmpeg
 *   SEND_RETAKE_CHAT    — Send a chat message to a retake.tv stream
 *   START_STREAM_PIPELINE — Start full video pipeline (Xvfb + Chromium + FFmpeg → RTMP)
 *   STOP_STREAM_PIPELINE  — Stop video pipeline and end stream
 *
 * Provider:
 *   ltcg-game-state — Injects board state into agent context
 *
 * Routes:
 *   GET /api/status — Plugin health and match state for monitoring
 *   GET /status — Compatibility health endpoint alias
 *   GET/POST /api/ltcg/autonomy/* — Autonomy control endpoints
 *   GET /api/retake/status — retake.tv streaming status
 *
 * Events:
 *   ACTION_STARTED / ACTION_COMPLETED — Logs LTCG action activity
 *   WORLD_CONNECTED — Logs when agent comes online
 */

import { initClient } from "./client.js";
import { initRetakeClient } from "./retake-client.js";
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
import { registerStreamAction } from "./actions/retake/registerStream.js";
import { startRetakeStreamAction } from "./actions/retake/startStream.js";
import { stopRetakeStreamAction } from "./actions/retake/stopStream.js";
import { checkRetakeStatusAction } from "./actions/retake/checkRetakeStatus.js";
import { getRtmpCredentialsAction } from "./actions/retake/getRtmpCredentials.js";
import { sendChatAction } from "./actions/retake/sendChat.js";
import { startPipelineAction } from "./actions/retake/startPipeline.js";
import { stopPipelineAction } from "./actions/retake/stopPipeline.js";
import { checkStreamDependencies } from "./stream-deps.js";
import { statusRoute, statusRouteCompat } from "./routes/status.js";
import {
  autonomyStatusRoute,
  autonomyStartRoute,
  autonomyPauseRoute,
  autonomyResumeRoute,
  autonomyStopRoute,
} from "./routes/autonomy.js";
import { retakeStatusRoute } from "./routes/retake.js";
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
    RETAKE_API_URL: getEnvValue("RETAKE_API_URL"),
    RETAKE_AGENT_TOKEN: getEnvValue("RETAKE_AGENT_TOKEN"),
    RETAKE_GAME_URL: getEnvValue("RETAKE_GAME_URL"),
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

    // retake.tv streaming (optional)
    const retakeApiUrl =
      config.RETAKE_API_URL || getEnvValue("RETAKE_API_URL") || "";
    const retakeToken =
      config.RETAKE_AGENT_TOKEN || getEnvValue("RETAKE_AGENT_TOKEN") || "";

    if (retakeApiUrl) {
      initRetakeClient(retakeApiUrl, retakeToken);
      console.log(`[LTCG] retake.tv streaming configured (${retakeApiUrl})`);

      // Check video pipeline dependencies
      const deps = await checkStreamDependencies();
      if (deps.allReady) {
        console.log("[LTCG] Streaming pipeline ready (Xvfb + Chromium + FFmpeg available)");
      } else {
        console.log(
          `[LTCG] Streaming pipeline unavailable (missing: ${deps.missing.join(", ")}). ` +
            "API-only streaming actions will still work.",
        );
      }
    } else {
      console.log("[LTCG] retake.tv streaming not configured (RETAKE_API_URL not set)");
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
    registerStreamAction,
    startRetakeStreamAction,
    stopRetakeStreamAction,
    checkRetakeStatusAction,
    getRtmpCredentialsAction,
    sendChatAction,
    startPipelineAction,
    stopPipelineAction,
  ],

  routes: [
    statusRoute,
    statusRouteCompat,
    autonomyStatusRoute,
    autonomyStartRoute,
    autonomyPauseRoute,
    autonomyResumeRoute,
    autonomyStopRoute,
    retakeStatusRoute,
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
export { statusRoute, statusRouteCompat, statusRouteLegacy } from "./routes/status.js";
export {
  autonomyStatusRoute,
  autonomyStartRoute,
  autonomyPauseRoute,
  autonomyResumeRoute,
  autonomyStopRoute,
} from "./routes/autonomy.js";
export { ltcgEvents } from "./events.js";
export { getAutonomyController } from "./autonomy/controller.js";
export { RetakeClient, initRetakeClient, getRetakeClient } from "./retake-client.js";
export { registerStreamAction } from "./actions/retake/registerStream.js";
export { startRetakeStreamAction } from "./actions/retake/startStream.js";
export { stopRetakeStreamAction } from "./actions/retake/stopStream.js";
export { checkRetakeStatusAction } from "./actions/retake/checkRetakeStatus.js";
export { getRtmpCredentialsAction } from "./actions/retake/getRtmpCredentials.js";
export { sendChatAction } from "./actions/retake/sendChat.js";
export { startPipelineAction } from "./actions/retake/startPipeline.js";
export { stopPipelineAction } from "./actions/retake/stopPipeline.js";
export { retakeStatusRoute } from "./routes/retake.js";
export { StreamPipeline, getStreamPipeline, initStreamPipeline } from "./stream-pipeline.js";
export { checkStreamDependencies, resolveChromiumBinary } from "./stream-deps.js";
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
