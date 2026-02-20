#!/usr/bin/env bun
/**
 * Uploads game-assets/ and solo-cup/ to Vercel Blob.
 * Run from apps/web/: bun scripts/migrate-game-assets-to-blob.ts
 */

import { put, list } from "@vercel/blob";
import { readdir, readFile, writeFile } from "fs/promises";
import { join, relative, extname } from "path";

const PUBLIC_DIR = "./public";
const BLOB_PREFIX = "lunchtable/lunchtable";

const DIRS_TO_UPLOAD = ["game-assets", "solo-cup"];

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".txt": "text/plain",
};

async function findFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findFiles(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("BLOB_READ_WRITE_TOKEN not found. Run: vercel env pull");
    process.exit(1);
  }

  const results: { localPath: string; blobUrl: string }[] = [];

  for (const dir of DIRS_TO_UPLOAD) {
    const dirPath = join(PUBLIC_DIR, dir);
    const files = await findFiles(dirPath);

    console.log(`\n${dir}/ — ${files.length} files\n`);

    for (const filePath of files) {
      const relativePath = relative(PUBLIC_DIR, filePath);
      const blobPath = `${BLOB_PREFIX}/${relativePath}`;
      const ext = extname(filePath).toLowerCase();
      const contentType = CONTENT_TYPES[ext] || "application/octet-stream";

      try {
        const fileBuffer = await readFile(filePath);
        const blob = await put(blobPath, fileBuffer, {
          access: "public",
          contentType,
        });
        results.push({ localPath: `/${relativePath}`, blobUrl: blob.url });
        console.log(`  ✓ ${relativePath} → ${blob.url}`);
      } catch (error) {
        console.error(`  ✗ ${relativePath}: ${error}`);
      }
    }
  }

  // Also upload the comic bubble PNGs from /lunchtable/ that are local-only
  const bubbleFiles = ["2.png", "3.png", "4.png", "5.png", "TTG.png", "back.png", "home.png", "login.png", "pvp.png"];
  console.log(`\nlunchtable/ bubbles & nav — ${bubbleFiles.length} files\n`);

  for (const file of bubbleFiles) {
    const filePath = join(PUBLIC_DIR, "lunchtable", file);
    const blobPath = `${BLOB_PREFIX}/${file}`;
    try {
      const fileBuffer = await readFile(filePath);
      const blob = await put(blobPath, fileBuffer, {
        access: "public",
        contentType: "image/png",
      });
      results.push({ localPath: `/lunchtable/${file}`, blobUrl: blob.url });
      console.log(`  ✓ lunchtable/${file} → ${blob.url}`);
    } catch (error) {
      console.error(`  ✗ lunchtable/${file}: ${error}`);
    }
  }

  // Secret backgrounds
  const secretBgs = ["collection-bg-secret.png", "deck-bg-secret.png", "landing-bg-secret.png"];
  console.log(`\nlunchtable/ secret backgrounds — ${secretBgs.length} files\n`);

  for (const file of secretBgs) {
    const filePath = join(PUBLIC_DIR, "lunchtable", file);
    const blobPath = `${BLOB_PREFIX}/${file}`;
    try {
      const fileBuffer = await readFile(filePath);
      const blob = await put(blobPath, fileBuffer, {
        access: "public",
        contentType: "image/png",
      });
      results.push({ localPath: `/lunchtable/${file}`, blobUrl: blob.url });
      console.log(`  ✓ lunchtable/${file} → ${blob.url}`);
    } catch (error) {
      console.error(`  ✗ lunchtable/${file}: ${error}`);
    }
  }

  // Write report
  const report = {
    timestamp: new Date().toISOString(),
    count: results.length,
    files: results,
  };
  await writeFile("./game-assets-blob-report.json", JSON.stringify(report, null, 2));

  console.log(`\nDone: ${results.length} files uploaded.`);
  console.log("Report: ./game-assets-blob-report.json");
}

main().catch(console.error);
