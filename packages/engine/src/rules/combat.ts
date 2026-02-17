import type { GameState, Seat, Command, EngineEvent, BoardCard } from "../types/index.js";
import { opponentSeat } from "./phases.js";

export function decideDeclareAttack(
  state: GameState,
  seat: Seat,
  command: Extract<Command, { type: "DECLARE_ATTACK" }>
): EngineEvent[] {
  const events: EngineEvent[] = [];
  const { attackerId, targetId } = command;

  // Check phase
  if (state.currentPhase !== "combat") {
    return events;
  }

  // Cannot attack on turn 1
  if (state.turnNumber === 1) {
    return events;
  }

  // Get attacker
  const board = seat === "host" ? state.hostBoard : state.awayBoard;
  const attacker = board.find((c) => c.cardId === attackerId);
  if (!attacker) {
    return events;
  }

  // Attacker must be face-up
  if (attacker.faceDown) {
    return events;
  }

  // Attacker must have canAttack=true and hasAttackedThisTurn=false
  if (!attacker.canAttack || attacker.hasAttackedThisTurn) {
    return events;
  }

  // Get opponent's board
  const opponentBoard = seat === "host" ? state.awayBoard : state.hostBoard;

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
    const defender = opponentBoard.find((c) => c.cardId === targetId);
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
      const { seat, attackerId } = event;
      const isHost = seat === "host";

      // Update attacker to mark it has attacked
      const board = isHost ? [...newState.hostBoard] : [...newState.awayBoard];
      const attackerIndex = board.findIndex((c) => c.cardId === attackerId);
      if (attackerIndex > -1) {
        const attacker = board[attackerIndex];
        if (!attacker) {
          break;
        }

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
