import { LtcgAgentApiClient } from "./agentApi";
import { loadCardLookup } from "./cardLookup";
import { appendTimeline, defaultArtifactsForRun, prepareRunArtifacts, writeReport } from "./report";
import type { LiveGameplayReport, LiveGameplayScenarioResult, LiveGameplaySuite } from "./types";
import { createBrowserObserver } from "./browserObserver";
import { runStoryStageScenario } from "./scenarios/storyStage";
import { runQuickDuelScenario } from "./scenarios/quickDuel";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgv(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const arg = raw.slice(2);
    if (!arg) continue;
    const eq = arg.indexOf("=");
    if (eq === -1) {
      out[arg] = true;
      continue;
    }
    out[arg.slice(0, eq)] = arg.slice(eq + 1);
  }
  return out;
}

function getStringFlag(flags: Record<string, string | boolean>, key: string) {
  const v = flags[key];
  return typeof v === "string" ? v : null;
}

function deriveConvexSiteUrlFromCloudUrl(cloudUrl: string | null | undefined) {
  const trimmed = (cloudUrl ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.includes(".convex.site")) return trimmed;
  if (trimmed.includes(".convex.cloud")) return trimmed.replace(".convex.cloud", ".convex.site");
  return null;
}

async function runScenario<T>(
  scenario: string,
  fn: () => Promise<T>,
): Promise<{ result: T | null; scenarioResult: LiveGameplayScenarioResult }> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const assertions: LiveGameplayScenarioResult["assertions"] = [];
  const errors: LiveGameplayScenarioResult["errors"] = [];
  let status: LiveGameplayScenarioResult["status"] = "pass";
  let matchId: string | undefined;

  try {
    const result = await fn();
    if (result && typeof result === "object" && "matchId" in (result as any)) {
      const id = (result as any).matchId;
      if (typeof id === "string") matchId = id;
    }
    assertions.push({ id: "completed", ok: true });
    return {
      result,
      scenarioResult: {
        scenario,
        status,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startMs,
        matchId,
        assertions,
        errors,
      },
    };
  } catch (error: any) {
    status = "fail";
    const message = String(error?.message ?? error);
    errors.push({ message, stack: typeof error?.stack === "string" ? error.stack : undefined });
    assertions.push({ id: "completed", ok: false, details: message });
    return {
      result: null,
      scenarioResult: {
        scenario,
        status,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startMs,
        matchId,
        assertions,
        errors,
      },
    };
  }
}

async function main() {
  const flags = parseArgv(process.argv.slice(2));
  const suite = (getStringFlag(flags, "suite") ?? (process.env.LTCG_SUITE ?? "core")) as LiveGameplaySuite;

  const apiUrl =
    getStringFlag(flags, "api-url") ??
    process.env.LTCG_API_URL ??
    process.env.LTCG_CONVEX_SITE_URL ??
    deriveConvexSiteUrlFromCloudUrl(process.env.VITE_CONVEX_URL) ??
    null;

  if (!apiUrl) {
    console.error("Missing API url. Provide --api-url or set LTCG_API_URL (a .convex.site URL).");
    process.exit(1);
  }

  const webUrl =
    getStringFlag(flags, "web-url") ??
    process.env.LTCG_WEB_URL ??
    null;

  const noBrowser = Boolean(flags["no-browser"]) || process.env.LTCG_NO_BROWSER === "1";

  const runId =
    getStringFlag(flags, "run-id") ??
    process.env.LTCG_RUN_ID ??
    `${Date.now()}`;

  const run = await prepareRunArtifacts(runId);
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  await appendTimeline(run.timelinePath, {
    type: "note",
    message: `run_start suite=${suite}`,
  });

  // Register a fresh agent for each run (keeps it isolated).
  const unauth = new LtcgAgentApiClient({ baseUrl: apiUrl });
  const reg = await unauth.registerAgent(`live-${suite}-${runId.slice(-6)}`);
  const client = unauth.withApiKey(reg.apiKey);
  const me = await client.getMe();

  await appendTimeline(run.timelinePath, {
    type: "agent",
    message: `agent_registered name=${me.name}`,
    agentId: me.id,
    apiKeyPrefix: me.apiKeyPrefix,
  });

  // Ensure a starter deck is selected (idempotent on backend).
  const starters = await client.getStarterDecks();
  const deckCode = starters?.[0]?.deckCode;
  if (typeof deckCode === "string" && deckCode.trim()) {
    try {
      await client.selectDeck(deckCode);
      await appendTimeline(run.timelinePath, { type: "note", message: `starter_deck_selected deckCode=${deckCode}` });
    } catch (error: any) {
      await appendTimeline(run.timelinePath, {
        type: "note",
        message: `starter_deck_select_failed err=${String(error?.message ?? error)}`,
      });
    }
  } else {
    await appendTimeline(run.timelinePath, { type: "note", message: "no_starter_decks_available" });
  }

  const cardLookup = await loadCardLookup({
    convexCloudUrl: process.env.VITE_CONVEX_URL,
    convexSiteUrl: apiUrl,
  });

  // Optional browser observer (requires a running web server).
  const observer = !noBrowser && webUrl
    ? await createBrowserObserver({
        webUrl,
        apiKey: reg.apiKey,
        artifactsDir: run.runDir,
        timelinePath: run.timelinePath,
      })
    : null;

  let spectatorLoopStop: (() => Promise<void>) | null = null;
  if (observer) {
    await observer.open();
    let stopped = false;
    const loop = (async () => {
      while (!stopped) {
        const snap = await observer.snapshot();
        await appendTimeline(run.timelinePath, {
          type: "spectator",
          message: "spectator_snapshot",
          snapshot: snap,
        });
        await sleep(1000);
      }
    })();
    spectatorLoopStop = async () => {
      stopped = true;
      await loop.catch(() => {});
    };
  }

  const scenarios: LiveGameplayScenarioResult[] = [];

  const coreStory = await runScenario("story_stage_1", async () => {
    const { matchId, completion } = await runStoryStageScenario({
      client,
      cardLookup,
      timelinePath: run.timelinePath,
      stageNumber: 1,
    });
    await appendTimeline(run.timelinePath, { type: "note", message: `story_completion ${JSON.stringify(completion)}` });
    return { matchId };
  });
  scenarios.push(coreStory.scenarioResult);
  if (coreStory.scenarioResult.status === "fail" && observer) {
    await observer.screenshot("failure_story_stage_1");
  }

  const coreDuel = await runScenario("quick_duel", async () => {
    const { matchId, finalStatus } = await runQuickDuelScenario({
      client,
      cardLookup,
      timelinePath: run.timelinePath,
    });
    await appendTimeline(run.timelinePath, { type: "note", message: `duel_status ${JSON.stringify(finalStatus)}` });
    return { matchId };
  });
  scenarios.push(coreDuel.scenarioResult);
  if (coreDuel.scenarioResult.status === "fail" && observer) {
    await observer.screenshot("failure_quick_duel");
  }

  if (suite === "full" || suite === "soak") {
    const maxStages =
      suite === "soak"
        ? Number(process.env.LTCG_SOAK_STAGES ?? 10)
        : Number(process.env.LTCG_FULL_STAGES ?? 3);
    for (let i = 0; i < maxStages; i += 1) {
      const next = await client.getNextStoryStage();
      if (next?.done) {
        await appendTimeline(run.timelinePath, { type: "note", message: "next_stage done=true" });
        break;
      }
      const chapterId = typeof next?.chapterId === "string" ? next.chapterId : null;
      const stageNumber = typeof next?.stageNumber === "number" ? next.stageNumber : null;
      if (!chapterId || !stageNumber) break;

      const name = `story_stage_${i + 2}`;
      const stageRes = await runScenario(name, async () => {
        const { matchId } = await runStoryStageScenario({
          client,
          cardLookup,
          timelinePath: run.timelinePath,
          chapterId,
          stageNumber,
        });
        return { matchId };
      });
      scenarios.push(stageRes.scenarioResult);
      if (stageRes.scenarioResult.status === "fail" && observer) {
        await observer.screenshot(`failure_${name}`);
        break;
      }
    }
  }

  if (spectatorLoopStop) {
    await spectatorLoopStop();
  }
  if (observer) {
    await observer.close();
  }

  const anyFail = scenarios.some((s) => s.status === "fail");
  const status = anyFail ? "fail" : "pass";

  const report: LiveGameplayReport = {
    runId,
    suite,
    status,
    apiUrl,
    webUrl: webUrl ?? undefined,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startMs,
    scenarios,
    artifacts: defaultArtifactsForRun(run),
  };

  await writeReport(run.reportPath, report);
  await appendTimeline(run.timelinePath, {
    type: "note",
    message: `run_end status=${status}`,
  });

  if (status !== "pass") {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[live-gameplay] failed", error);
  process.exit(1);
});
