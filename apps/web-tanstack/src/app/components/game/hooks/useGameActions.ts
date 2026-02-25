import { useState, useCallback } from "react";
import * as Sentry from "@sentry/react";
import { apiAny, useConvexMutation } from "@/lib/convexHelpers";
import { useAudio } from "@/components/audio/AudioProvider";
import { type Seat } from "./useGameState";

function sfxForCommand(command: Record<string, unknown>): string | null {
  const type = typeof command.type === "string" ? command.type : "";
  switch (type) {
    case "SUMMON":
    case "SET_MONSTER":
    case "FLIP_SUMMON":
      return "summon";
    case "SET_SPELL_TRAP":
    case "ACTIVATE_SPELL":
    case "ACTIVATE_TRAP":
    case "ACTIVATE_EFFECT":
      return "spell";
    case "DECLARE_ATTACK":
      return "attack";
    case "ADVANCE_PHASE":
    case "END_TURN":
      return "turn";
    case "SURRENDER":
      return "defeat";
    default:
      return null;
  }
}

/** Diagnose why an action was silently rejected by the engine. */
function diagnoseRejection(command: Record<string, unknown>): string {
  const type = typeof command.type === "string" ? command.type : "";
  switch (type) {
    case "SUMMON":
    case "SET_MONSTER":
      return "Can't summon — board may be full, or you already normal-summoned this turn.";
    case "SET_SPELL_TRAP":
      return "Can't set — spell/trap zone may be full.";
    case "ACTIVATE_SPELL":
      return "Spell can't activate — wrong phase or spell/trap zone is full.";
    case "ACTIVATE_TRAP":
      return "Trap can't activate — it must be set face-down first.";
    case "ACTIVATE_EFFECT":
      return "Effect can't activate — must be main phase with the monster face-up on your field.";
    case "FLIP_SUMMON":
      return "Can't flip summon — card must be set for at least one turn.";
    case "DECLARE_ATTACK":
      return "Can't attack — must be combat phase, and monster must be face-up in attack position.";
    case "CHANGE_POSITION":
      return "Can't change position — already changed this turn, or summoned this turn.";
    default:
      return "Action not allowed right now.";
  }
}

export function useGameActions(
  matchId: string | undefined,
  seat: Seat,
  expectedVersion?: number | null,
) {
  const submitAction = useConvexMutation(apiAny.game.submitAction);
  const { playSfx } = useAudio();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const send = useCallback(
    async (command: Record<string, unknown>) => {
      if (!matchId || submitting) return;
      if (typeof expectedVersion !== "number") {
        setError("State version unavailable. Wait for sync and try again.");
        return;
      }
      setSubmitting(true);
      setError("");
      try {
        const result: any = await submitAction({
          matchId,
          command: JSON.stringify(command),
          seat,
          expectedVersion,
        });
        // Engine returns empty events when the action is silently rejected
        if (result?.events === "[]") {
          setError(diagnoseRejection(command));
          playSfx("error");
          return;
        }
        const sfx = sfxForCommand(command);
        if (sfx) playSfx(sfx);
      } catch (err: any) {
        Sentry.captureException(err);
        const message = err?.message ?? "Action failed.";
        const normalized = String(message).toLowerCase();
        if (normalized.includes("version mismatch") || normalized.includes("state updated")) {
          setError("Action was rejected due to stale state. Refreshing the view should sync.");
        } else {
          setError(message);
        }
        playSfx("error");
      } finally {
        setSubmitting(false);
      }
    },
    [matchId, seat, expectedVersion, submitAction, submitting, playSfx],
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
    activateEffect: (cardId: string, effectIndex: number, targets?: string[]) =>
      send({ type: "ACTIVATE_EFFECT", cardId, effectIndex, targets }),
    changePosition: (cardId: string) =>
      send({ type: "CHANGE_POSITION", cardId }),
    declareAttack: (attackerId: string, targetId?: string) =>
      send({ type: "DECLARE_ATTACK", attackerId, targetId }),
    chainResponse: (cardId?: string, pass = true) =>
      send({ type: "CHAIN_RESPONSE", cardId, pass }),
    pongShoot: (destroyedCardId: string, result: "sink" | "miss") =>
      send({ type: "PONG_SHOOT", destroyedCardId, result }),
    pongDecline: (destroyedCardId: string) =>
      send({ type: "PONG_DECLINE", destroyedCardId }),
    redemptionShoot: (result: "sink" | "miss") =>
      send({ type: "REDEMPTION_SHOOT", result }),
    redemptionDecline: () =>
      send({ type: "REDEMPTION_DECLINE" }),
  };
}
