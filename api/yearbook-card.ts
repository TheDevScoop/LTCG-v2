import type { VercelRequest, VercelResponse } from "./_lib/vercelTypes";

const YEARBOOK_QUOTES: Record<string, string> = {
  ChaosAgent_001: "Most likely to cause a cafeteria riot.",
  LunchLady_X: "Will trade your lunch money for clout.",
  EntropyBot: "Voted most unpredictable three years running.",
  Detention_Dave: "Permanent resident of Room 101.",
  PaperCut_AI: "Death by a thousand paper cuts.",
  SloppyJoe: "Messy plays, messier wins.",
  ViceGrip: "Never lets go of a grudge.",
  GlitchWitch: "Hacks the yearbook photo every year.",
  HypeBeast_Bot: "Dripped out in rare cards only.",
};

const DEFAULT_QUOTE = "Most likely to flip the table.";

function getStringQuery(
  value: string | string[] | undefined,
  fallback: string,
  maxLength: number,
): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate) return fallback;
  return candidate.trim().slice(0, maxLength) || fallback;
}

function getIntQuery(
  value: string | string[] | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate) return fallback;
  const parsed = Number.parseInt(candidate, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatScore(score: number): string {
  return new Intl.NumberFormat("en-US").format(score);
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const name = getStringQuery(req.query.name, "Unknown Player", 32);
  const rank = getIntQuery(req.query.rank, 999, 1, 9999);
  const score = getIntQuery(req.query.score, 0, 0, 9_999_999);
  const breakdowns = getIntQuery(req.query.breakdowns, 0, 0, 9999);
  const type = getStringQuery(req.query.type, "human", 8).toLowerCase() === "agent" ? "agent" : "human";
  const quote = YEARBOOK_QUOTES[name] ?? DEFAULT_QUOTE;

  const accentColor = type === "agent" ? "#ffcc00" : "#121212";
  const subtitle = type === "agent" ? "AI AGENT" : "HUMAN PLAYER";

  const escapedName = escapeXml(name);
  const escapedQuote = escapeXml(quote);
  const escapedSubtitle = escapeXml(subtitle);
  const escapedScore = escapeXml(formatScore(score));
  const escapedBreakdowns = escapeXml(String(breakdowns));
  const escapedRank = escapeXml(String(rank));

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="LunchTable Yearbook Card">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop stop-color="#fffef9"/>
      <stop offset="1" stop-color="#f4f0e6"/>
    </linearGradient>
    <filter id="shadow" x="0" y="0" width="1200" height="630">
      <feDropShadow dx="8" dy="8" stdDeviation="0" flood-color="#121212" flood-opacity="0.35"/>
    </filter>
  </defs>

  <rect width="1200" height="630" fill="#ece5d8"/>
  <rect x="36" y="28" width="1128" height="574" rx="0" fill="url(#paper)" stroke="#121212" stroke-width="8" filter="url(#shadow)"/>

  <rect x="66" y="58" width="1068" height="54" fill="#121212"/>
  <text x="88" y="94" fill="#ffffff" font-size="20" font-weight="900" font-family="Arial, Helvetica, sans-serif" letter-spacing="2">LUNCHTABLE TCG YEARBOOK</text>
  <text x="1034" y="94" text-anchor="end" fill="#ffffff" font-size="20" font-weight="900" font-family="Arial, Helvetica, sans-serif" letter-spacing="2">CLASS OF 2026</text>

  <rect x="96" y="152" width="280" height="280" fill="#ffffff" stroke="#121212" stroke-width="6"/>
  <rect x="118" y="174" width="236" height="236" fill="#f5f5f5" stroke="#121212" stroke-width="3"/>
  <text x="236" y="304" text-anchor="middle" fill="#121212" font-size="46" font-weight="900" font-family="Arial, Helvetica, sans-serif">#${escapedRank}</text>

  <rect x="408" y="166" width="690" height="74" fill="none"/>
  <text x="408" y="222" fill="#121212" font-size="56" font-weight="900" font-family="Arial, Helvetica, sans-serif">${escapedName}</text>
  <text x="408" y="258" fill="${accentColor}" font-size="24" font-weight="700" font-family="Arial, Helvetica, sans-serif" letter-spacing="1.5">${escapedSubtitle}</text>

  <rect x="408" y="292" width="690" height="88" fill="#ffffff" stroke="#121212" stroke-width="3"/>
  <text x="434" y="346" fill="#2d2d2d" font-size="28" font-weight="400" font-family="Georgia, 'Times New Roman', serif" font-style="italic">"${escapedQuote}"</text>

  <rect x="408" y="410" width="330" height="132" fill="#ffffff" stroke="#121212" stroke-width="3"/>
  <text x="434" y="456" fill="#666666" font-size="18" font-weight="700" font-family="Arial, Helvetica, sans-serif" letter-spacing="1">SCORE</text>
  <text x="434" y="512" fill="${accentColor}" font-size="52" font-weight="900" font-family="Arial, Helvetica, sans-serif">${escapedScore}</text>

  <rect x="768" y="410" width="330" height="132" fill="#ffffff" stroke="#121212" stroke-width="3"/>
  <text x="794" y="456" fill="#666666" font-size="18" font-weight="700" font-family="Arial, Helvetica, sans-serif" letter-spacing="1">BREAKDOWNS</text>
  <text x="794" y="512" fill="#121212" font-size="52" font-weight="900" font-family="Arial, Helvetica, sans-serif">${escapedBreakdowns}</text>

  <rect x="64" y="556" width="1072" height="26" fill="#121212"/>
  <text x="600" y="575" text-anchor="middle" fill="#ffcc00" font-size="14" font-weight="700" font-family="Arial, Helvetica, sans-serif" letter-spacing="1.2">
    POST THIS CARD TO BABYLON TIMELINE
  </text>
</svg>`;

  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=900, stale-while-revalidate=3600");
  res.status(200).send(svg);
}
