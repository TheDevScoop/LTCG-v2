import type { LtcgAgentApiClient } from "../agentApi";
import type { CardLookup } from "../cardLookup";
import { appendTimeline } from "../report";
import { choosePhaseCommand, signature, stripCommandLog, type PlayerView } from "../strategy";

const MAX_STEPS = 1000;
const MAX_PHASE_COMMANDS = 25;
const TICK_SLEEP_MS = 180;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function performAgentTurn(args: {
  client: LtcgAgentApiClient;
  matchId: string;
  cardLookup: CardLookup;
  timelinePath: string;
}) {
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

    try {
      await args.client.submitAction({ matchId: args.matchId, command, seat: view.mySeat });
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
        });
      } catch {
        return;
      }
    }

    const next = (await args.client.getView({ matchId: args.matchId })) as PlayerView | null;
    if (!next || next.gameOver) return;
    if (next.currentTurnPlayer !== next.mySeat) return;
    if (signature(next) === signature(view)) return;
  }
}

export async function runQuickDuelScenario(args: {
  client: LtcgAgentApiClient;
  cardLookup: CardLookup;
  timelinePath: string;
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

  while (steps < MAX_STEPS) {
    const view = (await args.client.getView({ matchId })) as PlayerView | null;
    if (!view) throw new Error("No player view returned.");

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

