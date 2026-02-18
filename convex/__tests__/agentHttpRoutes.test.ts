import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..", "..");

const readSource = (relativePath: string) =>
  readFileSync(path.join(repoRoot, relativePath), "utf8");

describe("agent HTTP routes", () => {
  it("passes actorUserId to game.submitAction so agent actions don't require session auth", () => {
    const httpSource = readSource("convex/http.ts");

    expect(httpSource).toContain('path: "/api/agent/game/action"');
    expect(httpSource).toMatch(
      /path:\s*"\/api\/agent\/game\/action"[\s\S]*?ctx\.runMutation\(\s*api\.game\.submitAction\s*,\s*\{[\s\S]*?actorUserId:\s*agent\.userId/,
    );
  });
});

