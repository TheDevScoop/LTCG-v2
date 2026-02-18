import { describe, expect, it, vi } from "vitest";

vi.mock("ai", () => {
  return {
    generateText: vi.fn(async () => ({
      output: {
        title: "Mock Card",
        flavorText: "Flavor",
        effectText: "Effect",
        rarity: "common",
        variableOverrides: { name: "Mock Card" },
      },
    })),
    generateImage: vi.fn(async () => ({
      image: {
        uint8Array: new Uint8Array([1, 2, 3]),
      },
    })),
    Output: {
      object: vi.fn((args) => args),
    },
  };
});

vi.mock("@ai-sdk/gateway", () => ({
  createGateway: vi.fn(() => (model: string) => ({ model })),
}));

vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: vi.fn(() => ({
    chat: (model: string) => ({ model }),
  })),
}));

vi.mock("@ai-sdk/fal", () => ({
  createFal: vi.fn(() => ({
    image: (model: string) => ({ model }),
  })),
}));

import { generateStudioJob } from "./providers";

describe("providers", () => {
  it("generates structured text and optional image", async () => {
    const result = await generateStudioJob(
      {
        prompt: "Generate card",
        model: "openai/gpt-5-mini",
        values: { name: "A" },
        generateImage: true,
      },
      {
        gatewayApiKey: "x",
        openrouterApiKey: "y",
        falApiKey: "z",
      },
    );

    expect(result.suggestion.title).toBe("Mock Card");
    expect(result.imageDataUri?.startsWith("data:image/png;base64,")).toBe(true);
  });
});
