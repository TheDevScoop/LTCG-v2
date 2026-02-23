import { list } from "@vercel/blob";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const SOUNDTRACK_BLOB_PREFIX =
  process.env.LUNCHTABLE_SOUNDTRACK_BLOB_PREFIX ?? "lunchtable/lunchtable/soundtrack/";
const AUDIO_FILE_RE = /\.(mp3|wav|ogg|m4a|aac|flac)$/i;
const MAX_BLOB_LIST_PAGES = 10;

const FALLBACK_SOUNDTRACK_MANIFEST = `# LunchTable soundtrack manifest
# Format:
#   [section-name]
#   /audio/path/file.mp3
#
# For SFX:
#   [sfx]
#   attack=/audio/sfx/attack.wav
#
# Sections can be route contexts (landing, play, story, watch, etc)
# or page-scoped names (page:collection, page:decks, ...).

[landing]
/lunchtable/soundtrack/THEME.mp3
/lunchtable/soundtrack/THEMEREMIX.mp3
/lunchtable/soundtrack/MISC.mp3

[play]
/lunchtable/soundtrack/FREAK.mp3
/lunchtable/soundtrack/GEEK.mp3
/lunchtable/soundtrack/GOODIE.mp3
/lunchtable/soundtrack/NERDS.mp3
/lunchtable/soundtrack/PREP.mp3

[story]
/lunchtable/soundtrack/THEME2.mp3
/lunchtable/soundtrack/MISC3.mp3

[watch]
/lunchtable/soundtrack/THEME.mp3
/lunchtable/soundtrack/THEMEREMIX.mp3

[default]
/lunchtable/soundtrack/THEME.mp3
/lunchtable/soundtrack/FREAK.mp3
/lunchtable/soundtrack/GEEK.mp3

[sfx]
summon=/api/soundtrack-sfx?name=summon
spell=/api/soundtrack-sfx?name=spell
attack=/api/soundtrack-sfx?name=attack
turn=/api/soundtrack-sfx?name=turn
victory=/api/soundtrack-sfx?name=victory
defeat=/api/soundtrack-sfx?name=defeat
draw=/api/soundtrack-sfx?name=draw
error=/api/soundtrack-sfx?name=error`;

type ParsedManifest = {
  playlists: Record<string, string[]>;
  sfx: Record<string, string>;
};
type TrackBlobEntry = {
  pathname: string;
  url: string;
};
type SoundtrackPlaylists = Record<string, string[]>;

const FALLBACK_SOUND_EFFECTS: Record<string, string> = {
  summon: "summon",
  spell: "spell",
  attack: "attack",
  turn: "turn",
  victory: "victory",
  defeat: "defeat",
  draw: "draw",
  error: "error",
};
const LEGACY_SFX_FILE_MAP: Record<string, string> = {
  misc1: "summon",
  geek: "spell",
  goodie: "attack",
  theme2: "turn",
  themeremix: "victory",
  freak: "defeat",
  dropout: "draw",
  misc2: "error",
};

function pushUnique(target: string[], value: string): void {
  if (!value || target.includes(value)) return;
  target.push(value);
}

function hasAnyTracks(playlists: Record<string, string[]>): boolean {
  return Object.values(playlists).some((tracks) => tracks.length > 0);
}

function classifyBlobTrack(pathname: string): string[] {
  const normalized = pathname.toLowerCase();
  const fileName = normalized.split("/").pop() ?? normalized;
  const contexts = new Set<string>();

  if (/(theme|remix|misc)/.test(fileName)) contexts.add("landing");
  if (/(freak|geek|goodie|nerds|prep|dropout|prompt|misc)/.test(fileName)) {
    contexts.add("play");
  }
  if (/(theme2|misc3|prompt)/.test(fileName)) contexts.add("story");
  if (/(theme|remix|prompt)/.test(fileName)) contexts.add("watch");

  return Array.from(contexts);
}

async function readTrackBlobsFromStorage(): Promise<TrackBlobEntry[]> {
  const tracks: TrackBlobEntry[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_BLOB_LIST_PAGES; page += 1) {
    const response = await list({
      prefix: SOUNDTRACK_BLOB_PREFIX,
      cursor,
      limit: 1000,
    });

    for (const blob of response.blobs) {
      if (!blob.pathname || !blob.url) continue;
      if (!AUDIO_FILE_RE.test(blob.pathname)) continue;
      tracks.push({ pathname: blob.pathname, url: blob.url });
    }

    if (!response.cursor) break;
    cursor = response.cursor;
  }

  tracks.sort((a, b) => a.pathname.localeCompare(b.pathname));
  return tracks;
}

function playlistsFromTrackBlobs(blobs: TrackBlobEntry[]): SoundtrackPlaylists | null {
  if (blobs.length === 0) return null;

  const playlists: SoundtrackPlaylists = {
    default: [],
    landing: [],
    play: [],
    story: [],
    watch: [],
  };

  for (const blob of blobs) {
    pushUnique(playlists.default!, blob.url);
    const contexts = classifyBlobTrack(blob.pathname);
    const routedContexts = contexts.length > 0 ? contexts : ["play"];

    for (const context of routedContexts) {
      if (!playlists[context]) playlists[context] = [];
      pushUnique(playlists[context], blob.url);
    }
  }

  for (const key of ["landing", "play", "story", "watch"] as const) {
    if (!playlists[key] || playlists[key].length === 0) {
      playlists[key] = playlists.default!.slice(0, 4);
    }
  }

  return playlists;
}

function mergePlaylists(
  manifestPlaylists: SoundtrackPlaylists,
  blobPlaylists: SoundtrackPlaylists,
): SoundtrackPlaylists {
  const merged: SoundtrackPlaylists = Object.fromEntries(
    Object.entries(manifestPlaylists).map(([key, tracks]) => [key, [...tracks]]),
  );

  for (const [key, tracks] of Object.entries(blobPlaylists)) {
    if (!merged[key]) merged[key] = [];
    if (merged[key].length === 0) {
      merged[key] = [...tracks];
      continue;
    }
    for (const track of tracks) {
      pushUnique(merged[key], track);
    }
  }

  if (!merged.default) merged.default = [];
  return merged;
}

function normalizeSoundEffectPath(key: string, track: string): string {
  const normalizedKey = key.trim().toLowerCase();
  const mappedByKey = FALLBACK_SOUND_EFFECTS[normalizedKey];
  if (mappedByKey) {
    return `/api/soundtrack-sfx?name=${mappedByKey}`;
  }

  const normalizedTrack = track.trim();
  const baseTrack = normalizedTrack.split("?")[0] ?? "";
  const match = baseTrack.match(/\/lunchtable\/soundtrack\/([^/]+)\.mp3$/i);
  if (match?.[1]) {
    const mappedByFile = LEGACY_SFX_FILE_MAP[match[1].toLowerCase()];
    if (mappedByFile) {
      return `/api/soundtrack-sfx?name=${mappedByFile}`;
    }
  }

  return track;
}

function parseSoundtrackIn(raw: string): ParsedManifest {
  const playlists: Record<string, string[]> = { default: [] };
  const sfx: Record<string, string> = {};

  let section = "default";
  const lines = raw.split(/\r?\n/);

  for (const originalLine of lines) {
    const line = originalLine.trim();
    if (!line) continue;
    if (line.startsWith("#") || line.startsWith(";") || line.startsWith("//")) continue;

    if (line.startsWith("[") && line.endsWith("]")) {
      const nextSection = line.slice(1, -1).trim().toLowerCase();
      if (!nextSection) continue;
      section = nextSection;
      if (section !== "sfx" && !playlists[section]) playlists[section] = [];
      continue;
    }

    if (section === "sfx" || section.startsWith("sfx:")) {
      const eqIndex = line.indexOf("=");
      if (eqIndex === -1) continue;
      const key = line.slice(0, eqIndex).trim().toLowerCase();
      const value = line.slice(eqIndex + 1).trim();
      if (!key || !value) continue;
      sfx[key] = value;
      continue;
    }

    const eqIndex = line.indexOf("=");
    const value = (eqIndex === -1 ? line : line.slice(eqIndex + 1)).trim();
    if (!value) continue;

    if (!playlists[section]) playlists[section] = [];
    if (!playlists[section]!.includes(value)) playlists[section]!.push(value);
  }

  return { playlists, sfx };
}

function withAbsoluteUrl(input: string, baseUrl: string): string {
  const normalized = input.trim();
  if (normalized.toLowerCase().startsWith("/lunchtable/")) {
    return normalized;
  }

  try {
    return new URL(normalized, baseUrl).toString();
  } catch {
    return normalized;
  }
}

function getBaseUrl(request: VercelRequest): string {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const protocol = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto?.split(",")[0];
  const host = request.headers.host ?? "localhost:3334";
  return `${protocol || "https"}://${host}`;
}

function resolveContext(playlists: Record<string, string[]>, context: string) {
  const normalized = context.trim().toLowerCase();
  const keysTried = [`page:${normalized}`, normalized, "default", "app", "global"];

  for (const key of keysTried) {
    const tracks = playlists[key];
    if (tracks && tracks.length > 0) {
      return {
        context: normalized,
        key,
        tracks,
        shuffle: normalized === "landing",
      };
    }
  }

  return {
    context: normalized,
    key: null,
    tracks: [] as string[],
    shuffle: normalized === "landing",
  };
}

function setCorsHeaders(request: VercelRequest, response: VercelResponse) {
  const origin = request.headers.origin;
  const allowedOrigin = typeof origin === "string" && origin.length > 0 ? origin : "*";

  response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Vary", "Origin");
}

async function readManifestFile(): Promise<{ raw: string; source: string }> {
  const candidates = [
    {
      file: path.join(process.cwd(), "public", "soundtrack.in"),
      source: "file:public/soundtrack.in",
    },
    {
      file: path.join(process.cwd(), "apps", "web-tanstack", "public", "soundtrack.in"),
      source: "file:apps/web-tanstack/public/soundtrack.in",
    },
    {
      file: path.join(process.cwd(), "apps", "web", "public", "soundtrack.in"),
      source: "file:apps/web/public/soundtrack.in",
    },
  ];

  for (const candidate of candidates) {
    try {
      return {
        raw: await readFile(candidate.file, "utf8"),
        source: candidate.source,
      };
    } catch {
      // try next candidate path
    }
  }

  throw new Error("soundtrack.in not found");
}

async function readManifestFromRequest(baseUrl: string): Promise<string> {
  const manifestUrl = new URL("/soundtrack.in", baseUrl);
  const response = await fetch(manifestUrl);

  if (!response.ok) {
    throw new Error(`Failed to load soundtrack from ${manifestUrl.href}`);
  }

  return response.text();
}

async function resolveManifest(baseUrl: string): Promise<{ raw: string; source: string }> {
  try {
    return { raw: await readManifestFromRequest(baseUrl), source: `${manifestUrl(baseUrl)}` };
  } catch {
    try {
      return await readManifestFile();
    } catch {
      return {
        raw: FALLBACK_SOUNDTRACK_MANIFEST,
        source: "fallback",
      };
    }
  }
}

function manifestUrl(baseUrl: string) {
  return new URL("/soundtrack.in", baseUrl).href;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const context =
    typeof req.query.context === "string"
      ? req.query.context
      : typeof req.query.type === "string"
        ? req.query.type
        : null;

  try {
    const baseUrl = getBaseUrl(req);
    const { raw, source } = await resolveManifest(baseUrl);
    const parsed = parseSoundtrackIn(raw);

    let playlists: SoundtrackPlaylists = Object.fromEntries(
      Object.entries(parsed.playlists).map(([key, tracks]) => [
        key,
        tracks.map((track) => withAbsoluteUrl(track, baseUrl)),
      ]),
    );
    const sourceParts = [source];

    try {
      const blobTracks = await readTrackBlobsFromStorage();
      const blobPlaylists = playlistsFromTrackBlobs(blobTracks);
      if (blobPlaylists) {
        playlists = hasAnyTracks(playlists)
          ? mergePlaylists(playlists, blobPlaylists)
          : blobPlaylists;
        sourceParts.push(`blob:${SOUNDTRACK_BLOB_PREFIX}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Blob list failed";
      console.warn("Soundtrack blob lookup skipped", { error: message });
    }

    const sfx = Object.fromEntries(
      Object.entries(parsed.sfx).map(([key, value]) => [
        key,
        withAbsoluteUrl(normalizeSoundEffectPath(key, value), baseUrl),
      ]),
    );

    const resolved = context ? resolveContext(playlists, context) : null;

    res.status(200).json({
      source: sourceParts.join("|"),
      playlists,
      sfx,
      resolved,
      generatedAt: Date.now(),
    });
  } catch (error) {
    const baseUrl = getBaseUrl(req);
    const parsed = parseSoundtrackIn(FALLBACK_SOUNDTRACK_MANIFEST);

    let playlists: SoundtrackPlaylists = Object.fromEntries(
      Object.entries(parsed.playlists).map(([key, tracks]) => [
        key,
        tracks.map((track) => withAbsoluteUrl(track, baseUrl)),
      ]),
    );
    const sourceParts = ["fallback"];

    try {
      const blobTracks = await readTrackBlobsFromStorage();
      const blobPlaylists = playlistsFromTrackBlobs(blobTracks);
      if (blobPlaylists) {
        playlists = hasAnyTracks(playlists)
          ? mergePlaylists(playlists, blobPlaylists)
          : blobPlaylists;
        sourceParts.push(`blob:${SOUNDTRACK_BLOB_PREFIX}`);
      }
    } catch (blobError) {
      const blobMessage =
        blobError instanceof Error ? blobError.message : "Blob list failed";
      console.warn("Fallback soundtrack blob lookup skipped", { error: blobMessage });
    }

    const sfx = Object.fromEntries(
      Object.entries(parsed.sfx).map(([key, value]) => [
        key,
        withAbsoluteUrl(normalizeSoundEffectPath(key, value), baseUrl),
      ]),
    );

    const resolved = context ? resolveContext(playlists, context) : null;
    const message =
      error instanceof Error ? error.message : "Failed to load soundtrack";

    console.error("Soundtrack API fallback", { error: message });

    res.status(200).json({
      source: sourceParts.join("|"),
      playlists,
      sfx,
      resolved,
      generatedAt: Date.now(),
    });
  }
}

export const __soundtrackTestUtils = {
  parseSoundtrackIn,
  normalizeSoundEffectPath,
  classifyBlobTrack,
  playlistsFromTrackBlobs,
  mergePlaylists,
  resolveContext,
  withAbsoluteUrl,
};
