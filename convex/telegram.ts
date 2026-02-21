import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireUser } from "./auth";
import { getTelegramMiniAppDeepLink } from "./telegramLinks";

type TelegramInitUser = {
  id: number;
  first_name?: string;
  username?: string;
};

type TelegramInitChat = {
  id?: number;
  type?: string;
};

const encoder = new TextEncoder();
const internalApi = internal;
const TELEGRAM_INIT_DATA_MAX_AGE_SECONDS = 5 * 60;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function toBytes(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer);
}

async function hmacSha256Raw(keyBytes: Uint8Array, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return toBytes(signature);
}

async function deriveTelegramWebAppSecret(botToken: string): Promise<Uint8Array> {
  return hmacSha256Raw(encoder.encode("WebAppData"), botToken);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function buildTelegramDataCheckString(initDataRaw: string): {
  dataCheckString: string;
  hash: string | null;
  params: URLSearchParams;
} {
  const params = new URLSearchParams(initDataRaw);
  const hash = params.get("hash");
  params.delete("hash");
  const dataCheckString = Array.from(params.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  return { dataCheckString, hash, params };
}

export async function verifyTelegramInitData(
  initDataRaw: string,
  botToken: string,
): Promise<{ ok: boolean; error?: string; params?: URLSearchParams }> {
  if (!initDataRaw.trim()) {
    return { ok: false, error: "Missing init data." };
  }
  if (!botToken.trim()) {
    return { ok: false, error: "Missing TELEGRAM_BOT_TOKEN." };
  }

  const { dataCheckString, hash, params } = buildTelegramDataCheckString(initDataRaw);
  if (!hash) {
    return { ok: false, error: "Missing hash in init data." };
  }

  const secret = await deriveTelegramWebAppSecret(botToken);
  const expectedHash = toHex(await hmacSha256Raw(secret, dataCheckString));
  const ok = timingSafeEqualHex(expectedHash, hash.toLowerCase());
  if (!ok) {
    return { ok: false, error: "Telegram init data signature mismatch." };
  }

  const authDateRaw = params.get("auth_date");
  if (!authDateRaw) {
    return { ok: false, error: "Missing auth_date in init data." };
  }
  const authDate = Number(authDateRaw);
  if (!Number.isFinite(authDate)) {
    return { ok: false, error: "Invalid auth_date in init data." };
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (authDate > nowSeconds + 60) {
    return { ok: false, error: "Invalid auth_date timestamp." };
  }
  if (nowSeconds - authDate > TELEGRAM_INIT_DATA_MAX_AGE_SECONDS) {
    return { ok: false, error: "Telegram init data has expired." };
  }

  return { ok: true, params };
}

function parseTelegramUser(value: string | null): TelegramInitUser | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as TelegramInitUser;
    if (!parsed || typeof parsed.id !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseTelegramChat(value: string | null): TelegramInitChat | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as TelegramInitChat;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function upsertTelegramIdentityForUser(
  ctx: any,
  {
    userId,
    telegramUserId,
    username,
    firstName,
    privateChatId,
  }: {
    userId: string;
    telegramUserId: string;
    username?: string;
    firstName?: string;
    privateChatId?: string;
  },
) {
  const now = Date.now();
  const existingUserByTelegram = await ctx.db
    .query("users")
    .withIndex("by_telegramUserId", (q: any) => q.eq("telegramUserId", telegramUserId))
    .first();
  if (existingUserByTelegram && existingUserByTelegram._id !== userId) {
    throw new Error("This Telegram account is already linked to another user.");
  }

  const existingByTelegram = await ctx.db
    .query("telegramIdentities")
    .withIndex("by_telegramUserId", (q: any) => q.eq("telegramUserId", telegramUserId))
    .first();

  if (existingByTelegram && existingByTelegram.userId !== userId) {
    throw new Error("This Telegram account is already linked to another user.");
  }

  const existingByUser = await ctx.db
    .query("telegramIdentities")
    .withIndex("by_userId", (q: any) => q.eq("userId", userId))
    .first();

  const payload = {
    telegramUserId,
    userId,
    username,
    firstName,
    privateChatId,
    lastSeenAt: now,
  };

  if (existingByTelegram) {
    await ctx.db.patch(existingByTelegram._id, payload);
  } else if (existingByUser) {
    await ctx.db.patch(existingByUser._id, {
      ...payload,
      linkedAt: existingByUser.linkedAt ?? now,
    });
  } else {
    await ctx.db.insert("telegramIdentities", {
      ...payload,
      linkedAt: now,
    });
  }

  await ctx.db.patch(userId, { telegramUserId });

  return {
    telegramUserId,
    username: username ?? null,
    firstName: firstName ?? null,
    privateChatId: privateChatId ?? null,
  };
}

export const linkTelegramFromMiniApp = mutation({
  args: { initDataRaw: v.string() },
  returns: v.object({
    linked: v.boolean(),
    telegramUserId: v.string(),
    username: v.union(v.string(), v.null()),
    firstName: v.union(v.string(), v.null()),
    privateChatId: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
    const verification = await verifyTelegramInitData(args.initDataRaw, token);
    if (!verification.ok || !verification.params) {
      throw new Error(verification.error ?? "Failed to verify Telegram init data.");
    }

    const telegramUser = parseTelegramUser(verification.params.get("user"));
    if (!telegramUser) {
      throw new Error("Missing Telegram user payload in init data.");
    }

    const chat = parseTelegramChat(verification.params.get("chat"));
    const privateChatId =
      verification.params.get("chat_type") === "private" && typeof chat?.id === "number"
        ? String(chat.id)
        : undefined;

    const result = await upsertTelegramIdentityForUser(ctx, {
      userId: user._id,
      telegramUserId: String(telegramUser.id),
      username: telegramUser.username,
      firstName: telegramUser.first_name,
      privateChatId,
    });

    return { linked: true, ...result };
  },
});

export const getTelegramLinkStatus = query({
  args: {},
  returns: v.object({
    linked: v.boolean(),
    telegramUserId: v.union(v.string(), v.null()),
    username: v.union(v.string(), v.null()),
    firstName: v.union(v.string(), v.null()),
    privateChatId: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const identity = await ctx.db
      .query("telegramIdentities")
      .withIndex("by_userId", (q: any) => q.eq("userId", user._id))
      .first();

    return {
      linked: Boolean(identity),
      telegramUserId: identity?.telegramUserId ?? null,
      username: identity?.username ?? null,
      firstName: identity?.firstName ?? null,
      privateChatId: identity?.privateChatId ?? null,
    };
  },
});

export const findLinkedUserByTelegramId = internalQuery({
  args: { telegramUserId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const identity = await ctx.db
      .query("telegramIdentities")
      .withIndex("by_telegramUserId", (q: any) => q.eq("telegramUserId", args.telegramUserId))
      .first();
    return identity?.userId ?? null;
  },
});

export const getIdentityByUserId = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(
    v.object({
      telegramUserId: v.string(),
      username: v.union(v.string(), v.null()),
      firstName: v.union(v.string(), v.null()),
      privateChatId: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const identity = await ctx.db
      .query("telegramIdentities")
      .withIndex("by_userId", (q: any) => q.eq("userId", args.userId))
      .first();
    if (!identity) return null;
    return {
      telegramUserId: identity.telegramUserId,
      username: identity.username ?? null,
      firstName: identity.firstName ?? null,
      privateChatId: identity.privateChatId ?? null,
    };
  },
});

export const touchTelegramIdentity = internalMutation({
  args: {
    telegramUserId: v.string(),
    username: v.optional(v.string()),
    firstName: v.optional(v.string()),
    privateChatId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.db
      .query("telegramIdentities")
      .withIndex("by_telegramUserId", (q: any) => q.eq("telegramUserId", args.telegramUserId))
      .first();
    if (!identity) return null;
    await ctx.db.patch(identity._id, {
      username: args.username ?? identity.username,
      firstName: args.firstName ?? identity.firstName,
      privateChatId: args.privateChatId ?? identity.privateChatId,
      lastSeenAt: Date.now(),
    });
    return null;
  },
});

function randomToken(bytes = 12): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const createTelegramActionToken = internalMutation({
  args: {
    matchId: v.string(),
    seat: v.union(v.literal("host"), v.literal("away")),
    commandJson: v.string(),
    expectedVersion: v.optional(v.number()),
    expiresAt: v.number(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const token = randomToken(10);
    await ctx.db.insert("telegramActionTokens", {
      token,
      matchId: args.matchId,
      seat: args.seat,
      commandJson: args.commandJson,
      expectedVersion: args.expectedVersion,
      expiresAt: args.expiresAt,
      createdAt: Date.now(),
    });
    return token;
  },
});

export const consumeTelegramActionToken = internalMutation({
  args: { token: v.string() },
  returns: v.union(
    v.object({
      matchId: v.string(),
      seat: v.union(v.literal("host"), v.literal("away")),
      commandJson: v.string(),
      expectedVersion: v.union(v.number(), v.null()),
      expired: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("telegramActionTokens")
      .withIndex("by_token", (q: any) => q.eq("token", args.token))
      .first();
    if (!row) return null;

    await ctx.db.delete(row._id);
    const expired = row.expiresAt < Date.now();
    return {
      matchId: row.matchId,
      seat: row.seat,
      commandJson: row.commandJson,
      expectedVersion: row.expectedVersion ?? null,
      expired,
    };
  },
});

export const getTelegramActionToken = internalQuery({
  args: { token: v.string() },
  returns: v.union(
    v.object({
      token: v.string(),
      matchId: v.string(),
      seat: v.union(v.literal("host"), v.literal("away")),
      commandJson: v.string(),
      expectedVersion: v.union(v.number(), v.null()),
      expiresAt: v.number(),
      createdAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("telegramActionTokens")
      .withIndex("by_token", (q: any) => q.eq("token", args.token))
      .first();
    if (!row) return null;
    return {
      token: row.token,
      matchId: row.matchId,
      seat: row.seat,
      commandJson: row.commandJson,
      expectedVersion: row.expectedVersion ?? null,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    };
  },
});

export const deleteTelegramActionToken = internalMutation({
  args: { token: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("telegramActionTokens")
      .withIndex("by_token", (q: any) => q.eq("token", args.token))
      .first();
    if (!row) return false;
    await ctx.db.delete(row._id);
    return true;
  },
});

export const hasProcessedTelegramUpdate = internalQuery({
  args: { updateId: v.number() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("telegramProcessedUpdates")
      .withIndex("by_updateId", (q: any) => q.eq("updateId", args.updateId))
      .first();
    return Boolean(row);
  },
});

export const markTelegramUpdateProcessed = internalMutation({
  args: { updateId: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("telegramProcessedUpdates")
      .withIndex("by_updateId", (q: any) => q.eq("updateId", args.updateId))
      .first();
    if (!existing) {
      await ctx.db.insert("telegramProcessedUpdates", {
        updateId: args.updateId,
        processedAt: Date.now(),
      });
    }
    return null;
  },
});

export const notifyUserMatchTransition = internalAction({
  args: {
    userId: v.id("users"),
    matchId: v.string(),
    eventsJson: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.runQuery(internalApi.telegram.getIdentityByUserId, {
      userId: args.userId,
    });
    if (!identity?.privateChatId) return null;

    const botToken = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
    if (!botToken) return null;

    const eventsRaw: unknown = (() => {
      try {
        const parsed = JSON.parse(args.eventsJson) as unknown;
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })();
    const events = Array.isArray(eventsRaw) ? (eventsRaw as Array<Record<string, unknown>>) : [];

    const phaseEvent = events.find((event) => event?.type === "TURN_STARTED");
    const endedEvent = events.find((event) => event?.type === "GAME_ENDED");
    const chainEvent = events.find((event) => event?.type === "CHAIN_STARTED");
    if (!phaseEvent && !endedEvent && !chainEvent) return null;

    const matchMeta = await ctx.runQuery(internalApi.game.getMatchMetaAsActor, {
      matchId: args.matchId,
      actorUserId: args.userId,
    });
    const statusText = String((matchMeta as any)?.status ?? "updated").toUpperCase();
    const deepLink = getTelegramMiniAppDeepLink(args.matchId);

    const lines = [
      "<b>LunchTable Duel Update</b>",
      `Match <code>${args.matchId}</code>`,
      `Status: <b>${statusText}</b>`,
    ];
    if (phaseEvent && typeof phaseEvent.seat === "string") {
      lines.push(`Turn: <b>${String(phaseEvent.seat).toUpperCase()}</b>`);
    }
    if (endedEvent && typeof endedEvent.winner === "string") {
      lines.push(`Winner: <b>${String(endedEvent.winner).toUpperCase()}</b>`);
    }
    if (chainEvent) {
      lines.push("Chain response window opened.");
    }

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: identity.privateChatId,
        text: lines.join("\n"),
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [[{ text: "Open Mini App", url: deepLink }]],
        },
      }),
    });

    return null;
  },
});
