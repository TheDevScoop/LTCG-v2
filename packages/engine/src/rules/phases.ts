import type { Phase, Seat } from "../types/state.js";

const PHASE_ORDER: Phase[] = ["draw", "standby", "main", "combat", "main2", "breakdown_check", "end"];

export function nextPhase(current: Phase): Phase {
  const idx = PHASE_ORDER.indexOf(current);
  if (idx === -1 || idx === PHASE_ORDER.length - 1) return "draw";
  const next = PHASE_ORDER[idx + 1];
  return next ?? "draw";
}

export function opponentSeat(seat: Seat): Seat {
  return seat === "host" ? "away" : "host";
}
