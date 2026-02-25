import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { LiveGameplayArtifact, LiveGameplayReport } from "./types";

export type TimelineEvent =
  | { t: string; type: "note"; message: string }
  | { t: string; type: "agent"; message: string; agentId?: string; apiKeyPrefix?: string }
  | { t: string; type: "match"; message: string; matchId?: string }
  | {
      t: string;
      type: "view";
      matchId: string;
      seat?: string;
      turn?: string;
      phase?: string;
      priority?: string;
      chain?: number;
      gameOver?: boolean;
      lp?: [number, number];
    }
  | { t: string; type: "action"; matchId: string; seat?: string; command: Record<string, unknown> }
  | { t: string; type: "spectator"; message: string; snapshot?: unknown };

function isoNow() {
  return new Date().toISOString();
}

export type RunArtifacts = {
  runId: string;
  runDir: string;
  reportPath: string;
  timelinePath: string;
};

export async function prepareRunArtifacts(runId: string): Promise<RunArtifacts> {
  const runDir = join(process.cwd(), "artifacts", "live-gameplay", runId);
  const reportPath = join(runDir, "report.json");
  const timelinePath = join(runDir, "timeline.ndjson");

  await mkdir(runDir, { recursive: true });
  // Ensure parent exists (defensive for custom paths).
  await mkdir(dirname(reportPath), { recursive: true });
  await mkdir(dirname(timelinePath), { recursive: true });

  return { runId, runDir, reportPath, timelinePath };
}

export async function appendTimeline(timelinePath: string, event: Omit<TimelineEvent, "t">) {
  const payload: TimelineEvent = { t: isoNow(), ...event } as TimelineEvent;
  await appendFile(timelinePath, `${JSON.stringify(payload)}\n`, "utf8");
}

export async function writeReport(reportPath: string, report: LiveGameplayReport) {
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

export function defaultArtifactsForRun(run: RunArtifacts): LiveGameplayArtifact[] {
  const cwd = process.cwd().replace(/\\/g, "/");
  const toRel = (p: string) => {
    const normalized = p.replace(/\\/g, "/");
    return normalized.startsWith(`${cwd}/`) ? normalized.slice(cwd.length + 1) : p;
  };
  return [
    { kind: "report", path: toRel(run.reportPath) },
    { kind: "timeline", path: toRel(run.timelinePath) },
  ];
}
