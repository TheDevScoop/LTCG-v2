import { createFal } from "@ai-sdk/fal";
import { createGateway } from "@ai-sdk/gateway";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateImage, generateText, Output } from "ai";
import * as z from "zod";

export type ProviderKeys = {
  gatewayApiKey?: string;
  openrouterApiKey?: string;
  falApiKey?: string;
};

type GenerateJobInput = {
  prompt: string;
  model: string;
  values: Record<string, unknown>;
  generateImage: boolean;
  imageModel?: string;
  providerPreference?: "gateway" | "openrouter";
};

const GenerationSchema = z.object({
  title: z.string(),
  flavorText: z.string(),
  effectText: z.string(),
  rarity: z.string(),
  variableOverrides: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

function buildProviders(keys: ProviderKeys) {
  return {
    gateway: createGateway({
      apiKey: keys.gatewayApiKey || process.env.AI_GATEWAY_API_KEY || "",
    }),
    openrouter: createOpenRouter({
      apiKey: keys.openrouterApiKey || process.env.OPENROUTER_API_KEY || "",
    }),
    fal: createFal({
      apiKey: keys.falApiKey || process.env.FAL_API_KEY || process.env.FAL_KEY || "",
    }),
  };
}

async function runTextGeneration(
  input: GenerateJobInput,
  keys: ProviderKeys,
): Promise<z.infer<typeof GenerationSchema>> {
  const providers = buildProviders(keys);

  const prompt = [
    "You are a TCG designer producing clean JSON only.",
    input.prompt,
    `Current variables: ${JSON.stringify(input.values)}`,
    "Return compact values that can be used directly in a card template.",
  ].join("\n\n");

  const useGatewayFirst = input.providerPreference !== "openrouter";
  const modelName = input.model || "openai/gpt-5-mini";

  if (useGatewayFirst) {
    try {
      const result = await generateText({
        model: providers.gateway(modelName),
        prompt,
        output: Output.object({ schema: GenerationSchema }),
        providerOptions: {
          gateway: {
            order: ["openai", "anthropic"],
          },
        },
      });

      return result.output;
    } catch {
      // fallback to OpenRouter below
    }
  }

  const fallbackResult = await generateText({
    model: providers.openrouter.chat("anthropic/claude-3.5-sonnet"),
    prompt,
    output: Output.object({ schema: GenerationSchema }),
  });

  return fallbackResult.output;
}

async function runImageGeneration(
  prompt: string,
  keys: ProviderKeys,
  imageModel: string,
): Promise<string | undefined> {
  const providers = buildProviders(keys);
  if (!(keys.falApiKey || process.env.FAL_API_KEY || process.env.FAL_KEY)) {
    return undefined;
  }

  const imageResult = await generateImage({
    model: providers.fal.image(imageModel),
    prompt,
  });

  return `data:image/png;base64,${Buffer.from(imageResult.image.uint8Array).toString("base64")}`;
}

export async function generateStudioJob(
  input: GenerateJobInput,
  keys: ProviderKeys,
): Promise<{ suggestion: z.infer<typeof GenerationSchema>; imageDataUri?: string }> {
  const suggestion = await runTextGeneration(input, keys);
  let imageDataUri: string | undefined;

  if (input.generateImage) {
    imageDataUri = await runImageGeneration(
      `${suggestion.title}: ${suggestion.flavorText}`,
      keys,
      input.imageModel || "fal-ai/flux/schnell",
    );
  }

  return { suggestion, imageDataUri };
}
