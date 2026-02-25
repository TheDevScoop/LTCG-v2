import { LtcgAgentApiError, type LtcgAgentApiClient } from "../agentApi";
import { appendTimeline } from "../report";
import type { LiveGameplayAssertion } from "../types";

export async function runInvalidSeatActionScenario(args: {
  client: LtcgAgentApiClient;
  timelinePath: string;
}): Promise<{ matchId: string; assertions: LiveGameplayAssertion[] }> {
  const assertions: LiveGameplayAssertion[] = [];

  const start = await args.client.startDuel();
  const matchId = String((start as any)?.matchId ?? "");
  if (!matchId) {
    throw new Error("invalid seat scenario failed to start duel");
  }

  const view = await args.client.getView({ matchId });
  const mySeat = (view as Record<string, unknown>)?.mySeat;
  const seatIsValid = mySeat === "host" || mySeat === "away";
  assertions.push({
    id: "invalid_seat_base_view",
    ok: seatIsValid,
    details: `mySeat=${String(mySeat)}`,
  });
  if (!seatIsValid) {
    throw new Error("invalid seat scenario could not determine mySeat");
  }

  const oppositeSeat = mySeat === "host" ? "away" : "host";
  const status = await args.client.getMatchStatus(matchId);

  let rejected = false;
  let rejectionStatus: number | null = null;
  let rejectionMessage = "";
  try {
    await args.client.submitAction({
      matchId,
      seat: oppositeSeat,
      command: { type: "END_TURN" },
      expectedVersion: status.latestSnapshotVersion,
    });
  } catch (error: any) {
    rejected = true;
    if (error instanceof LtcgAgentApiError) {
      rejectionStatus = error.status;
      rejectionMessage = error.message;
    } else {
      rejectionMessage = String(error?.message ?? error);
    }
  }

  assertions.push({
    id: "invalid_seat_action_rejected",
    ok: rejected,
    details: rejected ? rejectionMessage : "submitAction unexpectedly succeeded",
  });

  const statusIs422 = rejectionStatus === 422;
  assertions.push({
    id: "invalid_seat_http_422",
    ok: statusIs422,
    details: `status=${String(rejectionStatus)}`,
  });

  const messageLooksRight =
    rejectionMessage.includes("not the") || rejectionMessage.includes("participant") || rejectionMessage.includes("seat");
  assertions.push({
    id: "invalid_seat_error_message",
    ok: messageLooksRight,
    details: rejectionMessage || "missing rejection message",
  });

  if (!rejected || !statusIs422 || !messageLooksRight) {
    throw new Error("invalid seat action did not fail with expected 422 contract");
  }

  await appendTimeline(args.timelinePath, {
    type: "note",
    message: `invalid_seat_action_rejected matchId=${matchId} status=${rejectionStatus}`,
  });

  return { matchId, assertions };
}
