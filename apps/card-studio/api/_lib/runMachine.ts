export type JobState = "queued" | "running" | "succeeded" | "failed" | "canceled";

export type RunJob = {
  jobId: string;
  state: JobState;
  attempt: number;
  maxAttempts: number;
};

export type RunSummary = {
  status: "queued" | "running" | "completed" | "failed" | "canceled";
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  canceledJobs: number;
};

export function summarizeRun(jobs: RunJob[]): RunSummary {
  const totalJobs = jobs.length;
  const completedJobs = jobs.filter((job) => job.state === "succeeded").length;
  const failedJobs = jobs.filter((job) => job.state === "failed").length;
  const canceledJobs = jobs.filter((job) => job.state === "canceled").length;
  const queuedJobs = jobs.filter((job) => job.state === "queued").length;
  const runningJobs = jobs.filter((job) => job.state === "running").length;

  let status: RunSummary["status"] = "queued";
  if (canceledJobs === totalJobs && totalJobs > 0) {
    status = "canceled";
  } else if (completedJobs === totalJobs && totalJobs > 0) {
    status = "completed";
  } else if (failedJobs > 0 && queuedJobs === 0 && runningJobs === 0) {
    status = "failed";
  } else if (runningJobs > 0 || completedJobs > 0) {
    status = "running";
  }

  return {
    status,
    totalJobs,
    completedJobs,
    failedJobs,
    canceledJobs,
  };
}

export function nextFailureState(job: RunJob): JobState {
  return job.attempt + 1 >= job.maxAttempts ? "failed" : "queued";
}
