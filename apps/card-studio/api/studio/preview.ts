import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as z from "zod";
import { enforcePost, json, readJsonBody } from "../_lib/http";
import { generateStudioJob } from "../_lib/providers";
import { redactSecrets } from "../../shared/security";

const PreviewSchema = z.object({
  prompt: z.string().min(1),
  card: z.object({
    id: z.string(),
    name: z.string(),
    variables: z.record(z.string(), z.unknown()),
  }),
  template: z.object({
    id: z.string(),
    name: z.string(),
  }),
  providerConfig: z
    .object({
      gatewayApiKey: z.string().optional(),
      openrouterApiKey: z.string().optional(),
      falApiKey: z.string().optional(),
    })
    .default({}),
});

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!enforcePost(request, response)) return;

  try {
    const body = PreviewSchema.parse(readJsonBody(request));
    const result = await generateStudioJob(
      {
        prompt: `${body.prompt}\n\nCard: ${body.card.name}`,
        model: "openai/gpt-5-mini",
        values: body.card.variables,
        generateImage: true,
        imageModel: "fal-ai/flux/schnell",
      },
      body.providerConfig,
    );

    json(response, 200, {
      suggestion: `Preview generated for ${body.card.name}`,
      updatedVariables: {
        ...body.card.variables,
        name: result.suggestion.title,
        flavor: result.suggestion.flavorText,
        effectText: result.suggestion.effectText,
      },
      imageDataUri: result.imageDataUri,
    });
  } catch (error) {
    const payload = redactSecrets(
      error instanceof Error ? { message: error.message } : { message: "Preview request failed" },
    );
    json(response, 400, payload);
  }
}
