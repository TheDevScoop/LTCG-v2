import type { LtcgAgentApiClient } from "../agentApi";
import { appendTimeline } from "../report";
import type { BrowserObserver } from "../browserObserver";
import type { LiveGameplayAssertion } from "../types";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type SnapshotShape = {
  matchId?: unknown;
  turnNumber?: unknown;
  phase?: unknown;
  players?: {
    agent?: { lifePoints?: unknown };
    opponent?: { lifePoints?: unknown };
  };
};

function asSnapshotShape(value: unknown): SnapshotShape | null {
  if (!value || typeof value !== "object") return null;
  return value as SnapshotShape;
}

async function waitForSnapshot(
  observer: BrowserObserver,
  predicate: (snapshot: SnapshotShape) => boolean,
  timeoutMs: number,
): Promise<SnapshotShape> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const next = asSnapshotShape(await observer.snapshot());
    if (next && predicate(next)) return next;
    await sleep(200);
  }
  throw new Error(`Timed out waiting for stream overlay snapshot after ${timeoutMs}ms`);
}

function isFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

export async function runStreamOverlaySnapshotContractScenario(args: {
  client: LtcgAgentApiClient;
  observer: BrowserObserver;
  timelinePath: string;
  maxWaitMs?: number;
}): Promise<{ matchId: string; assertions: LiveGameplayAssertion[] }> {
  const assertions: LiveGameplayAssertion[] = [];
  const maxWaitMs = Math.max(5_000, args.maxWaitMs ?? 20_000);

  const started = await args.client.startDuel();
  const matchId = String((started as any)?.matchId ?? "");
  if (!matchId) {
    throw new Error("stream overlay snapshot contract scenario failed to create a match");
  }

  await args.observer.open({ matchId, seat: "host" });
  const snapshot = await waitForSnapshot(
    args.observer,
    (next) => String(next.matchId ?? "") === matchId,
    maxWaitMs,
  );

  const turnNumberOk = isFiniteNumber(snapshot.turnNumber);
  const phaseOk = typeof snapshot.phase === "string" && snapshot.phase.length > 0;
  const agentLpOk = isFiniteNumber(snapshot.players?.agent?.lifePoints);
  const opponentLpOk = isFiniteNumber(snapshot.players?.opponent?.lifePoints);

  assertions.push({
    id: "snapshot_match_id",
    ok: String(snapshot.matchId ?? "") === matchId,
    details: `expected=${matchId} actual=${String(snapshot.matchId ?? "")}`,
  });
  assertions.push({
    id: "snapshot_turn_number",
    ok: turnNumberOk,
    details: `turnNumber=${String(snapshot.turnNumber ?? "")}`,
  });
  assertions.push({
    id: "snapshot_phase",
    ok: phaseOk,
    details: `phase=${String(snapshot.phase ?? "")}`,
  });
  assertions.push({
    id: "snapshot_agent_life_points",
    ok: agentLpOk,
    details: `agentLP=${String(snapshot.players?.agent?.lifePoints ?? "")}`,
  });
  assertions.push({
    id: "snapshot_opponent_life_points",
    ok: opponentLpOk,
    details: `opponentLP=${String(snapshot.players?.opponent?.lifePoints ?? "")}`,
  });

  const allPassed = assertions.every((entry) => entry.ok);
  if (!allPassed) {
    throw new Error("stream overlay snapshot contract failed required shape assertions");
  }

  await appendTimeline(args.timelinePath, {
    type: "note",
    message:
      `stream_overlay_snapshot_contract matchId=${matchId} ` +
      `turn=${String(snapshot.turnNumber ?? "")} phase=${String(snapshot.phase ?? "")}`,
  });

  return { matchId, assertions };
}
