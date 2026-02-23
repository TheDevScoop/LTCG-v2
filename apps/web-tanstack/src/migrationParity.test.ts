import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const routesDir = path.join(repoRoot, "apps/web-tanstack/src/routes");
const routeTreeFile = path.join(repoRoot, "apps/web-tanstack/src/routeTree.gen.ts");
const rootRouteFile = path.join(routesDir, "__root.tsx");
const streamOverlayPageFile = path.join(repoRoot, "apps/web-tanstack/src/legacy/pages/StreamOverlay.tsx");

const EXPECTED_ROUTE_FILES = [
  "__root.tsx",
  "index.tsx",
  "about.tsx",
  "agent-dev.tsx",
  "cards.tsx",
  "cards.$cardId.tsx",
  "cliques.tsx",
  "collection.tsx",
  "decks.tsx",
  "decks.$deckId.tsx",
  "discord-callback.tsx",
  "duel.tsx",
  "leaderboard.tsx",
  "onboarding.tsx",
  "play.$matchId.tsx",
  "privacy.tsx",
  "profile.tsx",
  "pvp.tsx",
  "settings.tsx",
  "story.tsx",
  "story.$chapterId.tsx",
  "stream-overlay.tsx",
  "terms.tsx",
  "token.tsx",
  "watch.tsx",
];

const EXPECTED_ROUTE_PATHS = [
  "/",
  "/about",
  "/agent-dev",
  "/cards",
  "/cards/$cardId",
  "/cliques",
  "/collection",
  "/decks",
  "/decks/$deckId",
  "/discord-callback",
  "/duel",
  "/leaderboard",
  "/onboarding",
  "/play/$matchId",
  "/privacy",
  "/profile",
  "/pvp",
  "/settings",
  "/story",
  "/story/$chapterId",
  "/stream-overlay",
  "/terms",
  "/token",
  "/watch",
];

const PUBLIC_ROUTES: Array<[string, string]> = [
  ["index.tsx", "@/pages/Home"],
  ["about.tsx", "@/pages/About"],
  ["agent-dev.tsx", "@/pages/AgentDev"],
  ["leaderboard.tsx", "@/pages/Leaderboard"],
  ["watch.tsx", "@/pages/Watch"],
  ["stream-overlay.tsx", "@/pages/StreamOverlay"],
  ["privacy.tsx", "@/pages/Privacy"],
  ["terms.tsx", "@/pages/Terms"],
  ["token.tsx", "@/pages/Token"],
  ["discord-callback.tsx", "@/pages/DiscordCallback"],
];

const PROTECTED_ROUTES: Array<[string, string]> = [
  ["onboarding.tsx", "@/pages/Onboarding"],
  ["collection.tsx", "@/pages/Collection"],
  ["decks.tsx", "@/pages/Decks"],
  ["decks.$deckId.tsx", "@/pages/DeckBuilder"],
  ["story.tsx", "@/pages/Story"],
  ["story.$chapterId.tsx", "@/pages/StoryChapter"],
  ["pvp.tsx", "@/pages/Pvp"],
  ["duel.tsx", "@/pages/Duel"],
  ["play.$matchId.tsx", "@/pages/Play"],
  ["cliques.tsx", "@/pages/Cliques"],
  ["profile.tsx", "@/pages/Profile"],
  ["settings.tsx", "@/pages/Settings"],
];

const ROOT_SHELL_SIGNATURES = [
  "Sentry.init",
  "PostHogProvider",
  "PrivyAuthProvider",
  "ConvexProviderWithAuth",
  "usePrivyAuthForConvex",
  "AudioProvider",
  "AudioContextGate",
  "useIframeMode",
  "useTelegramAuth",
  "sendChatToHost",
  "AgentSpectatorView",
  "Breadcrumb",
  "AudioControlsDock",
];

const ROUTE_FILES_NO_DIAGNOSTIC = [
  "index.tsx",
  "about.tsx",
  "agent-dev.tsx",
  "cliques.tsx",
  "collection.tsx",
  "decks.tsx",
  "decks.$deckId.tsx",
  "duel.tsx",
  "leaderboard.tsx",
  "onboarding.tsx",
  "play.$matchId.tsx",
  "profile.tsx",
  "pvp.tsx",
  "settings.tsx",
  "story.tsx",
  "story.$chapterId.tsx",
  "stream-overlay.tsx",
  "token.tsx",
  "watch.tsx",
];

const BLOCKED_PRODUCTION_COPY = [
  "main launchpad for story",
  "ops + diagnostics",
  "add <code>vite_convex_url",
  "query-param compatible overlay route",
  "migration",
];

function readRoute(name: string) {
  return readFileSync(path.join(routesDir, name), "utf8");
}

describe("tanstack migration parity", () => {
  it("keeps required route surface", () => {
    for (const file of EXPECTED_ROUTE_FILES) {
      expect(existsSync(path.join(routesDir, file))).toBe(true);
    }
  });

  it("includes required app paths in generated route tree", () => {
    const source = readFileSync(routeTreeFile, "utf8");
    for (const routePath of EXPECTED_ROUTE_PATHS) {
      expect(source).toContain(`fullPath: '${routePath}'`);
    }
  });

  it("wires legacy public and protected page wrappers", () => {
    for (const [routeFile, pageImport] of PUBLIC_ROUTES) {
      const source = readRoute(routeFile);
      expect(source).toContain(pageImport);
      expect(source).not.toContain("<Protected>");
    }

    for (const [routeFile, pageImport] of PROTECTED_ROUTES) {
      const source = readRoute(routeFile);
      expect(source).toContain(pageImport);
      expect(source).toContain("<Protected>");
    }
  });

  it("keeps runtime bootstrap integrations in root shell", () => {
    const source = readFileSync(rootRouteFile, "utf8");
    for (const signature of ROOT_SHELL_SIGNATURES) {
      expect(source).toContain(signature);
    }
  });

  it("keeps stream overlay query-parser wiring for selector contract", () => {
    const source = readFileSync(streamOverlayPageFile, "utf8");
    const requiredSignatures = [
      "parseStreamOverlayParams",
      "apiKey",
      "hostId",
      "matchId",
      "seat",
      "Missing apiKey, hostId, or matchId parameter",
    ];

    for (const signature of requiredSignatures) {
      expect(source).toContain(signature);
    }
  });

  it("does not ship migration diagnostic placeholder copy in production routes", () => {
    for (const routeFile of ROUTE_FILES_NO_DIAGNOSTIC) {
      const source = readRoute(routeFile).toLowerCase();
      for (const phrase of BLOCKED_PRODUCTION_COPY) {
        expect(source).not.toContain(phrase);
      }
    }
  });
});
