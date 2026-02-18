import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

export type CardLookup = Record<string, any>;

function deriveConvexCloudUrlFromSiteUrl(siteUrl: string): string | null {
  const trimmed = siteUrl.trim();
  if (!trimmed) return null;
  if (trimmed.includes(".convex.cloud")) return trimmed;
  if (trimmed.includes(".convex.site")) {
    return trimmed.replace(".convex.site", ".convex.cloud");
  }
  return null;
}

export async function loadCardLookup(args: {
  convexCloudUrl?: string;
  convexSiteUrl?: string;
}): Promise<CardLookup> {
  const cloudUrl =
    (args.convexCloudUrl ?? "").trim() ||
    (args.convexSiteUrl ? deriveConvexCloudUrlFromSiteUrl(args.convexSiteUrl) : null);

  if (!cloudUrl) {
    throw new Error(
      "Missing Convex cloud URL. Provide --convex-cloud-url or set VITE_CONVEX_URL (or provide a .convex.site URL).",
    );
  }

  const convex = new ConvexHttpClient(cloudUrl);
  const cards = await convex.query(api.game.getAllCards, {});
  const lookup: CardLookup = {};
  for (const card of (cards as any[]) ?? []) {
    const id = typeof card?._id === "string" ? card._id : null;
    if (!id) continue;
    lookup[id] = card;
  }
  return lookup;
}

