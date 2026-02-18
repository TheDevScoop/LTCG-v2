import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

function runCommand(cwd: string, command: string, args: string[] = []) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
  });

  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function initTempRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), "ltcg-script-test-"));
  tempDirs.push(dir);

  cpSync(path.join(process.cwd(), "cleanup.sh"), path.join(dir, "cleanup.sh"));
  cpSync(path.join(process.cwd(), "fix-packages.sh"), path.join(dir, "fix-packages.sh"));

  mkdirSync(path.join(dir, ".github/workflows"), { recursive: true });
  mkdirSync(path.join(dir, "apps/web/src/components/game/hooks"), { recursive: true });
  mkdirSync(path.join(dir, "apps/web/api"), { recursive: true });
  mkdirSync(path.join(dir, "api"), { recursive: true });

  writeFileSync(path.join(dir, "package.json"), "{\n  \"name\": \"test\"\n}\n");

  expect(runCommand(dir, "git", ["init", "-q"]).status).toBe(0);
  expect(runCommand(dir, "git", ["config", "user.email", "test@example.com"]).status).toBe(0);
  expect(runCommand(dir, "git", ["config", "user.name", "Test User"]).status).toBe(0);

  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("cleanup.sh", () => {
  it("defaults to dry-run and only removes untracked artifacts on apply", () => {
    const dir = initTempRepo();

    const trackedTestPath = "apps/web/src/components/game/hooks/useGameState.test.ts";
    const untrackedWorkflowPath = ".github/workflows/remotion-pr-preview.yml";
    const duplicateAppHandler = "apps/web/api/soundtrack-sfx.ts";
    const rootHandler = "api/soundtrack-sfx.ts";

    writeFileSync(path.join(dir, trackedTestPath), "// tracked test file\n");
    writeFileSync(path.join(dir, untrackedWorkflowPath), "name: workflow\n");
    writeFileSync(path.join(dir, duplicateAppHandler), "export default {};\n");
    writeFileSync(path.join(dir, rootHandler), "export default {};\n");

    expect(runCommand(dir, "git", ["add", "package.json", trackedTestPath]).status).toBe(0);

    const dryRun = runCommand(dir, "bash", ["cleanup.sh"]);
    expect(dryRun.status).toBe(0);
    expect(dryRun.stdout).toContain("Running in dry-run mode.");
    expect(existsSync(path.join(dir, untrackedWorkflowPath))).toBe(true);
    expect(existsSync(path.join(dir, trackedTestPath))).toBe(true);
    expect(existsSync(path.join(dir, duplicateAppHandler))).toBe(true);

    const apply = runCommand(dir, "bash", ["cleanup.sh", "--apply", "--yes"]);
    expect(apply.status).toBe(0);
    expect(existsSync(path.join(dir, untrackedWorkflowPath))).toBe(false);
    expect(existsSync(path.join(dir, trackedTestPath))).toBe(true);
    expect(existsSync(path.join(dir, duplicateAppHandler))).toBe(false);
    expect(existsSync(path.join(dir, rootHandler))).toBe(true);
  });
});

describe("fix-packages.sh", () => {
  it("supports dry-run and apply with --skip-install", () => {
    const dir = initTempRepo();

    mkdirSync(path.join(dir, "node_modules/example"), { recursive: true });
    mkdirSync(path.join(dir, "apps/web/node_modules/example"), { recursive: true });
    writeFileSync(path.join(dir, "bun.lockb"), "lock");

    const dryRun = runCommand(dir, "bash", ["fix-packages.sh"]);
    expect(dryRun.status).toBe(0);
    expect(dryRun.stdout).toContain("Running in dry-run mode.");
    expect(existsSync(path.join(dir, "node_modules"))).toBe(true);
    expect(existsSync(path.join(dir, "bun.lockb"))).toBe(true);

    const apply = runCommand(dir, "bash", [
      "fix-packages.sh",
      "--apply",
      "--yes",
      "--skip-install",
    ]);
    expect(apply.status).toBe(0);
    expect(apply.stdout).toContain("Skipped bun install");
    expect(existsSync(path.join(dir, "node_modules"))).toBe(false);
    expect(existsSync(path.join(dir, "apps/web/node_modules"))).toBe(false);
    expect(existsSync(path.join(dir, "bun.lockb"))).toBe(false);
  });
});
