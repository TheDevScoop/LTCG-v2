import { useMemo } from "react";
import { apiAny, useConvexQuery } from "@/lib/convexHelpers";

export type ValidActions = {
  canSummon: Map<string, { positions: ("attack" | "defense")[]; needsTribute: boolean }>;
  canSetMonster: Set<string>;
  canSetSpellTrap: Set<string>;
  canActivateSpell: Set<string>;
  canActivateTrap: Set<string>;
  canAttack: Map<string, string[]>; // attackerId → targetIds (empty string = direct)
  canFlipSummon: Set<string>;
};

export function useGameState(matchId: string | undefined) {
  // Query match metadata
  const meta = useConvexQuery(apiAny.game.getMatchMeta, matchId ? { matchId } : "skip") as any;

  // Query player view (returned as JSON string from Convex)
  const viewJson = useConvexQuery(
    apiAny.game.getPlayerView,
    matchId ? { matchId, seat: "host" } : "skip",
  ) as string | null | undefined;

  // Query all card definitions for lookup
  const allCards = useConvexQuery(apiAny.game.getAllCards, {}) as any[] | undefined;

  // Parse view JSON
  const view = useMemo(() => {
    if (!viewJson) return null;
    try {
      return JSON.parse(viewJson);
    } catch {
      return null;
    }
  }, [viewJson]);

  // Build card lookup map
  const cardLookup = useMemo(() => {
    if (!allCards) return {};
    const map: Record<string, any> = {};
    for (const c of allCards) map[c._id] = c;
    return map;
  }, [allCards]);

  const isMyTurn = view?.currentTurnPlayer === view?.mySeat;
  const phase = view?.currentPhase ?? "draw";
  const gameOver = view?.gameOver ?? false;

  // Derive valid actions from current state
  const validActions = useMemo(() => {
    const va: ValidActions = {
      canSummon: new Map(),
      canSetMonster: new Set(),
      canSetSpellTrap: new Set(),
      canActivateSpell: new Set(),
      canActivateTrap: new Set(),
      canAttack: new Map(),
      canFlipSummon: new Set(),
    };

    if (!view || !isMyTurn || gameOver) return va;

    const isMainPhase = phase === "main" || phase === "main2";
    const board = view.board ?? [];
    const hand = view.hand ?? [];
    const stZone = view.spellTrapZone ?? [];
    const opponentBoard = view.opponentBoard ?? [];

    if (isMainPhase) {
      if (board.length < 5) {
        for (const cardId of hand) {
          const card = cardLookup[cardId];
          if (!card) continue;
          if (card.cardType === "stereotype" || card.type === "stereotype") {
            const level = card.level ?? 0;
            const needsTribute = level >= 5;
            va.canSummon.set(cardId, { positions: ["attack", "defense"], needsTribute });
            va.canSetMonster.add(cardId);
          }
        }
      }

      if (stZone.length < 5) {
        for (const cardId of hand) {
          const card = cardLookup[cardId];
          if (!card) continue;
          if (card.cardType === "spell" || card.type === "spell") {
            va.canSetSpellTrap.add(cardId);
            va.canActivateSpell.add(cardId);
          }
          if (card.cardType === "trap" || card.type === "trap") {
            va.canSetSpellTrap.add(cardId);
          }
        }
      }

      // Activate set spells/traps
      for (const stCard of stZone) {
        if (!stCard.faceDown) continue;
        const card = cardLookup[stCard.definitionId];
        if (!card) continue;
        if (card.type === "spell" || card.cardType === "spell") va.canActivateSpell.add(stCard.cardId);
        if (card.type === "trap" || card.cardType === "trap") va.canActivateTrap.add(stCard.cardId);
      }

      // Flip summon
      for (const bc of board) {
        if (bc.faceDown && bc.turnSummoned < (view.turnNumber ?? 999)) {
          va.canFlipSummon.add(bc.cardId);
        }
      }
    }

    // Combat attacks
    if (phase === "combat" && (view.turnNumber ?? 0) > 1) {
      for (const mon of board) {
        if (mon.faceDown || !mon.canAttack || mon.hasAttackedThisTurn) continue;
        const targets: string[] = [];
        for (const opp of opponentBoard) targets.push(opp.cardId);
        const faceUpOpponents = opponentBoard.filter((c: any) => !c.faceDown);
        if (faceUpOpponents.length === 0) targets.push(""); // direct attack
        va.canAttack.set(mon.cardId, targets);
      }
    }

    return va;
  }, [view, isMyTurn, phase, gameOver, cardLookup]);

  return {
    meta,
    view,
    cardLookup,
    isMyTurn,
    phase,
    gameOver,
    validActions,
    isLoading: meta === undefined || viewJson === undefined,
    notFound: meta === null,
  };
}
