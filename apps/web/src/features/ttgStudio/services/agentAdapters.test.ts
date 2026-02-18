import { describe, expect, it } from "vitest";
import { createDraftFromWorld, playableWorlds } from "@/lib/ttrpgStudio";
import { createAgentAdapter, SimulatedAgentAdapter } from "./agentAdapters";

describe("agentAdapters", () => {
  it("generates deterministic simulated turns for identical seeds", async () => {
    const draft = createDraftFromWorld(playableWorlds[0].id);

    const adapterA = new SimulatedAgentAdapter();
    const adapterB = new SimulatedAgentAdapter();

    const sessionA = await adapterA.startSession({ provider: "simulated", draft, seed: 42 });
    const sessionB = await adapterB.startSession({ provider: "simulated", draft, seed: 42 });

    const stepA = await adapterA.stepTurn(sessionA);
    const stepB = await adapterB.stepTurn(sessionB);

    expect(stepA.map((event) => event.message)).toEqual(stepB.map((event) => event.message));
  });

  it("returns explicit not-connected status for scaffolded providers", async () => {
    const adapter = createAgentAdapter("eliza");
    const health = await adapter.healthCheck();
    expect(health.connected).toBe(false);
    expect(health.status).toBe("not-connected");
  });
});
