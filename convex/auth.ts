import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { components } from "./_generated/api";
import { LTCGCards } from "@lunchtable/cards";
import { isValidSignupAvatarPath, normalizeSignupAvatarPath } from "./signupAvatar";

/**
 * Extracts user identity from JWT via ctx.auth.getUserIdentity().
 * Throws if not authenticated.
 */
export async function requireAuth(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Not authenticated");
  const privyId = identity.subject;
  return { privyId, identity };
}

/**
 * Resolves the full user document from the authenticated JWT.
 * Throws if not authenticated or user not found.
 */
export async function requireUser(ctx: QueryCtx | MutationCtx) {
  const { privyId } = await requireAuth(ctx);
  const user = await ctx.db
    .query("users")
    .withIndex("by_privyId", (q) => q.eq("privyId", privyId))
    .first();
  if (!user) throw new ConvexError("User not found. Complete signup first.");
  return user;
}

/**
 * Syncs or creates a user based on JWT identity.
 * Uses JWT subject as privyId, no longer accepts it as an arg.
 */
export const syncUser = mutation({
  args: {
    email: v.optional(v.string()),
    walletAddress: v.optional(v.string()),
    walletType: v.optional(v.string()),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const { privyId, identity } = await requireAuth(ctx);
    const email = args.email ?? identity.email ?? undefined;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_privyId", (q) => q.eq("privyId", privyId))
      .first();

    if (existing) {
      // Update email if provided and changed
      if (email && email !== existing.email) {
        await ctx.db.patch(existing._id, { email });
      }
      return existing._id;
    }

    return await ctx.db.insert("users", {
      privyId,
      username: `player_${Date.now()}`,
      email,
      createdAt: Date.now(),
    });
  },
});

/**
 * Returns the current user based on JWT identity.
 * Returns null if not authenticated or user not found.
 */
export const currentUser = query({
  args: {},
  returns: v.union(v.any(), v.null()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return ctx.db
      .query("users")
      .withIndex("by_privyId", (q) => q.eq("privyId", identity.subject))
      .first();
  },
});

const cards = new LTCGCards(components.lunchtable_tcg_cards as any);

const vOnboardingStatus = v.object({
  exists: v.boolean(),
  hasUsername: v.boolean(),
  hasAvatar: v.boolean(),
  hasStarterDeck: v.boolean(),
});
const RESERVED_DECK_IDS = new Set(["undefined", "null", "skip"]);
const normalizeDeckId = (deckId: string | undefined): string | null => {
  if (!deckId) return null;
  const trimmed = deckId.trim();
  if (!trimmed) return null;
  if (RESERVED_DECK_IDS.has(trimmed.toLowerCase())) return null;
  return trimmed;
};

/**
 * Returns onboarding status for the authenticated user.
 */
export const getOnboardingStatus = query({
  args: {},
  returns: v.union(vOnboardingStatus, v.null()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_privyId", (q) => q.eq("privyId", identity.subject))
      .first();
    if (!user)
      return {
        exists: false,
        hasUsername: false,
        hasAvatar: false,
        hasStarterDeck: false,
      };

    const userDecks = await cards.decks.getUserDecks(ctx, user._id);
    const activeDeckId = normalizeDeckId(user.activeDeckId);
    const hasActiveDeck = activeDeckId
      ? userDecks?.some((deck: { deckId: string }) => deck.deckId === activeDeckId)
      : false;

    return {
      exists: true,
      hasUsername: !user.username.startsWith("player_"),
      hasAvatar: isValidSignupAvatarPath(user.avatarPath),
      hasStarterDeck: hasActiveDeck,
    };
  },
});

/**
 * Sets the username for the authenticated user.
 * Validates format and uniqueness.
 */
export const setUsername = mutation({
  args: { username: v.string() },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    // Validate: 3-20 chars, alphanumeric + underscores
    const trimmed = args.username.trim();
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(trimmed)) {
      throw new ConvexError(
        "Username must be 3-20 characters, alphanumeric and underscores only."
      );
    }
    // Check uniqueness
    const taken = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", trimmed))
      .first();
    if (taken && taken._id !== user._id) {
      throw new ConvexError("Username is already taken.");
    }
    await ctx.db.patch(user._id, { username: trimmed });
    return { success: true };
  },
});

/**
 * Sets the signup avatar path for the authenticated user.
 */
export const setAvatarPath = mutation({
  args: { avatarPath: v.string() },
  returns: v.object({ success: v.boolean(), avatarPath: v.string() }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const avatarPath = normalizeSignupAvatarPath(args.avatarPath);
    if (!avatarPath) throw new ConvexError("Invalid avatar selection.");

    await ctx.db.patch(user._id, { avatarPath });
    return { success: true, avatarPath };
  },
});
