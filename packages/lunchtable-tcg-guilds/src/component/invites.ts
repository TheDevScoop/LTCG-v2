import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const inviteReturnValidator = v.object({
  _id: v.string(),
  _creationTime: v.number(),
  guildId: v.string(),
  invitedBy: v.string(),
  invitedUserId: v.string(),
  status: v.union(
    v.literal("pending"),
    v.literal("accepted"),
    v.literal("declined"),
    v.literal("expired")
  ),
  createdAt: v.number(),
  expiresAt: v.number(),
  respondedAt: v.optional(v.number()),
});

const inviteLinkReturnValidator = v.object({
  _id: v.string(),
  _creationTime: v.number(),
  guildId: v.string(),
  code: v.string(),
  createdBy: v.string(),
  maxUses: v.optional(v.number()),
  uses: v.number(),
  expiresAt: v.number(),
  isActive: v.boolean(),
  createdAt: v.number(),
});

function generateInviteCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export const createInvite = mutation({
  args: {
    guildId: v.id("guilds"),
    invitedBy: v.string(),
    invitedUserId: v.string(),
    expiresIn: v.optional(v.number()), // milliseconds
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const guild = await ctx.db.get(args.guildId);
    if (!guild) {
      throw new Error("Guild not found");
    }

    // Check if inviter is a member with permissions
    const inviter = await ctx.db
      .query("guildMembers")
      .withIndex("by_guild_user", (q) =>
        q.eq("guildId", args.guildId).eq("userId", args.invitedBy)
      )
      .unique();

    if (!inviter) {
      throw new Error("Inviter is not a member of this guild");
    }

    if (inviter.role !== "owner") {
      throw new Error("Only guild owner can send invites");
    }

    // Check if invitee is already in a guild
    const inviteeMembership = await ctx.db
      .query("guildMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.invitedUserId))
      .first();

    if (inviteeMembership) {
      throw new Error("User is already in a guild");
    }

    // Check if there's already a pending invite
    const existingInvite = await ctx.db
      .query("guildInvites")
      .withIndex("by_invited_user", (q) =>
        q.eq("invitedUserId", args.invitedUserId).eq("status", "pending")
      )
      .first();

    if (existingInvite) {
      throw new Error("User already has a pending invite");
    }

    const now = Date.now();
    const expiresAt = args.expiresIn ? now + args.expiresIn : now + 7 * 24 * 60 * 60 * 1000; // default 7 days

    // Create invite
    const inviteId = await ctx.db.insert("guildInvites", {
      guildId: args.guildId,
      invitedBy: args.invitedBy,
      invitedUserId: args.invitedUserId,
      status: "pending",
      createdAt: now,
      expiresAt,
    });

    return inviteId as string;
  },
});

export const createInviteLink = mutation({
  args: {
    guildId: v.id("guilds"),
    createdBy: v.string(),
    maxUses: v.optional(v.number()),
    expiresIn: v.optional(v.number()), // milliseconds
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const guild = await ctx.db.get(args.guildId);
    if (!guild) {
      throw new Error("Guild not found");
    }

    // Check if creator has permissions
    const creator = await ctx.db
      .query("guildMembers")
      .withIndex("by_guild_user", (q) =>
        q.eq("guildId", args.guildId).eq("userId", args.createdBy)
      )
      .unique();

    if (!creator) {
      throw new Error("Creator is not a member of this guild");
    }

    if (creator.role !== "owner") {
      throw new Error("Only guild owner can create invite links");
    }

    // Generate unique code
    let code = generateInviteCode();
    let existing = await ctx.db
      .query("guildInviteLinks")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();

    // Keep generating until we get a unique code
    while (existing) {
      code = generateInviteCode();
      existing = await ctx.db
        .query("guildInviteLinks")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first();
    }

    const now = Date.now();
    const expiresAt = args.expiresIn ? now + args.expiresIn : now + 7 * 24 * 60 * 60 * 1000; // default 7 days

    await ctx.db.insert("guildInviteLinks", {
      guildId: args.guildId,
      code,
      createdBy: args.createdBy,
      maxUses: args.maxUses,
      uses: 0,
      expiresAt,
      isActive: true,
      createdAt: now,
    });

    return code;
  },
});

export const acceptInvite = mutation({
  args: {
    inviteId: v.id("guildInvites"),
    userId: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const invite = await ctx.db.get(args.inviteId);
    if (!invite) {
      throw new Error("Invite not found");
    }

    if (invite.invitedUserId !== args.userId) {
      throw new Error("This invite is not for you");
    }

    if (invite.status !== "pending") {
      throw new Error("Invite is no longer valid");
    }

    // Check if expired
    if (invite.expiresAt < Date.now()) {
      await ctx.db.patch(args.inviteId, { status: "expired" });
      throw new Error("Invite has expired");
    }

    const guild = await ctx.db.get(invite.guildId);
    if (!guild) {
      throw new Error("Guild not found");
    }

    // Check if user is already in a guild
    const existingMembership = await ctx.db
      .query("guildMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (existingMembership) {
      throw new Error("You are already in a guild");
    }

    // Add member
    const memberId = await ctx.db.insert("guildMembers", {
      guildId: invite.guildId,
      userId: args.userId,
      role: "member",
      joinedAt: Date.now(),
    });

    // Update invite status
    await ctx.db.patch(args.inviteId, {
      status: "accepted",
      respondedAt: Date.now(),
    });

    // Update member count
    await ctx.db.patch(invite.guildId, {
      memberCount: guild.memberCount + 1,
      updatedAt: Date.now(),
    });

    return memberId as string;
  },
});

export const useInviteLink = mutation({
  args: {
    code: v.string(),
    userId: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const inviteLink = await ctx.db
      .query("guildInviteLinks")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();

    if (!inviteLink) {
      throw new Error("Invalid invite code");
    }

    if (!inviteLink.isActive) {
      throw new Error("Invite link is no longer active");
    }

    // Check if expired
    if (inviteLink.expiresAt < Date.now()) {
      await ctx.db.patch(inviteLink._id, { isActive: false });
      throw new Error("Invite link has expired");
    }

    // Check if max uses reached
    if (inviteLink.maxUses && inviteLink.uses >= inviteLink.maxUses) {
      await ctx.db.patch(inviteLink._id, { isActive: false });
      throw new Error("Invite link has reached maximum uses");
    }

    const guild = await ctx.db.get(inviteLink.guildId);
    if (!guild) {
      throw new Error("Guild not found");
    }

    // Check if user is already in a guild
    const existingMembership = await ctx.db
      .query("guildMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (existingMembership) {
      throw new Error("You are already in a guild");
    }

    // Add member
    const memberId = await ctx.db.insert("guildMembers", {
      guildId: inviteLink.guildId,
      userId: args.userId,
      role: "member",
      joinedAt: Date.now(),
    });

    // Increment use count
    const newUses = inviteLink.uses + 1;
    const shouldDeactivate = inviteLink.maxUses && newUses >= inviteLink.maxUses;
    await ctx.db.patch(inviteLink._id, {
      uses: newUses,
      isActive: shouldDeactivate ? false : inviteLink.isActive,
    });

    // Update member count
    await ctx.db.patch(inviteLink.guildId, {
      memberCount: guild.memberCount + 1,
      updatedAt: Date.now(),
    });

    return memberId as string;
  },
});

export const declineInvite = mutation({
  args: {
    inviteId: v.id("guildInvites"),
    userId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const invite = await ctx.db.get(args.inviteId);
    if (!invite) {
      throw new Error("Invite not found");
    }

    if (invite.invitedUserId !== args.userId) {
      throw new Error("This invite is not for you");
    }

    if (invite.status !== "pending") {
      throw new Error("Invite is no longer valid");
    }

    await ctx.db.patch(args.inviteId, {
      status: "declined",
      respondedAt: Date.now(),
    });
    return null;
  },
});

export const cancelInvite = mutation({
  args: {
    inviteId: v.id("guildInvites"),
    cancelledBy: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const invite = await ctx.db.get(args.inviteId);
    if (!invite) {
      throw new Error("Invite not found");
    }

    // Check if canceller has permissions
    const canceller = await ctx.db
      .query("guildMembers")
      .withIndex("by_guild_user", (q) =>
        q.eq("guildId", invite.guildId).eq("userId", args.cancelledBy)
      )
      .unique();

    if (!canceller) {
      throw new Error("You are not a member of this guild");
    }

    // Must be the inviter or owner
    if (invite.invitedBy !== args.cancelledBy && canceller.role !== "owner") {
      throw new Error("Only the inviter or guild owner can cancel invites");
    }

    if (invite.status !== "pending") {
      throw new Error("Invite is no longer valid");
    }

    await ctx.db.patch(args.inviteId, { status: "expired" });
    return null;
  },
});

export const getPendingInvites = query({
  args: { userId: v.string() },
  returns: v.array(inviteReturnValidator),
  handler: async (ctx, args) => {
    const invites = await ctx.db
      .query("guildInvites")
      .withIndex("by_invited_user", (q) =>
        q.eq("invitedUserId", args.userId).eq("status", "pending")
      )
      .collect();
    return invites.map((invite) => ({
      ...invite,
      _id: invite._id as string,
      guildId: invite.guildId as string,
    }));
  },
});

export const getGuildInvites = query({
  args: {
    guildId: v.id("guilds"),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("accepted"),
        v.literal("declined"),
        v.literal("expired")
      )
    ),
  },
  returns: v.array(inviteReturnValidator),
  handler: async (ctx, args) => {
    if (args.status) {
      const invites = await ctx.db
        .query("guildInvites")
        .withIndex("by_guild", (q) =>
          q.eq("guildId", args.guildId).eq("status", args.status!)
        )
        .collect();
      return invites.map((invite) => ({
        ...invite,
        _id: invite._id as string,
        guildId: invite.guildId as string,
      }));
    }

    // If no status filter, collect all and filter manually
    const allInvites = await ctx.db
      .query("guildInvites")
      .collect();
    const invites = allInvites.filter((invite) => invite.guildId === args.guildId);

    return invites.map((invite) => ({
      ...invite,
      _id: invite._id as string,
      guildId: invite.guildId as string,
    }));
  },
});

export const getGuildInviteLinks = query({
  args: {
    guildId: v.id("guilds"),
    activeOnly: v.optional(v.boolean()),
  },
  returns: v.array(inviteLinkReturnValidator),
  handler: async (ctx, args) => {
    if (args.activeOnly) {
      const links = await ctx.db
        .query("guildInviteLinks")
        .withIndex("by_guild", (q) =>
          q.eq("guildId", args.guildId).eq("isActive", true)
        )
        .collect();
      return links.map((link) => ({
        ...link,
        _id: link._id as string,
        guildId: link.guildId as string,
      }));
    }

    // If no filter, collect all for this guild
    const allLinks = await ctx.db.query("guildInviteLinks").collect();
    const links = allLinks.filter((link) => link.guildId === args.guildId);
    return links.map((link) => ({
      ...link,
      _id: link._id as string,
      guildId: link.guildId as string,
    }));
  },
});

export const deleteInviteLink = mutation({
  args: {
    linkId: v.id("guildInviteLinks"),
    deletedBy: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const link = await ctx.db.get(args.linkId);
    if (!link) {
      throw new Error("Invite link not found");
    }

    // Check if deleter has permissions
    const deleter = await ctx.db
      .query("guildMembers")
      .withIndex("by_guild_user", (q) =>
        q.eq("guildId", link.guildId).eq("userId", args.deletedBy)
      )
      .unique();

    if (!deleter) {
      throw new Error("You are not a member of this guild");
    }

    // Must be the creator or have admin/owner role
    if (
      link.createdBy !== args.deletedBy &&
      !["owner", "admin"].includes(deleter.role)
    ) {
      throw new Error("Only the creator or guild admins can delete invite links");
    }

    await ctx.db.delete(args.linkId);
    return null;
  },
});
