/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    mutations: {
      createMatch: FunctionReference<
        "mutation",
        "internal",
        {
          awayDeck?: Array<string>;
          awayId?: string;
          hostDeck: Array<string>;
          hostId: string;
          isAIOpponent: boolean;
          mode: "pvp" | "story";
        },
        string,
        Name
      >;
      joinMatch: FunctionReference<
        "mutation",
        "internal",
        { awayDeck: Array<string>; awayId: string; matchId: string },
        null,
        Name
      >;
      startMatch: FunctionReference<
        "mutation",
        "internal",
        {
          configAllowlist?: {
            pongEnabled?: boolean;
            redemptionEnabled?: boolean;
          };
          initialState: string;
          matchId: string;
        },
        null,
        Name
      >;
      submitAction: FunctionReference<
        "mutation",
        "internal",
        {
          cardLookup?: string;
          command: string;
          expectedVersion: number;
          matchId: string;
          seat: "host" | "away";
        },
        { events: string; version: number },
        Name
      >;
    };
    queries: {
      getActiveMatchByHost: FunctionReference<
        "query",
        "internal",
        { hostId: string },
        {
          _creationTime: number;
          _id: string;
          awayDeck: Array<string> | null;
          awayId: string | null;
          createdAt: number;
          endReason?: string;
          endedAt?: number;
          hostDeck: Array<string>;
          hostId: string;
          isAIOpponent: boolean;
          mode: "pvp" | "story";
          startedAt?: number;
          status: "waiting" | "active" | "ended";
          winner?: "host" | "away";
        } | null,
        Name
      >;
      getLatestSnapshotVersion: FunctionReference<
        "query",
        "internal",
        { matchId: string },
        number,
        Name
      >;
      getMatchMeta: FunctionReference<
        "query",
        "internal",
        { matchId: string },
        {
          _creationTime: number;
          _id: string;
          awayDeck: Array<string> | null;
          awayId: string | null;
          createdAt: number;
          endReason?: string;
          endedAt?: number;
          hostDeck: Array<string>;
          hostId: string;
          isAIOpponent: boolean;
          mode: "pvp" | "story";
          startedAt?: number;
          status: "waiting" | "active" | "ended";
          winner?: "host" | "away";
        } | null,
        Name
      >;
      getOpenLobbyByHost: FunctionReference<
        "query",
        "internal",
        { hostId: string },
        {
          _creationTime: number;
          _id: string;
          awayDeck: Array<string> | null;
          awayId: string | null;
          createdAt: number;
          endReason?: string;
          endedAt?: number;
          hostDeck: Array<string>;
          hostId: string;
          isAIOpponent: boolean;
          mode: "pvp" | "story";
          startedAt?: number;
          status: "waiting" | "active" | "ended";
          winner?: "host" | "away";
        } | null,
        Name
      >;
      getOpenPrompt: FunctionReference<
        "query",
        "internal",
        { matchId: string; seat: "host" | "away" },
        {
          _creationTime: number;
          _id: string;
          createdAt: number;
          data?: string;
          matchId: string;
          promptType:
            | "chain_response"
            | "optional_trigger"
            | "replay_decision"
            | "discard";
          resolved: boolean;
          resolvedAt?: number;
          seat: "host" | "away";
        } | null,
        Name
      >;
      getPlayerView: FunctionReference<
        "query",
        "internal",
        { matchId: string; seat: "host" | "away" },
        string | null,
        Name
      >;
      getRecentEvents: FunctionReference<
        "query",
        "internal",
        { matchId: string; sinceVersion: number },
        Array<{
          _creationTime: number;
          _id: string;
          command: string;
          createdAt: number;
          events: string;
          seat: "host" | "away";
          version: number;
        }>,
        Name
      >;
    };
  };
