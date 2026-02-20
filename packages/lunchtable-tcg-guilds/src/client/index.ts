import type {
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";
import type { api } from "../component/_generated/api.js";

type RunQueryCtx = {
  runQuery: GenericQueryCtx<GenericDataModel>["runQuery"];
};

type RunMutationCtx = {
  runMutation: GenericMutationCtx<GenericDataModel>["runMutation"];
};

export type { RunQueryCtx, RunMutationCtx };

// Re-export the component API type for UseApi
export type { api };

/**
 * Client for the @lunchtable/guilds Convex component.
 *
 * Usage:
 * ```ts
 * import { components } from "@convex/_generated/api";
 * import { LTCGGuilds } from "@lunchtable/guilds/client";
 *
 * const guilds = new LTCGGuilds(components.ltcgGuilds);
 *
 * export const myMutation = mutation({
 *   handler: async (ctx) => {
 *     await guilds.guilds.create(ctx, { ... });
 *   }
 * });
 * ```
 */
export class LTCGGuilds {
  public guilds: GuildsClient;
  public members: MembersClient;
  public invites: InvitesClient;
  public chat: ChatClient;
  public discovery: DiscoveryClient;

  constructor(component: typeof api) {
    this.guilds = new GuildsClient(component);
    this.members = new MembersClient(component);
    this.invites = new InvitesClient(component);
    this.chat = new ChatClient(component);
    this.discovery = new DiscoveryClient(component);
  }
}

/**
 * Client for guild CRUD operations.
 */
export class GuildsClient {
  constructor(private component: typeof api) {}

  async create(
    ctx: RunMutationCtx,
    args: {
      ownerId: string;
      name: string;
      description?: string;
      profileImageId?: string;
      bannerImageId?: string;
      visibility?: "public" | "private";
    }
  ) {
    return await ctx.runMutation(this.component.guilds.create, args);
  }

  async getById(ctx: RunQueryCtx, args: { id: string }) {
    return await ctx.runQuery(this.component.guilds.getById, {
      id: args.id as any,
    });
  }

  async getByOwner(ctx: RunQueryCtx, args: { ownerId: string }) {
    return await ctx.runQuery(this.component.guilds.getByOwner, args);
  }

  async getPublicGuilds(ctx: RunQueryCtx, args?: { limit?: number }) {
    return await ctx.runQuery(this.component.guilds.getPublicGuilds, args || {});
  }

  async update(
    ctx: RunMutationCtx,
    args: {
      id: string;
      ownerId: string;
      name?: string;
      description?: string;
      profileImageId?: string;
      bannerImageId?: string;
      visibility?: "public" | "private";
    }
  ) {
    return await ctx.runMutation(this.component.guilds.update, {
      id: args.id as any,
      ownerId: args.ownerId,
      name: args.name,
      description: args.description,
      profileImageId: args.profileImageId,
      bannerImageId: args.bannerImageId,
      visibility: args.visibility,
    });
  }

  async disband(ctx: RunMutationCtx, args: { id: string; ownerId: string }) {
    return await ctx.runMutation(this.component.guilds.disband, {
      id: args.id as any,
      ownerId: args.ownerId,
    });
  }
}

/**
 * Client for guild member management.
 */
export class MembersClient {
  constructor(private component: typeof api) {}

  async join(ctx: RunMutationCtx, args: { guildId: string; userId: string }) {
    return await ctx.runMutation(this.component.members.join, {
      guildId: args.guildId as any,
      userId: args.userId,
    });
  }

  async leave(ctx: RunMutationCtx, args: { guildId: string; userId: string }) {
    return await ctx.runMutation(this.component.members.leave, {
      guildId: args.guildId as any,
      userId: args.userId,
    });
  }

  async kick(
    ctx: RunMutationCtx,
    args: {
      guildId: string;
      targetUserId: string;
      kickedBy: string;
    }
  ) {
    return await ctx.runMutation(this.component.members.kick, {
      guildId: args.guildId as any,
      targetUserId: args.targetUserId,
      kickedBy: args.kickedBy,
    });
  }

  async updateRole(
    ctx: RunMutationCtx,
    args: {
      guildId: string;
      targetUserId: string;
      newRole: "owner" | "member";
      updatedBy: string;
    }
  ) {
    return await ctx.runMutation(this.component.members.updateRole, {
      guildId: args.guildId as any,
      targetUserId: args.targetUserId,
      newRole: args.newRole,
      updatedBy: args.updatedBy,
    });
  }

  async transferOwnership(
    ctx: RunMutationCtx,
    args: {
      guildId: string;
      currentOwnerId: string;
      newOwnerId: string;
    }
  ) {
    return await ctx.runMutation(this.component.members.transferOwnership, {
      guildId: args.guildId as any,
      currentOwnerId: args.currentOwnerId,
      newOwnerId: args.newOwnerId,
    });
  }

  async getMembers(ctx: RunQueryCtx, args: { guildId: string }) {
    return await ctx.runQuery(this.component.members.getMembers, {
      guildId: args.guildId as any,
    });
  }

  async getMemberCount(ctx: RunQueryCtx, args: { guildId: string }) {
    return await ctx.runQuery(this.component.members.getMemberCount, {
      guildId: args.guildId as any,
    });
  }

  async getPlayerGuild(ctx: RunQueryCtx, args: { userId: string }) {
    return await ctx.runQuery(this.component.members.getPlayerGuild, args);
  }
}

/**
 * Client for guild invite system.
 */
export class InvitesClient {
  constructor(private component: typeof api) {}

  async createInvite(
    ctx: RunMutationCtx,
    args: {
      guildId: string;
      invitedBy: string;
      invitedUserId: string;
      expiresIn?: number;
    }
  ) {
    return await ctx.runMutation(this.component.invites.createInvite, {
      guildId: args.guildId as any,
      invitedBy: args.invitedBy,
      invitedUserId: args.invitedUserId,
      expiresIn: args.expiresIn,
    });
  }

  async createInviteLink(
    ctx: RunMutationCtx,
    args: {
      guildId: string;
      createdBy: string;
      maxUses?: number;
      expiresIn?: number;
    }
  ) {
    return await ctx.runMutation(this.component.invites.createInviteLink, {
      guildId: args.guildId as any,
      createdBy: args.createdBy,
      maxUses: args.maxUses,
      expiresIn: args.expiresIn,
    });
  }

  async acceptInvite(
    ctx: RunMutationCtx,
    args: {
      inviteId: string;
      userId: string;
    }
  ) {
    return await ctx.runMutation(this.component.invites.acceptInvite, {
      inviteId: args.inviteId as any,
      userId: args.userId,
    });
  }

  async useInviteLink(
    ctx: RunMutationCtx,
    args: {
      code: string;
      userId: string;
    }
  ) {
    return await ctx.runMutation(this.component.invites.useInviteLink, args);
  }

  async declineInvite(
    ctx: RunMutationCtx,
    args: {
      inviteId: string;
      userId: string;
    }
  ) {
    return await ctx.runMutation(this.component.invites.declineInvite, {
      inviteId: args.inviteId as any,
      userId: args.userId,
    });
  }

  async cancelInvite(
    ctx: RunMutationCtx,
    args: {
      inviteId: string;
      cancelledBy: string;
    }
  ) {
    return await ctx.runMutation(this.component.invites.cancelInvite, {
      inviteId: args.inviteId as any,
      cancelledBy: args.cancelledBy,
    });
  }

  async getPendingInvites(ctx: RunQueryCtx, args: { userId: string }) {
    return await ctx.runQuery(this.component.invites.getPendingInvites, args);
  }

  async getGuildInvites(
    ctx: RunQueryCtx,
    args: {
      guildId: string;
      status?: "pending" | "accepted" | "declined" | "expired";
    }
  ) {
    return await ctx.runQuery(this.component.invites.getGuildInvites, {
      guildId: args.guildId as any,
      status: args.status,
    });
  }

  async getGuildInviteLinks(
    ctx: RunQueryCtx,
    args: { guildId: string; activeOnly?: boolean }
  ) {
    return await ctx.runQuery(this.component.invites.getGuildInviteLinks, {
      guildId: args.guildId as any,
      activeOnly: args.activeOnly,
    });
  }

  async deleteInviteLink(
    ctx: RunMutationCtx,
    args: {
      linkId: string;
      deletedBy: string;
    }
  ) {
    return await ctx.runMutation(this.component.invites.deleteInviteLink, {
      linkId: args.linkId as any,
      deletedBy: args.deletedBy,
    });
  }
}

/**
 * Client for guild chat operations.
 */
export class ChatClient {
  constructor(private component: typeof api) {}

  async sendMessage(
    ctx: RunMutationCtx,
    args: {
      guildId: string;
      userId: string;
      username: string;
      message: string;
      isSystem?: boolean;
    }
  ) {
    return await ctx.runMutation(this.component.chat.sendMessage, {
      guildId: args.guildId as any,
      userId: args.userId,
      username: args.username,
      message: args.message,
      isSystem: args.isSystem,
    });
  }

  async getMessages(
    ctx: RunQueryCtx,
    args: {
      guildId: string;
      limit?: number;
      before?: number;
    }
  ) {
    return await ctx.runQuery(this.component.chat.getMessages, {
      guildId: args.guildId as any,
      limit: args.limit,
      before: args.before,
    });
  }

  async getRecentMessages(
    ctx: RunQueryCtx,
    args: {
      guildId: string;
      count?: number;
    }
  ) {
    return await ctx.runQuery(this.component.chat.getRecentMessages, {
      guildId: args.guildId as any,
      count: args.count,
    });
  }

  async deleteMessage(
    ctx: RunMutationCtx,
    args: {
      messageId: string;
      deletedBy: string;
    }
  ) {
    return await ctx.runMutation(this.component.chat.deleteMessage, {
      messageId: args.messageId as any,
      deletedBy: args.deletedBy,
    });
  }
}

/**
 * Client for guild discovery and join request operations.
 */
export class DiscoveryClient {
  constructor(private component: typeof api) {}

  async searchGuilds(
    ctx: RunQueryCtx,
    args: {
      searchTerm: string;
      limit?: number;
    }
  ) {
    return await ctx.runQuery(this.component.discovery.searchGuilds, args);
  }

  async submitJoinRequest(
    ctx: RunMutationCtx,
    args: {
      guildId: string;
      userId: string;
      message?: string;
    }
  ) {
    return await ctx.runMutation(this.component.discovery.submitJoinRequest, {
      guildId: args.guildId as any,
      userId: args.userId,
      message: args.message,
    });
  }

  async getJoinRequests(
    ctx: RunQueryCtx,
    args: {
      guildId: string;
    }
  ) {
    return await ctx.runQuery(this.component.discovery.getJoinRequests, {
      guildId: args.guildId as any,
    });
  }

  async getPlayerRequests(
    ctx: RunQueryCtx,
    args: {
      userId: string;
    }
  ) {
    return await ctx.runQuery(this.component.discovery.getPlayerRequests, args);
  }

  async approveJoinRequest(
    ctx: RunMutationCtx,
    args: {
      requestId: string;
      approvedBy: string;
    }
  ) {
    return await ctx.runMutation(this.component.discovery.approveJoinRequest, {
      requestId: args.requestId as any,
      approvedBy: args.approvedBy,
    });
  }

  async rejectJoinRequest(
    ctx: RunMutationCtx,
    args: {
      requestId: string;
      rejectedBy: string;
    }
  ) {
    return await ctx.runMutation(this.component.discovery.rejectJoinRequest, {
      requestId: args.requestId as any,
      rejectedBy: args.rejectedBy,
    });
  }
}
