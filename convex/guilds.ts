import { LTCGGuilds } from "@lunchtable/guilds";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./auth";

const guilds: any = new LTCGGuilds(components.lunchtable_tcg_guilds as any);

const visibilityValidator = v.union(v.literal("public"), v.literal("private"));
const inviteStatusValidator = v.union(
  v.literal("pending"),
  v.literal("accepted"),
  v.literal("declined"),
  v.literal("expired"),
);
const memberRoleValidator = v.union(v.literal("owner"), v.literal("member"));

function getDisplayName(user: { username?: string; name?: string; _id: string }) {
  return user.username || user.name || `player_${user._id}`;
}

// ---------------------------------------------------------------------------
// Guild queries
// ---------------------------------------------------------------------------

export const getGuildById = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return guilds.guilds.getById(ctx, { id: args.id });
  },
});

export const getGuildsByOwner = query({
  args: { ownerId: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return guilds.guilds.getByOwner(ctx, { ownerId: args.ownerId });
  },
});

export const getMyOwnedGuilds = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return guilds.guilds.getByOwner(ctx, { ownerId: user._id });
  },
});

export const getPublicGuilds = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return guilds.guilds.getPublicGuilds(ctx, { limit: args.limit });
  },
});

export const getGuildMembers = query({
  args: { guildId: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return guilds.members.getMembers(ctx, { guildId: args.guildId });
  },
});

export const getGuildMemberCount = query({
  args: { guildId: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return guilds.members.getMemberCount(ctx, { guildId: args.guildId });
  },
});

export const getMyGuild = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return guilds.members.getPlayerGuild(ctx, { userId: user._id });
  },
});

export const searchGuilds = query({
  args: {
    searchTerm: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return guilds.discovery.searchGuilds(ctx, {
      searchTerm: args.searchTerm,
      limit: args.limit,
    });
  },
});

export const getPendingInvites = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return guilds.invites.getPendingInvites(ctx, { userId: user._id });
  },
});

export const getGuildInvites = query({
  args: {
    guildId: v.string(),
    status: v.optional(inviteStatusValidator),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return guilds.invites.getGuildInvites(ctx, {
      guildId: args.guildId,
      status: args.status,
    });
  },
});

export const getGuildInviteLinks = query({
  args: {
    guildId: v.string(),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return guilds.invites.getGuildInviteLinks(ctx, {
      guildId: args.guildId,
      activeOnly: args.activeOnly,
    });
  },
});

export const getGuildMessages = query({
  args: {
    guildId: v.string(),
    limit: v.optional(v.number()),
    before: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return guilds.chat.getMessages(ctx, {
      guildId: args.guildId,
      limit: args.limit,
      before: args.before,
    });
  },
});

export const getRecentGuildMessages = query({
  args: {
    guildId: v.string(),
    count: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return guilds.chat.getRecentMessages(ctx, {
      guildId: args.guildId,
      count: args.count,
    });
  },
});

export const getGuildJoinRequests = query({
  args: { guildId: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return guilds.discovery.getJoinRequests(ctx, { guildId: args.guildId });
  },
});

export const getMyJoinRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return guilds.discovery.getPlayerRequests(ctx, { userId: user._id });
  },
});

// ---------------------------------------------------------------------------
// Guild mutations
// ---------------------------------------------------------------------------

export const createGuild = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    profileImageId: v.optional(v.string()),
    bannerImageId: v.optional(v.string()),
    visibility: v.optional(visibilityValidator),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return guilds.guilds.create(ctx, {
      ownerId: user._id,
      name: args.name,
      description: args.description,
      profileImageId: args.profileImageId,
      bannerImageId: args.bannerImageId,
      visibility: args.visibility,
    });
  },
});

export const updateGuild = mutation({
  args: {
    id: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    profileImageId: v.optional(v.string()),
    bannerImageId: v.optional(v.string()),
    visibility: v.optional(visibilityValidator),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return guilds.guilds.update(ctx, {
      id: args.id,
      ownerId: user._id,
      name: args.name,
      description: args.description,
      profileImageId: args.profileImageId,
      bannerImageId: args.bannerImageId,
      visibility: args.visibility,
    });
  },
});

export const disbandGuild = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return guilds.guilds.disband(ctx, {
      id: args.id,
      ownerId: user._id,
    });
  },
});

export const joinGuild = mutation({
  args: { guildId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return guilds.members.join(ctx, {
      guildId: args.guildId,
      userId: user._id,
    });
  },
});

export const leaveGuild = mutation({
  args: { guildId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return guilds.members.leave(ctx, {
      guildId: args.guildId,
      userId: user._id,
    });
  },
});

export const kickGuildMember = mutation({
  args: {
    guildId: v.string(),
    targetUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return guilds.members.kick(ctx, {
      guildId: args.guildId,
      targetUserId: args.targetUserId,
      kickedBy: user._id,
    });
  },
});

export const updateGuildMemberRole = mutation({
  args: {
    guildId: v.string(),
    targetUserId: v.string(),
    newRole: memberRoleValidator,
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return guilds.members.updateRole(ctx, {
      guildId: args.guildId,
      targetUserId: args.targetUserId,
      newRole: args.newRole,
      updatedBy: user._id,
    });
  },
});

export const transferGuildOwnership = mutation({
  args: {
    guildId: v.string(),
    newOwnerId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return guilds.members.transferOwnership(ctx, {
      guildId: args.guildId,
      currentOwnerId: user._id,
      newOwnerId: args.newOwnerId,
    });
  },
});

export const createGuildInvite = mutation({
  args: {
    guildId: v.string(),
    invitedUserId: v.string(),
    expiresIn: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return guilds.invites.createInvite(ctx, {
      guildId: args.guildId,
      invitedBy: user._id,
      invitedUserId: args.invitedUserId,
      expiresIn: args.expiresIn,
    });
  },
});

export const createGuildInviteLink = mutation({
  args: {
    guildId: v.string(),
    maxUses: v.optional(v.number()),
    expiresIn: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return guilds.invites.createInviteLink(ctx, {
      guildId: args.guildId,
      createdBy: user._id,
      maxUses: args.maxUses,
      expiresIn: args.expiresIn,
    });
  },
});

export const acceptGuildInvite = mutation({
  args: { inviteId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return guilds.invites.acceptInvite(ctx, {
      inviteId: args.inviteId,
      userId: user._id,
    });
  },
});

export const useGuildInviteLink = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return guilds.invites.useInviteLink(ctx, {
      code: args.code,
      userId: user._id,
    });
  },
});

export const declineGuildInvite = mutation({
  args: { inviteId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return guilds.invites.declineInvite(ctx, {
      inviteId: args.inviteId,
      userId: user._id,
    });
  },
});

export const cancelGuildInvite = mutation({
  args: { inviteId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return guilds.invites.cancelInvite(ctx, {
      inviteId: args.inviteId,
      cancelledBy: user._id,
    });
  },
});

export const deleteGuildInviteLink = mutation({
  args: { linkId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return guilds.invites.deleteInviteLink(ctx, {
      linkId: args.linkId,
      deletedBy: user._id,
    });
  },
});

export const sendGuildMessage = mutation({
  args: {
    guildId: v.string(),
    message: v.string(),
    isSystem: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return guilds.chat.sendMessage(ctx, {
      guildId: args.guildId,
      userId: user._id,
      username: getDisplayName(user),
      message: args.message,
      isSystem: args.isSystem,
    });
  },
});

export const deleteGuildMessage = mutation({
  args: { messageId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return guilds.chat.deleteMessage(ctx, {
      messageId: args.messageId,
      deletedBy: user._id,
    });
  },
});

export const submitGuildJoinRequest = mutation({
  args: {
    guildId: v.string(),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return guilds.discovery.submitJoinRequest(ctx, {
      guildId: args.guildId,
      userId: user._id,
      message: args.message,
    });
  },
});

export const approveGuildJoinRequest = mutation({
  args: { requestId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return guilds.discovery.approveJoinRequest(ctx, {
      requestId: args.requestId,
      approvedBy: user._id,
    });
  },
});

export const rejectGuildJoinRequest = mutation({
  args: { requestId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return guilds.discovery.rejectJoinRequest(ctx, {
      requestId: args.requestId,
      rejectedBy: user._id,
    });
  },
});
