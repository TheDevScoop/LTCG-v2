import { patchUrlMappings } from "@discord/embedded-app-sdk";
import { isDiscordActivityFrame } from "./clientPlatform";

export type DiscordUrlMapping = {
  prefix: string;
  target: string;
};

const DEFAULT_CONVEX_MAPPING_PREFIX = "/.proxy/convex";
const DEFAULT_CONVEX_SITE_MAPPING_PREFIX = "/.proxy/convex-site";

function normalizeTargetHost(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      return new URL(trimmed).host;
    }
    return new URL(`https://${trimmed}`).host;
  } catch {
    return null;
  }
}

export function deriveDefaultDiscordUrlMappings(convexUrl: string | undefined): DiscordUrlMapping[] {
  if (!convexUrl) return [];

  const convexHost = normalizeTargetHost(convexUrl);
  if (!convexHost) return [];

  const mappings: DiscordUrlMapping[] = [
    { prefix: DEFAULT_CONVEX_MAPPING_PREFIX, target: convexHost },
  ];

  if (convexHost.endsWith(".convex.cloud")) {
    const convexSiteHost = convexHost.replace(".convex.cloud", ".convex.site");
    if (convexSiteHost !== convexHost) {
      mappings.push({
        prefix: DEFAULT_CONVEX_SITE_MAPPING_PREFIX,
        target: convexSiteHost,
      });
    }
  }

  return mappings;
}

export function parseDiscordUrlMappings(value: string | undefined): DiscordUrlMapping[] {
  if (!value?.trim()) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];

    const mappings: DiscordUrlMapping[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const objectEntry = entry as { prefix?: unknown; target?: unknown };
      const prefix = typeof objectEntry.prefix === "string" ? objectEntry.prefix.trim() : "";
      const target = typeof objectEntry.target === "string" ? objectEntry.target.trim() : "";
      if (!prefix || !target) continue;
      mappings.push({ prefix, target });
    }
    return mappings;
  } catch {
    return [];
  }
}

export function buildDiscordUrlMappings({
  convexUrl,
  extraMappingsJson,
}: {
  convexUrl: string | undefined;
  extraMappingsJson: string | undefined;
}): DiscordUrlMapping[] {
  const defaults = deriveDefaultDiscordUrlMappings(convexUrl);
  const extras = parseDiscordUrlMappings(extraMappingsJson);
  const combined = [...defaults, ...extras];

  const deduped = new Map<string, DiscordUrlMapping>();
  for (const mapping of combined) {
    const targetHost = normalizeTargetHost(mapping.target);
    if (!targetHost) continue;
    const key = `${mapping.prefix}|${targetHost}`;
    deduped.set(key, {
      prefix: mapping.prefix,
      target: targetHost,
    });
  }

  return [...deduped.values()];
}

export function applyDiscordUrlMappings(
  mappings: DiscordUrlMapping[],
  patcher: (
    mappings: DiscordUrlMapping[],
    config?: { patchFetch?: boolean; patchWebSocket?: boolean; patchXhr?: boolean; patchSrcAttributes?: boolean },
  ) => void = patchUrlMappings,
): boolean {
  if (typeof window === "undefined") return false;
  if (mappings.length === 0) return false;

  patcher(mappings, {
    patchFetch: true,
    patchWebSocket: true,
    patchXhr: true,
  });
  return true;
}

export function enableDiscordUrlMappingsForActivity({
  isDiscordActivity = isDiscordActivityFrame(),
  convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined,
  extraMappingsJson = import.meta.env.VITE_DISCORD_URL_MAPPINGS as string | undefined,
  patcher = patchUrlMappings,
}: {
  isDiscordActivity?: boolean;
  convexUrl?: string;
  extraMappingsJson?: string;
  patcher?: (
    mappings: DiscordUrlMapping[],
    config?: { patchFetch?: boolean; patchWebSocket?: boolean; patchXhr?: boolean; patchSrcAttributes?: boolean },
  ) => void;
} = {}): DiscordUrlMapping[] {
  if (!isDiscordActivity) return [];

  const mappings = buildDiscordUrlMappings({ convexUrl, extraMappingsJson });
  applyDiscordUrlMappings(mappings, patcher);
  return mappings;
}
