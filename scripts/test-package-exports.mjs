#!/usr/bin/env node
/**
 * test-package-exports.mjs
 *
 * Validates that all workspace package exports resolve correctly.
 *
 * Exit codes:
 *   0  - all source files exist (ground truth)
 *   1  - one or more source files are missing
 *
 * Dist files (import / types / default) are warnings only — they require a
 * build step and their absence does not fail the script.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGES_DIR = resolve(__dirname, "../packages");

// ---------------------------------------------------------------------------
// Packages to validate
// Each entry mirrors the real package.json exports field.
// ---------------------------------------------------------------------------
const PACKAGES = [
  {
    name: "@lunchtable/engine",
    dir: join(PACKAGES_DIR, "engine"),
    exports: {
      ".": {
        import: "./dist/index.js",
        types: "./dist/index.d.ts",
      },
      "./types": {
        import: "./dist/types/index.js",
        types: "./dist/types/index.d.ts",
      },
      "./rules": {
        import: "./dist/rules/index.js",
        types: "./dist/rules/index.d.ts",
      },
    },
  },
  {
    name: "@lunchtable/cards",
    dir: join(PACKAGES_DIR, "lunchtable-tcg-cards"),
    exports: {
      ".": {
        "@convex-dev/component-source": "./src/client/index.ts",
        import: "./dist/client/index.js",
        types: "./dist/client/index.d.ts",
        default: "./dist/client/index.js",
      },
      "./convex.config": {
        "@convex-dev/component-source": "./src/component/convex.config.ts",
        import: "./dist/component/convex.config.js",
        types: "./dist/component/convex.config.d.ts",
        default: "./dist/component/convex.config.js",
      },
    },
  },
  {
    name: "@lunchtable/match",
    dir: join(PACKAGES_DIR, "lunchtable-tcg-match"),
    exports: {
      ".": {
        "@convex-dev/component-source": "./src/client/index.ts",
        import: "./dist/client/index.js",
        types: "./dist/client/index.d.ts",
        default: "./dist/client/index.js",
      },
      "./convex.config": {
        "@convex-dev/component-source": "./src/component/convex.config.ts",
        import: "./dist/component/convex.config.js",
        types: "./dist/component/convex.config.d.ts",
        default: "./dist/component/convex.config.js",
      },
    },
  },
  {
    name: "@lunchtable/story",
    dir: join(PACKAGES_DIR, "lunchtable-tcg-story"),
    exports: {
      ".": {
        "@convex-dev/component-source": "./src/client/index.ts",
        import: "./dist/client/index.js",
        types: "./dist/client/index.d.ts",
        default: "./dist/client/index.js",
      },
      "./convex.config": {
        "@convex-dev/component-source": "./src/component/convex.config.ts",
        import: "./dist/component/convex.config.js",
        types: "./dist/component/convex.config.d.ts",
        default: "./dist/component/convex.config.js",
      },
    },
  },
  {
    name: "@lunchtable/guilds",
    dir: join(PACKAGES_DIR, "lunchtable-tcg-guilds"),
    exports: {
      ".": {
        "@convex-dev/component-source": "./src/client/index.ts",
        import: "./dist/client/index.js",
        types: "./dist/client/index.d.ts",
        default: "./dist/client/index.js",
      },
      "./convex.config": {
        "@convex-dev/component-source": "./src/component/convex.config.ts",
        import: "./dist/component/convex.config.js",
        types: "./dist/component/convex.config.d.ts",
        default: "./dist/component/convex.config.js",
      },
    },
  },
  {
    name: "@lunchtable/plugin-ltcg",
    dir: join(PACKAGES_DIR, "plugin-ltcg"),
    exports: {
      ".": {
        types: "./dist/index.d.ts",
        default: "./dist/index.js",
      },
    },
  },
  {
    name: "@lunchtable/app-lunchtable",
    dir: join(PACKAGES_DIR, "app-lunchtable"),
    exports: {
      ".": {
        types: "./dist/index.d.ts",
        default: "./dist/index.js",
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SOURCE_CONDITION = "@convex-dev/component-source";
const DIST_CONDITIONS = new Set(["import", "types", "default"]);

/** ANSI colour helpers (no dependencies). */
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

const ok = (msg) => console.log(`  ${c.green}✓${c.reset} ${msg}`);
const warn = (msg) => console.log(`  ${c.yellow}⚠${c.reset}  ${msg}`);
const fail = (msg) => console.log(`  ${c.red}✗${c.reset} ${msg}`);
const info = (msg) => console.log(`${c.cyan}${msg}${c.reset}`);
const dim = (msg) => console.log(`${c.dim}${msg}${c.reset}`);

/** Detect whether a package has a build script by reading its package.json. */
function hasBuildScript(pkgDir) {
  try {
    const raw = readFileSync(join(pkgDir, "package.json"), "utf8");
    const json = JSON.parse(raw);
    return Boolean(json.scripts && json.scripts.build);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main validation loop
// ---------------------------------------------------------------------------

let totalSourceErrors = 0;
let totalDistWarnings = 0;
let totalOk = 0;

console.log();
info("=== Workspace Package Export Validator ===");
console.log();

for (const pkg of PACKAGES) {
  const hasBuild = hasBuildScript(pkg.dir);

  console.log(`${c.bold}${pkg.name}${c.reset}  ${c.dim}(${pkg.dir})${c.reset}`);

  for (const [subpath, conditions] of Object.entries(pkg.exports)) {
    dim(`  export "${subpath}"`);

    for (const [condition, relativePath] of Object.entries(conditions)) {
      const absolutePath = join(pkg.dir, relativePath);
      const exists = existsSync(absolutePath);
      const shortPath = relativePath;

      if (condition === SOURCE_CONDITION) {
        // Source files MUST exist — failures are hard errors.
        if (exists) {
          ok(`[source] ${shortPath}`);
          totalOk++;
        } else {
          fail(`[source] ${shortPath}  ${c.red}MISSING${c.reset}`);
          totalSourceErrors++;
        }
      } else if (DIST_CONDITIONS.has(condition)) {
        // Dist files — warn only if missing, trust the build script.
        if (exists) {
          ok(`[${condition}] ${shortPath}`);
          totalOk++;
        } else if (hasBuild) {
          warn(`[${condition}] ${shortPath}  (not built yet — run \`build\` script)`);
          totalDistWarnings++;
        } else {
          warn(`[${condition}] ${shortPath}  (missing and no build script found)`);
          totalDistWarnings++;
        }
      } else {
        // Unknown condition — treat like dist (warn only).
        if (exists) {
          ok(`[${condition}] ${shortPath}`);
          totalOk++;
        } else {
          warn(`[${condition}] ${shortPath}  (unknown condition, file missing)`);
          totalDistWarnings++;
        }
      }
    }
  }

  console.log();
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

info("=== Summary ===");
console.log();
console.log(`  ${c.green}Passed${c.reset}:   ${totalOk} file(s) exist`);
console.log(`  ${c.yellow}Warnings${c.reset}: ${totalDistWarnings} dist file(s) missing (need build)`);
console.log(`  ${c.red}Errors${c.reset}:   ${totalSourceErrors} source file(s) missing`);
console.log();

if (totalSourceErrors > 0) {
  console.log(`${c.red}${c.bold}FAIL${c.reset} — ${totalSourceErrors} source file(s) are missing. Source files are the ground truth and must exist.`);
  console.log();
  process.exit(1);
} else {
  console.log(`${c.green}${c.bold}PASS${c.reset} — All source files exist.${totalDistWarnings > 0 ? ` Run \`bun run build\` in affected packages to produce dist files.` : ""}`);
  console.log();
  process.exit(0);
}
