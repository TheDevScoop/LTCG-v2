import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as z from "zod";
import { BatchRunSpecV1Schema } from "@lunchtable-tcg/card-studio-sdk";
import { enforcePost, json, readJsonBody } from "../_lib/http";
import { convexMutation, convexQuery, createConvexClient, ensureRunExists } from "../_lib/convexClient";
import { generateStudioJob } from "../_lib/providers";
import { redactSecrets } from "../../shared/security";

const ExecuteSchema = z.object({
  runId: z.string().min(1),
  runSpec: BatchRunSpecV1Schema.optional(),
  providerConfig: z
    .object({
      gatewayApiKey: z.string().optional(),
      openrouterApiKey: z.string().optional(),
      falApiKey: z.string().optional(),
    })
    .default({}),
  chunkSize: z.number().int().positive().max(50).default(50),
});

type ClaimedJob = {
  jobId: string;
  input: {
    prompt: string;
    variables: Record<string, unknown>;
    generateImage?: boolean;
  };
  attempt: number;
  claimToken: string;
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!enforcePost(request, response)) return;

  try {
    const body = ExecuteSchema.parse(readJsonBody(request));
    const client = createConvexClient();

    if (body.runSpec) {
      await ensureRunExists(client, body.runId, {
        projectName: body.runSpec.projectName,
        jobs: body.runSpec.jobs.map((job) => ({
          ...job,
          maxAttempts: 3,
        })),
        batchSize: body.runSpec.batchSize,
        stopOnBudget: body.runSpec.stopOnBudget,
        budgetUsd: body.runSpec.budgetUsd,
      });
    }

    const claimed = (await convexMutation(client, "studio:claimRunWork", {
      runId: body.runId,
      chunkSize: body.chunkSize,
    })) as { jobs: ClaimedJob[] };

    let processedJobs = 0;

    for (const job of claimed.jobs) {
      try {
        const generated = await generateStudioJob(
          {
            prompt: job.input.prompt,
            model: "openai/gpt-5-mini",
            values: job.input.variables,
            generateImage: Boolean(job.input.generateImage),
            imageModel: "fal-ai/flux/schnell",
          },
          body.providerConfig,
        );

        await convexMutation(client, "studio:completeJob", {
          runId: body.runId,
          jobId: job.jobId,
          claimToken: job.claimToken,
          output: {
            suggestion: generated.suggestion,
            imageDataUri: generated.imageDataUri,
          },
        });
      } catch (error) {
        await convexMutation(client, "studio:failJob", {
          runId: body.runId,
          jobId: job.jobId,
          claimToken: job.claimToken,
          error: redactSecrets(
            error instanceof Error ? { message: error.message } : { message: "Job failed" },
          ),
        });
      }

      processedJobs += 1;
    }

    const run = await convexQuery(client, "studio:getRun", { runId: body.runId });

    json(response, 200, {
      run,
      processedJobs,
    });
  } catch (error) {
    const payload = redactSecrets(
      error instanceof Error ? { error: error.message } : { error: "execute failed" },
    );
    json(response, 400, payload);
  }
}
