import { describe, expect, it } from "vitest";
import { nextFailureState, summarizeRun } from "./runMachine";

describe("runMachine", () => {
  it("summarizes completed runs", () => {
    const summary = summarizeRun([
      { jobId: "j1", state: "succeeded", attempt: 0, maxAttempts: 3 },
      { jobId: "j2", state: "succeeded", attempt: 0, maxAttempts: 3 },
    ]);

    expect(summary.status).toBe("completed");
    expect(summary.completedJobs).toBe(2);
  });

  it("marks exhausted retries as failed", () => {
    expect(nextFailureState({ jobId: "j1", state: "running", attempt: 2, maxAttempts: 3 })).toBe("failed");
    expect(nextFailureState({ jobId: "j1", state: "running", attempt: 0, maxAttempts: 3 })).toBe("queued");
  });
});
