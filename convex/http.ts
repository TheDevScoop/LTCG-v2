import { httpRouter } from "convex/server";
import { api, internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { buildApiKeyPrefix, isSupportedAgentApiKey } from "./agentApiKey";
import { isPlainObject, normalizeGameCommand } from "./agentRouteHelpers";

const http = httpRouter();
const internalApi = internal as any;

// CORS configuration
const ALLOWED_HEADERS = ["Content-Type", "Authorization"];

/**
 * Wrap a handler with CORS headers
 */
function corsHandler(
	handler: (ctx: any, request: Request) => Promise<Response>,
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
			handler: httpAction(
				corsHandler(async () => new Response(null, { status: 204 })),
			),
		});
	}
}

const registeredOptions = new Set<string>();

// ── Agent Auth Middleware ─────────────────────────────────────────

async function authenticateAgent(ctx: { runQuery: any }, request: Request) {
	const authHeader = request.headers.get("Authorization");
	if (!authHeader?.startsWith("Bearer ")) {
		return null;
	}

	const apiKey = authHeader.slice(7);
	if (!isSupportedAgentApiKey(apiKey)) {
		return null;
	}

	// Hash the key and look up
	const encoder = new TextEncoder();
	const data = encoder.encode(apiKey);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const apiKeyHash = hashArray
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");

	const agent = await ctx.runQuery(api.agentAuth.getAgentByKeyHash, {
		apiKeyHash,
	});
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

async function parseRequestJson(request: Request): Promise<Record<string, any>> {
	try {
		return (await request.json()) as Record<string, any>;
	} catch {
		return {};
	}
}

type MatchSeat = "host" | "away";

export async function resolveMatchAndSeat(
	ctx: { runQuery: any },
	agentUserId: string,
	matchId: string,
	requestedSeat?: string,
) {
	const meta = await ctx.runQuery(internal.game.getMatchMetaAsActor, {
		matchId,
		actorUserId: agentUserId,
	});
	if (!meta) {
		throw new Error("Match not found");
	}

	const hostId = (meta as any).hostId;
	const awayId = (meta as any).awayId;

	if (
		requestedSeat !== undefined &&
		requestedSeat !== "host" &&
		requestedSeat !== "away"
	) {
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
		const body = (await request.json()) as Record<string, any>;
		const { name } = body;

		if (
			!name ||
			typeof name !== "string" ||
			name.length < 1 ||
			name.length > 50
		) {
			return errorResponse("Name is required (1-50 characters).");
		}

		// Generate a random API key
		const randomBytes = new Uint8Array(32);
		crypto.getRandomValues(randomBytes);
		const keyBody = Array.from(randomBytes)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
		const apiKey = `ltcg_${keyBody}`;
		const apiKeyPrefix = buildApiKeyPrefix(apiKey);

		// Hash the key for storage
		const encoder = new TextEncoder();
		const data = encoder.encode(apiKey);
		const hashBuffer = await crypto.subtle.digest("SHA-256", data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		const apiKeyHash = hashArray
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");

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
		const briefing = await ctx.runQuery(
			api.dailyBriefing.getAgentDailyBriefing,
			{
				agentId: agent._id,
				userId: agent.userId,
			},
		);

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

		const body = (await request.json()) as Record<string, any>;
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
	path: "/api/agent/game/pvp/create",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);

		try {
			const result = await ctx.runMutation(api.agentAuth.agentCreatePvpLobby, {
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

		const body = (await request.json()) as Record<string, any>;
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

		const body = (await request.json()) as Record<string, any>;
		const { matchId, command, seat: requestedSeat, expectedVersion } = body;

		if (!matchId || !command) {
			return errorResponse("matchId and command are required.");
		}
		if (typeof expectedVersion !== "number" || !Number.isFinite(expectedVersion)) {
			return errorResponse("expectedVersion is required and must be a number", 422);
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
				return errorResponse(
					"command must be valid JSON or a JSON-compatible object.",
				);
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
			// Agent HTTP routes do not run with Convex auth context; enforce seat
			// ownership with explicit actorUserId via internal actor-scoped mutation.
			const result = await ctx.runMutation(internal.game.submitActionAsActor, {
				matchId,
				command: JSON.stringify(normalizedCommand),
				seat: resolvedSeat,
				actorUserId: agent.userId,
				expectedVersion: Number(expectedVersion),
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
			// Keep view reads actor-scoped for the same reason as submitAction:
			// HTTP routes are unauthenticated at the Convex mutation/query layer.
			const view = await ctx.runQuery(internal.game.getPlayerViewAsActor, {
				matchId,
				seat,
				actorUserId: agent.userId,
			});
			if (!view) return errorResponse("Match state not found", 404);

			// getPlayerView returns a JSON string — parse before wrapping.
			const parsed = typeof view === "string" ? JSON.parse(view) : view;

			// Dual guardrail: non-fatal nudge to ensure CPU turns resume if scheduler
			// drift or no-op AI commands left the match waiting on the AI seat.
			try {
				await ctx.runMutation(internal.game.nudgeAITurnAsActor, {
					matchId,
					actorUserId: agent.userId,
				});
			} catch {
				// Keep view endpoint read contract stable even if recovery nudge fails.
			}

			return jsonResponse(parsed);
		} catch (e: any) {
			return errorResponse(e.message, 422);
		}
	},
});

corsRoute({
  path: "/api/agent/game/public-view",
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
      const view = await ctx.runQuery(internal.game.getPublicPlayerViewAsActor, {
        matchId,
        seat,
        actorUserId: agent.userId,
      });
      if (!view) return errorResponse("Match state not found", 404);
      return jsonResponse(view);
    } catch (e: any) {
      return errorResponse(e.message, 422);
    }
  },
});

corsRoute({
  path: "/api/agent/game/public-events",
  method: "GET",
  handler: async (ctx, request) => {
    const agent = await authenticateAgent(ctx, request);
    if (!agent) return errorResponse("Unauthorized", 401);

    const url = new URL(request.url);
    const matchId = url.searchParams.get("matchId");
    const requestedSeat = url.searchParams.get("seat") ?? undefined;
    const sinceVersionRaw = url.searchParams.get("sinceVersion");

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

    const parsedSinceVersion =
      typeof sinceVersionRaw === "string" && sinceVersionRaw.length > 0
        ? Number.parseInt(sinceVersionRaw, 10)
        : undefined;
    if (
      parsedSinceVersion !== undefined &&
      (!Number.isFinite(parsedSinceVersion) || parsedSinceVersion < 0)
    ) {
      return errorResponse("sinceVersion must be a non-negative integer.");
    }

    try {
      const events = await ctx.runQuery(internal.game.getPublicEventsAsActor, {
        matchId,
        seat,
        actorUserId: agent.userId,
        sinceVersion: parsedSinceVersion,
      });
      return jsonResponse(events);
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

		const body = (await request.json()) as Record<string, any>;
		const { deckCode } = body;

		if (!deckCode || typeof deckCode !== "string") {
			return errorResponse("deckCode is required.");
		}

		try {
			const result = await ctx.runMutation(
				api.agentAuth.agentSelectStarterDeck,
				{
					agentUserId: agent.userId,
					deckCode,
				},
			);
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

    const result = await ctx.runQuery(internalApi.game.getFullStoryProgressForUser, {
      userId: agent.userId,
    });
    return jsonResponse(result);
  },
});

corsRoute({
  path: "/api/agent/story/next-stage",
  method: "GET",
  handler: async (ctx, request) => {
    const agent = await authenticateAgent(ctx, request);
    if (!agent) return errorResponse("Unauthorized", 401);

    const result = await ctx.runQuery(internalApi.game.getNextStoryStageForUser, {
      userId: agent.userId,
    });
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

		const body = (await request.json()) as Record<string, any>;
		const { matchId } = body;

		if (!matchId || typeof matchId !== "string") {
			return errorResponse("matchId is required.");
		}

		try {
			const result = await ctx.runMutation(internalApi.game.completeStoryStageAsActor, {
				matchId,
				actorUserId: agent.userId,
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
				const latestSnapshotVersion = await ctx.runQuery(
					internalApi.game.getLatestSnapshotVersionAsActor,
					{
						matchId,
						actorUserId: agent.userId,
					},
				);
				const storyCtx = await ctx.runQuery(api.game.getStoryMatchContext, {
					matchId,
				});

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
					latestSnapshotVersion,
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

		const activeMatch = await ctx.runQuery(
			(internal as any).game.getActiveMatchByHostAsActor,
			{
				hostId: agent.userId,
				actorUserId: agent.userId as any,
			},
		);

		if (!activeMatch) {
			return jsonResponse({ matchId: null, status: null });
		}

		const meta = await ctx.runQuery(internal.game.getMatchMetaAsActor, {
			matchId: activeMatch.matchId,
			actorUserId: agent.userId as any,
		});

		return jsonResponse({
			matchId: activeMatch.matchId,
			status: activeMatch.status,
			mode: activeMatch.mode,
			createdAt: activeMatch.createdAt,
			hostId: (meta as any)?.hostId ?? null,
			awayId: (meta as any)?.awayId ?? null,
			seat: activeMatch.seat as MatchSeat,
		});
	},
});

// ── Agent Stream Chat ────────────────────────────────────────

corsRoute({
	path: "/api/agent/stream/chat",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);

		const body = (await request.json()) as Record<string, any>;
		const { text, role, senderName, source } = body;

		if (!text || typeof text !== "string" || text.trim().length === 0) {
			return errorResponse("text is required.");
		}

		const validRoles = ["agent", "viewer", "system"];
		const validSources = ["retake", "telegram", "discord", "system", "other"];
		const resolvedRole = validRoles.includes(role) ? role : "agent";
		const resolvedSource = validSources.includes(source) ? source : "other";
		const resolvedSenderName =
			typeof senderName === "string" && senderName.trim().length > 0
				? senderName.trim()
				: agent.name;

		const messageId = await ctx.runMutation(internal.streamChat.postStreamMessage, {
			agentId: agent._id,
			role: resolvedRole,
			senderName: resolvedSenderName,
			text: text.trim().slice(0, 2000),
			source: resolvedSource,
		});

		return jsonResponse({ messageId, ok: true });
	},
});

// ── Agent Daily Briefing ─────────────────────────────────────

corsRoute({
	path: "/api/agent/daily-briefing",
	method: "GET",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);

		const briefing = await ctx.runQuery(
			api.dailyBriefing.getAgentDailyBriefing,
			{
				agentId: agent._id,
				userId: agent.userId,
			},
		);

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
		const checkinResult = await ctx.runMutation(
			api.dailyBriefing.agentCheckin,
			{
				agentId: agent._id,
				userId: agent.userId,
			},
		);

		// Return full briefing with check-in status
		const briefing = await ctx.runQuery(
			api.dailyBriefing.getAgentDailyBriefing,
			{
				agentId: agent._id,
				userId: agent.userId,
			},
		);

		return jsonResponse({
			...briefing,
			checkinStatus: checkinResult,
		});
	},
});

// ── RPG Namespace ────────────────────────────────────────────

corsRoute({
	path: "/api/rpg/agent/register",
	method: "POST",
	handler: async (ctx, request) => {
		const body = await parseRequestJson(request);
		const name = typeof body?.name === "string" ? body.name : "";
		if (!name || name.length > 50) {
			return errorResponse("Name is required (1-50 characters).");
		}

		const randomBytes = new Uint8Array(32);
		crypto.getRandomValues(randomBytes);
		const keyBody = Array.from(randomBytes)
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
		const apiKey = `rpg_${keyBody}`;
		const apiKeyPrefix = buildApiKeyPrefix(apiKey);

		const encoder = new TextEncoder();
		const hashBuffer = await crypto.subtle.digest(
			"SHA-256",
			encoder.encode(apiKey),
		);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		const apiKeyHash = hashArray
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");

		const result = await ctx.runMutation(api.agentAuth.registerAgent, {
			name,
			apiKeyHash,
			apiKeyPrefix,
		});

		return jsonResponse({
			id: result.agentId,
			userId: result.userId,
			apiKey,
			apiKeyPrefix,
			message: "Save your API key. This token is shown once.",
		});
	},
});

corsRoute({
	path: "/api/rpg/agent/me",
	method: "GET",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);

		return jsonResponse({
			id: agent._id,
			userId: agent.userId,
			name: agent.name,
			apiKeyPrefix: agent.apiKeyPrefix,
			isActive: agent.isActive,
			schemaVersion: "1.0.0",
			capabilities: {
				seats: [
					"dm",
					"player_1",
					"player_2",
					"player_3",
					"player_4",
					"player_5",
					"player_6",
					"narrator",
					"npc_controller",
				],
				autonomy: "full",
			},
		});
	},
});

corsRoute({
	path: "/api/rpg/worlds/create",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const body = await parseRequestJson(request);

		const result = await ctx.runMutation((api as any).rpg.createWorld, {
			ownerId: agent.userId,
			title: body?.title ?? "Untitled World",
			slug: body?.slug,
			description: body?.description ?? "",
			genre: body?.genre ?? "mixed",
			tags: Array.isArray(body?.tags) ? body.tags : [],
			visibility: body?.visibility,
			manifest: body?.manifest ?? {},
		});

		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/worlds/publish",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const body = await parseRequestJson(request);
		if (!body?.worldId) return errorResponse("worldId is required");

		const result = await ctx.runMutation((api as any).rpg.publishWorld, {
			worldId: body.worldId,
			ownerId: agent.userId,
		});
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/worlds/fork",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const body = await parseRequestJson(request);
		if (!body?.sourceWorldId) return errorResponse("sourceWorldId is required");

		const result = await ctx.runMutation((api as any).rpg.forkWorld, {
			sourceWorldId: body.sourceWorldId,
			newOwnerId: agent.userId,
			title: body?.title,
		});
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/worlds/install",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const body = await parseRequestJson(request);
		if (!body?.worldVersionId)
			return errorResponse("worldVersionId is required");

		const result = await ctx.runMutation((api as any).rpg.installWorld, {
			worldVersionId: body.worldVersionId,
			installerId: agent.userId,
		});
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/worlds/list",
	method: "GET",
	handler: async (ctx, request) => {
		const url = new URL(request.url);
		const limit = Number(url.searchParams.get("limit") ?? 20);
		const worlds = await ctx.runQuery((api as any).rpg.listWorlds, { limit });
		return jsonResponse({ worlds });
	},
});

corsRoute({
	path: "/api/rpg/worlds/search",
	method: "GET",
	handler: async (ctx, request) => {
		const url = new URL(request.url);
		const query = url.searchParams.get("q") ?? "";
		const limit = Number(url.searchParams.get("limit") ?? 20);
		const worlds = await ctx.runQuery((api as any).rpg.searchWorlds, {
			query,
			limit,
		});
		return jsonResponse({ worlds });
	},
});

corsRoute({
	path: "/api/rpg/worlds/bootstrap",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const result = await ctx.runMutation(
			(api as any).rpg.bootstrapFlagshipWorlds,
			{
				ownerId: agent.userId,
			},
		);
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/worlds/slug",
	method: "GET",
	handler: async (ctx, request) => {
		const url = new URL(request.url);
		const slug = url.searchParams.get("slug");
		if (!slug) return errorResponse("slug is required");
		const world = await ctx.runQuery((api as any).rpg.getWorldBySlug, { slug });
		return jsonResponse(world);
	},
});

corsRoute({
	path: "/api/rpg/worlds/detail",
	method: "GET",
	handler: async (ctx, request) => {
		const url = new URL(request.url);
		const worldId = url.searchParams.get("worldId");
		if (!worldId) return errorResponse("worldId is required");
		const detail = await ctx.runQuery((api as any).rpg.getWorldDetail, {
			worldId,
		});
		return jsonResponse(detail);
	},
});

corsRoute({
	path: "/api/rpg/worlds/featured",
	method: "GET",
	handler: async (ctx, request) => {
		const url = new URL(request.url);
		const limit = Number(url.searchParams.get("limit") ?? 12);
		const worlds = await ctx.runQuery((api as any).rpg.listFeaturedWorlds, {
			limit,
		});
		return jsonResponse({ worlds });
	},
});

corsRoute({
	path: "/api/rpg/campaigns/generate",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const body = await parseRequestJson(request);
		if (!body?.worldId) return errorResponse("worldId is required");

		const result = await ctx.runMutation((api as any).rpg.generateCampaign, {
			worldId: body.worldId,
			ownerId: agent.userId,
			title: body?.title ?? "Generated Campaign",
			stages: typeof body?.stages === "number" ? body.stages : 12,
		});
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/campaigns/validate",
	method: "POST",
	handler: async (ctx, request) => {
		const body = await parseRequestJson(request);
		if (!body?.campaignId) return errorResponse("campaignId is required");
		const result = await ctx.runQuery((api as any).rpg.validateCampaign, {
			campaignId: body.campaignId,
		});
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/characters/create",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const body = await parseRequestJson(request);
		if (!body?.worldId) return errorResponse("worldId is required");

		const result = await ctx.runMutation((api as any).rpg.createCharacter, {
			ownerId: agent.userId,
			worldId: body.worldId,
			name: body?.name ?? "Unnamed Character",
			classId: body?.classId,
			stats: body?.stats ?? {},
			inventory: body?.inventory ?? [],
			abilities: body?.abilities ?? [],
		});
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/characters/level",
	method: "POST",
	handler: async (ctx, request) => {
		const body = await parseRequestJson(request);
		if (!body?.characterId) return errorResponse("characterId is required");
		const result = await ctx.runMutation((api as any).rpg.levelCharacter, {
			characterId: body.characterId,
			levels: typeof body?.levels === "number" ? body.levels : 1,
		});
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/characters/export",
	method: "GET",
	handler: async (ctx, request) => {
		const url = new URL(request.url);
		const characterId = url.searchParams.get("characterId");
		if (!characterId) return errorResponse("characterId is required");
		const result = await ctx.runQuery((api as any).rpg.exportCharacter, {
			characterId,
		});
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/sessions/create",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const body = await parseRequestJson(request);
		if (!body?.worldVersionId)
			return errorResponse("worldVersionId is required");

		const result = await ctx.runMutation((api as any).rpg.createSession, {
			ownerId: agent.userId,
			worldVersionId: body.worldVersionId,
			title: body?.title ?? "RPG Session",
			seatLimit: body?.seatLimit,
		});
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/sessions/join",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const body = await parseRequestJson(request);
		if (!body?.sessionId) return errorResponse("sessionId is required");

		const result = await ctx.runMutation((api as any).rpg.joinSession, {
			sessionId: body.sessionId,
			actorId: agent.userId,
			seat: body?.seat ?? "player_1",
		});
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/sessions/state",
	method: "GET",
	handler: async (ctx, request) => {
		const url = new URL(request.url);
		const sessionId = url.searchParams.get("sessionId");
		if (!sessionId) return errorResponse("sessionId is required");
		const session = await ctx.runQuery((api as any).rpg.getSessionState, {
			sessionId,
		});
		return jsonResponse(session);
	},
});

corsRoute({
	path: "/api/rpg/sessions/action",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const body = await parseRequestJson(request);
		if (!body?.sessionId) return errorResponse("sessionId is required");
		const result = await ctx.runMutation((api as any).rpg.applySessionAction, {
			sessionId: body.sessionId,
			actorId: agent.userId,
			action: body?.action ?? {},
		});
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/sessions/end",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const body = await parseRequestJson(request);
		if (!body?.sessionId) return errorResponse("sessionId is required");
		const result = await ctx.runMutation((api as any).rpg.endSession, {
			sessionId: body.sessionId,
			actorId: agent.userId,
		});
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/dice/roll",
	method: "POST",
	handler: async (ctx, request) => {
		const body = await parseRequestJson(request);
		const expression =
			typeof body?.expression === "string" ? body.expression : "";
		if (!expression) return errorResponse("expression is required");

		const result = await ctx.runQuery((api as any).rpg.rollDice, {
			expression,
			seedHint: body?.seedHint,
		});
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/matchmaking/create",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const body = await parseRequestJson(request);
		if (!body?.worldId) return errorResponse("worldId is required");

		const result = await ctx.runMutation(
			(api as any).rpg.createMatchmakingListing,
			{
				ownerId: agent.userId,
				worldId: body.worldId,
				sessionId: body?.sessionId,
				title: body?.title ?? "Open RPG Session",
				partySize: typeof body?.partySize === "number" ? body.partySize : 6,
				difficulty: body?.difficulty ?? "normal",
				agentIntensity:
					typeof body?.agentIntensity === "number" ? body.agentIntensity : 70,
				tags: Array.isArray(body?.tags) ? body.tags : [],
			},
		);
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/matchmaking/list",
	method: "GET",
	handler: async (ctx, request) => {
		const url = new URL(request.url);
		const limit = Number(url.searchParams.get("limit") ?? 20);
		const listings = await ctx.runQuery(
			(api as any).rpg.listMatchmakingListings,
			{ limit },
		);
		return jsonResponse({ listings });
	},
});

corsRoute({
	path: "/api/rpg/matchmaking/join",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const body = await parseRequestJson(request);
		if (!body?.listingId) return errorResponse("listingId is required");
		const result = await ctx.runMutation(
			(api as any).rpg.joinMatchmakingListing,
			{
				listingId: body.listingId,
				actorId: agent.userId,
			},
		);
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/marketplace/sell",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const body = await parseRequestJson(request);

		const result = await ctx.runMutation(
			(api as any).rpg.createMarketplaceItem,
			{
				ownerId: agent.userId,
				worldId: body?.worldId,
				worldVersionId: body?.worldVersionId,
				itemType: body?.itemType ?? "world",
				title: body?.title ?? "Untitled Listing",
				description: body?.description ?? "",
				priceUsdCents:
					typeof body?.priceUsdCents === "number" ? body.priceUsdCents : 0,
			},
		);

		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/marketplace/list",
	method: "GET",
	handler: async (ctx, request) => {
		const url = new URL(request.url);
		const limit = Number(url.searchParams.get("limit") ?? 20);
		const items = await ctx.runQuery((api as any).rpg.listMarketplaceItems, {
			limit,
		});
		return jsonResponse({ items });
	},
});

corsRoute({
	path: "/api/rpg/marketplace/buy",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const body = await parseRequestJson(request);
		if (!body?.marketplaceItemId)
			return errorResponse("marketplaceItemId is required");

		const result = await ctx.runMutation((api as any).rpg.buyMarketplaceItem, {
			marketplaceItemId: body.marketplaceItemId,
			buyerId: agent.userId,
		});
		return jsonResponse(result);
	},
});

corsRoute({
	path: "/api/rpg/moderation/report",
	method: "POST",
	handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const body = await parseRequestJson(request);
		if (!body?.targetType || !body?.targetId || !body?.reason) {
			return errorResponse("targetType, targetId, and reason are required");
		}

		const result = await ctx.runMutation((api as any).rpg.reportModeration, {
			targetType: body.targetType,
			targetId: body.targetId,
			reporterId: agent.userId,
			reason: body.reason,
			details: body?.details,
		});
		return jsonResponse(result);
	},
});

corsRoute({
		path: "/api/rpg/moderation/review",
		method: "POST",
		handler: async (ctx, request) => {
		const agent = await authenticateAgent(ctx, request);
		if (!agent) return errorResponse("Unauthorized", 401);
		const body = await parseRequestJson(request);
		if (!body?.moderationId || !body?.status || !body?.safetyState) {
			return errorResponse(
				"moderationId, status, and safetyState are required",
			);
		}

		const result = await ctx.runMutation((api as any).rpg.reviewModeration, {
			moderationId: body.moderationId,
			reviewerId: agent.userId,
			status: body.status,
			safetyState: body.safetyState,
			resolution: body?.resolution,
		});

			return jsonResponse(result);
		},
	});

// ── Telegram Bot Helpers ────────────────────────────────────────────

type TelegramChat = {
  id?: number;
  type?: string;
};

type TelegramUser = {
  id?: number;
  username?: string;
  first_name?: string;
};

type TelegramMessage = {
  message_id?: number;
  chat?: TelegramChat;
  from?: TelegramUser;
  text?: string;
};

type TelegramInlineKeyboardButton = {
  text: string;
  url?: string;
  callback_data?: string;
};

type TelegramInlineKeyboardMarkup = {
  inline_keyboard: TelegramInlineKeyboardButton[][];
};

type TelegramInlineQuery = {
  id: string;
  query?: string;
};

type TelegramCallbackQuery = {
  id: string;
  data?: string;
  from?: TelegramUser;
  message?: TelegramMessage;
};

type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
  inline_query?: TelegramInlineQuery;
  callback_query?: TelegramCallbackQuery;
};

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function escapeTelegramHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseTelegramMatchIdToken(raw: string): string | null {
  const token = raw.trim();
  if (!token) return null;
  if (!/^[A-Za-z0-9_-]{10,}$/.test(token)) return null;
  return token;
}

function getTelegramDeepLink(matchId?: string): string {
  const botUsername = (process.env.TELEGRAM_BOT_USERNAME ?? "")
    .trim()
    .replace(/^@/, "");
  if (!botUsername) return "https://telegram.org";
  const payload = matchId ? `m_${matchId}` : "";
  const qs = payload ? `?startapp=${encodeURIComponent(payload)}` : "";
  return `https://t.me/${botUsername}${qs}`;
}

async function telegramApi(method: string, payload: Record<string, unknown>) {
  const token = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not configured.");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram API error (${method}): ${res.status} ${body}`);
  }
  return res.json();
}

async function telegramSendMessage(
  chatId: number,
  text: string,
  replyMarkup?: TelegramInlineKeyboardMarkup,
) {
  try {
    await telegramApi("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
      disable_web_page_preview: true,
    });
  } catch (error) {
    console.warn("telegramSendMessage failed", error);
  }
}

async function telegramAnswerInlineQuery(inlineQueryId: string, results: unknown[]) {
  try {
    await telegramApi("answerInlineQuery", {
      inline_query_id: inlineQueryId,
      results,
      cache_time: 0,
    });
  } catch (error) {
    console.warn("telegramAnswerInlineQuery failed", error);
  }
}

async function telegramAnswerCallbackQuery(
  callbackQueryId: string,
  text: string,
  showAlert = false,
) {
  try {
    await telegramApi("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    });
  } catch (error) {
    console.warn("telegramAnswerCallbackQuery failed", error);
  }
}

async function telegramEditCallbackMessage(
  callbackQuery: TelegramCallbackQuery,
  text: string,
  replyMarkup?: TelegramInlineKeyboardMarkup,
) {
  const messageId = callbackQuery.message?.message_id;
  const chatId = callbackQuery.message?.chat?.id;
  if (!messageId || !chatId) return;

  try {
    await telegramApi("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
      disable_web_page_preview: true,
    });
  } catch (error) {
    console.warn("telegramEditCallbackMessage failed", error);
  }
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseRefreshPayload(raw: string): { matchId: string | null; page: number } {
  const [matchIdRaw, pageRaw] = raw.split(":", 2);
  const matchId = matchIdRaw ? parseTelegramMatchIdToken(matchIdRaw) : null;
  const page = Number(pageRaw ?? 0);
  return { matchId, page: Number.isFinite(page) ? page : 0 };
}

async function buildTelegramMatchSummary(
  ctx: { runQuery: any },
  args: { matchId: string; userId: string; page?: number },
): Promise<{ text: string; replyMarkup: TelegramInlineKeyboardMarkup }> {
  const meta = await ctx.runQuery(internal.game.getMatchMetaAsActor, {
    matchId: args.matchId,
    actorUserId: args.userId,
  });
  const status = String((meta as any)?.status ?? "unknown").toUpperCase();
  const mode = String((meta as any)?.mode ?? "unknown").toUpperCase();
  const winner = (meta as any)?.winner ? String((meta as any).winner).toUpperCase() : null;

  const lines = [
    "<b>LunchTable Lobby</b>",
    `Match <code>${escapeTelegramHtml(args.matchId)}</code>`,
    `Mode: <b>${escapeTelegramHtml(mode)}</b>`,
    `Status: <b>${escapeTelegramHtml(status)}</b>`,
    winner ? `Winner: <b>${escapeTelegramHtml(winner)}</b>` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const replyMarkup: TelegramInlineKeyboardMarkup = {
    inline_keyboard: [
      [{ text: "Open Mini App", url: getTelegramDeepLink(args.matchId) }],
      [{ text: "Refresh", callback_data: `refresh:${args.matchId}:${args.page ?? 0}` }],
    ],
  };

  return { text: lines, replyMarkup };
}

async function requireLinkedTelegramUser(
  ctx: { runQuery: any },
  callbackQuery: TelegramCallbackQuery,
) {
  const telegramUserId = callbackQuery.from?.id ? String(callbackQuery.from.id) : null;
  if (!telegramUserId) {
    throw new Error("Missing Telegram identity.");
  }

  const userId = await ctx.runQuery(internalApi.telegram.findLinkedUserByTelegramId, {
    telegramUserId,
  });
  if (!userId) {
    throw new Error("Telegram account not linked. Open the Mini App to link your account first.");
  }

  return { userId: String(userId) };
}

	async function handleTelegramStartMessage(
	  ctx: { runMutation: any },
	  message: TelegramMessage,
	) {
  const chatId = message.chat?.id;
  if (!chatId) return;
  const text = (message.text ?? "").trim();
  const payload = text.split(/\s+/, 2)[1] ?? "";
  const matchId = payload.startsWith("m_") ? parseTelegramMatchIdToken(payload.slice(2)) : null;

  if (message.from?.id) {
    await ctx.runMutation(internalApi.telegram.touchTelegramIdentity, {
      telegramUserId: String(message.from.id),
      username: message.from.username,
      firstName: message.from.first_name,
      privateChatId: message.chat?.type === "private" ? String(chatId) : undefined,
    });
  }

  const intro = [
    "<b>LunchTable Telegram</b>",
    "Open the Mini App to link your account and play full matches.",
    matchId ? `Match requested: <code>${escapeTelegramHtml(matchId)}</code>` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const keyboard: TelegramInlineKeyboardMarkup = {
    inline_keyboard: [
      [{ text: "Open Mini App", url: getTelegramDeepLink(matchId ?? undefined) }],
      ...(matchId ? [[{ text: "Join Lobby Inline", callback_data: `join_lobby:${matchId}` }]] : []),
    ],
  };

  await telegramSendMessage(chatId, intro, keyboard);
}

async function handleTelegramInlineQuery(
  inlineQuery: TelegramInlineQuery,
) {
  const queryText = (inlineQuery.query ?? "").trim();
  const requestedMatchId = parseTelegramMatchIdToken(queryText);
  const results: unknown[] = [];
  const openMiniAppButton = { text: "Open Mini App", url: getTelegramDeepLink() };

  results.push({
    type: "article",
    id: "create_lobby",
    title: "Create PvP Lobby",
    description: "Create a waiting PvP match from inline chat.",
    input_message_content: {
      message_text: "Create a LunchTable PvP lobby:",
    },
    reply_markup: {
      inline_keyboard: [
        [{ text: "Create Lobby", callback_data: "create_lobby" }],
        [openMiniAppButton],
      ],
    },
  });

  if (requestedMatchId) {
    results.push({
      type: "article",
      id: `join_${requestedMatchId}`,
      title: `Join Lobby ${requestedMatchId}`,
      description: "Join an existing waiting PvP lobby.",
      input_message_content: {
        message_text: `Join LunchTable lobby <code>${escapeTelegramHtml(requestedMatchId)}</code>`,
        parse_mode: "HTML",
      },
      reply_markup: {
        inline_keyboard: [
          [{ text: "Join Lobby", callback_data: `join_lobby:${requestedMatchId}` }],
          [openMiniAppButton],
        ],
      },
    });
  }

  results.push({
    type: "article",
    id: "open_miniapp",
    title: "Open Mini App",
    description: "Launch LunchTable Mini App in Telegram.",
    input_message_content: {
      message_text: "Open LunchTable Mini App:",
    },
    reply_markup: {
      inline_keyboard: [[openMiniAppButton]],
    },
  });

  await telegramAnswerInlineQuery(inlineQuery.id, results);
}

async function handleTelegramCallbackQuery(
  ctx: { runMutation: any; runQuery: any },
  callbackQuery: TelegramCallbackQuery,
) {
  const data = (callbackQuery.data ?? "").trim();
  if (!data) {
    await telegramAnswerCallbackQuery(callbackQuery.id, "No callback payload.");
    return;
  }

  if (data.startsWith("refresh:")) {
    try {
      const { userId } = await requireLinkedTelegramUser(ctx, callbackQuery);
      const { matchId, page } = parseRefreshPayload(data.slice("refresh:".length));
      if (!matchId) throw new Error("Invalid match id.");
      const summary = await buildTelegramMatchSummary(ctx, { matchId, userId, page });
      await telegramEditCallbackMessage(callbackQuery, summary.text, summary.replyMarkup);
      await telegramAnswerCallbackQuery(callbackQuery.id, "Refreshed.");
    } catch (error: any) {
      await telegramAnswerCallbackQuery(callbackQuery.id, error?.message ?? "Refresh failed.", true);
    }
    return;
  }

  if (data === "create_lobby") {
    try {
      const { userId } = await requireLinkedTelegramUser(ctx, callbackQuery);
      const result = await ctx.runMutation(internalApi.game.createPvpLobbyForUser, {
        userId,
        client: "telegram",
        source: "telegram-inline",
      });
      const summary = await buildTelegramMatchSummary(ctx, { matchId: result.matchId, userId });
      await telegramEditCallbackMessage(callbackQuery, summary.text, summary.replyMarkup);
      await telegramAnswerCallbackQuery(callbackQuery.id, "Lobby ready.");
    } catch (error: any) {
      await telegramAnswerCallbackQuery(callbackQuery.id, error?.message ?? "Failed to create lobby.", true);
    }
    return;
  }

  if (data.startsWith("join_lobby:")) {
    try {
      const { userId } = await requireLinkedTelegramUser(ctx, callbackQuery);
      const matchId = parseTelegramMatchIdToken(data.slice("join_lobby:".length));
      if (!matchId) throw new Error("Invalid match id.");
      await ctx.runMutation(internalApi.game.joinPvpLobbyForUser, {
        userId,
        matchId,
        client: "telegram",
        source: "telegram-inline",
      });
      const summary = await buildTelegramMatchSummary(ctx, { matchId, userId });
      await telegramEditCallbackMessage(callbackQuery, summary.text, summary.replyMarkup);
      await telegramAnswerCallbackQuery(callbackQuery.id, "Joined match.");
    } catch (error: any) {
      await telegramAnswerCallbackQuery(callbackQuery.id, error?.message ?? "Failed to join.", true);
    }
    return;
  }

  if (data.startsWith("act:")) {
    try {
      const { userId } = await requireLinkedTelegramUser(ctx, callbackQuery);
      const token = data.slice("act:".length);
      const tokenPayload = await ctx.runQuery(internalApi.telegram.getTelegramActionToken, {
        token,
      });
      if (!tokenPayload) {
        throw new Error("Action expired. Refresh the controls.");
      }
      if (tokenPayload.expiresAt < Date.now()) {
        await ctx.runMutation(internalApi.telegram.deleteTelegramActionToken, { token });
        throw new Error("Action token expired. Refresh and try again.");
      }

      const meta = await ctx.runQuery(internal.game.getMatchMetaAsActor, {
        matchId: tokenPayload.matchId,
        actorUserId: userId,
      });
      if (!meta) {
        throw new Error("Match not found.");
      }
      const seatOwner = tokenPayload.seat === "host" ? meta.hostId : meta.awayId;
      if (seatOwner !== userId) {
        throw new Error("You are not authorized to execute this action.");
      }

	      const command = parseJsonObject(tokenPayload.commandJson);
	      if (!command) throw new Error("Action payload is invalid.");
	      if (typeof tokenPayload.expectedVersion !== "number") {
	        throw new Error("Action token is missing expectedVersion.");
	      }

	      await ctx.runMutation(internalApi.game.submitActionWithClientForUser, {
	        userId,
	        matchId: tokenPayload.matchId,
	        command: JSON.stringify(command),
	        seat: tokenPayload.seat,
	        expectedVersion: tokenPayload.expectedVersion,
	        client: "telegram",
	      });
      await ctx.runMutation(internalApi.telegram.deleteTelegramActionToken, { token });

      const summary = await buildTelegramMatchSummary(ctx, {
        matchId: tokenPayload.matchId,
        userId,
      });
      await telegramEditCallbackMessage(callbackQuery, summary.text, summary.replyMarkup);
      await telegramAnswerCallbackQuery(callbackQuery.id, "Action submitted.");
    } catch (error: any) {
      await telegramAnswerCallbackQuery(callbackQuery.id, error?.message ?? "Action failed.", true);
    }
    return;
  }

  await telegramAnswerCallbackQuery(callbackQuery.id, "Unsupported action.");
}

async function handleTelegramUpdate(
  ctx: { runMutation: any; runQuery: any },
  update: TelegramUpdate,
) {
  if (update.message?.text?.startsWith("/start")) {
    await handleTelegramStartMessage(ctx, update.message);
    return;
  }

  if (update.inline_query) {
    await handleTelegramInlineQuery(update.inline_query);
    return;
  }

  if (update.callback_query) {
    await handleTelegramCallbackQuery(ctx, update.callback_query);
  }
}

http.route({
  path: "/api/telegram/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const configuredSecret = (process.env.TELEGRAM_WEBHOOK_SECRET ?? "").trim();
    const receivedSecret = (request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "").trim();
    if (!configuredSecret || !timingSafeEqual(configuredSecret, receivedSecret)) {
      return new Response("Unauthorized", { status: 401 });
    }

    let payload: TelegramUpdate;
    try {
      payload = (await request.json()) as TelegramUpdate;
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    const updateId = typeof payload.update_id === "number" ? payload.update_id : null;
    if (updateId !== null) {
      const alreadyProcessed = await ctx.runQuery(internalApi.telegram.hasProcessedTelegramUpdate, {
        updateId,
      });
      if (alreadyProcessed) {
        return jsonResponse({ ok: true, duplicate: true });
      }
    }

    try {
      await handleTelegramUpdate(ctx, payload);
      if (updateId !== null) {
        await ctx.runMutation(internalApi.telegram.markTelegramUpdateProcessed, { updateId });
      }
      return jsonResponse({ ok: true });
    } catch (error: any) {
      console.error("telegram_webhook_error", error);
      return errorResponse(error?.message ?? "Webhook processing failed.", 500);
    }
  }),
});

export default http;
