export type SeatRole = "dm" | "narrator" | "npc_controller" | "player_1" | "player_2" | "player_3" | "player_4" | "player_5" | "player_6";

export interface ActorState {
  seat: SeatRole;
  actorId: string;
  hp: number;
  stats: Record<string, number>;
  resources: Record<string, number>;
}

export interface SessionState {
  schemaVersion: string;
  sessionId: string;
  worldId: string;
  turn: number;
  phase: "setup" | "briefing" | "action" | "resolution" | "ended";
  actors: Record<string, ActorState>;
  flags: Record<string, boolean | number | string>;
  log: string[];
}

export interface SessionAction {
  actorSeat: SeatRole;
  actionType:
    | "SET_PHASE"
    | "FLAG_SET"
    | "DAMAGE"
    | "HEAL"
    | "RESOURCE_DELTA"
    | "LOG"
    | "ADVANCE_TURN"
    | "END_SESSION";
  payload: Record<string, unknown>;
}

export interface SessionEvent {
  eventId: string;
  actorSeat: SeatRole;
  actionType: SessionAction["actionType"];
  payload: Record<string, unknown>;
  createdAt: number;
}

export interface DiceRollResult {
  expression: string;
  dice: number[];
  modifier: number;
  total: number;
}
