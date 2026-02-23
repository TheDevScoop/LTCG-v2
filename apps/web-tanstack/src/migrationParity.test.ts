import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const routesDir = path.join(repoRoot, "apps/web-tanstack/src/routes");
const routeTreeFile = path.join(repoRoot, "apps/web-tanstack/src/routeTree.gen.ts");

function readRoute(name: string) {
  return readFileSync(path.join(routesDir, name), "utf8");
}

describe("tanstack migration parity", () => {
  it("keeps legacy route surface plus new cards routes", () => {
    const expectedRouteFiles = [
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

    for (const file of expectedRouteFiles) {
      expect(existsSync(path.join(routesDir, file))).toBe(true);
    }
  });

  it("includes all required app paths in generated route tree", () => {
    const source = readFileSync(routeTreeFile, "utf8");
    const expectedPaths = [
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

    for (const routePath of expectedPaths) {
      expect(source).toContain(`fullPath: '${routePath}'`);
    }
  });

  it("preserves required gameplay/data integrations across migrated routes", () => {
    const requiredByRoute: Record<string, string[]> = {
      "agent-dev.tsx": [
        "api.game.getStarterDecks",
        "api.game.selectStarterDeck",
      ],
      "cliques.tsx": [
        "api.cliques.ensureMyCliqueAssignment",
        "api.cliques.getCliqueDashboard",
      ],
      "collection.tsx": [
        "api.game.getCatalogCards",
        "api.game.getUserCardCounts",
      ],
      "decks.tsx": [
        "api.game.createDeck",
        "api.game.getUserDecks",
        "api.game.setActiveDeck",
      ],
      "decks.$deckId.tsx": [
        "api.game.getDeckWithCards",
        "api.game.getCatalogCards",
        "api.game.saveDeck",
      ],
      "duel.tsx": [
        "api.game.createPvpLobby",
        "api.game.joinPvpLobby",
      ],
      "leaderboard.tsx": [
        "api.ranked.getLeaderboard",
        "api.ranked.getRankDistribution",
        "api.ranked.getPlayerRank",
      ],
      "onboarding.tsx": [
        "api.auth.setUsername",
        "api.auth.setAvatarPath",
        "api.game.getStarterDecks",
        "api.game.selectStarterDeck",
      ],
      "play.$matchId.tsx": [
        "api.game.getMatchMeta",
        "api.game.getPlayerView",
        "api.game.getLegalMoves",
        "api.game.getRecentEvents",
        "api.game.getOpenPrompt",
        "api.game.submitAction",
      ],
      "profile.tsx": [
        "api.auth.currentUser",
        "api.game.getUserDecks",
      ],
      "pvp.tsx": [
        "api.game.listOpenPvpLobbies",
        "api.game.getMyPvpLobby",
        "api.game.createPvpLobby",
        "api.game.joinPvpLobby",
        "api.game.joinPvpLobbyByCode",
        "api.game.cancelPvpLobby",
      ],
      "settings.tsx": [
        "api.auth.currentUser",
        "api.auth.setUsername",
        "api.auth.setAvatarPath",
      ],
      "story.$chapterId.tsx": [
        "api.game.getChapterStages",
        "api.game.getMyOpenStoryLobby",
        "api.game.startStoryBattle",
        "api.game.startStoryBattleForAgent",
      ],
      "stream-overlay.tsx": [
        "api.game.getPublicActiveMatchByHost",
        "api.game.getSpectatorView",
        "api.game.getSpectatorEventsPaginated",
        "api.streamChat.getRecentStreamMessages",
      ],
      "watch.tsx": ["getLiveStreams"],
    };

    for (const [routeFile, signatures] of Object.entries(requiredByRoute)) {
      const source = readRoute(routeFile);
      for (const signature of signatures) {
        expect(source, `${routeFile} missing ${signature}`).toContain(signature);
      }
    }
  });

  it("does not ship obvious placeholder copy in migrated routes", () => {
    const routeFiles = [
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

    const blockedPhrases = ["todo", "coming soon"];

    for (const routeFile of routeFiles) {
      const source = readRoute(routeFile).toLowerCase();
      for (const phrase of blockedPhrases) {
        expect(source).not.toContain(phrase);
      }
    }
  });
});
