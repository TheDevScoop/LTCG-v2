import { describe, expect, it } from "vitest";
import {
  compilePrompt,
  createDraftFromWorld,
  deserializeDraft,
  runDeterministicDice,
  serializeDraft,
  validateDraft,
} from "./studioApi";
import { playableWorlds } from "./worlds";

describe("studioApi", () => {
  it("compiles templates and marks missing placeholders", () => {
    const prompt = {
      id: "test",
      name: "Test",
      purpose: "test",
      inputSchema: ["world", "tone"],
      template: "World {{world}} with tone {{tone}} and {{missing_key}}",
      outputChecklist: [],
    };

    const result = compilePrompt(prompt, { world: "Neon Borough", tone: "high pressure" });
    expect(result).toContain("Neon Borough");
    expect(result).toContain("high pressure");
    expect(result).toContain("[missing:missing_key]");
  });

  it("rolls deterministic dice with seed replay", () => {
    const a = runDeterministicDice("1d20+2", 77);
    const b = runDeterministicDice("1d20+2", 77);
    expect(a.total).toBe(b.total);
    expect(a.rolls).toEqual(b.rolls);
    expect(() => runDeterministicDice("bad+syntax", 1)).toThrow();
  });

  it("validates publish configuration", () => {
    const draft = createDraftFromWorld(playableWorlds[0].id);
    draft.publish.version = "not-semver";
    const issues = validateDraft(draft);
    expect(issues.some((issue) => issue.code === "package_version_invalid")).toBe(true);
  });

  it("supports draft JSON roundtrip", () => {
    const draft = createDraftFromWorld(playableWorlds[1].id);
    const serialized = serializeDraft(draft);
    const parsed = deserializeDraft(serialized);
    expect(parsed.world.id).toBe(draft.world.id);
    expect(parsed.publish.packageName).toBe(draft.publish.packageName);
  });
});
