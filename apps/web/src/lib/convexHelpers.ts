import {
  type OptionalRestArgsOrSkip,
  useAction,
  useMutation,
  useQuery,
} from "convex/react";
import { api } from "@convex-generated-api";
import type { DefaultFunctionArgs, FunctionReference } from "convex/server";

export { api };

export const convex = {
  api,
} as const;

// Backward-compatible alias while callsites migrate to typed helpers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const apiAny = api as any;

/**
 * Strictly typed helper for Convex public mutations.
 */
export function useConvexMutation<
  TMutation extends FunctionReference<"mutation", "public", DefaultFunctionArgs>,
>(path: TMutation) {
  return useMutation(path);
}

/**
 * Strictly typed helper for Convex public queries.
 *
 * Use "skip" when the query should be paused until prerequisites are ready.
 */
export function useConvexQuery<
  TQuery extends FunctionReference<"query", "public", DefaultFunctionArgs>,
>(
  path: TQuery,
  ...args: OptionalRestArgsOrSkip<TQuery>
) {
  return useQuery(path, ...args);
}

/**
 * Strictly typed helper for Convex public actions.
 */
export function useConvexAction<
  TAction extends FunctionReference<"action", "public", DefaultFunctionArgs>,
>(path: TAction) {
  return useAction(path);
}
