import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..", "..");

const readSource = (relativePath: string) =>
  readFileSync(path.join(repoRoot, relativePath), "utf8");

describe("agent HTTP routes", () => {
  it("passes actorUserId to internal submitActionAsActor for agent actions", () => {
    const httpSource = readSource("convex/http.ts");

    expect(httpSource).toContain('path: "/api/agent/game/action"');
    expect(httpSource).toMatch(
      /path:\s*"\/api\/agent\/game\/action"[\s\S]*?ctx\.runMutation\(\s*internal\.game\.submitActionAsActor\s*,\s*\{[\s\S]*?actorUserId:\s*agent\.userId/,
    );
  });

  it("uses internal getPlayerViewAsActor for authenticated agent game view", () => {
    const httpSource = readSource("convex/http.ts");

    expect(httpSource).toContain('path: "/api/agent/game/view"');
    expect(httpSource).toMatch(
      /path:\s*"\/api\/agent\/game\/view"[\s\S]*?ctx\.runQuery\(\s*internal\.game\.getPlayerViewAsActor\s*,\s*\{[\s\S]*?actorUserId:\s*agent\.userId/,
    );
  });

  it("uses internal getMatchMetaAsActor for participant-scoped metadata reads", () => {
    const httpSource = readSource("convex/http.ts");

    expect(httpSource).toMatch(
      /resolveMatchAndSeat[\s\S]*?ctx\.runQuery\(\s*internal\.game\.getMatchMetaAsActor\s*,\s*\{[\s\S]*?actorUserId:\s*agentUserId/,
    );
  });
});
