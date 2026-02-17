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
          awayDeck: Array<string>;
          awayId: string;
          hostDeck: Array<string>;
          hostId: string;
          isAIOpponent: boolean;
          mode: "pvp" | "story";
        },
        string,
        Name
      >;
      startMatch: FunctionReference<
        "mutation",
        "internal",
        { initialState: string; matchId: string },
        null,
        Name
      >;
      submitAction: FunctionReference<
        "mutation",
        "internal",
        {
          cardLookup?: string;
          command: string;
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
        any,
        Name
      >;
      getMatchMeta: FunctionReference<
        "query",
        "internal",
        { matchId: string },
        any,
        Name
      >;
      getOpenPrompt: FunctionReference<
        "query",
        "internal",
        { matchId: string; seat: "host" | "away" },
        any,
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
        any,
        Name
      >;
    };
  };
