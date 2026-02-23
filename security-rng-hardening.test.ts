import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname);

function read(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("player-facing RNG hardening", () => {
  it("does not use Math.random in sensitive matchmaking/economy code paths", () => {
    const sensitiveFiles = [
      "convex/game.ts",
      "convex/packs.ts",
      "packages/lunchtable-tcg-guilds/src/component/invites.ts",
    ];

    for (const file of sensitiveFiles) {
      const source = read(file);
      expect(source).not.toContain("Math.random");
    }
  });
});
