import { LtcgAgentApiClient } from "./agentApi";
import { loadCardLookup } from "./cardLookup";
import { appendTimeline, defaultArtifactsForRun, prepareRunArtifacts, writeReport } from "./report";
import type { LiveGameplayReport, LiveGameplayScenarioResult, LiveGameplaySuite } from "./types";
import { createBrowserObserver } from "./browserObserver";
import { runStoryStageScenario } from "./scenarios/storyStage";
import { runQuickDuelScenario } from "./scenarios/quickDuel";
import { runPublicViewConsistencyScenario } from "./scenarios/publicViewConsistency";
import { runInvalidSeatActionScenario } from "./scenarios/invalidSeatAction";

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

function getNumberFlag(flags: Record<string, string | boolean>, key: string) {
  const raw = getStringFlag(flags, key);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function deriveConvexSiteUrlFromCloudUrl(cloudUrl: string | null | undefined) {
  const trimmed = (cloudUrl ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.includes(".convex.site")) return trimmed;
  if (trimmed.includes(".convex.cloud")) return trimmed.replace(".convex.cloud", ".convex.site");
  return null;
}

async function probeUrlReachable(url: string, timeoutMs: number) {
  const controller = new AbortController();
  // Use Promise.race to guarantee we don't hang even if lower-level DNS/TLS work
  // fails to respect AbortController in some environments.
  const timeout = new Promise<boolean>((resolve) => {
    setTimeout(() => {
      controller.abort();
      resolve(false);
    }, timeoutMs);
  });

  const attempt = (async () => {
    try {
      // Any HTTP response (including 404) is fine; we only care about connectivity.
      await fetch(url, { method: "GET", signal: controller.signal });
      return true;
    } catch {
      return false;
    }
  })();

  return await Promise.race([attempt, timeout]);
}

async function withRetries<T>(args: {
  label: string;
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  fn: (attempt: number) => Promise<T>;
}): Promise<T> {
  const totalAttempts = Math.max(1, Math.floor(args.retries) + 1);
  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    try {
      return await args.fn(attempt);
    } catch (err) {
      if (attempt >= totalAttempts) throw err;
      const expDelay = Math.min(args.maxDelayMs, args.baseDelayMs * Math.pow(2, attempt - 1));
      const message = String((err as any)?.message ?? err);
      console.error(
        `[live-gameplay] ${args.label} attempt ${attempt}/${totalAttempts} failed: ${message}. ` +
          `Retrying in ${expDelay}ms...`,
      );
      await sleep(expDelay);
    }
  }
  throw new Error(`${args.label} failed`);
}

async function runScenario<T>(
  scenario: string,
  timeoutMs: number,
  fn: () => Promise<T>,
): Promise<{ result: T | null; scenarioResult: LiveGameplayScenarioResult }> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const assertions: LiveGameplayScenarioResult["assertions"] = [];
  const errors: LiveGameplayScenarioResult["errors"] = [];
  let status: LiveGameplayScenarioResult["status"] = "pass";
  let matchId: string | undefined;

  try {
    const result = await (() => {
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        return fn();
      }
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`scenario "${scenario}" timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        fn()
          .then((value) => {
            clearTimeout(timer);
            resolve(value);
          })
          .catch((error) => {
            clearTimeout(timer);
            reject(error);
          });
      });
    })();
    if (result && typeof result === "object" && "matchId" in (result as any)) {
      const id = (result as any).matchId;
      if (typeof id === "string") matchId = id;
    }
    if (result && typeof result === "object" && Array.isArray((result as any).assertions)) {
      for (const assertion of (result as any).assertions) {
        if (!assertion || typeof assertion !== "object") continue;
        const id = typeof (assertion as any).id === "string" ? (assertion as any).id : null;
        const ok = typeof (assertion as any).ok === "boolean" ? (assertion as any).ok : null;
        if (!id || ok === null) continue;
        assertions.push({
          id,
          ok,
          details:
            typeof (assertion as any).details === "string"
              ? (assertion as any).details
              : undefined,
        });
      }
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
  const runId =
    getStringFlag(flags, "run-id") ??
    process.env.LTCG_RUN_ID ??
    `${Date.now()}`;

  const retries = getNumberFlag(flags, "retries") ?? 0;
  const retryDelayMs = getNumberFlag(flags, "retry-delay-ms") ?? 500;
  const retryMaxDelayMs = getNumberFlag(flags, "retry-max-delay-ms") ?? 8000;
  const timeoutMs = getNumberFlag(flags, "timeout-ms") ?? 5000;
  const scenarioTimeoutMs =
    getNumberFlag(flags, "scenario-timeout-ms") ??
    Number(process.env.LTCG_SCENARIO_TIMEOUT_MS ?? 120000);
  const scenarioSoftTimeoutMs = Math.max(10_000, scenarioTimeoutMs - 10_000);
  const run = await prepareRunArtifacts(runId);
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  const apiUrl =
    getStringFlag(flags, "api-url") ??
    process.env.LTCG_API_URL ??
    process.env.LTCG_CONVEX_SITE_URL ??
    deriveConvexSiteUrlFromCloudUrl(process.env.VITE_CONVEX_URL) ??
    null;

  const writeSkipReport = async (message: string, reportApiUrl: string) => {
    await appendTimeline(run.timelinePath, {
      type: "note",
      message: `run_start suite=${suite}`,
    });
    await appendTimeline(run.timelinePath, {
      type: "note",
      message: `run_skip reason=${message}`,
    });

    const report: LiveGameplayReport = {
      runId,
      suite,
      status: "skip",
      skipReason: message,
      apiUrl: reportApiUrl,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startMs,
      scenarios: [],
      artifacts: defaultArtifactsForRun(run),
    };
    await writeReport(run.reportPath, report);
  };

  // Explicit environment gate:
  // - If no API URL is configured, skip by default (exit 0) so local/CI runs
  //   don't fail due to external connectivity.
  // - If you want this to be required, set `LTCG_LIVE_REQUIRED=1`.
  if (!apiUrl) {
    const required = process.env.LTCG_LIVE_REQUIRED === "1";
    const message =
      "live gameplay suite skipped: no api url configured. " +
      "Set LTCG_API_URL or pass --api-url=... to run.";
    if (required) {
      throw new Error(message);
    }
    await writeSkipReport(message, "unconfigured");
    console.warn(`[live-gameplay] ${message}`);
    return;
  }

  const required = process.env.LTCG_LIVE_REQUIRED === "1";
  const reachable = await probeUrlReachable(apiUrl, Math.min(3000, timeoutMs));
  if (!reachable) {
    const message = `live gameplay suite skipped: api url is not reachable (${apiUrl}).`;
    if (required) {
      throw new Error(message);
    }
    await writeSkipReport(message, apiUrl);
    console.warn(`[live-gameplay] ${message}`);
    return;
  }

  const webUrl =
    getStringFlag(flags, "web-url") ??
    process.env.LTCG_WEB_URL ??
    null;

  const noBrowser = Boolean(flags["no-browser"]) || process.env.LTCG_NO_BROWSER === "1";

  await appendTimeline(run.timelinePath, {
    type: "note",
    message: `run_start suite=${suite}`,
  });

  // Register a fresh agent for each run (keeps it isolated).
  const unauth = new LtcgAgentApiClient({ baseUrl: apiUrl, timeoutMs });
  let reg: Awaited<ReturnType<LtcgAgentApiClient["registerAgent"]>>;
  try {
    reg = await withRetries({
      label: "registerAgent",
      retries,
      baseDelayMs: retryDelayMs,
      maxDelayMs: retryMaxDelayMs,
      fn: async () => unauth.registerAgent(`live-${suite}-${runId.slice(-6)}`),
    });
  } catch (error: any) {
    const message = String(error?.message ?? error);
    throw new Error(
      `Unable to register agent against ${apiUrl} after ${retries + 1} attempt(s): ${message}\n` +
        `Hint: pass --api-url=... (a reachable .convex.site URL) or set LTCG_API_URL.`,
    );
  }
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

  const coreStory = await runScenario("story_stage_1", scenarioTimeoutMs, async () => {
    const { matchId, completion } = await runStoryStageScenario({
      client,
      cardLookup,
      timelinePath: run.timelinePath,
      stageNumber: 1,
      maxDurationMs: scenarioSoftTimeoutMs,
    });
    await appendTimeline(run.timelinePath, { type: "note", message: `story_completion ${JSON.stringify(completion)}` });
    return { matchId };
  });
  scenarios.push(coreStory.scenarioResult);
  if (coreStory.scenarioResult.status === "fail" && observer) {
    await observer.screenshot("failure_story_stage_1");
  }

  const coreDuel = await runScenario("quick_duel", scenarioTimeoutMs, async () => {
    const { matchId, finalStatus } = await runQuickDuelScenario({
      client,
      cardLookup,
      timelinePath: run.timelinePath,
      maxDurationMs: scenarioSoftTimeoutMs,
    });
    await appendTimeline(run.timelinePath, { type: "note", message: `duel_status ${JSON.stringify(finalStatus)}` });
    return { matchId };
  });
  scenarios.push(coreDuel.scenarioResult);
  if (coreDuel.scenarioResult.status === "fail" && observer) {
    await observer.screenshot("failure_quick_duel");
  }

  const publicViewConsistency = await runScenario("public_view_consistency", scenarioTimeoutMs, async () => {
    let matchId =
      coreDuel.result &&
      typeof coreDuel.result === "object" &&
      typeof (coreDuel.result as any).matchId === "string"
        ? (coreDuel.result as any).matchId
        : null;

    if (!matchId) {
      const fallbackDuel = await client.startDuel();
      matchId = String((fallbackDuel as any)?.matchId ?? "");
      if (!matchId) {
        throw new Error("public view consistency scenario could not acquire a match");
      }
    }

    return await runPublicViewConsistencyScenario({
      client,
      timelinePath: run.timelinePath,
      matchId,
    });
  });
  scenarios.push(publicViewConsistency.scenarioResult);
  if (publicViewConsistency.scenarioResult.status === "fail" && observer) {
    await observer.screenshot("failure_public_view_consistency");
  }

  const invalidSeatAction = await runScenario("invalid_seat_action_rejected", scenarioTimeoutMs, async () =>
    runInvalidSeatActionScenario({
      client,
      timelinePath: run.timelinePath,
    }),
  );
  scenarios.push(invalidSeatAction.scenarioResult);
  if (invalidSeatAction.scenarioResult.status === "fail" && observer) {
    await observer.screenshot("failure_invalid_seat_action");
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
      const stageRes = await runScenario(name, scenarioTimeoutMs, async () => {
        const { matchId } = await runStoryStageScenario({
          client,
          cardLookup,
          timelinePath: run.timelinePath,
          chapterId,
          stageNumber,
          maxDurationMs: scenarioSoftTimeoutMs,
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
