import type { LtcgAgentApiClient } from "../agentApi";
import type { CardLookup } from "../cardLookup";
import { NoopProgressionGuard } from "../noopGuard";
import { appendTimeline } from "../report";
import { choosePhaseCommand, signature, stripCommandLog, type PlayerView } from "../strategy";

const MAX_STEPS = 1200;
const MAX_PHASE_COMMANDS = 25;
const TICK_SLEEP_MS = 180;
const STALE_GLOBAL_LIMIT = 40;
const NOOP_REPEAT_LIMIT = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function resolveStoryChapter(chapters: any[], requestedChapterId?: string) {
  const firstChapter = chapters[0] ?? null;
  if (!requestedChapterId) {
    return { chapter: firstChapter, fallbackFrom: null as string | null };
  }

  const direct = chapters.find((chapter: any) => chapter?._id === requestedChapterId);
  if (direct) {
    return { chapter: direct, fallbackFrom: null as string | null };
  }

  const externalId = chapters.find((chapter: any) => chapter?.chapterId === requestedChapterId);
  if (externalId) {
    return { chapter: externalId, fallbackFrom: null as string | null };
  }

  return { chapter: firstChapter, fallbackFrom: requestedChapterId };
}

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
  const actions: string[] = [];
  let stagnant = 0;
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
    if (!view || view.gameOver) break;
    if (!view.mySeat || view.currentTurnPlayer !== view.mySeat) break;

    const selected = choosePhaseCommand(view, args.cardLookup) as Record<string, unknown> & { _log?: string };
    const command = stripCommandLog(selected);
    const label = selected._log ?? String(selected.type ?? "command");
    actions.push(label);

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
    let shouldRetrySameState = false;
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
        message: `action_failed label=${label} err=${String(error?.message ?? error)}`,
      });

      if (selected.type !== "END_TURN") {
        try {
          await args.client.submitAction({
            matchId: args.matchId,
            command: { type: "END_TURN" },
            seat: view.mySeat,
            expectedVersion: await getExpectedVersion(),
          });
          actions.push("fallback end turn");
        } catch {
          break;
        }
      } else {
        break;
      }
    }

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
          message: `action_noop label=${label} repeats=${noop.repeats} version=${submitted.version}`,
        });
      }
      if (!noop.validPayload) {
        await appendTimeline(args.timelinePath, {
          type: "note",
          message: `action_noop_invalid_payload label=${label} rawEvents=${submitted.events}`,
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
    if (!next || next.gameOver) break;
    if (next.currentTurnPlayer !== next.mySeat) break;

    if (signature(next) === signature(view)) {
      stagnant += 1;
      if (shouldRetrySameState) {
        continue;
      }
      if (stagnant >= 2) break;
    } else {
      stagnant = 0;
      noopGuard.reset();
    }
  }

  return actions;
}

export async function runStoryStageScenario(args: {
  client: LtcgAgentApiClient;
  cardLookup: CardLookup;
  timelinePath: string;
  chapterId?: string;
  stageNumber?: number;
  maxDurationMs?: number;
}): Promise<{ matchId: string; completion: any }> {
  const chapters = await args.client.getChapters();
  if (!chapters?.length) throw new Error("No chapters available.");

  const chapterResolution = resolveStoryChapter(chapters, args.chapterId);
  const chapter = chapterResolution.chapter;
  if (!chapter?._id) throw new Error("Invalid chapter selection.");
  if (chapterResolution.fallbackFrom) {
    await appendTimeline(args.timelinePath, {
      type: "note",
      message: `chapter_selection_fallback requested=${chapterResolution.fallbackFrom} resolved=${String(chapter._id)}`,
    });
  }

  const stageNumber = typeof args.stageNumber === "number" ? args.stageNumber : 1;
  const start = await args.client.startStory({ chapterId: String(chapter._id), stageNumber });
  const matchId = String((start as any).matchId ?? "");
  if (!matchId) throw new Error("Story start returned no matchId.");

  await appendTimeline(args.timelinePath, {
    type: "match",
    message: `story_start chapter=${String(chapter._id)} stage=${stageNumber}`,
    matchId,
  });

  let steps = 0;
  let staleTicks = 0;
  let lastSig = "";
  let stateTransitions = 0;
  const observedTurns = new Set<number>();
  const startedAtMs = Date.now();
  const maxDurationMs =
    Number.isFinite(args.maxDurationMs) && Number(args.maxDurationMs) > 0
      ? Number(args.maxDurationMs)
      : 60000;

  while (steps < MAX_STEPS) {
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

    if (Date.now() - startedAtMs > maxDurationMs) {
      if (view.mySeat) {
        await appendTimeline(args.timelinePath, {
          type: "note",
          message: `forced_progression story_timeout_surrender transitions=${stateTransitions} turns=${observedTurns.size}`,
        });
        try {
          const status = await args.client.getMatchStatus(matchId);
          await args.client.submitAction({
            matchId,
            command: { type: "SURRENDER" },
            seat: view.mySeat,
            expectedVersion: status.latestSnapshotVersion,
          });
        } catch (error: any) {
          await appendTimeline(args.timelinePath, {
            type: "note",
            message: `forced_progression story_timeout_surrender_failed err=${String(error?.message ?? error)}`,
          });
        }
      } else {
        await appendTimeline(args.timelinePath, {
          type: "note",
          message: `forced_progression story_timeout_no_seat transitions=${stateTransitions} turns=${observedTurns.size}`,
        });
      }
      break;
    }

    const sig = signature(view);
    if (sig !== lastSig) {
      stateTransitions += 1;
    }
    staleTicks = sig === lastSig ? staleTicks + 1 : 0;
    lastSig = sig;

    if (staleTicks >= STALE_GLOBAL_LIMIT) {
      await appendTimeline(args.timelinePath, {
        type: "note",
        message: "stale_state forcing one action attempt",
      });
      staleTicks = 0;
    }

    if (view.mySeat && view.currentTurnPlayer === view.mySeat) {
      const actions = await performAgentTurn({
        client: args.client,
        matchId,
        cardLookup: args.cardLookup,
        timelinePath: args.timelinePath,
      });
      if (actions.length > 0) {
        await appendTimeline(args.timelinePath, {
          type: "note",
          message: `turn_actions count=${actions.length} last=${actions[actions.length - 1]}`,
        });
      }
    } else {
      await sleep(TICK_SLEEP_MS);
    }

    steps += 1;
    await sleep(60);
  }

  for (let i = 0; i < 20; i += 1) {
    const status = await args.client.getMatchStatus(matchId);
    if (status.isGameOver) break;
    await sleep(200);
  }

  const completion = await args.client.completeStoryStage(matchId);
  await appendTimeline(args.timelinePath, {
    type: "note",
    message: `story_complete ok`,
  });

  return { matchId, completion };
}
