import { blob as blobUrl } from "@/lib/blobUrls";

export interface SoundtrackManifest {
  playlists: Record<string, string[]>;
  sfx: Record<string, string>;
  source: string;
  loadedAt: number;
}

export interface ResolvedPlaylist {
  context: string;
  keysTried: string[];
  matchedKey: string | null;
  tracks: string[];
  shuffle: boolean;
}

interface CachedManifestEntry {
  source: string;
  manifest: SoundtrackManifest;
  cachedAt: number;
  normalized?: boolean;
}

const COMMENT_PREFIXES = ["#", ";", "//"];
const SOUNDTRACK_CACHE_KEY = "ltcg.soundtrack.manifest.cache.v2";
const SOUNDTRACK_CACHE_TTL_MS = 30 * 60 * 1000;
const FALLBACK_PLAYLISTS: Record<string, string[]> = {
  landing: [
    "/lunchtable/soundtrack/THEME.mp3",
    "/lunchtable/soundtrack/THEMEREMIX.mp3",
    "/lunchtable/soundtrack/MISC.mp3",
  ],
  play: [
    "/lunchtable/soundtrack/FREAK.mp3",
    "/lunchtable/soundtrack/GEEK.mp3",
    "/lunchtable/soundtrack/GOODIE.mp3",
    "/lunchtable/soundtrack/NERDS.mp3",
    "/lunchtable/soundtrack/PREP.mp3",
  ],
  story: [
    "/lunchtable/soundtrack/THEME2.mp3",
    "/lunchtable/soundtrack/MISC3.mp3",
  ],
  watch: [
    "/lunchtable/soundtrack/THEME.mp3",
    "/lunchtable/soundtrack/THEMEREMIX.mp3",
  ],
  default: [
    "/lunchtable/soundtrack/THEME.mp3",
    "/lunchtable/soundtrack/FREAK.mp3",
    "/lunchtable/soundtrack/GEEK.mp3",
  ],
};
const FALLBACK_SFX_KEYS: Record<string, string> = {
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

function normalizeSectionName(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeSoundEffectTrack(key: string, reference: string): string {
  const normalizedKey = key.trim().toLowerCase();
  const mappedFromKey = FALLBACK_SFX_KEYS[normalizedKey];

  if (mappedFromKey) {
    return `/api/soundtrack-sfx?name=${mappedFromKey}`;
  }

  const lower = reference.trim().toLowerCase();
  const baseTrack = lower.split("?")[0] ?? "";
  const match = baseTrack.match(/\/lunchtable\/soundtrack\/([^/]+)\.mp3$/i);
  if (match?.[1]) {
    const mappedFromFile = LEGACY_SFX_FILE_MAP[match[1]];
    if (mappedFromFile) {
      return `/api/soundtrack-sfx?name=${mappedFromFile}`;
    }
  }

  return normalizeTrackPath(reference);
}

function isComment(line: string): boolean {
  return COMMENT_PREFIXES.some((prefix) => line.startsWith(prefix));
}

function parseSectionHeader(line: string): string | null {
  if (!line.startsWith("[") || !line.endsWith("]")) return null;
  const section = line.slice(1, -1).trim();
  return section ? normalizeSectionName(section) : null;
}

function extractValue(line: string): string {
  const eqIndex = line.indexOf("=");
  if (eqIndex === -1) return line.trim();
  return line.slice(eqIndex + 1).trim();
}

function pushUnique(target: string[], value: string): void {
  if (!value || target.includes(value)) return;
  target.push(value);
}

function normalizeTrackPath(reference: string): string {
  const trimmed = reference.trim();
  if (!trimmed) return "";

  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith(".") || trimmed.startsWith("/")) return trimmed;
  return `/${trimmed}`;
}

function buildFallbackSoundtrackManifest(source: string): SoundtrackManifest {
  const fallbackSfx = Object.fromEntries(
    Object.entries(FALLBACK_SFX_KEYS).map(([key]) => [
      key,
      `/api/soundtrack-sfx?name=${key}`,
    ]),
  );

  return {
    playlists: Object.fromEntries(
      Object.entries(FALLBACK_PLAYLISTS).map(([section, tracks]) => [
        section,
        tracks.map((track) => normalizeTrackPath(track)),
      ]),
    ),
    sfx: fallbackSfx,
    source,
    loadedAt: Date.now(),
  };
}

function isLunchtableTrack(reference: string): boolean {
  const lower = reference.toLowerCase();
  return lower.startsWith("/lunchtable/");
}

function encodeBlobSegment(segment: string): string {
  try {
    return encodeURIComponent(decodeURIComponent(segment));
  } catch {
    return encodeURIComponent(segment);
  }
}

function toBlobUrl(reference: string): string {
  const normalized = reference.startsWith("/") ? reference.slice(1) : reference;
  const cleanPath = normalized.replace(/^lunchtable\/+/, "");
  const encodedPath = cleanPath
    .split("/")
    .map((segment) => encodeBlobSegment(segment))
    .join("/");

  return blobUrl(encodedPath);
}

function resolveTrackUrl(reference: string): string {
  if (typeof window === "undefined") return reference;

  const normalized = normalizeTrackPath(reference);
  const parsed = resolveTrackUrlFromOrigin(normalized);

  if (!import.meta.env.DEV && isLunchtableTrack(normalized)) {
    return toBlobUrl(normalized);
  }

  return parsed;
}

function resolveTrackUrlFromOrigin(reference: string): string {
  try {
    return new URL(reference, window.location.origin).toString();
  } catch {
    return reference;
  }
}

function uniqueOrdered(values: string[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    if (!out.includes(value)) out.push(value);
  }
  return out;
}

function normalizeTrackList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];

  const tracks: string[] = [];
  for (const track of values) {
    if (typeof track !== "string") continue;
    const normalized = normalizeTrackPath(track);
    if (!normalized) continue;
    pushUnique(tracks, normalized);
  }

  return tracks;
}

function normalizePlaylists(value: unknown): Record<string, string[]> {
  if (!isObject(value)) return {};

  return Object.fromEntries(
    Object.entries(value).map(([section, tracks]) => [
      normalizeSectionName(section),
      normalizeTrackList(tracks),
    ]),
  );
}

function mergePlaylistMap(
  base: Record<string, string[]>,
  extra: Record<string, string[]>,
): Record<string, string[]> {
  const merged = Object.fromEntries(
    Object.entries(base).map(([section, tracks]) => [section, [...tracks]]),
  );

  for (const [section, tracks] of Object.entries(extra)) {
    if (!merged[section]) merged[section] = [];
    for (const track of tracks) {
      pushUnique(merged[section]!, track);
    }
  }

  return merged;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isSoundtrackManifest(value: unknown): value is SoundtrackManifest {
  if (!isObject(value)) return false;
  if (!isObject(value.playlists) || !isObject(value.sfx)) return false;
  if (typeof value.source !== "string" || typeof value.loadedAt !== "number") return false;

  for (const tracks of Object.values(value.playlists)) {
    if (!Array.isArray(tracks)) return false;
  }

  return true;
}

function manifestHasTracks(manifest: SoundtrackManifest): boolean {
  return Object.values(manifest.playlists).some((tracks) => tracks.length > 0);
}

function normalizeSfxMap(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (value == null || typeof value !== "object") return out;

  for (const [key, track] of Object.entries(value as Record<string, unknown>)) {
    if (typeof track !== "string") continue;
    const normalizedKey = key.trim().toLowerCase();
    const normalizedTrack = normalizeSoundEffectTrack(normalizedKey, track);
    if (!normalizedKey || !normalizedTrack) continue;
    out[normalizedKey] = normalizedTrack;
  }

  return out;
}

function isLikelyJavaScriptModulePayload(payload: string): boolean {
  const probe = payload.slice(0, 400).toLowerCase();
  if (!probe) return false;

  return (
    probe.startsWith("import ") ||
    probe.includes("from \"/@id/__vite-browser-external") ||
    probe.includes("sourcemappingurl=data:application/json;base64")
  );
}

function parseTrackPayload(raw: string): SoundtrackManifest {
  const trimmed = raw.trim();

  try {
    const json = JSON.parse(trimmed) as
      | SoundtrackManifest
      | {
      playlists?: unknown;
      tracksByCategory?: unknown;
      tracks?: unknown;
      resolved?: unknown;
      sfx?: unknown;
      source?: string;
    };

    if (json && typeof json === "object") {
      if (isSoundtrackManifest(json)) {
        return normalizeManifestForPlayback(json);
      }

      let playlists = normalizePlaylists(json.playlists);
      playlists = mergePlaylistMap(playlists, normalizePlaylists(json.tracksByCategory));

      const legacyTracks = normalizeTrackList(json.tracks);
      if (legacyTracks.length > 0) {
        if (!playlists.default) playlists.default = [];
        for (const track of legacyTracks) {
          pushUnique(playlists.default, track);
        }
      }

      if (isObject(json.resolved)) {
        const resolvedKey =
          typeof json.resolved.key === "string"
            ? normalizeSectionName(json.resolved.key)
            : null;
        const resolvedTracks = normalizeTrackList(json.resolved.tracks);
        if (resolvedTracks.length > 0) {
          const key = resolvedKey || "default";
          if (!playlists[key]) playlists[key] = [];
          for (const track of resolvedTracks) {
            pushUnique(playlists[key]!, track);
          }
        }
      }

      return {
        playlists,
        sfx: normalizeSfxMap(json.sfx ?? {}),
        source: json.source ?? "/api/soundtrack",
        loadedAt: Date.now(),
      };
    }
  } catch {
    // fall through to .in parser
  }

  if (isLikelyJavaScriptModulePayload(trimmed)) {
    return buildFallbackSoundtrackManifest("/soundtrack.in");
  }

  return parseSoundtrackIn(trimmed, "/soundtrack.in");
}

export function parseSoundtrackIn(
  raw: string,
  source = "/soundtrack.in",
): SoundtrackManifest {
  const playlists: Record<string, string[]> = {};
  const sfx: Record<string, string> = {};

  let section = "default";
  playlists.default = [];

  const lines = raw.split(/\r?\n/);
  for (const originalLine of lines) {
    const line = originalLine.trim();
    if (!line || isComment(line)) continue;

    const maybeSection = parseSectionHeader(line);
    if (maybeSection) {
      section = maybeSection;
      if (section !== "sfx" && !playlists[section]) {
        playlists[section] = [];
      }
      continue;
    }

    if (section === "sfx" || section.startsWith("sfx:")) {
      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) continue;
      const key = line.slice(0, separatorIndex).trim().toLowerCase();
      const value = line.slice(separatorIndex + 1).trim();
      if (!key || !value) continue;
      sfx[key] = normalizeSoundEffectTrack(key, value);
      continue;
    }

    const playlistKey = section || "default";
    if (!playlists[playlistKey]) playlists[playlistKey] = [];
    pushUnique(playlists[playlistKey], normalizeTrackPath(extractValue(line)));
  }

  return {
    playlists,
    sfx,
    source,
    loadedAt: Date.now(),
  };
}

function readCachedManifest(source: string): CachedManifestEntry | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(SOUNDTRACK_CACHE_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw) as CachedManifestEntry;
    if (data.source !== source || typeof data.cachedAt !== "number" || !data.manifest) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

function isManifestCacheFresh(entry: CachedManifestEntry | null): boolean {
  if (!entry) return false;
  return Date.now() - entry.cachedAt <= SOUNDTRACK_CACHE_TTL_MS;
}

function writeCachedManifest(source: string, manifest: SoundtrackManifest): void {
  if (typeof window === "undefined") return;

  try {
    const payload: CachedManifestEntry = {
      source,
      manifest,
      cachedAt: Date.now(),
      normalized: true,
    };
    window.localStorage.setItem(SOUNDTRACK_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore cache write failures
  }
}

function normalizeManifestForPlayback(manifest: SoundtrackManifest): SoundtrackManifest {
  return {
    source: manifest.source,
    loadedAt: manifest.loadedAt,
    playlists: Object.fromEntries(
      Object.entries(manifest.playlists).map(([section, tracks]) => [
        section,
        tracks
          .map((track) => resolveTrackUrl(track))
          .filter((track) => track.length > 0),
      ]),
    ),
    sfx: Object.fromEntries(
      Object.entries(manifest.sfx).map(([key, track]) => [
        key,
        resolveTrackUrl(track),
      ]),
    ),
  };
}

export async function loadSoundtrackManifest(
  source = "/api/soundtrack",
): Promise<SoundtrackManifest> {
  const loadFromUrl = async (
    requestSource: string,
    cacheMode: RequestCache = "force-cache",
  ): Promise<SoundtrackManifest> => {
    const response = await fetch(requestSource, {
      cache: cacheMode,
      headers: { Accept: "application/json, text/plain;q=0.9" },
    });

    if (!response.ok) {
      throw new Error(`Failed to load ${requestSource} (${response.status})`);
    }

    const text = await response.text();
    const parsed = parseTrackPayload(text);
    parsed.source = requestSource;
    parsed.loadedAt = Date.now();

    const normalized = normalizeManifestForPlayback(parsed);
    writeCachedManifest(requestSource, normalized);
    return normalized;
  };

  const cached = readCachedManifest(source);
  const cachedManifest = cached
    ? cached.normalized
      ? cached.manifest
      : normalizeManifestForPlayback(cached.manifest)
    : null;
  const cachedManifestHasTracks = cachedManifest ? manifestHasTracks(cachedManifest) : false;
  if (cachedManifest && cachedManifestHasTracks && isManifestCacheFresh(cached)) {
    return cachedManifest;
  }

  if (cachedManifest) {
    try {
      return await loadFromUrl(source, "no-store");
    } catch {
      if (cachedManifestHasTracks) {
        return cachedManifest;
      }
    }
  }

  try {
    return await loadFromUrl(source);
  } catch (error) {
    console.warn("Failed to load soundtrack manifest", { source, error });
    if (cachedManifest && cachedManifestHasTracks) return cachedManifest;

    if (source !== "/soundtrack.in") {
      try {
        return await loadFromUrl("/soundtrack.in");
      } catch {
        // fall through
      }
    }

    return buildFallbackSoundtrackManifest(`${source}:fallback`);
  }
}

export function resolvePlaylist(
  manifest: SoundtrackManifest,
  contextKey: string,
): ResolvedPlaylist {
  const context = normalizeSectionName(contextKey || "default");
  const keysTried = uniqueOrdered([
    `page:${context}`,
    context,
    "default",
    "app",
    "global",
  ]);

  let matchedKey: string | null = null;
  let tracks: string[] = [];
  for (const key of keysTried) {
    const candidate = manifest.playlists[key];
    if (candidate && candidate.length > 0) {
      matchedKey = key;
      tracks = candidate;
      break;
    }
  }

  return {
    context,
    keysTried,
    matchedKey,
    tracks,
    shuffle: context === "landing",
  };
}

export function toAbsoluteTrackUrl(reference: string): string {
  return resolveTrackUrl(reference);
}
