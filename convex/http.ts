import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";

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
type ClientPlatform = "web" | "telegram_inline" | "telegram_miniapp" | "agent" | "cpu";
type TelegramBotUser = {
  id: number;
  first_name?: string;
  username?: string;
};
type TelegramCallbackQuery = {
  id: string;
  data?: string;
  from?: TelegramBotUser;
  inline_message_id?: string;
  message?: {
    message_id: number;
    chat?: { id?: number | string; type?: string };
  };
};
type TelegramMessage = {
  message_id: number;
  text?: string;
  chat?: { id?: number | string; type?: string };
  from?: TelegramBotUser;
};
type TelegramInlineQuery = {
  id: string;
  query?: string;
  from?: TelegramBotUser;
};
type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  inline_query?: TelegramInlineQuery;
};
type TelegramInlineKeyboardButton = {
  text: string;
  callback_data?: string;
  url?: string;
};
type TelegramInlineKeyboardMarkup = {
  inline_keyboard: TelegramInlineKeyboardButton[][];
};
type TelegramMatchSummary = {
  text: string;
  replyMarkup: TelegramInlineKeyboardMarkup;
};

const TELEGRAM_INLINE_ACTION_TTL_MS = 5 * 60 * 1000;
const TELEGRAM_INLINE_ACTION_LIMIT = 8;
const TELEGRAM_INLINE_MINI_APP_FALLBACK = "https://telegram.org";
const internalApi = internal;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function parseTelegramMatchIdToken(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^[A-Za-z0-9_-]{3,48}$/.test(trimmed)) return null;
  return trimmed;
}

function escapeTelegramHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function getTelegramDeepLink(matchId?: string): string {
  const username = (process.env.TELEGRAM_BOT_USERNAME ?? "").trim();
  if (!username) return TELEGRAM_INLINE_MINI_APP_FALLBACK;
  const cleanUsername = username.replace(/^@/, "");
  const startAppParam = matchId ? `m_${matchId}` : "home";
  return `https://t.me/${cleanUsername}?startapp=${encodeURIComponent(startAppParam)}`;
}

function getTelegramApiBase(): string {
  const token = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
  return `https://api.telegram.org/bot${token}`;
}

async function telegramApiCall<T = unknown>(
  method: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${getTelegramApiBase()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Telegram API ${method} failed (${response.status}): ${bodyText.slice(0, 400)}`);
  }
  let parsed: any;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw new Error(`Telegram API ${method} returned non-JSON response.`);
  }
  if (!parsed?.ok) {
    throw new Error(`Telegram API ${method} error: ${parsed?.description ?? "unknown error"}`);
  }
  return parsed.result as T;
}

async function telegramSendMessage(
  chatId: string | number,
  text: string,
  replyMarkup?: TelegramInlineKeyboardMarkup,
) {
  await telegramApiCall("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: replyMarkup,
  });
}

async function telegramEditCallbackMessage(
  callbackQuery: TelegramCallbackQuery,
  text: string,
  replyMarkup?: TelegramInlineKeyboardMarkup,
) {
  if (callbackQuery.inline_message_id) {
    await telegramApiCall("editMessageText", {
      inline_message_id: callbackQuery.inline_message_id,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: replyMarkup,
    });
    return;
  }
  const chatId = callbackQuery.message?.chat?.id;
  const messageId = callbackQuery.message?.message_id;
  if (!chatId || typeof messageId !== "number") return;

  await telegramApiCall("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: replyMarkup,
  });
}

async function telegramAnswerCallbackQuery(
  callbackQueryId: string,
  text?: string,
  showAlert = false,
) {
  await telegramApiCall("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert,
  });
}

async function telegramAnswerInlineQuery(inlineQueryId: string, results: unknown[]) {
  await telegramApiCall("answerInlineQuery", {
    inline_query_id: inlineQueryId,
    cache_time: 0,
    is_personal: true,
    results,
  });
}

function platformTag(platform: ClientPlatform | null | undefined): string {
  switch (platform) {
    case "telegram_inline":
      return "TG_INLINE";
    case "telegram_miniapp":
      return "TG_MINIAPP";
    case "agent":
      return "AGENT";
    case "cpu":
      return "CPU";
    case "web":
    default:
      return "WEB";
  }
}

function parseJsonObject(raw: string): Record<string, any> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, any>;
  } catch {
    return null;
  }
}

function buildInlineFallbackKeyboard(matchId: string): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "Refresh", callback_data: `refresh:${matchId}` }],
      [{ text: "Open Mini App", url: getTelegramDeepLink(matchId) }],
    ],
  };
}

async function requireLinkedTelegramUser(
  ctx: { runMutation: any; runQuery: any },
  callbackQuery: TelegramCallbackQuery,
): Promise<{ userId: string; telegramUserId: string }> {
  const telegramUserId = callbackQuery.from?.id ? String(callbackQuery.from.id) : null;
  if (!telegramUserId) {
    throw new Error("Telegram user information is missing.");
  }

  await ctx.runMutation(internalApi.telegram.touchTelegramIdentity, {
    telegramUserId,
    username: callbackQuery.from?.username,
    firstName: callbackQuery.from?.first_name,
    privateChatId:
      callbackQuery.message?.chat?.type === "private" && callbackQuery.message?.chat?.id != null
        ? String(callbackQuery.message.chat.id)
        : undefined,
  });

  const userId = await ctx.runQuery(internalApi.telegram.findLinkedUserByTelegramId, {
    telegramUserId,
  });
  if (!userId) {
    throw new Error("Link your Telegram account in the Mini App before using inline play.");
  }
  return { userId, telegramUserId };
}

function resolveSeatFromMeta(meta: any, userId: string): MatchSeat | null {
  if (!meta || !userId) return null;
  if (meta.hostId === userId) return "host";
  if (meta.awayId === userId) return "away";
  return null;
}

function compactPhase(value: unknown): string {
  const phase = typeof value === "string" ? value : "";
  if (!phase) return "unknown";
  return phase.toUpperCase();
}

function compactLp(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function chunkButtons(
  buttons: TelegramInlineKeyboardButton[],
  perRow = 2,
): TelegramInlineKeyboardButton[][] {
  const rows: TelegramInlineKeyboardButton[][] = [];
  for (let i = 0; i < buttons.length; i += perRow) {
    rows.push(buttons.slice(i, i + perRow));
  }
  return rows;
}

function deriveInlineCommands(
  view: Record<string, any>,
  seat: MatchSeat,
  cardTypeById: Map<string, string>,
): Array<{ label: string; command: Record<string, unknown> }> {
  const commands: Array<{ label: string; command: Record<string, unknown> }> = [];
  const gameOver = Boolean(view.gameOver);
  const currentTurnPlayer = typeof view.currentTurnPlayer === "string" ? view.currentTurnPlayer : null;
  const currentPriorityPlayer =
    typeof view.currentPriorityPlayer === "string" ? view.currentPriorityPlayer : null;
  const phase = typeof view.currentPhase === "string" ? view.currentPhase : "";

  const hand = Array.isArray(view.hand) ? view.hand.filter((v) => typeof v === "string") : [];
  const board = Array.isArray(view.board) ? view.board : [];
  const opponentBoard = Array.isArray(view.opponentBoard) ? view.opponentBoard : [];
  const spellTrapZone = Array.isArray(view.spellTrapZone) ? view.spellTrapZone : [];

  if (gameOver) {
    return commands;
  }

  if (Array.isArray(view.currentChain) && view.currentChain.length > 0 && currentPriorityPlayer === seat) {
    commands.push({ label: "Chain Pass", command: { type: "CHAIN_RESPONSE", pass: true } });
  }

  if (currentTurnPlayer === seat && (phase === "main" || phase === "main2")) {
    const hasMonsterSlot = board.length < 3;
    const hasSpellSlot = spellTrapZone.length < 3;
    for (const cardId of hand.slice(0, 3)) {
      const type = cardTypeById.get(cardId) ?? "";
      if (hasMonsterSlot && type === "stereotype") {
        commands.push({ label: `Summon ${cardId.slice(0, 6)} A`, command: { type: "SUMMON", cardId, position: "attack" } });
        commands.push({ label: `Set ${cardId.slice(0, 6)}`, command: { type: "SET_MONSTER", cardId } });
      }
      if (hasSpellSlot && (type === "spell" || type === "trap")) {
        commands.push({ label: `Set ${cardId.slice(0, 6)} S/T`, command: { type: "SET_SPELL_TRAP", cardId } });
      }
      if (type === "spell") {
        commands.push({ label: `Cast ${cardId.slice(0, 6)}`, command: { type: "ACTIVATE_SPELL", cardId } });
      }
    }

    for (const card of board.slice(0, 2)) {
      const cardId = typeof card?.cardId === "string" ? card.cardId : null;
      if (!cardId) continue;
      if (Boolean(card.faceDown)) {
        commands.push({ label: `Flip ${cardId.slice(0, 6)}`, command: { type: "FLIP_SUMMON", cardId } });
      }
    }
  }

  if (currentTurnPlayer === seat && phase === "combat") {
    const firstTarget =
      opponentBoard.find((entry: any) => typeof entry?.cardId === "string")?.cardId ?? undefined;
    for (const card of board.slice(0, 3)) {
      const cardId = typeof card?.cardId === "string" ? card.cardId : null;
      if (!cardId || card.canAttack === false || card.hasAttackedThisTurn === true) continue;
      commands.push({
        label: `Attack ${cardId.slice(0, 6)}`,
        command: { type: "DECLARE_ATTACK", attackerId: cardId, targetId: firstTarget },
      });
    }
  }

  commands.push({ label: "Advance Phase", command: { type: "ADVANCE_PHASE" } });
  commands.push({ label: "End Turn", command: { type: "END_TURN" } });
  commands.push({ label: "Surrender", command: { type: "SURRENDER" } });

  const unique = new Map<string, { label: string; command: Record<string, unknown> }>();
  for (const item of commands) {
    const key = JSON.stringify(item.command);
    if (!unique.has(key)) unique.set(key, item);
  }

  return Array.from(unique.values()).slice(0, TELEGRAM_INLINE_ACTION_LIMIT);
}

async function buildTelegramMatchSummary(
  ctx: { runMutation: any; runQuery: any },
  {
    matchId,
    userId,
  }: {
    matchId: string;
    userId: string;
  },
): Promise<TelegramMatchSummary> {
  const meta = await ctx.runQuery(api.game.getMatchMeta, { matchId });
  if (!meta) {
    return {
      text: `<b>Match not found.</b>\n<code>${escapeTelegramHtml(matchId)}</code>`,
      replyMarkup: buildInlineFallbackKeyboard(matchId),
    };
  }

  const seat = resolveSeatFromMeta(meta, userId);
  const presence = await ctx.runQuery(api.game.getMatchPlatformPresence, { matchId });

  const header = [
    "<b>LunchTable Duel</b>",
    `Match <code>${escapeTelegramHtml(matchId)}</code>`,
    `Status: <b>${escapeTelegramHtml(String(meta.status ?? "unknown").toUpperCase())}</b>`,
  ];

  if (presence) {
    header.push(
      `Host: <b>${platformTag(presence.hostPlatform)}</b>` +
        (presence.awayPlatform ? ` • Away: <b>${platformTag(presence.awayPlatform)}</b>` : ""),
    );
  }

  if (!seat) {
    header.push("You are not seated in this match.");
    return {
      text: header.join("\n"),
      replyMarkup: {
        inline_keyboard: [
          [{ text: "Join Lobby", callback_data: `join_lobby:${matchId}` }],
          [{ text: "Open Mini App", url: getTelegramDeepLink(matchId) }],
        ],
      },
    };
  }

  if (meta.status === "waiting") {
    header.push(seat === "host" ? "Waiting for opponent to join." : "Lobby is waiting to start.");
    return {
      text: header.join("\n"),
      replyMarkup: {
        inline_keyboard: [
          [{ text: "Refresh", callback_data: `refresh:${matchId}` }],
          [{ text: "Open Mini App", url: getTelegramDeepLink(matchId) }],
        ],
      },
    };
  }

  const viewRaw = await ctx.runQuery(api.game.getPlayerView, { matchId, seat });
  const view = typeof viewRaw === "string" ? parseJsonObject(viewRaw) : null;
  if (!view) {
    header.push("Unable to load player view.");
    return { text: header.join("\n"), replyMarkup: buildInlineFallbackKeyboard(matchId) };
  }

  const latestVersion = await ctx.runQuery(api.game.getLatestSnapshotVersion, { matchId });
  const cardDefs = await ctx.runQuery(api.game.getAllCards, {});
  const cardTypeById = new Map<string, string>();
  for (const card of cardDefs ?? []) {
    if (typeof card?._id !== "string") continue;
    const typeRaw =
      typeof card?.cardType === "string"
        ? card.cardType
        : typeof card?.type === "string"
          ? card.type
          : "";
    cardTypeById.set(card._id, typeRaw.toLowerCase());
  }

  const lpLine = `LP: You ${compactLp(view.lifePoints)} • Opp ${compactLp(view.opponentLifePoints)}`;
  const phaseLine = `Turn: ${escapeTelegramHtml(String(view.currentTurnPlayer ?? "?").toUpperCase())} • Phase: ${compactPhase(view.currentPhase)}`;
  const handLine = `Hand: ${Array.isArray(view.hand) ? view.hand.length : 0} • Board: ${Array.isArray(view.board) ? view.board.length : 0}`;

  const commandButtons: TelegramInlineKeyboardButton[] = [];
  for (const action of deriveInlineCommands(view, seat, cardTypeById)) {
    const token = await ctx.runMutation(internalApi.telegram.createTelegramActionToken, {
      matchId,
      seat,
      commandJson: JSON.stringify(action.command),
      expectedVersion: typeof latestVersion === "number" ? latestVersion : undefined,
      expiresAt: Date.now() + TELEGRAM_INLINE_ACTION_TTL_MS,
    });
    commandButtons.push({ text: action.label, callback_data: `act:${token}` });
  }

  const keyboardRows = [
    ...chunkButtons(commandButtons),
    [{ text: "Refresh", callback_data: `refresh:${matchId}` }],
    [{ text: "Open Mini App", url: getTelegramDeepLink(matchId) }],
  ];

  return {
    text: [...header, phaseLine, lpLine, handLine].join("\n"),
    replyMarkup: { inline_keyboard: keyboardRows },
  };
}

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
  const meta = await ctx.runQuery(api.game.getMatchMeta, { matchId });
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
    const {
      matchId,
      command,
      seat: requestedSeat,
      expectedVersion,
    } = body;

    if (!matchId || !command) {
      return errorResponse("matchId and command are required.");
    }
    if (expectedVersion !== undefined && typeof expectedVersion !== "number") {
      return errorResponse("expectedVersion must be a number.");
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
      const result = await ctx.runMutation(api.game.submitActionWithClient, {
        matchId,
        command: JSON.stringify(normalizedCommand),
        seat: resolvedSeat,
        expectedVersion:
          typeof expectedVersion === "number" ? Number(expectedVersion) : undefined,
        client: "agent",
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
      const view = await ctx.runQuery(api.game.getPlayerView, { matchId, seat });
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
      const matchId = parseTelegramMatchIdToken(data.slice("refresh:".length));
      if (!matchId) throw new Error("Invalid match id.");
      const summary = await buildTelegramMatchSummary(ctx, { matchId, userId });
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
      const result = await ctx.runMutation(internal.game.createPvpLobbyForUser, {
        userId,
        client: "telegram_inline",
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
      await ctx.runMutation(internal.game.joinPvpLobbyForUser, {
        userId,
        matchId,
        client: "telegram_inline",
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

      const meta = await ctx.runQuery(api.game.getMatchMeta, { matchId: tokenPayload.matchId });
      if (!meta) {
        throw new Error("Match not found.");
      }
      const seatOwner = tokenPayload.seat === "host" ? meta.hostId : meta.awayId;
      if (seatOwner !== userId) {
        throw new Error("You are not authorized to execute this action.");
      }

      const command = parseJsonObject(tokenPayload.commandJson);
      if (!command) throw new Error("Action payload is invalid.");

      await ctx.runMutation(internal.game.submitActionWithClientForUser, {
        userId,
        matchId: tokenPayload.matchId,
        command: JSON.stringify(command),
        seat: tokenPayload.seat,
        expectedVersion: tokenPayload.expectedVersion ?? undefined,
        client: "telegram_inline",
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
