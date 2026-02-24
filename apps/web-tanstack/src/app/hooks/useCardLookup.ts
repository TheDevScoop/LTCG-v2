import { useMemo } from "react";
import { useQuery } from "convex/react";
import { apiAny } from "@/lib/convexHelpers";
import type { CardDefinition } from "@/lib/convexTypes";

export function useCardLookup(): { lookup: Record<string, CardDefinition>; isLoaded: boolean } {
  const allCards = useQuery(apiAny.game.getAllCards, {}) as CardDefinition[] | undefined;
  const lookup = useMemo<Record<string, CardDefinition>>(() => {
    if (!allCards) return {};
    const map: Record<string, CardDefinition> = {};
    for (const card of allCards) {
      map[card._id] = card;
    }
    return map;
  }, [allCards]);
  return { lookup, isLoaded: allCards !== undefined };
}
