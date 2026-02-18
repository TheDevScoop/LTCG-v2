import type { GameState, Seat, Command, EngineEvent, BoardCard } from "../types/index.js";
import { opponentSeat } from "./phases.js";
import { expectDefined } from "../internal/invariant.js";

export function decideDeclareAttack(
  state: GameState,
  seat: Seat,
  command: Extract<Command, { type: "DECLARE_ATTACK" }>
): EngineEvent[] {
  const events: EngineEvent[] = [];
  const { attackerId, attackerSlot, targetId, targetSlot } = command;

  // Check phase
  if (state.currentPhase !== "combat") {
    return events;
  }

  // Cannot attack on turn 1
  if (state.turnNumber === 1) {
    return events;
  }

  const board = seat === "host" ? state.hostBoard : state.awayBoard;
  const opponentBoard = seat === "host" ? state.awayBoard : state.hostBoard;

  const resolveBoardMonsterBySlot = (
    boardCards: BoardCard[],
    cardId: string,
    slot?: number,
  ) => {
    if (slot !== undefined) {
      const candidate = boardCards[slot];
      if (
        candidate &&
        candidate.cardId === cardId &&
        !candidate.faceDown &&
        candidate.canAttack &&
        !candidate.hasAttackedThisTurn
      ) {
        return { index: slot, card: candidate };
      }

      return undefined;
    }

    const candidates = boardCards
      .map((card, index) => ({ card, index }))
      .filter(
        ({ card }) =>
          card.cardId === cardId && !card.faceDown && card.canAttack && !card.hasAttackedThisTurn,
      );

    if (candidates.length !== 1) {
      return undefined;
    }

    return candidates[0];
  };

  const resolvedAttacker = resolveBoardMonsterBySlot(board, attackerId, attackerSlot);
  if (!resolvedAttacker) {
    return events;
  }

  const attacker = resolvedAttacker.card;

  // Attacker must be face-up
  if (attacker.faceDown) {
    return events;
  }

  // Attacker must have canAttack=true and hasAttackedThisTurn=false
  if (!attacker.canAttack || attacker.hasAttackedThisTurn) {
    return events;
  }

  // Determine battle type
  if (!targetId) {
    // Direct attack - opponent must have no monsters
    const faceUpMonsters = opponentBoard.filter((c) => !c.faceDown);
    if (faceUpMonsters.length > 0) {
      return events;
    }

    // Get attacker stats
    const attackerStats = getMonsterStats(state, attacker);
    if (!attackerStats) {
      return events;
    }

    // Emit attack declared
    events.push({
      type: "ATTACK_DECLARED",
      seat,
      attackerId,
      ...(attackerSlot !== undefined ? { attackerSlot } : {}),
      targetId: null,
    });

    // Deal damage
    events.push({
      type: "DAMAGE_DEALT",
      seat: opponentSeat(seat),
      amount: attackerStats.attack,
      isBattle: true,
    });

    // Battle resolved
    events.push({
      type: "BATTLE_RESOLVED",
      attackerId,
      defenderId: null,
      result: "win",
    });
  } else {
    // Attack a specific monster
    const resolvedTargets = opponentBoard.filter((card) => card.cardId === targetId);

    const selectedTargetWithSlot =
      targetSlot !== undefined
        ? opponentBoard[targetSlot]
        : undefined;
    const defender =
      targetSlot !== undefined
        ? selectedTargetWithSlot
        : resolvedTargets[0];

    if (targetSlot !== undefined) {
      if (!selectedTargetWithSlot || selectedTargetWithSlot.cardId !== targetId) {
        return events;
      }
    } else if (resolvedTargets.length !== 1) {
      return events;
    }

    if (!defender) {
      return events;
    }

    // Get attacker stats
    const attackerStats = getMonsterStats(state, attacker);
    if (!attackerStats) {
      return events;
    }

    // Emit attack declared
    events.push({
      type: "ATTACK_DECLARED",
      seat,
      attackerId,
      ...(attackerSlot !== undefined ? { attackerSlot } : {}),
      targetId,
    });

    // Get defender stats
    const defenderStats = getMonsterStats(state, defender);
    if (!defenderStats) {
      return events;
    }

    // Resolve battle based on defender position
    if (defender.position === "attack") {
      // Attack vs Attack
      if (attackerStats.attack > defenderStats.attack) {
        // Attacker wins
        events.push({
          type: "CARD_DESTROYED",
          cardId: targetId,
          reason: "battle",
        });
        events.push({
          type: "CARD_SENT_TO_GRAVEYARD",
          cardId: targetId,
          from: "board",
          sourceSeat: opponentSeat(seat),
        });

        // Deal damage difference
        const damage = attackerStats.attack - defenderStats.attack;
        events.push({
          type: "DAMAGE_DEALT",
          seat: opponentSeat(seat),
          amount: damage,
          isBattle: true,
        });

        events.push({
          type: "BATTLE_RESOLVED",
          attackerId,
          defenderId: targetId,
          result: "win",
        });
      } else if (attackerStats.attack < defenderStats.attack) {
        // Defender wins
        events.push({
          type: "CARD_DESTROYED",
          cardId: attackerId,
          reason: "battle",
        });
        events.push({
          type: "CARD_SENT_TO_GRAVEYARD",
          cardId: attackerId,
          from: "board",
          sourceSeat: seat,
        });

        // Deal damage difference
        const damage = defenderStats.attack - attackerStats.attack;
        events.push({
          type: "DAMAGE_DEALT",
          seat,
          amount: damage,
          isBattle: true,
        });

        events.push({
          type: "BATTLE_RESOLVED",
          attackerId,
          defenderId: targetId,
          result: "lose",
        });
      } else {
        // Draw - both destroyed
        events.push({
          type: "CARD_DESTROYED",
          cardId: attackerId,
          reason: "battle",
        });
        events.push({
          type: "CARD_SENT_TO_GRAVEYARD",
          cardId: attackerId,
          from: "board",
          sourceSeat: seat,
        });
        events.push({
          type: "CARD_DESTROYED",
          cardId: targetId,
          reason: "battle",
        });
        events.push({
          type: "CARD_SENT_TO_GRAVEYARD",
          cardId: targetId,
          from: "board",
          sourceSeat: opponentSeat(seat),
        });

        events.push({
          type: "BATTLE_RESOLVED",
          attackerId,
          defenderId: targetId,
          result: "draw",
        });
      }
    } else {
      // Attack vs Defense
      if (attackerStats.attack > defenderStats.defense) {
        // Defender destroyed
        events.push({
          type: "CARD_DESTROYED",
          cardId: targetId,
          reason: "battle",
        });
        events.push({
          type: "CARD_SENT_TO_GRAVEYARD",
          cardId: targetId,
          from: "board",
          sourceSeat: opponentSeat(seat),
        });

        events.push({
          type: "BATTLE_RESOLVED",
          attackerId,
          defenderId: targetId,
          result: "win",
        });
      } else if (attackerStats.attack < defenderStats.defense) {
        // Attacker takes damage
        const damage = defenderStats.defense - attackerStats.attack;
        events.push({
          type: "DAMAGE_DEALT",
          seat,
          amount: damage,
          isBattle: true,
        });

        events.push({
          type: "BATTLE_RESOLVED",
          attackerId,
          defenderId: targetId,
          result: "lose",
        });
      } else {
        // Equal - nothing happens
        events.push({
          type: "BATTLE_RESOLVED",
          attackerId,
          defenderId: targetId,
          result: "draw",
        });
      }
    }
  }

  return events;
}

export function evolveCombat(state: GameState, event: EngineEvent): GameState {
  const newState = { ...state };

  switch (event.type) {
    case "ATTACK_DECLARED": {
      const { seat, attackerId, attackerSlot } = event;
      const isHost = seat === "host";

      // Update attacker to mark it has attacked
      const board = isHost ? [...newState.hostBoard] : [...newState.awayBoard];
      const candidateAttackers = board
        .map((card, index) => ({ card, index }))
        .filter(
          (entry) =>
            entry.card.cardId === attackerId &&
            !entry.card.faceDown &&
            !entry.card.hasAttackedThisTurn &&
            entry.card.canAttack,
        );

      const explicitAttackerCard =
        attackerSlot !== undefined &&
        attackerSlot >= 0 &&
        attackerSlot < board.length
          ? board[attackerSlot]
          : undefined;
      let attackerIndex = -1;
      if (
        explicitAttackerCard !== undefined &&
        attackerSlot !== undefined &&
        explicitAttackerCard.cardId === attackerId &&
        !explicitAttackerCard.faceDown &&
        explicitAttackerCard.canAttack &&
        !explicitAttackerCard.hasAttackedThisTurn
      ) {
        attackerIndex = attackerSlot;
      } else if (candidateAttackers.length === 1 && candidateAttackers[0]) {
        attackerIndex = candidateAttackers[0].index;
      }
      if (attackerIndex > -1) {
        const attacker = expectDefined(
          board[attackerIndex],
          `rules.combat.evolveCombat missing attacker at index ${attackerIndex}`
        );

        board[attackerIndex] = {
          ...attacker,
          hasAttackedThisTurn: true,
        };
      }

      if (isHost) {
        newState.hostBoard = board;
      } else {
        newState.awayBoard = board;
      }
      break;
    }

    case "DAMAGE_DEALT": {
      const { seat, amount } = event;
      const isHost = seat === "host";

      if (isHost) {
        newState.hostLifePoints = Math.max(0, newState.hostLifePoints - amount);
      } else {
        newState.awayLifePoints = Math.max(0, newState.awayLifePoints - amount);
      }
      break;
    }

    case "CARD_DESTROYED": {
      // The actual removal is handled by CARD_SENT_TO_GRAVEYARD
      // This event is informational
      break;
    }

    case "BATTLE_RESOLVED": {
      // This event is informational
      break;
    }
  }

  return newState;
}

function getMonsterStats(
  state: GameState,
  card: BoardCard
): { attack: number; defense: number } | null {
  const definition = state.cardLookup[card.definitionId];
  if (!definition || definition.type !== "stereotype") {
    return null;
  }

  const baseAttack = definition.attack ?? 0;
  const baseDefense = definition.defense ?? 0;

  return {
    attack: baseAttack + card.temporaryBoosts.attack,
    defense: baseDefense + card.temporaryBoosts.defense,
  };
}
