import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

  mkdirSync(path.join(dir, "scripts"), { recursive: true });
  cpSync(path.join(process.cwd(), "cleanup.sh"), path.join(dir, "cleanup.sh"));
  cpSync(path.join(process.cwd(), "fix-packages.sh"), path.join(dir, "fix-packages.sh"));
  cpSync(
    path.join(process.cwd(), "scripts/setup-dev-env.sh"),
    path.join(dir, "scripts/setup-dev-env.sh"),
  );
  cpSync(
    path.join(process.cwd(), "scripts/setup-dev-agent-auth.sh"),
    path.join(dir, "scripts/setup-dev-agent-auth.sh"),
  );
  cpSync(
    path.join(process.cwd(), "scripts/run-worktree-automation.sh"),
    path.join(dir, "scripts/run-worktree-automation.sh"),
  );
  mkdirSync(path.join(dir, ".agents/skills/ltcg-complete-setup/scripts"), { recursive: true });
  cpSync(
    path.join(process.cwd(), ".agents/skills/ltcg-complete-setup/scripts/bootstrap.sh"),
    path.join(dir, ".agents/skills/ltcg-complete-setup/scripts/bootstrap.sh"),
  );

  mkdirSync(path.join(dir, ".github/workflows"), { recursive: true });
  mkdirSync(path.join(dir, "apps/web-tanstack"), { recursive: true });
  mkdirSync(path.join(dir, "apps/web-tanstack/src/app/components/game/hooks"), { recursive: true });
  mkdirSync(path.join(dir, "apps/web-tanstack/api"), { recursive: true });
  mkdirSync(path.join(dir, "api"), { recursive: true });

  writeFileSync(path.join(dir, "package.json"), "{\n  \"name\": \"test\"\n}\n");
  writeFileSync(path.join(dir, "apps/web-tanstack/package.json"), "{\n  \"name\": \"web-ts\"\n}\n");

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

    const trackedTestPath = "apps/web-tanstack/src/app/components/game/hooks/useGameState.test.ts";
    const untrackedWorkflowPath = ".github/workflows/remotion-pr-preview.yml";
    const duplicateAppHandler = "apps/web-tanstack/api/soundtrack-sfx.ts";
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
    mkdirSync(path.join(dir, "apps/web-tanstack/node_modules/example"), { recursive: true });
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
    expect(existsSync(path.join(dir, "apps/web-tanstack/node_modules"))).toBe(false);
    expect(existsSync(path.join(dir, "bun.lockb"))).toBe(false);
  });
});

describe("scripts/setup-dev-env.sh", () => {
  it("writes Convex env values without requiring installs in test mode", () => {
    const dir = initTempRepo();

    const result = runCommand(dir, "bash", [
      "scripts/setup-dev-env.sh",
      "--deployment",
      "scintillating-mongoose-458",
      "--skip-install",
      "--skip-convex-check",
      "--skip-bun-install",
      "--skip-workspace-build",
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("CONVEX_DEPLOYMENT=scintillating-mongoose-458");
    expect(result.stdout).toContain(
      "VITE_CONVEX_URL=https://scintillating-mongoose-458.convex.cloud",
    );
    expect(result.stdout).toContain(
      "LTCG_API_URL=https://scintillating-mongoose-458.convex.site",
    );

    const rootEnv = readFileSync(path.join(dir, ".env.local"), "utf8");
    expect(rootEnv).toContain("CONVEX_DEPLOYMENT=scintillating-mongoose-458");
    expect(rootEnv).toContain("VITE_CONVEX_URL=https://scintillating-mongoose-458.convex.cloud");
    expect(rootEnv).toContain("LTCG_API_URL=https://scintillating-mongoose-458.convex.site");

    const webTanstackEnv = readFileSync(path.join(dir, "apps/web-tanstack/.env.local"), "utf8");
    expect(webTanstackEnv).toContain(
      "VITE_CONVEX_URL=https://scintillating-mongoose-458.convex.cloud",
    );

  });
});

describe(".agents/skills/ltcg-complete-setup/scripts/bootstrap.sh", () => {
  it("supports worktree-targeted setup and emits an automation env file in test mode", () => {
    const dir = initTempRepo();

    const automationEnvPath = "artifacts/automation/worktree.env";
    const result = runCommand(dir, "bash", [
      ".agents/skills/ltcg-complete-setup/scripts/bootstrap.sh",
      "--worktree",
      dir,
      "--deployment",
      "scintillating-mongoose-458",
      "--skip-install",
      "--skip-convex-check",
      "--skip-bun-install",
      "--skip-workspace-build",
      "--emit-automation-env",
      automationEnvPath,
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("=== LTCG setup profile ===");

    const emittedEnv = readFileSync(path.join(dir, automationEnvPath), "utf8");
    expect(emittedEnv).toContain(`LTCG_WORKTREE_PATH=${dir}`);
    expect(emittedEnv).toContain("CONVEX_DEPLOYMENT=scintillating-mongoose-458");
    expect(emittedEnv).toContain("VITE_CONVEX_URL=https://scintillating-mongoose-458.convex.cloud");
    expect(emittedEnv).toContain("LTCG_API_URL=https://scintillating-mongoose-458.convex.site");
    expect(emittedEnv).toContain("LTCG_LIVE_REQUIRED=1");
  });
});

describe("scripts/run-worktree-automation.sh", () => {
  it("exposes a help command for scheduler usage", () => {
    const dir = initTempRepo();
    const result = runCommand(dir, "bash", ["scripts/run-worktree-automation.sh", "--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Runs the complete setup skill against a specific worktree");
    expect(result.stdout).toContain("--worktree <path>");
    expect(result.stdout).toContain("--skip-live");
    expect(result.stdout).toContain("--skip-install");
  });
});
