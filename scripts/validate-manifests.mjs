#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const isDevBuild =
  process.env.NODE_ENV === "development" || process.env.MANIFEST_ALLOW_LOCAL === "1";

const manifests = [
  {
    file: path.join(repoRoot, "apps/web-tanstack/package.json"),
    required: true,
  },
  {
    file: path.join(repoRoot, "packages/plugin-ltcg/package.json"),
    required: true,
  },
  {
    file: path.join(repoRoot, "packages/app-lunchtable/package.json"),
    required: true,
  },
];

const localHostPattern = /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i;

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function checkManifest(filePath) {
  const json = readJson(filePath);
  const app = json?.elizaos?.app;
  if (!app) return [];

  const issues = [];
  const targets = [
    { key: "launchUrl", value: app.launchUrl },
    { key: "viewer.url", value: app?.viewer?.url },
  ];

  for (const target of targets) {
    const value = typeof target.value === "string" ? target.value.trim() : "";
    if (!value) {
      issues.push(`${target.key} is missing`);
      continue;
    }

    if (!isDevBuild && (value.startsWith("file://") || localHostPattern.test(value))) {
      issues.push(`${target.key} must not use local-only URL in non-dev builds: ${value}`);
    }
  }

  return issues;
}

const failures = [];
for (const manifest of manifests) {
  if (!fs.existsSync(manifest.file)) {
    if (manifest.required) {
      failures.push({
        manifest: manifest.file,
        issues: ["manifest file is missing"],
      });
    }
    continue;
  }

  const issues = checkManifest(manifest.file);
  if (issues.length) {
    failures.push({ manifest: manifest.file, issues });
  }
}

if (failures.length > 0) {
  console.error("Manifest validation failed:");
  for (const failure of failures) {
    console.error(`- ${path.relative(repoRoot, failure.manifest)}`);
    for (const issue of failure.issues) {
      console.error(`  - ${issue}`);
    }
  }
  process.exit(1);
}

console.log("Manifest validation passed.");
