import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

// CORS configuration
const ALLOWED_HEADERS = ["Content-Type", "Authorization"];

/**
 * Wrap a handler with CORS headers
 */
function corsHandler(
  handler: (ctx: any, request: Request) => Promise<Response>
): (ctx: any, request: Request) => Promise<Response> {
  return async (ctx, request) => {
    // Handle preflight OPTIONS request
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": ALLOWED_HEADERS.join(", "),
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // Call actual handler
    const response = await handler(ctx, request);
    
    // Add CORS headers to response
    const newHeaders = new Headers(response.headers);
    newHeaders.set("Access-Control-Allow-Origin", "*");
    newHeaders.set("Access-Control-Allow-Headers", ALLOWED_HEADERS.join(", "));
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  };
}

/**
 * Register a route with CORS support (includes OPTIONS preflight)
 */
function corsRoute({
  path,
  method,
  handler,
}: {
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  handler: (ctx: any, request: Request) => Promise<Response>;
}) {
  // Register the actual method
  http.route({
    path,
    method,
    handler: httpAction(corsHandler(handler)),
  });
  // Register OPTIONS preflight for the same path
  if (!registeredOptions.has(path)) {
    registeredOptions.add(path);
    http.route({
      path,
      method: "OPTIONS",
      handler: httpAction(corsHandler(async () => new Response(null, { status: 204 }))),
    });
  }
}

const registeredOptions = new Set<string>();

// ── Agent Auth Middleware ─────────────────────────────────────────

async function authenticateAgent(
  ctx: { runQuery: any },
  request: Request,
) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const apiKey = authHeader.slice(7);
  if (!apiKey.startsWith("ltcg_")) {
    return null;
  }

  // Hash the key and look up
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const apiKeyHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  const agent = await ctx.runQuery(api.agentAuth.getAgentByKeyHash, { apiKeyHash });
  if (!agent || !agent.isActive) return null;

  return agent;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

type MatchSeat = "host" | "away";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function parseLegacyResponseType(
  responseType: unknown,
): boolean | undefined {
  if (typeof responseType === "boolean") return responseType;
  if (typeof responseType !== "string") return undefined;

  const normalized = responseType.toLowerCase().trim();
  if (normalized === "pass") return true;
  if (normalized === "play" || normalized === "continue" || normalized === "no") {
    return false;
  }

  return undefined;
}

function normalizeGameCommand(rawCommand: unknown): unknown {
  if (!isPlainObject(rawCommand)) {
    return rawCommand;
  }

  const command = { ...rawCommand };

  const legacyToCanonical: Record<string, string> = {
    cardInstanceId: "cardId",
    attackerInstanceId: "attackerId",
    targetInstanceId: "targetId",
    newPosition: "position",
  };

  for (const [legacyKey, canonicalKey] of Object.entries(legacyToCanonical)) {
    if (legacyKey in command && !(canonicalKey in command)) {
      command[canonicalKey] = command[legacyKey];
    }
    if (legacyKey in command) {
      delete command[legacyKey];
    }
  }

  if (
    command.type === "CHAIN_RESPONSE" &&
    !("pass" in command) &&
    "responseType" in command
  ) {
    const parsedPass = parseLegacyResponseType(command.responseType);
    if (parsedPass !== undefined) {
      command.pass = parsedPass;
      delete command.responseType;
    }
  }

  return command;
}

async function resolveMatchAndSeat(
  ctx: { runQuery: any },
  agentUserId: string,
  matchId: string,
  requestedSeat?: string,
) {
  const meta = await ctx.runQuery(api.game.getMatchMeta, {
    matchId,
    actorUserId: agentUserId as any,
  });
  if (!meta) {
    throw new Error("Match not found");
  }

  const hostId = (meta as any).hostId;
  const awayId = (meta as any).awayId;

  if (requestedSeat !== undefined && requestedSeat !== "host" && requestedSeat !== "away") {
    throw new Error("seat must be 'host' or 'away'.");
  }

  const seat = requestedSeat as MatchSeat | undefined;

  if (seat === "host") {
    if (hostId !== agentUserId) {
      throw new Error("You are not the host in this match.");
    }
    return { meta, seat: "host" as MatchSeat };
  }

  if (seat === "away") {
    if (awayId !== agentUserId) {
      throw new Error("You are not the away player in this match.");
    }
    return { meta, seat: "away" as MatchSeat };
  }

  if (hostId === agentUserId) {
    return { meta, seat: "host" as MatchSeat };
  }
  if (awayId === agentUserId) {
    return { meta, seat: "away" as MatchSeat };
  }

  throw new Error("You are not a participant in this match.");
}

// ── Routes ───────────────────────────────────────────────────────

corsRoute({
  path: "/api/agent/register",
  method: "POST",
  handler: async (ctx, request) => {
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || name.length < 1 || name.length > 50) {
      return errorResponse("Name is required (1-50 characters).");
    }

    // Generate a random API key
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const keyBody = Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const apiKey = `ltcg_${keyBody}`;
    const apiKeyPrefix = `ltcg_${keyBody.slice(0, 8)}...`;

    // Hash the key for storage
    const encoder = new TextEncoder();
    const data = encoder.encode(apiKey);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const apiKeyHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    const result = await ctx.runMutation(api.agentAuth.registerAgent, {
      name,
      apiKeyHash,
      apiKeyPrefix,
    });

    return jsonResponse({
      agentId: result.agentId,
      userId: result.userId,
      apiKey, // Shown once — cannot be retrieved again
      apiKeyPrefix,
      message: "Save your API key! It cannot be retrieved again.",
    });
  },
});

corsRoute({
  path: "/api/agent/me",
  method: "GET",
  handler: async (ctx, request) => {
    const agent = await authenticateAgent(ctx, request);
    if (!agent) return errorResponse("Unauthorized", 401);

    // Check if there's an unread daily briefing
    const briefing = await ctx.runQuery(api.dailyBriefing.getAgentDailyBriefing, {
      agentId: agent._id,
      userId: agent.userId,
    });

    return jsonResponse({
      id: agent._id,
      name: agent.name,
      userId: agent.userId,
      apiKeyPrefix: agent.apiKeyPrefix,
      isActive: agent.isActive,
      createdAt: agent.createdAt,
      dailyBriefing: briefing?.active
        ? {
            available: true,
            checkedIn: briefing.checkedIn,
            event: briefing.event,
            announcement: briefing.announcement,
          }
        : { available: false, checkedIn: false },
    });
  },
});

corsRoute({
  path: "/api/agent/game/start",
  method: "POST",
  handler: async (ctx, request) => {
    const agent = await authenticateAgent(ctx, request);
    if (!agent) return errorResponse("Unauthorized", 401);

    const body = await request.json();
    const { chapterId, stageNumber } = body;

    if (!chapterId || typeof chapterId !== "string") {
      return errorResponse("chapterId is required.");
    }

    try {
      const result = await ctx.runMutation(api.agentAuth.agentStartBattle, {
        agentUserId: agent.userId,
        chapterId,
        stageNumber: typeof stageNumber === "number" ? stageNumber : undefined,
      });
      return jsonResponse(result);
    } catch (e: any) {
      return errorResponse(e.message, 422);
    }
  },
});

corsRoute({
  path: "/api/agent/game/start-duel",
  method: "POST",
  handler: async (ctx, request) => {
    const agent = await authenticateAgent(ctx, request);
    if (!agent) return errorResponse("Unauthorized", 401);

    try {
      const result = await ctx.runMutation(api.agentAuth.agentStartDuel, {
        agentUserId: agent.userId,
      });
      return jsonResponse(result);
    } catch (e: any) {
      return errorResponse(e.message, 422);
    }
  },
});

corsRoute({
  path: "/api/agent/game/join",
  method: "POST",
  handler: async (ctx, request) => {
    const agent = await authenticateAgent(ctx, request);
    if (!agent) return errorResponse("Unauthorized", 401);

    const body = await request.json();
    const { matchId } = body;

    if (!matchId || typeof matchId !== "string") {
      return errorResponse("matchId is required.");
    }

    try {
      const result = await ctx.runMutation(api.agentAuth.agentJoinMatch, {
        agentUserId: agent.userId,
        matchId,
      });
      return jsonResponse(result);
    } catch (e: any) {
      return errorResponse(e.message, 422);
    }
  },
});

corsRoute({
  path: "/api/agent/game/action",
  method: "POST",
  handler: async (ctx, request) => {
    const agent = await authenticateAgent(ctx, request);
    if (!agent) return errorResponse("Unauthorized", 401);

    const body = await request.json();
    const { matchId, command, seat: requestedSeat } = body;

    if (!matchId || !command) {
      return errorResponse("matchId and command are required.");
    }

    let resolvedSeat: MatchSeat;
    try {
      ({ seat: resolvedSeat } = await resolveMatchAndSeat(
        ctx,
        agent.userId,
        matchId,
        requestedSeat,
      ));
    } catch (e: any) {
      return errorResponse(e.message, 422);
    }

    let parsedCommand = command;
    if (typeof command === "string") {
      try {
        parsedCommand = JSON.parse(command);
      } catch {
        return errorResponse("command must be valid JSON or a JSON-compatible object.");
      }
    }
    if (!isPlainObject(parsedCommand)) {
      return errorResponse("command must be an object.");
    }

    const normalizedCommand = normalizeGameCommand(parsedCommand);
    if (!isPlainObject(normalizedCommand)) {
      return errorResponse("command must be an object after normalization.");
    }

    try {
      const result = await ctx.runMutation(api.game.submitAction, {
        matchId,
        command: JSON.stringify(normalizedCommand),
        seat: resolvedSeat,
        actorUserId: agent.userId as any,
      });
      return jsonResponse(result);
    } catch (e: any) {
      return errorResponse(e.message, 422);
    }
  },
});

corsRoute({
  path: "/api/agent/game/view",
  method: "GET",
  handler: async (ctx, request) => {
    const agent = await authenticateAgent(ctx, request);
    if (!agent) return errorResponse("Unauthorized", 401);

    const url = new URL(request.url);
    const matchId = url.searchParams.get("matchId");
    const requestedSeat = url.searchParams.get("seat") ?? undefined;

    if (!matchId) {
      return errorResponse("matchId query parameter is required.");
    }

    let seat: MatchSeat;
    try {
      ({ seat } = await resolveMatchAndSeat(
        ctx,
        agent.userId,
        matchId,
        requestedSeat,
      ));
    } catch (e: any) {
      return errorResponse(e.message, 422);
    }

    try {
      const view = await ctx.runQuery(api.game.getPlayerView, {
        matchId,
        seat,
        actorUserId: agent.userId as any,
      });
      if (!view) return errorResponse("Match state not found", 404);
      // getPlayerView returns a JSON string — parse before wrapping
      const parsed = typeof view === "string" ? JSON.parse(view) : view;
      return jsonResponse(parsed);
    } catch (e: any) {
      return errorResponse(e.message, 422);
    }
  },
});

// ── Agent Setup Routes ──────────────────────────────────────────

corsRoute({
  path: "/api/agent/game/chapters",
  method: "GET",
  handler: async (ctx, request) => {
    const agent = await authenticateAgent(ctx, request);
    if (!agent) return errorResponse("Unauthorized", 401);

    const chapters = await ctx.runQuery(api.game.getChapters, {});
    return jsonResponse(chapters);
  },
});

corsRoute({
  path: "/api/agent/game/starter-decks",
  method: "GET",
  handler: async (ctx, request) => {
    const agent = await authenticateAgent(ctx, request);
    if (!agent) return errorResponse("Unauthorized", 401);

    const decks = await ctx.runQuery(api.game.getStarterDecks, {});
    return jsonResponse(decks);
  },
});

corsRoute({
  path: "/api/agent/game/select-deck",
  method: "POST",
  handler: async (ctx, request) => {
    const agent = await authenticateAgent(ctx, request);
    if (!agent) return errorResponse("Unauthorized", 401);

    const body = await request.json();
    const { deckCode } = body;

    if (!deckCode || typeof deckCode !== "string") {
      return errorResponse("deckCode is required.");
    }

    try {
      const result = await ctx.runMutation(api.agentAuth.agentSelectStarterDeck, {
        agentUserId: agent.userId,
        deckCode,
      });
      return jsonResponse(result);
    } catch (e: any) {
      return errorResponse(e.message, 422);
    }
  },
});

// ── Agent Story Endpoints ──────────────────────────────────────

corsRoute({
  path: "/api/agent/story/progress",
  method: "GET",
  handler: async (ctx, request) => {
    const agent = await authenticateAgent(ctx, request);
    if (!agent) return errorResponse("Unauthorized", 401);

    const result = await ctx.runQuery(api.game.getFullStoryProgress, {});
    return jsonResponse(result);
  },
});

corsRoute({
  path: "/api/agent/story/stage",
  method: "GET",
  handler: async (ctx, request) => {
    const agent = await authenticateAgent(ctx, request);
    if (!agent) return errorResponse("Unauthorized", 401);

    const url = new URL(request.url);
    const chapterId = url.searchParams.get("chapterId");
    const stageNumber = url.searchParams.get("stageNumber");

    if (!chapterId || !stageNumber) {
      return errorResponse("chapterId and stageNumber query params required.");
    }

    const stage = await ctx.runQuery(api.game.getStageWithNarrative, {
      chapterId,
      stageNumber: parseInt(stageNumber, 10),
    });

    if (!stage) return errorResponse("Stage not found", 404);
    return jsonResponse(stage);
  },
});

corsRoute({
  path: "/api/agent/story/complete-stage",
  method: "POST",
  handler: async (ctx, request) => {
    const agent = await authenticateAgent(ctx, request);
    if (!agent) return errorResponse("Unauthorized", 401);

    const body = await request.json();
    const { matchId } = body;

    if (!matchId || typeof matchId !== "string") {
      return errorResponse("matchId is required.");
    }

    try {
      const result = await ctx.runMutation(api.game.completeStoryStage, {
        matchId,
      });
      return jsonResponse(result);
    } catch (e: any) {
      return errorResponse(e.message, 422);
    }
  },
});

corsRoute({
  path: "/api/agent/game/match-status",
  method: "GET",
  handler: async (ctx, request) => {
    const agent = await authenticateAgent(ctx, request);
    if (!agent) return errorResponse("Unauthorized", 401);

    const url = new URL(request.url);
    const matchId = url.searchParams.get("matchId");

    if (!matchId) {
      return errorResponse("matchId query parameter is required.");
    }

    try {
      const { meta: validatedMeta, seat } = await resolveMatchAndSeat(
        ctx,
        agent.userId,
        matchId,
      );
      const storyCtx = await ctx.runQuery(api.game.getStoryMatchContext, { matchId });

      return jsonResponse({
        matchId,
        status: (validatedMeta as any)?.status,
        mode: (validatedMeta as any)?.mode,
        winner: (validatedMeta as any)?.winner ?? null,
        endReason: (validatedMeta as any)?.endReason ?? null,
        isGameOver: (validatedMeta as any)?.status === "ended",
        hostId: (validatedMeta as any)?.hostId ?? null,
        awayId: (validatedMeta as any)?.awayId ?? null,
        seat,
        chapterId: storyCtx?.chapterId ?? null,
        stageNumber: storyCtx?.stageNumber ?? null,
        outcome: storyCtx?.outcome ?? null,
        starsEarned: storyCtx?.starsEarned ?? null,
      });
    } catch (e: any) {
      return errorResponse(e.message, 422);
    }
  },
});

// ── Agent Active Match ──────────────────────────────────────

corsRoute({
  path: "/api/agent/active-match",
  method: "GET",
  handler: async (ctx, request) => {
    const agent = await authenticateAgent(ctx, request);
    if (!agent) return errorResponse("Unauthorized", 401);

    const activeMatch = await ctx.runQuery(api.game.getActiveMatchByHost, {
      hostId: agent.userId,
    });

    if (!activeMatch) {
      return jsonResponse({ matchId: null, status: null });
    }

    let seat: MatchSeat;
    try {
      ({ seat } = await resolveMatchAndSeat(ctx, agent.userId, activeMatch._id));
    } catch (e: any) {
      return errorResponse(e.message, 422);
    }

    return jsonResponse({
      matchId: activeMatch._id,
      status: activeMatch.status,
      mode: activeMatch.mode,
      createdAt: activeMatch.createdAt,
      hostId: (activeMatch as any).hostId,
      awayId: (activeMatch as any).awayId,
      seat,
    });
  },
});

// ── Agent Daily Briefing ─────────────────────────────────────

corsRoute({
  path: "/api/agent/daily-briefing",
  method: "GET",
  handler: async (ctx, request) => {
    const agent = await authenticateAgent(ctx, request);
    if (!agent) return errorResponse("Unauthorized", 401);

    const briefing = await ctx.runQuery(api.dailyBriefing.getAgentDailyBriefing, {
      agentId: agent._id,
      userId: agent.userId,
    });

    return jsonResponse(briefing);
  },
});

corsRoute({
  path: "/api/agent/checkin",
  method: "POST",
  handler: async (ctx, request) => {
    const agent = await authenticateAgent(ctx, request);
    if (!agent) return errorResponse("Unauthorized", 401);

    // Record check-in
    const checkinResult = await ctx.runMutation(api.dailyBriefing.agentCheckin, {
      agentId: agent._id,
      userId: agent.userId,
    });

    // Return full briefing with check-in status
    const briefing = await ctx.runQuery(api.dailyBriefing.getAgentDailyBriefing, {
      agentId: agent._id,
      userId: agent.userId,
    });

    return jsonResponse({
      ...briefing,
      checkinStatus: checkinResult,
    });
  },
});

export default http;
