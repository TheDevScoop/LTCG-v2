import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query, internalMutation } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser } from "./auth";
import { LTCGCards } from "@lunchtable-tcg/cards";

const cards = new LTCGCards(components.lunchtable_tcg_cards as any);

const RESERVED_DECK_IDS = new Set(["undefined", "null", "skip"]);
const ARCHETYPE_ALIASES: Record<string, string> = {
  dropout: "dropouts",
  dropouts: "dropouts",
  prep: "preps",
  preps: "preps",
  geek: "geeks",
  geeks: "geeks",
  freak: "freaks",
  freaks: "freaks",
  nerd: "nerds",
  nerds: "nerds",
  goodie: "goodies",
  goodies: "goodies",
  goodie_two_shoes: "goodies",
  goodietwoshoes: "goodies",
};

const CLIQUE_DATA = [
  {
    name: "Dropout Gang",
    archetype: "dropouts",
    description: "High-risk, high-reward chaos. Live fast, break things.",
  },
  {
    name: "Honor Club",
    archetype: "preps",
    description: "Status and social warfare. Always be closing.",
  },
  {
    name: "Geek Squad",
    archetype: "geeks",
    description: "Card draw and tech control. Outsmart the opposition.",
  },
  {
    name: "Freak Show",
    archetype: "freaks",
    description: "Disruption and chaos. Make things weird.",
  },
  {
    name: "Nerd Herd",
    archetype: "nerds",
    description: "Defensive control. The best defense is a good offense.",
  },
  {
    name: "Goodie Two-Shoes",
    archetype: "goodies",
    description: "Attrition and grind. Never give an inch.",
  },
];

const CLIQUE_MEMBER_ROLE = v.union(
  v.literal("member"),
  v.literal("leader"),
  v.literal("founder"),
);
const vClique = v.object({
  _id: v.id("cliques"),
  _creationTime: v.number(),
  name: v.string(),
  archetype: v.string(),
  description: v.string(),
  iconUrl: v.optional(v.string()),
  memberCount: v.number(),
  totalWins: v.number(),
  createdAt: v.number(),
});
const vCliqueMember = v.object({
  _id: v.id("users"),
  _creationTime: v.number(),
  username: v.optional(v.string()),
  name: v.optional(v.string()),
  cliqueRole: v.optional(CLIQUE_MEMBER_ROLE),
  createdAt: v.number(),
});

type CliqueDoc = Doc<"cliques">;
type UserDoc = Doc<"users">;
type UserId = Id<"users">;

type AssignedCliqueResult =
  | {
      status: "assigned";
      clique: CliqueDoc;
      archetype: string;
      reason: string;
    }
  | {
      status: "already_assigned";
      clique: CliqueDoc;
      archetype: string;
      reason: string;
    }
  | {
      status: "missing_starter_deck";
      clique: null;
      archetype: null;
      reason: string;
    }
  | {
      status: "missing_clique";
      clique: null;
      archetype: string;
      reason: string;
    };
const vLeaderboardEntry = v.object({
  _id: v.id("cliques"),
  _creationTime: v.number(),
  name: v.string(),
  archetype: v.string(),
  description: v.string(),
  iconUrl: v.optional(v.string()),
  memberCount: v.number(),
  totalWins: v.number(),
  createdAt: v.number(),
  rank: v.number(),
  isMyClique: v.boolean(),
});
const vCliqueDashboard = v.object({
  myArchetype: v.union(v.string(), v.null()),
  myClique: v.union(vClique, v.null()),
  myCliqueMembers: v.array(vCliqueMember),
  myCliqueMemberOverflow: v.number(),
  totalPlayers: v.number(),
  leaderboard: v.array(vLeaderboardEntry),
});
const vCliqueAssignmentAssigned = v.object({
  status: v.literal("assigned"),
  clique: vClique,
  archetype: v.string(),
  reason: v.string(),
});
const vCliqueAssignmentAlreadyAssigned = v.object({
  status: v.literal("already_assigned"),
  clique: vClique,
  archetype: v.string(),
  reason: v.string(),
});
const vCliqueAssignmentMissingStarterDeck = v.object({
  status: v.literal("missing_starter_deck"),
  clique: v.null(),
  archetype: v.null(),
  reason: v.string(),
});
const vCliqueAssignmentMissingClique = v.object({
  status: v.literal("missing_clique"),
  clique: v.null(),
  archetype: v.string(),
  reason: v.string(),
});

const normalizeDeckId = (deckId: string | null | undefined): string | null => {
  if (!deckId) return null;
  const trimmed = deckId.trim();
  if (!trimmed) return null;
  if (RESERVED_DECK_IDS.has(trimmed.toLowerCase())) return null;
  return trimmed;
};

const normalizeArchetype = (value: string | undefined): string | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");
  if (!normalized) return null;
  return ARCHETYPE_ALIASES[normalized] ?? null;
};

type UserDeckLike = {
  deckId?: string | null;
  deckArchetype?: string | null;
  deckCode?: string | null;
  name?: string | null;
};

const normalizeCardText = (value: unknown): string | null => {
  return typeof value === "string" ? value.trim() : null;
};

const resolveDeckArchetype = (deck: unknown): string | null => {
  const deckRecord: Partial<UserDeckLike> = deck;

  const direct = normalizeArchetype(normalizeCardText(deckRecord.deckArchetype) ?? undefined);
  if (direct) return direct;

  const byDeckCode =
    normalizeCardText(deckRecord.deckCode)?.endsWith("_starter")
      ? normalizeArchetype(
          normalizeCardText(deckRecord.deckCode)?.replace("_starter", ""),
        ) ?? null
      : null;
  if (byDeckCode) return byDeckCode;

  const byName =
    normalizeCardText(deckRecord.name)?.endsWith("_starter")
      ? normalizeArchetype(normalizeCardText(deckRecord.name)?.replace("_starter", "") ?? "") ??
        null
      : null;
  return byName;
};

const sortCliques = <T extends { memberCount: number; totalWins: number; name: string }>(
  cliques: T[],
) =>
  cliques.sort((a, b) => {
    if (b.memberCount !== a.memberCount) return b.memberCount - a.memberCount;
    if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins;
    return a.name.localeCompare(b.name);
  });

const resolveUserStarterArchetype = async (
  ctx: QueryCtx | MutationCtx,
  user: Pick<UserDoc, "_id" | "activeDeckId">,
): Promise<string | null> => {
  const decks = await cards.decks.getUserDecks(ctx, user._id);
  if (!Array.isArray(decks) || decks.length === 0) return null;

  const normalizedActiveDeckId = normalizeDeckId(user.activeDeckId);
  const activeDeck = normalizedActiveDeckId
    ? decks.find((deck: UserDeckLike) => normalizeDeckId(deck.deckId) === normalizedActiveDeckId)
    : null;

  if (activeDeck) {
    const activeDeckArchetype = resolveDeckArchetype(activeDeck);
    if (activeDeckArchetype) return activeDeckArchetype;
  }

  for (const deck of decks) {
    const deckArchetype = resolveDeckArchetype(deck);
    if (deckArchetype) return deckArchetype;
  }

  return null;
};

const assignUserToCliqueByArchetype = async (
  ctx: MutationCtx,
  userId: UserId,
  rawArchetype: string,
): Promise<CliqueDoc | null> => {
  const archetype = normalizeArchetype(rawArchetype);
  if (!archetype) return null;

  const clique = await ctx.db
    .query("cliques")
    .withIndex("by_archetype", (q: any) => q.eq("archetype", archetype))
    .first();
  if (!clique) return null;

  const user = await ctx.db.get(userId);
  if (!user) throw new Error("User not found");

  if (user.cliqueId) {
    const existingClique = await ctx.db.get(user.cliqueId);
    if (existingClique?._id === clique._id) {
      if (user.cliqueRole !== "member") {
        await ctx.db.patch(user._id, { cliqueRole: "member" });
      }
      return clique;
    }

    if (existingClique) {
      await ctx.db.patch(existingClique._id, {
        memberCount: Math.max(0, existingClique.memberCount - 1),
      });
    }
  }

  await ctx.db.patch(user._id, {
    cliqueId: clique._id,
    cliqueRole: "member",
  });

  await ctx.db.patch(clique._id, {
    memberCount: clique.memberCount + 1,
  });

  return clique;
};

const mapAssignmentResult = (
  status: AssignedCliqueResult["status"],
  data: Omit<AssignedCliqueResult, "status" | "clique"> & { clique: CliqueDoc | null },
): AssignedCliqueResult => ({
  status,
  ...data,
}) as AssignedCliqueResult;

export const getAllCliques = query({
  args: {},
  returns: v.array(vClique),
  handler: async (ctx) => {
    const cliques = await ctx.db.query("cliques").collect();
    return sortCliques(cliques);
  },
});

export const getCliqueByArchetype = query({
  args: { archetype: v.string() },
  returns: v.union(vClique, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("cliques")
      .withIndex("by_archetype", (q) => q.eq("archetype", args.archetype))
      .first();
  },
});

export const getMyClique = query({
  args: {},
  returns: v.union(vClique, v.null()),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (!user.cliqueId) return null;
    return await ctx.db.get(user.cliqueId);
  },
});

export const getCliqueDashboard = query({
  args: {},
  returns: vCliqueDashboard,
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const cliques = sortCliques(await ctx.db.query("cliques").collect());

    const myClique = user.cliqueId ? await ctx.db.get(user.cliqueId) : null;
    const myArchetype = await resolveUserStarterArchetype(ctx, user);

    const members = user.cliqueId
      ? await ctx.db
          .query("users")
          .withIndex("by_clique", (q) => q.eq("cliqueId", user.cliqueId))
          .collect()
      : [];

    members.sort((a, b) => (a.username ?? a.name ?? "").localeCompare(b.username ?? b.name ?? ""));

    const rosterPreview = members.slice(0, 12).map((member) => ({
      _id: member._id,
      _creationTime: member._creationTime,
      username: member.username,
      name: member.name,
      cliqueRole: member.cliqueRole,
      createdAt: member.createdAt,
    }));

    return {
      myArchetype,
      myClique,
      myCliqueMembers: rosterPreview,
      myCliqueMemberOverflow: Math.max(0, members.length - rosterPreview.length),
      totalPlayers: cliques.reduce((sum, clique) => sum + clique.memberCount, 0),
      leaderboard: cliques.map((clique, index) => ({
        ...clique,
        rank: index + 1,
        isMyClique: Boolean(myClique && clique._id === myClique._id),
      })),
    };
  },
});

export const getCliqueMembers = query({
  args: { cliqueId: v.id("cliques") },
  returns: v.array(vCliqueMember),
  handler: async (ctx, args) => {
    const members = await ctx.db
      .query("users")
      .withIndex("by_clique", (q) => q.eq("cliqueId", args.cliqueId))
      .collect();
    return members.map((m) => ({
      _id: m._id,
      _creationTime: m._creationTime,
      username: m.username,
      name: m.name,
      cliqueRole: m.cliqueRole,
      createdAt: m.createdAt,
    }));
  },
});

export const joinClique = mutation({
  args: { cliqueId: v.id("cliques") },
  returns: v.union(vClique, v.null()),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const clique = await ctx.db.get(args.cliqueId);
    if (!clique) {
      throw new Error("Clique not found");
    }

    const userArchetype = await resolveUserStarterArchetype(ctx, user);
    if (userArchetype && clique.archetype !== userArchetype) {
      throw new Error(
        `Starter deck locked to ${userArchetype}. You can only join that clique.`,
      );
    }

    return assignUserToCliqueByArchetype(ctx, user._id, clique.archetype);
  },
});

export const leaveClique = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    if (!user.cliqueId) {
      throw new Error("Not in a clique");
    }

    const clique = await ctx.db.get(user.cliqueId);
    if (!clique) {
      throw new Error("Clique not found");
    }

    // Leaders/founders can't leave if they're the only one
    if (user.cliqueRole === "founder" || user.cliqueRole === "leader") {
      if (clique.memberCount <= 1) {
        await ctx.db.delete(user.cliqueId);
      } else {
        throw new Error("Transfer leadership before leaving");
      }
    }

    // Update user
    await ctx.db.patch(user._id, {
      cliqueId: undefined,
      cliqueRole: undefined,
    });

    // Update member count
    await ctx.db.patch(user.cliqueId, {
      memberCount: Math.max(0, clique.memberCount - 1),
    });
  },
});

export const seedCliques = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Check if already seeded
    const existing = await ctx.db.query("cliques").first();
    if (existing) return;

    for (const data of CLIQUE_DATA) {
      await ctx.db.insert("cliques", {
        ...data,
        iconUrl: undefined,
        memberCount: 0,
        totalWins: 0,
        createdAt: Date.now(),
      });
    }
  },
});

export const autoAssignUserToCliqueFromArchetype = internalMutation({
  args: {
    userId: v.id("users"),
    archetype: v.string(),
  },
  returns: v.union(
    vCliqueAssignmentAssigned,
    vCliqueAssignmentAlreadyAssigned,
    v.object({
      status: v.literal("missing_clique"),
      clique: v.null(),
      archetype: v.string(),
      reason: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const existingUser = await ctx.db.get(args.userId);
    if (!existingUser) {
      return mapAssignmentResult("missing_clique", {
        clique: null,
        archetype: args.archetype,
        reason: "User not found",
      });
    }

    if (existingUser.cliqueId) {
      const existingClique = await ctx.db.get(existingUser.cliqueId);
      if (existingClique && existingClique.archetype === args.archetype) {
        return mapAssignmentResult("already_assigned", {
          clique: existingClique,
          archetype: args.archetype,
          reason: "Clique already assigned",
        });
      }
    }

    const clique = await assignUserToCliqueByArchetype(ctx, args.userId, args.archetype);
    if (!clique) {
      return mapAssignmentResult("missing_clique", {
        clique: null,
        archetype: args.archetype,
        reason: `No clique found for archetype ${args.archetype}`,
      });
    }
    return mapAssignmentResult("assigned", {
      clique,
      archetype: args.archetype,
      reason: "Assigned from archetype",
    });
  },
});

export const ensureMyCliqueAssignment = mutation({
  args: {},
  returns: v.union(
    vCliqueAssignmentAssigned,
    vCliqueAssignmentAlreadyAssigned,
    vCliqueAssignmentMissingStarterDeck,
    vCliqueAssignmentMissingClique,
  ),
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    if (user.cliqueId) {
      const myClique = await ctx.db.get(user.cliqueId);
      if (myClique) {
        return mapAssignmentResult("already_assigned", {
          clique: myClique,
          archetype: myClique.archetype,
          reason: "Clique already assigned",
        });
      }

      await ctx.db.patch(user._id, {
        cliqueId: undefined,
        cliqueRole: undefined,
      });
    }

    const archetype = await resolveUserStarterArchetype(ctx, user);
    if (!archetype) {
      return {
      status: "missing_starter_deck",
        clique: null,
        archetype: null,
        reason: "Starter deck missing or unable to determine archetype",
      };
    }

    const clique = await assignUserToCliqueByArchetype(ctx, user._id, archetype);
    if (!clique) {
      return {
        status: "missing_clique",
        clique: null,
        archetype,
        reason: `No clique exists for archetype ${archetype}`,
      };
    }

    return {
      status: "assigned",
      clique,
      archetype,
      reason: "Assigned from starter deck archetype",
    };
  },
});
