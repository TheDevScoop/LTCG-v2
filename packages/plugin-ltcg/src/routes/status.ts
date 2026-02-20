/**
 * Route: GET /api/status and GET /status
 *
 * Health/status endpoint for monitoring the LTCG plugin.
 * Exposed by ElizaOS at the plugin API path, and mirrored at /status
 * for common host runtimes.
 *
 * Returns:
 * - plugin name and version
 * - connection status to the LTCG API
 * - current match state (if any)
 * - agent info
 */

import { getClient } from "../client.js";
import { getEnvValue } from "../env.js";
import { resolveLifePoints } from "../utils.js";
import type { Route, RouteRequest, RouteResponse, IAgentRuntime } from "../types.js";
import type { MatchActive } from "../types.js";

const buildStatusHandler = async (
  _req: RouteRequest,
  res: RouteResponse,
  runtime: IAgentRuntime,
) => {
  try {
    const client = getClient();
    const matchId = client.currentMatchId;
    const soundtrackEndpoint =
      runtime.getSetting("LTCG_SOUNDTRACK_API_URL") ||
      getEnvValue("LTCG_SOUNDTRACK_API_URL") ||
      null;

    // Build status payload
    const status: Record<string, unknown> = {
      plugin: "ltcg",
      status: "ok",
      connected: true,
      hasActiveMatch: client.hasActiveMatch,
      matchId: matchId ?? null,
      seat: client.currentSeat ?? null,
      timestamp: Date.now(),
      soundtrack: {
        configured: Boolean(soundtrackEndpoint),
        endpoint: soundtrackEndpoint,
      },
    };

    // If there's an active match, include its state
    if (matchId) {
      try {
        if (!client.currentSeat) {
          try {
            await client.syncSeatFromMatch(matchId);
          } catch {}
        }

        const seat = (client.currentSeat ?? "host") as MatchActive["seat"];
        status.seat = seat;
        const view = await client.getView(matchId, seat);
        const { myLP, oppLP } = resolveLifePoints(view, seat);
        status.match = {
          phase: view.phase,
          gameOver: view.gameOver,
          isMyTurn: view.currentTurnPlayer === seat,
          myLP,
          oppLP,
          handSize: view.hand.length,
        };
      } catch {
        status.match = { error: "Unable to fetch match state" };
      }
    }

    // Get agent info
    try {
      const me = await client.getMe();
      status.agent = {
        name: me.name,
        id: me.id,
        apiKeyPrefix: me.apiKeyPrefix,
      };
    } catch {
      status.agent = null;
    }

    res.status(200).json(status);
  } catch {
    // Client not initialized
    res.status(503).json({
      plugin: "ltcg",
      status: "disconnected",
      connected: false,
      hasActiveMatch: false,
      matchId: null,
      timestamp: Date.now(),
    });
  }
};

export const statusRoute: Route = {
  type: "GET",
  path: "/api/status",
  public: true,
  name: "ltcg-status",
  handler: buildStatusHandler,
};

export const statusRouteLegacy: Route = {
  type: "GET",
  path: "/status",
  public: true,
  name: "ltcg-status-legacy",
  handler: buildStatusHandler,
};

