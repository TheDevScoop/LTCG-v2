import { ConvexHttpClient } from "convex/browser";

function requireConvexUrl(): string {
  const value = process.env.CONVEX_URL?.trim();
  if (!value) {
    throw new Error("CONVEX_URL is required for studio API handlers");
  }
  return value;
}

export function createConvexClient(): ConvexHttpClient {
  return new ConvexHttpClient(requireConvexUrl());
}

export async function convexMutation<T>(
  client: ConvexHttpClient,
  functionName: string,
  args: Record<string, unknown>,
): Promise<T> {
  return await (client as any).mutation(functionName, args);
}

export async function convexQuery<T>(
  client: ConvexHttpClient,
  functionName: string,
  args: Record<string, unknown>,
): Promise<T> {
  return await (client as any).query(functionName, args);
}

export async function ensureRunExists(
  client: ConvexHttpClient,
  runId: string,
  payload: {
    projectName: string;
    jobs: Array<Record<string, unknown>>;
    batchSize?: number;
    stopOnBudget?: boolean;
    budgetUsd?: number;
  },
) {
  try {
    return await convexMutation(client, "studio:createRun", {
      runId,
      projectName: payload.projectName,
      jobs: payload.jobs,
      batchSize: payload.batchSize,
      stopOnBudget: payload.stopOnBudget,
      budgetUsd: payload.budgetUsd,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown createRun error";
    if (!message.includes("already exists")) {
      throw error;
    }
    return await convexQuery(client, "studio:getRun", { runId });
  }
}
