import { describe, expect, it } from "vitest";
import { cloneDefaultProject } from "../../shared/defaults";
import { buildBundleFromProject } from "../../shared/bundle";
import { validateBundleForPromotion } from "./promotion";

describe("happy path", () => {
  it("builds bundle then validates for promotion", () => {
    const project = cloneDefaultProject();
    const bundle = buildBundleFromProject(project);
    const validation = validateBundleForPromotion(bundle);

    expect(bundle.cards.length).toBeGreaterThan(0);
    expect(bundle.assets.length).toBeGreaterThan(0);
    expect(validation.errors).toHaveLength(0);
  });
});
