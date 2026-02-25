#!/usr/bin/env node

import { readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const DEFAULT_WARN_BYTES = 500 * 1024;
const DEFAULT_TOP_N = 12;

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

async function walkFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const absolutePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkFiles(absolutePath)));
      continue;
    }
    out.push(absolutePath);
  }
  return out;
}

async function main() {
  const distArg = process.argv[2] ?? "apps/web-tanstack/dist/client";
  const distDir = resolve(process.cwd(), distArg);
  const warnBytes = parsePositiveInt(process.env.BUNDLE_WARN_BYTES, DEFAULT_WARN_BYTES);
  const topN = parsePositiveInt(process.env.BUNDLE_TOP_N, DEFAULT_TOP_N);

  const files = await walkFiles(distDir);
  const assetCandidates = files.filter((file) => {
    const normalized = file.replace(/\\/g, "/");
    if (!normalized.includes("/assets/")) return false;
    if (normalized.endsWith(".map")) return false;
    return normalized.endsWith(".js") || normalized.endsWith(".css");
  });

  const assets = [];
  for (const absolutePath of assetCandidates) {
    const fileStat = await stat(absolutePath);
    assets.push({
      path: relative(process.cwd(), absolutePath).replace(/\\/g, "/"),
      bytes: fileStat.size,
    });
  }

  assets.sort((a, b) => {
    if (b.bytes !== a.bytes) return b.bytes - a.bytes;
    return a.path.localeCompare(b.path);
  });

  const totalBytes = assets.reduce((sum, item) => sum + item.bytes, 0);
  const warningAssets = assets.filter((item) => item.bytes >= warnBytes);

  console.log("[bundle-metrics] Bundle asset summary");
  console.log(`[bundle-metrics] dist=${relative(process.cwd(), distDir).replace(/\\/g, "/")}`);
  console.log(`[bundle-metrics] assets=${assets.length} total=${formatKiB(totalBytes)} warn_threshold=${formatKiB(warnBytes)}`);

  if (assets.length === 0) {
    console.log("[bundle-metrics] No JS/CSS assets found under dist/assets.");
    return;
  }

  const topAssets = assets.slice(0, topN);
  for (const [index, asset] of topAssets.entries()) {
    const marker = asset.bytes >= warnBytes ? "WARN" : "OK";
    const rank = String(index + 1).padStart(2, "0");
    console.log(`[bundle-metrics] ${rank} ${marker} ${formatKiB(asset.bytes)} ${asset.path}`);
  }

  if (warningAssets.length > 0) {
    console.log(`[bundle-metrics] warning_assets=${warningAssets.length} (non-blocking)`);
  } else {
    console.log("[bundle-metrics] warning_assets=0");
  }
}

main().catch((error) => {
  console.error("[bundle-metrics] failed", error);
  process.exit(1);
});
