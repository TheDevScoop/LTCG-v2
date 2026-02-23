import type { LtcgAgentApiClient } from "../agentApi";
import type { BrowserObserver } from "../browserObserver";
import { appendTimeline } from "../report";
import type { LiveGameplayAssertion } from "../types";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type SnapshotShape = {
  matchId?: unknown;
  seat?: unknown;
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
  throw new Error(`Timed out waiting for stream overlay query override snapshot after ${timeoutMs}ms`);
}

export async function runStreamOverlayQueryOverrideScenario(args: {
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
    throw new Error("stream overlay query override scenario failed to create a match");
  }

  await args.observer.open({ matchId, seat: "away" });

  const snapshot = await waitForSnapshot(
    args.observer,
    (next) => String(next.matchId ?? "") === matchId && next.seat === "away",
    maxWaitMs,
  );

  const publicAwayView = await args.client.getPublicView({ matchId, seat: "away" });

  const snapshotMatchIdOk = String(snapshot.matchId ?? "") === matchId;
  const snapshotSeatOk = snapshot.seat === "away";
  const publicViewSeatOk = (publicAwayView as any)?.seat === "away";

  assertions.push({
    id: "query_override_match_id",
    ok: snapshotMatchIdOk,
    details: `expected=${matchId} actual=${String(snapshot.matchId ?? "")}`,
  });
  assertions.push({
    id: "query_override_seat",
    ok: snapshotSeatOk,
    details: `expected=away actual=${String(snapshot.seat ?? "")}`,
  });
  assertions.push({
    id: "query_override_public_view_away",
    ok: publicViewSeatOk,
    details: `publicViewSeat=${String((publicAwayView as any)?.seat ?? "")}`,
  });

  const allPassed = assertions.every((entry) => entry.ok);
  if (!allPassed) {
    throw new Error("stream overlay query override assertions failed");
  }

  await appendTimeline(args.timelinePath, {
    type: "note",
    message: `stream_overlay_query_override matchId=${matchId} seat=away`,
  });

  return { matchId, assertions };
}
