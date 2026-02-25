import { LtcgAgentApiClient, type LtcgAgentApiError } from "../agentApi";
import type { CardLookup } from "../cardLookup";
import { appendTimeline } from "../report";
import { choosePhaseCommand, signature, stripCommandLog, type PlayerView } from "../strategy";
import type { LiveGameplayAssertion } from "../types";

const MAX_STEPS = 1200;
const MAX_PHASE_COMMANDS = 25;
const TICK_SLEEP_MS = 180;
const STALE_GLOBAL_LIMIT = 40;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function performAgentTurn(args: {
  client: LtcgAgentApiClient;
  matchId: string;
  cardLookup: CardLookup;
  timelinePath: string;
  label: "host" | "away";
}) {
  let stagnant = 0;

  const attemptFallback = async (opts: {
    seat: string;
    baseSignature: string;
    fallbackType: "ADVANCE_PHASE" | "END_TURN";
  }) => {
    const fallbackCommand = { type: opts.fallbackType } as const;
    await appendTimeline(args.timelinePath, {
      type: "action",
      matchId: args.matchId,
      seat: opts.seat,
      command: fallbackCommand,
    });

    try {
      await args.client.submitAction({
        matchId: args.matchId,
        command: fallbackCommand,
        seat: opts.seat === "away" ? "away" : "host",
      });
    } catch (error: any) {
      await appendTimeline(args.timelinePath, {
        type: "note",
        message: `agent_vs_agent_fallback_failed label=${args.label} type=${opts.fallbackType} err=${String(
          error?.message ?? error,
        )}`,
      });
      return false;
    }

    const afterFallback = (await args.client.getView({ matchId: args.matchId })) as PlayerView | null;
    if (!afterFallback || afterFallback.gameOver) return true;
    if (!afterFallback.mySeat || afterFallback.currentTurnPlayer !== afterFallback.mySeat) return true;
    return signature(afterFallback) !== opts.baseSignature;
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

    try {
      await args.client.submitAction({
        matchId: args.matchId,
        command,
        seat: view.mySeat,
      });
    } catch (error: any) {
      await appendTimeline(args.timelinePath, {
        type: "note",
        message: `agent_vs_agent_action_failed label=${args.label} err=${String(error?.message ?? error)}`,
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

    if (signature(next) === signature(view)) {
      stagnant += 1;
      const selectedType = String(selected.type ?? "unknown");
      await appendTimeline(args.timelinePath, {
        type: "note",
        message: `agent_vs_agent_no_progress label=${args.label} selected=${selectedType} stagnant=${stagnant}`,
      });

      let progressed = false;
      if (selectedType !== "END_TURN") {
        const fallbackOrder: Array<"ADVANCE_PHASE" | "END_TURN"> =
          selectedType === "ADVANCE_PHASE" ? ["END_TURN"] : ["ADVANCE_PHASE", "END_TURN"];
        for (const fallbackType of fallbackOrder) {
          if (
            await attemptFallback({
              seat: view.mySeat,
              baseSignature: signature(next),
              fallbackType,
            })
          ) {
            progressed = true;
            break;
          }
        }
      }

      if (!progressed && stagnant >= 2) return;
      continue;
    }

    stagnant = 0;
  }
}

function parseStatusError(error: unknown) {
  if (!error || typeof error !== "object") return String(error ?? "unknown error");
  const maybe = error as Partial<LtcgAgentApiError> & { message?: string };
  if (typeof maybe.message === "string") return maybe.message;
  return String(error);
}

export async function runAgentVsAgentPvpScenario(args: {
  hostClient: LtcgAgentApiClient;
  baseUrl: string;
  timeoutMs: number;
  cardLookup: CardLookup;
  timelinePath: string;
  maxDurationMs?: number;
}): Promise<{ matchId: string; assertions: LiveGameplayAssertion[] }> {
  const assertions: LiveGameplayAssertion[] = [];
  const startedAtMs = Date.now();
  const maxDurationMs =
    Number.isFinite(args.maxDurationMs) && Number(args.maxDurationMs) > 0
      ? Number(args.maxDurationMs)
      : 120000;

  const unauth = new LtcgAgentApiClient({
    baseUrl: args.baseUrl,
    timeoutMs: args.timeoutMs,
  });
  const register = await unauth.registerAgent(`live-pvp-away-${Date.now().toString().slice(-6)}`);
  const awayClient = unauth.withApiKey(register.apiKey);
  const away = await awayClient.getMe();
  await appendTimeline(args.timelinePath, {
    type: "agent",
    message: "agent_vs_agent_away_registered",
    agentId: away.id,
    apiKeyPrefix: away.apiKeyPrefix,
  });

  const awayStarters = await awayClient.getStarterDecks();
  const awayDeckCode = typeof awayStarters?.[0]?.deckCode === "string" ? awayStarters[0].deckCode : null;
  if (!awayDeckCode) {
    throw new Error("agent vs agent scenario could not resolve away starter deck");
  }
  await awayClient.selectDeck(awayDeckCode);

  const lobby = await args.hostClient.createPvpLobby();
  const matchId = String(lobby.matchId ?? "");
  if (!matchId) {
    throw new Error("agent vs agent scenario failed to create a lobby");
  }

  assertions.push({
    id: "agent_vs_agent_lobby_created",
    ok: lobby.status === "waiting",
    details: `status=${String(lobby.status)}`,
  });

  await appendTimeline(args.timelinePath, {
    type: "match",
    message: "agent_vs_agent_lobby_created",
    matchId,
  });

  await awayClient.joinMatch(matchId);
  assertions.push({
    id: "agent_vs_agent_joined",
    ok: true,
    details: `away=${away.id}`,
  });

  const hostStatus = await args.hostClient.getMatchStatus(matchId);
  const awayStatus = await awayClient.getMatchStatus(matchId);
  assertions.push({
    id: "agent_vs_agent_mode_pvp",
    ok: hostStatus.mode === "pvp" && awayStatus.mode === "pvp",
    details: `hostMode=${String(hostStatus.mode)} awayMode=${String(awayStatus.mode)}`,
  });
  assertions.push({
    id: "agent_vs_agent_seat_assignment",
    ok: hostStatus.seat === "host" && awayStatus.seat === "away",
    details: `hostSeat=${String(hostStatus.seat)} awaySeat=${String(awayStatus.seat)}`,
  });

  let steps = 0;
  let staleTicks = 0;
  let lastSig = "";

  while (steps < MAX_STEPS) {
    if (Date.now() - startedAtMs > maxDurationMs) {
      throw new Error(`agent_vs_agent_pvp timed out after ${maxDurationMs}ms`);
    }

    const hostView = (await args.hostClient.getView({ matchId })) as PlayerView | null;
    const awayView = (await awayClient.getView({ matchId })) as PlayerView | null;
    if (!hostView || !awayView) {
      throw new Error("agent_vs_agent_pvp failed to fetch both player views");
    }

    await appendTimeline(args.timelinePath, {
      type: "view",
      matchId,
      seat: hostView.mySeat,
      turn: hostView.currentTurnPlayer,
      phase: hostView.currentPhase,
      priority: hostView.currentPriorityPlayer,
      chain: Array.isArray(hostView.currentChain) ? hostView.currentChain.length : 0,
      gameOver: Boolean(hostView.gameOver),
      lp: [Number(hostView.lifePoints ?? 0), Number(hostView.opponentLifePoints ?? 0)],
    });

    if (hostView.gameOver || awayView.gameOver) break;

    const combinedSig = `${signature(hostView)}|${signature(awayView)}`;
    staleTicks = combinedSig === lastSig ? staleTicks + 1 : 0;
    lastSig = combinedSig;
    if (staleTicks >= STALE_GLOBAL_LIMIT) {
      await appendTimeline(args.timelinePath, {
        type: "note",
        message: `agent_vs_agent_stalled ticks=${staleTicks}`,
      });
      throw new Error(`agent_vs_agent_pvp stalled (${staleTicks} ticks)`);
    }

    const chainOpen = Array.isArray(hostView.currentChain) && hostView.currentChain.length > 0;
    if (chainOpen) {
      if (hostView.currentPriorityPlayer === hostView.mySeat && hostView.mySeat) {
        await args.hostClient.submitAction({
          matchId,
          seat: hostView.mySeat,
          command: { type: "CHAIN_RESPONSE", pass: true },
        });
        steps += 1;
        await sleep(60);
        continue;
      }
      if (awayView.currentPriorityPlayer === awayView.mySeat && awayView.mySeat) {
        await awayClient.submitAction({
          matchId,
          seat: awayView.mySeat,
          command: { type: "CHAIN_RESPONSE", pass: true },
        });
        steps += 1;
        await sleep(60);
        continue;
      }
    }

    let acted = false;
    if (hostView.mySeat && hostView.currentTurnPlayer === hostView.mySeat) {
      await performAgentTurn({
        client: args.hostClient,
        matchId,
        cardLookup: args.cardLookup,
        timelinePath: args.timelinePath,
        label: "host",
      });
      acted = true;
    } else if (awayView.mySeat && awayView.currentTurnPlayer === awayView.mySeat) {
      await performAgentTurn({
        client: awayClient,
        matchId,
        cardLookup: args.cardLookup,
        timelinePath: args.timelinePath,
        label: "away",
      });
      acted = true;
    }

    if (!acted) {
      await sleep(TICK_SLEEP_MS);
    }

    steps += 1;
    await sleep(60);
  }

  const finalStatus = await args.hostClient.getMatchStatus(matchId);
  const completed = Boolean(finalStatus.isGameOver);
  assertions.push({
    id: "agent_vs_agent_game_completed",
    ok: completed,
    details: completed
      ? `winner=${String(finalStatus.winner)} reason=${String(finalStatus.endReason)}`
      : parseStatusError(finalStatus),
  });
  if (!completed) {
    throw new Error("agent_vs_agent_pvp did not complete");
  }

  await appendTimeline(args.timelinePath, {
    type: "note",
    message: `agent_vs_agent_complete winner=${String(finalStatus.winner)} reason=${String(
      finalStatus.endReason,
    )}`,
  });

  return { matchId, assertions };
}
