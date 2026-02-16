import { useState, useCallback } from "react";
import * as Sentry from "@sentry/react";
import { apiAny, useConvexMutation } from "@/lib/convexHelpers";

export function useGameActions(matchId: string | undefined) {
  const submitAction = useConvexMutation(apiAny.game.submitAction);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const send = useCallback(
    async (command: Record<string, unknown>) => {
      if (!matchId || submitting) return;
      setSubmitting(true);
      setError("");
      try {
        await submitAction({
          matchId,
          command: JSON.stringify(command),
          seat: "host",
        });
      } catch (err: any) {
        Sentry.captureException(err);
        setError(err.message ?? "Action failed.");
      } finally {
        setSubmitting(false);
      }
    },
    [matchId, submitAction, submitting],
  );

  return {
    submitting,
    error,
    clearError: () => setError(""),
    advancePhase: () => send({ type: "ADVANCE_PHASE" }),
    endTurn: () => send({ type: "END_TURN" }),
    surrender: () => send({ type: "SURRENDER" }),
    summon: (cardId: string, position: "attack" | "defense", tributeCardIds?: string[]) =>
      send({ type: "SUMMON", cardId, position, tributeCardIds }),
    setMonster: (cardId: string) => send({ type: "SET_MONSTER", cardId }),
    flipSummon: (cardId: string) => send({ type: "FLIP_SUMMON", cardId }),
    setSpellTrap: (cardId: string) => send({ type: "SET_SPELL_TRAP", cardId }),
    activateSpell: (cardId: string, targets?: string[]) =>
      send({ type: "ACTIVATE_SPELL", cardId, targets }),
    activateTrap: (cardId: string, targets?: string[]) =>
      send({ type: "ACTIVATE_TRAP", cardId, targets }),
    declareAttack: (attackerId: string, targetId?: string) =>
      send({ type: "DECLARE_ATTACK", attackerId, targetId }),
    chainResponse: (cardId?: string, pass = true) =>
      send({ type: "CHAIN_RESPONSE", cardId, pass }),
  };
}
