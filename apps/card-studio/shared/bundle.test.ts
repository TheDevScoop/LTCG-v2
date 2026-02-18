import { describe, expect, it } from "vitest";
import { cloneDefaultProject } from "./defaults";
import { buildBundleFromProject } from "./bundle";

describe("buildBundleFromProject", () => {
  it("is deterministic for stable project input", () => {
    const project = cloneDefaultProject();
    project.createdAt = 1700000000000;
    project.updatedAt = 1700000000000;

    const first = buildBundleFromProject(project);
    const second = buildBundleFromProject(project);

    expect(first.generatedCode.cardTemplateTsx).toBe(second.generatedCode.cardTemplateTsx);
    expect(first.cssTokens).toBe(second.cssTokens);
    expect(first.assets.map((asset) => asset.checksum)).toEqual(
      second.assets.map((asset) => asset.checksum),
    );
  });
});
