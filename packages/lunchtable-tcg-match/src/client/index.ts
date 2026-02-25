import type {
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";
import type { api } from "../component/_generated/api.js";

export type RunQueryCtx = {
  runQuery: GenericQueryCtx<GenericDataModel>["runQuery"];
};

export type RunMutationCtx = {
  runMutation: GenericMutationCtx<GenericDataModel>["runMutation"];
};

export type { api };

/**
 * Client for the @lunchtable/match Convex component.
 *
 * Usage:
 * ```ts
 * import { components } from "@convex/_generated/api";
 * import { LTCGMatch } from "@lunchtable/match";
 *
 * const match = new LTCGMatch(components.ltcgMatch);
 *
 * // In a mutation:
 * const matchId = await match.createMatch(ctx, { hostId, awayId, ... });
 * await match.startMatch(ctx, { matchId, initialState: JSON.stringify(state) });
 *
 * // In a query:
 * const view = await match.getPlayerView(ctx, { matchId, seat: "host" });
 * ```
 */
export class LTCGMatch {
  constructor(private component: typeof api) {}

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  async createMatch(
    ctx: RunMutationCtx,
    args: {
      hostId: string;
      awayId?: string;
      mode: "pvp" | "story";
      hostDeck: string[];
      awayDeck?: string[];
      isAIOpponent: boolean;
    }
  ) {
    return await ctx.runMutation(this.component.mutations.createMatch, args);
  }

  async joinMatch(
    ctx: RunMutationCtx,
    args: {
      matchId: string;
      awayId: string;
      awayDeck: string[];
    }
  ) {
    return await ctx.runMutation(this.component.mutations.joinMatch, {
      matchId: args.matchId as any,
      awayId: args.awayId,
      awayDeck: args.awayDeck,
    });
  }

  async startMatch(
    ctx: RunMutationCtx,
    args: {
      matchId: string;
      initialState: string;
      configAllowlist?: {
        pongEnabled?: boolean;
        redemptionEnabled?: boolean;
      };
    }
  ) {
    return await ctx.runMutation(this.component.mutations.startMatch, {
      matchId: args.matchId as any,
      initialState: args.initialState,
      configAllowlist: args.configAllowlist,
    });
  }

  async cancelMatch(
    ctx: RunMutationCtx,
    args: { matchId: string }
  ) {
    return await ctx.runMutation(this.component.mutations.cancelMatch, {
      matchId: args.matchId as any,
    });
  }

  async submitAction(
    ctx: RunMutationCtx,
    args: {
      matchId: string;
      command: string;
      seat: "host" | "away";
      cardLookup?: string;
      expectedVersion: number;
    }
  ) {
    return await ctx.runMutation(this.component.mutations.submitAction, {
      matchId: args.matchId as any,
      command: args.command,
      seat: args.seat,
      cardLookup: args.cardLookup,
      expectedVersion: args.expectedVersion,
    });
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  async getMatchMeta(
    ctx: RunQueryCtx,
    args: { matchId: string }
  ) {
    return await ctx.runQuery(this.component.queries.getMatchMeta, {
      matchId: args.matchId as any,
    });
  }

  async getPlayerView(
    ctx: RunQueryCtx,
    args: {
      matchId: string;
      seat: "host" | "away";
    }
  ) {
    return await ctx.runQuery(this.component.queries.getPlayerView, {
      matchId: args.matchId as any,
      seat: args.seat,
    });
  }

  async getLegalMoves(
    ctx: RunQueryCtx,
    args: {
      matchId: string;
      seat: "host" | "away";
    }
  ) {
    return await ctx.runQuery((this.component.queries as any).getLegalMoves, {
      matchId: args.matchId as any,
      seat: args.seat,
    });
  }

  async getRecentEvents(
    ctx: RunQueryCtx,
    args: {
      matchId: string;
      sinceVersion: number;
    }
  ) {
    return await ctx.runQuery(this.component.queries.getRecentEvents, {
      matchId: args.matchId as any,
      sinceVersion: args.sinceVersion,
    });
  }

  async getRecentEventsPaginated(
    ctx: RunQueryCtx,
    args: {
      matchId: string;
      paginationOpts: unknown;
    }
  ) {
    return await ctx.runQuery((this.component.queries as any).getRecentEventsPaginated, {
      matchId: args.matchId as any,
      paginationOpts: args.paginationOpts as any,
    });
  }

  async getLatestSnapshotVersion(
    ctx: RunQueryCtx,
    args: { matchId: string }
  ) {
    return await ctx.runQuery(this.component.queries.getLatestSnapshotVersion, {
      matchId: args.matchId as any,
    });
  }

  async getActiveMatchByHost(
    ctx: RunQueryCtx,
    args: { hostId: string }
  ) {
    return await ctx.runQuery(this.component.queries.getActiveMatchByHost, {
      hostId: args.hostId,
    });
  }

  async getOpenLobbyByHost(
    ctx: RunQueryCtx,
    args: { hostId: string }
  ) {
    return await ctx.runQuery(this.component.queries.getOpenLobbyByHost, {
      hostId: args.hostId,
    });
  }

  async getOpenPrompt(
    ctx: RunQueryCtx,
    args: {
      matchId: string;
      seat: "host" | "away";
    }
  ) {
    return await ctx.runQuery(this.component.queries.getOpenPrompt, {
      matchId: args.matchId as any,
      seat: args.seat,
    });
  }
}
