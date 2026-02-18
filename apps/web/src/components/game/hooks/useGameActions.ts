import { useState, useCallback } from "react";
import * as Sentry from "@sentry/react";
import { apiAny, useConvexMutation } from "@/lib/convexHelpers";
import { useAudio } from "@/components/audio/AudioProvider";
import { type Seat } from "./useGameState";
import { isTelegramMiniApp } from "@/hooks/auth/useTelegramAuth";

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

export function useGameActions(
  matchId: string | undefined,
  seat: Seat,
  expectedVersion?: number | null,
) {
  const submitAction = useConvexMutation(apiAny.game.submitActionWithClient);
  const { playSfx } = useAudio();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const client = isTelegramMiniApp() ? "telegram_miniapp" : "web";

  const send = useCallback(
    async (command: Record<string, unknown>) => {
      if (!matchId || submitting) return;
      setSubmitting(true);
      setError("");
      try {
        await submitAction({
          matchId,
          command: JSON.stringify(command),
          seat,
          expectedVersion: typeof expectedVersion === "number" ? expectedVersion : undefined,
          client,
        });
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
    [matchId, seat, expectedVersion, submitAction, submitting, playSfx, client],
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
