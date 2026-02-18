import { describe, expect, it } from "vitest";
import {
  STUDIO_SCHEMA_VERSION,
  CardProjectV1Schema,
  GeneratedCardBundleV1Schema,
  migrateStudioSchema,
  validateStudioBundle,
} from "../index";

describe("card studio sdk schema", () => {
  it("migrates legacy project payloads", () => {
    const migrated = migrateStudioSchema({
      id: "legacy_project",
      name: "Legacy",
      template: {
        id: "t1",
        name: "Legacy Template",
        width: 744,
        height: 1039,
        background: "#fff",
        variables: [],
        layers: [],
      },
    });

    expect(migrated.schemaVersion).toBe(STUDIO_SCHEMA_VERSION);
    expect(migrated.projectId).toBe("legacy_project");
    expect(migrated.name).toBe("Legacy");
  });

  it("rejects invalid project payloads", () => {
    const parse = CardProjectV1Schema.safeParse({
      schemaVersion: STUDIO_SCHEMA_VERSION,
      projectId: "p1",
    });

    expect(parse.success).toBe(false);
  });

  it("validates bundle payloads", () => {
    const bundle = {
      schemaVersion: STUDIO_SCHEMA_VERSION,
      engineCompatibility: { min: "0.1.0", tested: "0.1.0" },
      template: {
        id: "template",
        name: "Template",
        width: 744,
        height: 1039,
        background: "#fff",
        variables: [],
        layers: [],
      },
      themes: [],
      cards: [],
      assets: [],
      generatedCode: {
        cardTemplateTsx: "export const CardTemplate = () => null;",
        indexTs: "export * from './CardTemplate';",
      },
      cssTokens: ":root {}",
      sdkArtifacts: {
        typesTs: "export type A = string;",
        validatorsTs: "export const validate = () => true;",
      },
      manifest: {
        createdAt: Date.now(),
        files: [
          {
            path: "bundle.studio.json",
            checksum: "abc123",
          },
        ],
      },
    };

    const result = validateStudioBundle(bundle);
    expect(result.success).toBe(true);
    expect(GeneratedCardBundleV1Schema.parse(bundle).schemaVersion).toBe(STUDIO_SCHEMA_VERSION);
  });

  it("returns readable errors on invalid bundle", () => {
    const result = validateStudioBundle({ schemaVersion: STUDIO_SCHEMA_VERSION });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});
