import { describe, expect, it } from "vitest";
import { cloneDefaultProject } from "../../shared/defaults";
import { buildBundleFromProject } from "../../shared/bundle";
import { validateBundleForPromotion } from "./promotion";

describe("promotion validation", () => {
  it("accepts valid bundle cards", () => {
    const project = cloneDefaultProject();
    const bundle = buildBundleFromProject(project);
    const result = validateBundleForPromotion(bundle);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects invalid card archetype", () => {
    const project = cloneDefaultProject();
    project.cards[0]!.gameplay = {
      ...project.cards[0]!.gameplay!,
      archetype: "invalid-archetype",
    };

    const bundle = buildBundleFromProject(project);
    const result = validateBundleForPromotion(bundle);
    expect(result.errors.some((entry) => entry.includes("invalid archetype"))).toBe(true);
  });
});
