/**
 * Maps route paths to soundtrack context keys used by soundtrack.in sections.
 */
export function getAudioContextFromPath(pathname: string): string {
  const clean = pathname.trim().toLowerCase();
  if (clean === "/" || clean === "") return "landing";

  const firstSegment = clean.replace(/^\/+/, "").split("/")[0];
  if (!firstSegment) return "landing";

  if (firstSegment === "play") return "play";
  if (firstSegment === "duel") return "play";
  if (firstSegment === "story") return "story";
  if (firstSegment === "privacy" || firstSegment === "terms" || firstSegment === "about") {
    return "legal";
  }

  return firstSegment;
}
