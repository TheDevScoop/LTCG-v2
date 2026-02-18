export type LiveGameplaySuite = "core" | "full" | "soak";

export type LiveGameplayStatus = "pass" | "fail" | "skip";

export type LiveGameplayAssertion = {
  id: string;
  ok: boolean;
  details?: string;
};

export type LiveGameplayArtifact = {
  kind: "report" | "timeline" | "screenshot" | "log";
  path: string;
};

export type LiveGameplayScenarioResult = {
  scenario: string;
  status: LiveGameplayStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  agent?: { id: string; name: string; apiKeyPrefix: string };
  matchId?: string;
  assertions: LiveGameplayAssertion[];
  errors: Array<{ message: string; stack?: string }>;
};

export type LiveGameplayReport = {
  runId: string;
  suite: LiveGameplaySuite;
  status: LiveGameplayStatus;
  apiUrl: string;
  webUrl?: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  scenarios: LiveGameplayScenarioResult[];
  artifacts: LiveGameplayArtifact[];
};

