import type { SessionAction, SessionEvent, SessionState } from "./types.js";

function nextEventId(sessionId: string, turn: number, index: number): string {
  return `${sessionId}:${turn}:${index}`;
}

export function createSessionState(sessionId: string, worldId: string): SessionState {
  return {
    schemaVersion: "1.0.0",
    sessionId,
    worldId,
    turn: 1,
    phase: "setup",
    actors: {},
    flags: {},
    log: ["Session created."],
  };
}

export function evolve(state: SessionState, action: SessionAction): { state: SessionState; event: SessionEvent } {
  const nextState: SessionState = {
    ...state,
    actors: { ...state.actors },
    flags: { ...state.flags },
    log: [...state.log],
  };

  switch (action.actionType) {
    case "SET_PHASE": {
      const phase = action.payload.phase;
      if (
        phase !== "setup" &&
        phase !== "briefing" &&
        phase !== "action" &&
        phase !== "resolution" &&
        phase !== "ended"
      ) {
        throw new Error("Invalid phase");
      }
      nextState.phase = phase;
      nextState.log.push(`Phase set to ${phase}`);
      break;
    }
    case "FLAG_SET": {
      const key = String(action.payload.key ?? "");
      const value = action.payload.value;
      if (!key) throw new Error("Flag key is required");
      if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
        throw new Error("Flag value must be string, number, or boolean");
      }
      nextState.flags[key] = value;
      nextState.log.push(`Flag ${key} updated`);
      break;
    }
    case "DAMAGE": {
      const targetSeat = String(action.payload.targetSeat ?? "");
      const amount = Number(action.payload.amount ?? 0);
      const actor = nextState.actors[targetSeat];
      if (!actor) throw new Error(`Unknown actor seat: ${targetSeat}`);
      actor.hp = Math.max(0, actor.hp - amount);
      nextState.log.push(`${targetSeat} took ${amount} damage`);
      break;
    }
    case "HEAL": {
      const targetSeat = String(action.payload.targetSeat ?? "");
      const amount = Number(action.payload.amount ?? 0);
      const actor = nextState.actors[targetSeat];
      if (!actor) throw new Error(`Unknown actor seat: ${targetSeat}`);
      actor.hp = actor.hp + amount;
      nextState.log.push(`${targetSeat} healed ${amount}`);
      break;
    }
    case "RESOURCE_DELTA": {
      const targetSeat = String(action.payload.targetSeat ?? "");
      const resource = String(action.payload.resource ?? "");
      const delta = Number(action.payload.delta ?? 0);
      const actor = nextState.actors[targetSeat];
      if (!actor) throw new Error(`Unknown actor seat: ${targetSeat}`);
      actor.resources[resource] = (actor.resources[resource] ?? 0) + delta;
      nextState.log.push(`${targetSeat} ${resource} changed by ${delta}`);
      break;
    }
    case "LOG": {
      const message = String(action.payload.message ?? "").trim();
      if (!message) throw new Error("Log message is required");
      nextState.log.push(message);
      break;
    }
    case "ADVANCE_TURN": {
      nextState.turn += 1;
      nextState.phase = "briefing";
      nextState.log.push(`Turn advanced to ${nextState.turn}`);
      break;
    }
    case "END_SESSION": {
      nextState.phase = "ended";
      nextState.log.push("Session ended");
      break;
    }
    default:
      throw new Error(`Unsupported action type: ${(action as SessionAction).actionType}`);
  }

  const event: SessionEvent = {
    eventId: nextEventId(state.sessionId, state.turn, state.log.length),
    actorSeat: action.actorSeat,
    actionType: action.actionType,
    payload: action.payload,
    createdAt: Date.now(),
  };

  return { state: nextState, event };
}
