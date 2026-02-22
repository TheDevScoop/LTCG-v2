import type { LtcgAgentApiClient } from "../agentApi";
import type { CardLookup } from "../cardLookup";
import { NoopProgressionGuard } from "../noopGuard";
import { appendTimeline } from "../report";
import { choosePhaseCommand, signature, stripCommandLog, type PlayerView } from "../strategy";

const MAX_STEPS = 1000;
const MAX_PHASE_COMMANDS = 25;
const TICK_SLEEP_MS = 180;
const NOOP_REPEAT_LIMIT = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function performAgentTurn(args: {
  client: LtcgAgentApiClient;
  matchId: string;
  cardLookup: CardLookup;
  timelinePath: string;
}) {
  const getExpectedVersion = async () => {
    const status = await args.client.getMatchStatus(args.matchId);
    return status.latestSnapshotVersion;
  };
  const noopGuard = new NoopProgressionGuard(NOOP_REPEAT_LIMIT);

  const forceProgression = async (seat: "host" | "away") => {
    for (const forced of [{ type: "ADVANCE_PHASE" as const }, { type: "END_TURN" as const }]) {
      await appendTimeline(args.timelinePath, {
        type: "action",
        matchId: args.matchId,
        seat,
        command: forced,
      });
      try {
        const result = await args.client.submitAction({
          matchId: args.matchId,
          command: forced,
          seat,
          expectedVersion: await getExpectedVersion(),
        });
        await appendTimeline(args.timelinePath, {
          type: "note",
          message: `forced_progression command=${forced.type} version=${result.version} events=${result.events}`,
        });
      } catch (error: any) {
        await appendTimeline(args.timelinePath, {
          type: "note",
          message: `forced_progression_failed command=${forced.type} err=${String(error?.message ?? error)}`,
        });
        return;
      }

      const view = (await args.client.getView({ matchId: args.matchId })) as PlayerView | null;
      if (!view || view.gameOver) return;
      if (!view.mySeat || view.currentTurnPlayer !== view.mySeat) return;
    }
  };

  for (let step = 0; step < MAX_PHASE_COMMANDS; step += 1) {
    const view = (await args.client.getView({ matchId: args.matchId })) as PlayerView | null;
    if (!view || view.gameOver) return;
    if (!view.mySeat || view.currentTurnPlayer !== view.mySeat) return;

    const selected = choosePhaseCommand(view, args.cardLookup) as Record<string, unknown> & { _log?: string };
    const command = stripCommandLog(selected);

    await appendTimeline(args.timelinePath, {
      type: "action",
      matchId: args.matchId,
      seat: view.mySeat,
      command,
    });

    let submitted:
      | {
          events: string;
          version: number;
        }
      | null = null;
    try {
      submitted = await args.client.submitAction({
        matchId: args.matchId,
        command,
        seat: view.mySeat,
        expectedVersion: await getExpectedVersion(),
      });
    } catch (error: any) {
      await appendTimeline(args.timelinePath, {
        type: "note",
        message: `action_failed err=${String(error?.message ?? error)}`,
      });
      try {
        await args.client.submitAction({
          matchId: args.matchId,
          command: { type: "END_TURN" },
          seat: view.mySeat,
          expectedVersion: await getExpectedVersion(),
        });
      } catch {
          return;
      }
    }

    let shouldRetrySameState = false;
    if (submitted) {
      const noop = noopGuard.register({
        signature: signature(view),
        command,
        submitResult: submitted,
      });
      shouldRetrySameState = noop.isNoop;
      if (noop.isNoop) {
        await appendTimeline(args.timelinePath, {
          type: "note",
          message: `action_noop command=${String((command as any).type ?? "unknown")} repeats=${noop.repeats} version=${submitted.version}`,
        });
      }
      if (!noop.validPayload) {
        await appendTimeline(args.timelinePath, {
          type: "note",
          message: `action_noop_invalid_payload command=${String((command as any).type ?? "unknown")} rawEvents=${submitted.events}`,
        });
      }
      if (noop.shouldForceProgression) {
        await appendTimeline(args.timelinePath, {
          type: "note",
          message: `forced_progression trigger=repeated_noop repeats=${noop.repeats}`,
        });
        noopGuard.reset();
        await forceProgression(view.mySeat);
      }
    }

    const next = (await args.client.getView({ matchId: args.matchId })) as PlayerView | null;
    if (!next || next.gameOver) return;
    if (next.currentTurnPlayer !== next.mySeat) return;
    if (signature(next) === signature(view)) {
      if (shouldRetrySameState) {
        continue;
      }
      return;
    }
    noopGuard.reset();
  }
}

export async function runQuickDuelScenario(args: {
  client: LtcgAgentApiClient;
  cardLookup: CardLookup;
  timelinePath: string;
  maxDurationMs?: number;
}): Promise<{ matchId: string; finalStatus: any }> {
  const start = await args.client.startDuel();
  const matchId = String((start as any).matchId ?? "");
  if (!matchId) throw new Error("Duel start returned no matchId.");

  await appendTimeline(args.timelinePath, {
    type: "match",
    message: "duel_start",
    matchId,
  });

  let steps = 0;
  let lastSig = "";
  let stateTransitions = 0;
  const observedTurns = new Set<number>();
  const startedAtMs = Date.now();
  const maxDurationMs =
    Number.isFinite(args.maxDurationMs) && Number(args.maxDurationMs) > 0
      ? Number(args.maxDurationMs)
      : 60000;

  while (steps < MAX_STEPS) {
    if (Date.now() - startedAtMs > maxDurationMs) {
      await appendTimeline(args.timelinePath, {
        type: "note",
        message: `forced_progression quick_duel_timeout_surrender transitions=${stateTransitions} turns=${observedTurns.size}`,
      });
      try {
        const timeoutView = (await args.client.getView({ matchId })) as PlayerView | null;
        if (timeoutView?.mySeat) {
          const status = await args.client.getMatchStatus(matchId);
          await args.client.submitAction({
            matchId,
            command: { type: "SURRENDER" },
            seat: timeoutView.mySeat,
            expectedVersion: status.latestSnapshotVersion,
          });
        }
      } catch (error: any) {
        await appendTimeline(args.timelinePath, {
          type: "note",
          message: `forced_progression quick_duel_timeout_surrender_failed err=${String(error?.message ?? error)}`,
        });
      }
      break;
    }
    const view = (await args.client.getView({ matchId })) as PlayerView | null;
    if (!view) throw new Error("No player view returned.");
    if (typeof view.turnNumber === "number" && Number.isFinite(view.turnNumber)) {
      observedTurns.add(view.turnNumber);
    }

    await appendTimeline(args.timelinePath, {
      type: "view",
      matchId,
      seat: view.mySeat,
      phase: view.currentPhase,
      gameOver: Boolean(view.gameOver),
      lp: [Number(view.lifePoints ?? 0), Number(view.opponentLifePoints ?? 0)],
    });

    if (view.gameOver) break;

    const sig = signature(view);
    if (sig !== lastSig) {
      stateTransitions += 1;
    }
    if (sig === lastSig) {
      await sleep(TICK_SLEEP_MS);
    }
    lastSig = sig;

    if (view.mySeat && view.currentTurnPlayer === view.mySeat) {
      await performAgentTurn({
        client: args.client,
        matchId,
        cardLookup: args.cardLookup,
        timelinePath: args.timelinePath,
      });
    } else {
      await sleep(TICK_SLEEP_MS);
    }

    steps += 1;
    await sleep(60);
  }

  const finalStatus = await args.client.getMatchStatus(matchId);
  return { matchId, finalStatus };
}
