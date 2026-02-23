/// <reference types="vite/client" />
import { expect, test, describe, beforeEach } from "vitest";
import { api, internal } from "../_generated/api";
import { setupTestConvex, seedUser, ALICE, BOB, CHARLIE } from "./setup.test-helpers";
import {
  getDeckCardIdsFromDeckData,
  findStageByNumber,
  normalizeFirstClearBonus,
  __test as gameTestHelpers,
} from "../game";
import { buildDeckSeedPart, buildMatchSeed } from "../agentSeed";

// ═══════════════════════════════════════════════════════════════════════
// game.ts integration tests
// Exercises card queries, deck operations, starter deck selection,
// PvP lobby lifecycle, match presence — all against a real in-process
// Convex backend with components.
// ═══════════════════════════════════════════════════════════════════════

beforeEach(() => {
  gameTestHelpers.resetPvpJoinCodeRateLimiter();
});

// ── Card Queries ─────────────────────────────────────────────────────

describe("getStarterDecks", () => {
  test("returns the configured starter decks", async () => {
    const t = setupTestConvex();
    const decks = await t.query(api.game.getStarterDecks, {});
    expect(Array.isArray(decks)).toBe(true);
    expect(decks.length).toBeGreaterThan(0);
    // Each deck has at least a deckCode and name
    for (const deck of decks) {
      expect(deck.deckCode).toBeTruthy();
      expect(deck.name).toBeTruthy();
    }
  });
});

describe("card queries after seed", () => {
  test("getAllCards returns cards after seeding", async () => {
    const t = setupTestConvex();
    // Before seed: empty
    const before = await t.query(api.game.getAllCards, {});
    expect(Array.isArray(before)).toBe(true);

    // Seed all card definitions via the seed mutation
    await t.mutation(api.seed.seedAll, {});

    const after = await t.query(api.game.getAllCards, {});
    expect(after.length).toBeGreaterThan(100); // 132 cards expected
  });

  test("getCatalogCards returns well-formed card objects", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const catalog = await t.query(api.game.getCatalogCards, {});
    expect(catalog.length).toBeGreaterThan(0);
    for (const card of catalog.slice(0, 5)) {
      expect(card._id).toBeTruthy();
      expect(card.name).toBeTruthy();
      expect(card.cardType).toBeTruthy();
      expect(typeof card.isActive).toBe("boolean");
    }
  });
});

// ── Starter Deck Selection ───────────────────────────────────────────

describe("selectStarterDeck", () => {
  test("creates a deck with cards for valid deck code", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const asAlice = await seedUser(t, ALICE, api);

    // Get available starter decks
    const starters = await t.query(api.game.getStarterDecks, {});
    const firstCode = starters[0]!.deckCode;

    const result = await asAlice.mutation(api.game.selectStarterDeck, {
      deckCode: firstCode,
    });
    expect(result.deckId).toBeTruthy();
    expect(result.cardCount).toBeGreaterThan(0);
  });

  test("re-selecting returns existing deck without duplicating", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const asAlice = await seedUser(t, ALICE, api);
    const starters = await t.query(api.game.getStarterDecks, {});
    const code = starters[0]!.deckCode;

    const first = await asAlice.mutation(api.game.selectStarterDeck, {
      deckCode: code,
    });
    const second = await asAlice.mutation(api.game.selectStarterDeck, {
      deckCode: code,
    });
    expect(second.deckId).toBe(first.deckId);
  });

  test("throws for unknown deck code", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const asAlice = await seedUser(t, ALICE, api);
    await expect(
      asAlice.mutation(api.game.selectStarterDeck, {
        deckCode: "nonexistent_deck",
      }),
    ).rejects.toThrow();
  });
});

// ── Deck Operations ──────────────────────────────────────────────────

describe("deck operations", () => {
  test("getUserDecks returns decks after starter selection", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const asAlice = await seedUser(t, ALICE, api);
    const starters = await t.query(api.game.getStarterDecks, {});
    await asAlice.mutation(api.game.selectStarterDeck, {
      deckCode: starters[0]!.deckCode,
    });

    const decks = await asAlice.query(api.game.getUserDecks, {});
    expect(Array.isArray(decks)).toBe(true);
    expect(decks.length).toBeGreaterThanOrEqual(1);
  });

  test("getUserCardCounts shows cards after starter selection", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const asAlice = await seedUser(t, ALICE, api);
    const starters = await t.query(api.game.getStarterDecks, {});
    await asAlice.mutation(api.game.selectStarterDeck, {
      deckCode: starters[0]!.deckCode,
    });

    const counts = await asAlice.query(api.game.getUserCardCounts, {});
    expect(counts.length).toBeGreaterThan(0);
    for (const c of counts) {
      expect(c.cardDefinitionId).toBeTruthy();
      expect(c.quantity).toBeGreaterThan(0);
    }
  });

  test("getDeckWithCards returns deck contents", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const asAlice = await seedUser(t, ALICE, api);
    const starters = await t.query(api.game.getStarterDecks, {});
    const { deckId } = await asAlice.mutation(api.game.selectStarterDeck, {
      deckCode: starters[0]!.deckCode,
    });

    const deck = await asAlice.query(api.game.getDeckWithCards, { deckId });
    expect(deck).not.toBeNull();
  });

  test("getDeckWithCards returns null for invalid deckId", async () => {
    const t = setupTestConvex();
    const deck = await t.query(api.game.getDeckWithCards, {
      deckId: "undefined",
    });
    expect(deck).toBeNull();
  });

  test("createDeck auto-creates starter deck if none selected", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const asAlice = await seedUser(t, ALICE, api);
    // No explicit starter deck selected — resolveActiveDeckIdForUser
    // auto-creates one via createStarterDeckFromRecipe fallback
    const deckId = await asAlice.mutation(api.game.createDeck, {
      name: "Custom Deck",
    });
    expect(deckId).toBeTruthy();
    expect(typeof deckId).toBe("string");
  });

  test("createDeck returns a deckId for an empty custom deck", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const asAlice = await seedUser(t, ALICE, api);
    const starters = await t.query(api.game.getStarterDecks, {});
    await asAlice.mutation(api.game.selectStarterDeck, {
      deckCode: starters[0]!.deckCode,
    });

    const deckId = await asAlice.mutation(api.game.createDeck, {
      name: "My Custom Deck",
    });
    expect(deckId).toBeTruthy();
    expect(typeof deckId).toBe("string");
  });

  test("setActiveDeck rejects invalid deck ID", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const asAlice = await seedUser(t, ALICE, api);
    await expect(
      asAlice.mutation(api.game.setActiveDeck, { deckId: "null" }),
    ).rejects.toThrow();
  });
});

// ── PvP Lobby Lifecycle ──────────────────────────────────────────────

describe("PvP lobby", () => {
  test("createPvpLobby creates a waiting lobby", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const asAlice = await seedUser(t, ALICE, api);
    const starters = await t.query(api.game.getStarterDecks, {});
    await asAlice.mutation(api.game.selectStarterDeck, {
      deckCode: starters[0]!.deckCode,
    });

    const lobby = await asAlice.mutation(api.game.createPvpLobby, {});
    expect(lobby.matchId).toBeTruthy();
    expect(lobby.status).toBe("waiting");
    expect(lobby.visibility).toBe("public");
    expect(lobby.joinCode).toBeNull();
  });

  test("createPvpLobby with private visibility generates join code", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const asAlice = await seedUser(t, ALICE, api);
    const starters = await t.query(api.game.getStarterDecks, {});
    await asAlice.mutation(api.game.selectStarterDeck, {
      deckCode: starters[0]!.deckCode,
    });

    const lobby = await asAlice.mutation(api.game.createPvpLobby, {
      visibility: "private",
    });
    expect(lobby.visibility).toBe("private");
    expect(lobby.joinCode).toBeTruthy();
    expect(lobby.joinCode!.length).toBe(6);
  });

  test("cannot create a second lobby while one is waiting", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const asAlice = await seedUser(t, ALICE, api);
    const starters = await t.query(api.game.getStarterDecks, {});
    await asAlice.mutation(api.game.selectStarterDeck, {
      deckCode: starters[0]!.deckCode,
    });

    await asAlice.mutation(api.game.createPvpLobby, {});
    await expect(
      asAlice.mutation(api.game.createPvpLobby, {}),
    ).rejects.toThrow();
  });

  test("cancelPvpLobby cancels lobby and match", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const asAlice = await seedUser(t, ALICE, api);
    const starters = await t.query(api.game.getStarterDecks, {});
    await asAlice.mutation(api.game.selectStarterDeck, {
      deckCode: starters[0]!.deckCode,
    });

    const lobby = await asAlice.mutation(api.game.createPvpLobby, {});

    const result = await asAlice.mutation(api.game.cancelPvpLobby, {
      matchId: lobby.matchId,
    });
    expect(result.canceled).toBe(true);
    expect(result.status).toBe("canceled");

    // Verify lobby status in host DB
    const lobbyRow = await t.run(async (ctx) => {
      return ctx.db
        .query("pvpLobbies")
        .withIndex("by_matchId", (q: any) => q.eq("matchId", lobby.matchId))
        .first();
    });
    expect(lobbyRow).toBeTruthy();
    expect(lobbyRow!.status).toBe("canceled");
  });

  test("cancelPvpLobby rejects non-host user", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    // Alice creates lobby
    const asAlice = await seedUser(t, ALICE, api);
    const starters = await t.query(api.game.getStarterDecks, {});
    await asAlice.mutation(api.game.selectStarterDeck, {
      deckCode: starters[0]!.deckCode,
    });
    const lobby = await asAlice.mutation(api.game.createPvpLobby, {});

    // Bob tries to cancel it
    const asBob = await seedUser(t, BOB, api);
    await expect(
      asBob.mutation(api.game.cancelPvpLobby, {
        matchId: lobby.matchId,
      }),
    ).rejects.toThrow();
  });
});

// ── Match Presence ───────────────────────────────────────────────────

describe("upsertMatchPresence", () => {
  test("creates a new presence entry", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);

    const result = await asAlice.mutation(api.game.upsertMatchPresence, {
      matchId: "test-match-1",
      platform: "web",
    });
    expect(result).toBeNull(); // returns null

    // Verify presence was created by checking DB directly
    const rows = await t.run(async (ctx) => {
      return ctx.db
        .query("matchPresence")
        .withIndex("by_match", (q: any) => q.eq("matchId", "test-match-1"))
        .collect();
    });
    expect(rows.length).toBe(1);
    expect(rows[0]!.platform).toBe("web");
  });

  test("updates existing presence on second call", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);

    await asAlice.mutation(api.game.upsertMatchPresence, {
      matchId: "test-match-2",
      platform: "web",
    });
    await asAlice.mutation(api.game.upsertMatchPresence, {
      matchId: "test-match-2",
      platform: "telegram",
    });

    const rows = await t.run(async (ctx) => {
      return ctx.db
        .query("matchPresence")
        .withIndex("by_match", (q: any) => q.eq("matchId", "test-match-2"))
        .collect();
    });
    // Should still be 1 row, updated platform
    expect(rows.length).toBe(1);
    expect(rows[0]!.platform).toBe("telegram");
  });
});

// ── Story Queries ────────────────────────────────────────────────────

describe("story queries", () => {
  test("getChapters returns seeded chapters", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const chapters = await t.query(api.game.getChapters, {});
    expect(Array.isArray(chapters)).toBe(true);
    expect(chapters.length).toBe(16); // 4 acts x 4 chapters
  });

  test("getChapterStages returns stages for a chapter", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const chapters = await t.query(api.game.getChapters, {});
    const firstChapter = chapters[0];
    expect(firstChapter).toBeTruthy();

    const stages = await t.query(api.game.getChapterStages, {
      chapterId: firstChapter._id,
    });
    expect(Array.isArray(stages)).toBe(true);
    expect(stages.length).toBe(3); // each chapter has 3 stages
  });
});

// ── Match Meta (public query) ────────────────────────────────────────

describe("getMatchMeta", () => {
  test("returns match metadata for a PvP lobby match", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const asAlice = await seedUser(t, ALICE, api);
    const starters = await t.query(api.game.getStarterDecks, {});
    await asAlice.mutation(api.game.selectStarterDeck, {
      deckCode: starters[0]!.deckCode,
    });

    const lobby = await asAlice.mutation(api.game.createPvpLobby, {});
    const meta = await asAlice.query(api.game.getMatchMeta, {
      matchId: lobby.matchId,
    });

    expect(meta).toBeTruthy();
    expect((meta as any).mode).toBe("pvp");
    expect((meta as any).status).toBe("waiting");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// NEW INTEGRATION TESTS — Sections 1-13
// ═══════════════════════════════════════════════════════════════════════

// ── Helpers ─────────────────────────────────────────────────────────

async function seedUserWithDeck(
  t: ReturnType<typeof setupTestConvex>,
  identity: { name: string; subject: string },
) {
  const asUser = await seedUser(t, identity, api);
  const starters = await t.query(api.game.getStarterDecks, {});
  const { deckId, cardCount } = await asUser.mutation(
    api.game.selectStarterDeck,
    { deckCode: starters[0]!.deckCode },
  );
  return { asUser, deckId, starters };
}

async function createActivePvpMatch(t: ReturnType<typeof setupTestConvex>) {
  const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
  const { asUser: asBob } = await seedUserWithDeck(t, BOB);

  const lobby = await asAlice.mutation(api.game.createPvpLobby, {});
  const joinResult = await asBob.mutation(api.game.joinPvpLobby, {
    matchId: lobby.matchId,
  });
  return { asAlice, asBob, matchId: lobby.matchId, joinResult };
}

/** Creates a lobby (waiting state) without joining — returns matchId and host context */
async function createActivePvpMatchPartial(t: ReturnType<typeof setupTestConvex>) {
  const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
  const lobby = await asAlice.mutation(api.game.createPvpLobby, {});
  return { asAlice, matchId: lobby.matchId };
}

async function getFirstChapterId(t: ReturnType<typeof setupTestConvex>) {
  const chapters = await t.query(api.game.getChapters, {});
  // Sort by act/chapter to ensure we get Act 1, Chapter 1
  const sorted = [...chapters].sort((a: any, b: any) => {
    const actDelta = (a.actNumber ?? 0) - (b.actNumber ?? 0);
    if (actDelta !== 0) return actDelta;
    return (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0);
  });
  return sorted[0]._id as string;
}

// ── Section 1: saveDeck ─────────────────────────────────────────────

describe("saveDeck", () => {
  test("saves cards to a valid deck and round-trips", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice, deckId } = await seedUserWithDeck(t, ALICE);

    // Use the cards from user's inventory (granted by starter deck)
    // to satisfy ownership validation in the component
    const ownedCards = await asAlice.query(api.game.getUserCardCounts, {});
    // Build a deck with at least 30 cards from owned inventory
    const cardsToSave = ownedCards.map((c: any) => ({
      cardDefinitionId: c.cardDefinitionId,
      quantity: c.quantity,
    }));

    // Create a new deck and save owned cards to it
    const newDeckId = await asAlice.mutation(api.game.createDeck, {
      name: "Test Deck",
    });
    await asAlice.mutation(api.game.saveDeck, {
      deckId: newDeckId,
      cards: cardsToSave,
    });

    const deck = await asAlice.query(api.game.getDeckWithCards, {
      deckId: newDeckId,
    });
    expect(deck).not.toBeNull();
  });

  test("saveDeck rejects unauthenticated calls", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { deckId } = await seedUserWithDeck(t, ALICE);

    const catalog = await t.query(api.game.getCatalogCards, {});
    const validCards = catalog.slice(0, 10).map((c: any) => ({
      cardDefinitionId: c._id,
      quantity: 3,
    }));

    await expect(
      t.mutation(api.game.saveDeck, { deckId, cards: validCards }),
    ).rejects.toThrow();
  });

  test("empty card array is rejected by component (30-card minimum)", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice, deckId } = await seedUserWithDeck(t, ALICE);

    // Component enforces 30-card minimum
    await expect(
      asAlice.mutation(api.game.saveDeck, { deckId, cards: [] }),
    ).rejects.toThrow(/at least 30 cards/);
  });

  test("nonexistent card IDs are rejected by component validator", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);

    const newDeckId = await asAlice.mutation(api.game.createDeck, {
      name: "Fake Cards Deck",
    });

    // Component validates cardDefinitionId as a Convex document ID
    await expect(
      asAlice.mutation(api.game.saveDeck, {
        deckId: newDeckId,
        cards: [{ cardDefinitionId: "fake-card-id-999", quantity: 3 }],
      }),
    ).rejects.toThrow();
  });

  test("zero quantity card entry is rejected by component", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);

    const catalog = await t.query(api.game.getCatalogCards, {});
    const newDeckId = await asAlice.mutation(api.game.createDeck, {
      name: "Zero Qty Deck",
    });

    // Component enforces 30-card minimum; a single card with qty=0 yields 0 total
    await expect(
      asAlice.mutation(api.game.saveDeck, {
        deckId: newDeckId,
        cards: [{ cardDefinitionId: catalog[0]._id, quantity: 0 }],
      }),
    ).rejects.toThrow(/at least 30 cards/);
  });
});

// ── Section 2: getUserCards and cross-query consistency ──────────────

describe("getUserCards and cross-query consistency", () => {
  test("returns raw card inventory after starter", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);

    const userCards = await asAlice.query(api.game.getUserCards, {});
    expect(Array.isArray(userCards)).toBe(true);
    expect(userCards.length).toBeGreaterThan(0);
  });

  test("rejects unauthenticated calls", async () => {
    const t = setupTestConvex();
    await expect(t.query(api.game.getUserCards, {})).rejects.toThrow();
  });

  test("getUserCardCounts IDs match getCatalogCards IDs", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);

    const catalog = await t.query(api.game.getCatalogCards, {});
    const catalogIdSet = new Set(catalog.map((c: any) => c._id));

    const counts = await asAlice.query(api.game.getUserCardCounts, {});
    for (const c of counts) {
      expect(catalogIdSet.has(c.cardDefinitionId)).toBe(true);
    }
  });
});

// ── Section 11: Authorization boundary tests ────────────────────────

describe("authorization boundary tests", () => {
  test("getUserDecks rejects unauthenticated", async () => {
    const t = setupTestConvex();
    await expect(t.query(api.game.getUserDecks, {})).rejects.toThrow();
  });

  test("getUserCardCounts rejects unauthenticated", async () => {
    const t = setupTestConvex();
    await expect(t.query(api.game.getUserCardCounts, {})).rejects.toThrow();
  });

  test("createPvpLobby rejects unauthenticated", async () => {
    const t = setupTestConvex();
    await expect(t.mutation(api.game.createPvpLobby, {})).rejects.toThrow();
  });

  test("listOpenPvpLobbies rejects unauthenticated", async () => {
    const t = setupTestConvex();
    await expect(
      t.query(api.game.listOpenPvpLobbies, {}),
    ).rejects.toThrow();
  });

  test("getMyPvpLobby rejects unauthenticated", async () => {
    const t = setupTestConvex();
    await expect(t.query(api.game.getMyPvpLobby, {})).rejects.toThrow();
  });

  test("getStoryProgress rejects unauthenticated", async () => {
    const t = setupTestConvex();
    await expect(t.query(api.game.getStoryProgress, {})).rejects.toThrow();
  });
});

// ── Section 3: PvP join flow ────────────────────────────────────────

describe("PvP join flow", () => {
  test("Bob joins Alice's public lobby", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, asBob, matchId, joinResult } =
      await createActivePvpMatch(t);

    expect(joinResult.seat).toBe("away");
    expect(joinResult.status).toBe("active");
    expect(joinResult.mode).toBe("pvp");
    expect(joinResult.matchId).toBe(matchId);
  });

  test("host cannot join their own lobby", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);

    const lobby = await asAlice.mutation(api.game.createPvpLobby, {});
    await expect(
      asAlice.mutation(api.game.joinPvpLobby, { matchId: lobby.matchId }),
    ).rejects.toThrow(/Cannot join your own lobby/);
  });

  test("join private lobby without code rejects", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const { asUser: asBob } = await seedUserWithDeck(t, BOB);

    const lobby = await asAlice.mutation(api.game.createPvpLobby, {
      visibility: "private",
    });

    await expect(
      asBob.mutation(api.game.joinPvpLobby, { matchId: lobby.matchId }),
    ).rejects.toThrow(/Invalid private lobby join code/);
  });

  test("join private lobby with wrong code rejects", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const { asUser: asBob } = await seedUserWithDeck(t, BOB);

    const lobby = await asAlice.mutation(api.game.createPvpLobby, {
      visibility: "private",
    });

    await expect(
      asBob.mutation(api.game.joinPvpLobby, {
        matchId: lobby.matchId,
        joinCode: "ZZZZZZ",
      }),
    ).rejects.toThrow(/Invalid private lobby join code/);
  });

  test("join private lobby with correct code succeeds", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const { asUser: asBob } = await seedUserWithDeck(t, BOB);

    const lobby = await asAlice.mutation(api.game.createPvpLobby, {
      visibility: "private",
    });
    expect(lobby.joinCode).toBeTruthy();

    const result = await asBob.mutation(api.game.joinPvpLobby, {
      matchId: lobby.matchId,
      joinCode: lobby.joinCode!,
    });
    expect(result.seat).toBe("away");
    expect(result.status).toBe("active");
  });

  test("joinPvpLobbyByCode finds private lobby", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const { asUser: asBob } = await seedUserWithDeck(t, BOB);

    const lobby = await asAlice.mutation(api.game.createPvpLobby, {
      visibility: "private",
    });

    const result = await asBob.mutation(api.game.joinPvpLobbyByCode, {
      joinCode: lobby.joinCode!,
    });
    expect(result.seat).toBe("away");
    expect(result.status).toBe("active");
  });

  test("joinPvpLobbyByCode rejects short code", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asBob } = await seedUserWithDeck(t, BOB);

    await expect(
      asBob.mutation(api.game.joinPvpLobbyByCode, { joinCode: "AB" }),
    ).rejects.toThrow(/6-character code/);
  });

  test("joinPvpLobbyByCode rate limits repeated attempts", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asBob } = await seedUserWithDeck(t, BOB);

    for (let attempt = 0; attempt < 12; attempt += 1) {
      await expect(
        asBob.mutation(api.game.joinPvpLobbyByCode, { joinCode: "ZZZZZZ" }),
      ).rejects.toThrow(/No waiting lobby found/);
    }

    await expect(
      asBob.mutation(api.game.joinPvpLobbyByCode, { joinCode: "ZZZZZZ" }),
    ).rejects.toThrow(/Too many join code attempts/);
  });

  test("join already-active lobby rejects (CHARLIE)", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { matchId } = await createActivePvpMatch(t);

    const { asUser: asCharlie } = await seedUserWithDeck(t, CHARLIE);
    await expect(
      asCharlie.mutation(api.game.joinPvpLobby, { matchId }),
    ).rejects.toThrow();
  });

  test("join canceled lobby rejects", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const { asUser: asBob } = await seedUserWithDeck(t, BOB);

    const lobby = await asAlice.mutation(api.game.createPvpLobby, {});
    await asAlice.mutation(api.game.cancelPvpLobby, {
      matchId: lobby.matchId,
    });

    await expect(
      asBob.mutation(api.game.joinPvpLobby, { matchId: lobby.matchId }),
    ).rejects.toThrow();
  });

  test("lobby status transitions to active after join", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { matchId } = await createActivePvpMatch(t);

    const lobbyRow = await t.run(async (ctx) => {
      return ctx.db
        .query("pvpLobbies")
        .withIndex("by_matchId", (q: any) => q.eq("matchId", matchId))
        .first();
    });
    expect(lobbyRow).toBeTruthy();
    expect(lobbyRow!.status).toBe("active");
    expect(lobbyRow!.activatedAt).toBeTypeOf("number");
  });
});

// ── Section 4: listOpenPvpLobbies and getMyPvpLobby ─────────────────

describe("listOpenPvpLobbies and getMyPvpLobby", () => {
  test("lists other users' public lobbies", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const { asUser: asBob } = await seedUserWithDeck(t, BOB);

    await asBob.mutation(api.game.createPvpLobby, {});

    const lobbies = await asAlice.query(api.game.listOpenPvpLobbies, {});
    expect(lobbies.length).toBeGreaterThanOrEqual(1);
    expect(lobbies.some((l: any) => l.visibility === "public")).toBe(true);
  });

  test("excludes own lobby", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);

    await asAlice.mutation(api.game.createPvpLobby, {});

    const lobbies = await asAlice.query(api.game.listOpenPvpLobbies, {});
    // Alice should NOT see her own lobby
    for (const lobby of lobbies) {
      expect(lobby.hostUserId).not.toBe(
        (await t.run(async (ctx) => {
          const identity = ALICE;
          return ctx.db
            .query("users")
            .withIndex("by_privyId", (q: any) =>
              q.eq("privyId", identity.subject),
            )
            .first();
        }))!._id,
      );
    }
  });

  test("excludes private lobbies", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const { asUser: asBob } = await seedUserWithDeck(t, BOB);

    await asBob.mutation(api.game.createPvpLobby, { visibility: "private" });

    const lobbies = await asAlice.query(api.game.listOpenPvpLobbies, {});
    for (const lobby of lobbies) {
      expect(lobby.visibility).toBe("public");
    }
  });

  test("excludes canceled lobbies", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const { asUser: asBob } = await seedUserWithDeck(t, BOB);

    const lobby = await asBob.mutation(api.game.createPvpLobby, {});
    await asBob.mutation(api.game.cancelPvpLobby, {
      matchId: lobby.matchId,
    });

    const lobbies = await asAlice.query(api.game.listOpenPvpLobbies, {});
    for (const l of lobbies) {
      expect(l.matchId).not.toBe(lobby.matchId);
    }
  });

  test("getMyPvpLobby returns own waiting lobby", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);

    const lobby = await asAlice.mutation(api.game.createPvpLobby, {});

    const myLobby = await asAlice.query(api.game.getMyPvpLobby, {});
    expect(myLobby).not.toBeNull();
    expect(myLobby!.matchId).toBe(lobby.matchId);
    expect(myLobby!.status).toBe("waiting");
  });

  test("getMyPvpLobby returns null when none", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);

    const myLobby = await asAlice.query(api.game.getMyPvpLobby, {});
    expect(myLobby).toBeNull();
  });
});

// ── Section 5: story mode — startStoryBattle ────────────────────────

describe("story mode - startStoryBattle", () => {
  test("starts story battle for ch1/stage1", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const chapterId = await getFirstChapterId(t);

    const result = await asAlice.mutation(api.game.startStoryBattle, {
      chapterId,
      stageNumber: 1,
    });
    expect(result.matchId).toBeTruthy();
    expect(result.chapterId).toBe(chapterId);
    expect(result.stageNumber).toBe(1);
  });

  test("defaults stageNumber to 1", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const chapterId = await getFirstChapterId(t);

    const result = await asAlice.mutation(api.game.startStoryBattle, {
      chapterId,
    });
    expect(result.stageNumber).toBe(1);
  });

  test("rejects stage 2 without stage 1 completed", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const chapterId = await getFirstChapterId(t);

    await expect(
      asAlice.mutation(api.game.startStoryBattle, {
        chapterId,
        stageNumber: 2,
      }),
    ).rejects.toThrow(/Stage 1 must be cleared first/);
  });

  test("creates storyMatches row in host DB", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const chapterId = await getFirstChapterId(t);

    const result = await asAlice.mutation(api.game.startStoryBattle, {
      chapterId,
      stageNumber: 1,
    });

    const storyRow = await t.run(async (ctx) => {
      return ctx.db
        .query("storyMatches")
        .withIndex("by_matchId", (q: any) =>
          q.eq("matchId", result.matchId),
        )
        .first();
    });
    expect(storyRow).toBeTruthy();
    expect(storyRow!.chapterId).toBe(chapterId);
    expect(storyRow!.stageNumber).toBe(1);
  });

  test("rejects unauthenticated call", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const chapterId = await getFirstChapterId(t);

    await expect(
      t.mutation(api.game.startStoryBattle, { chapterId }),
    ).rejects.toThrow();
  });

  test("rejects invalid chapterId", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);

    await expect(
      asAlice.mutation(api.game.startStoryBattle, {
        chapterId: "invalid-chapter-id",
      }),
    ).rejects.toThrow();
  });
});

// ── Section 6: story mode — completeStoryStage ──────────────────────

describe("story mode - completeStoryStage", () => {
  test("rejects completing active (non-ended) match", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const chapterId = await getFirstChapterId(t);

    const result = await asAlice.mutation(api.game.startStoryBattle, {
      chapterId,
      stageNumber: 1,
    });

    // Match is active, not ended — completion should fail
    await expect(
      asAlice.mutation(api.game.completeStoryStage, {
        matchId: result.matchId,
      }),
    ).rejects.toThrow(/Match is not ended yet/);
  });

  test("rejects non-story match", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { matchId } = await createActivePvpMatch(t);

    const { asUser: asAlice } = await seedUserWithDeck(t, { name: "Alice2", subject: "privy:alice2-001" });

    // PvP match has no storyMatches row
    await expect(
      asAlice.mutation(api.game.completeStoryStage, { matchId }),
    ).rejects.toThrow(/Not a story match/);
  });

  test("rejects wrong user", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const { asUser: asBob } = await seedUserWithDeck(t, BOB);
    const chapterId = await getFirstChapterId(t);

    const result = await asAlice.mutation(api.game.startStoryBattle, {
      chapterId,
      stageNumber: 1,
    });

    // Surrender to end the match
    await asAlice.mutation(api.game.submitAction, {
      matchId: result.matchId,
      command: JSON.stringify({ type: "SURRENDER" }),
      seat: "host",
    });

    // Bob tries to complete Alice's story match
    await expect(
      asBob.mutation(api.game.completeStoryStage, {
        matchId: result.matchId,
      }),
    ).rejects.toThrow(/Not your match/);
  });

  test("re-completing returns cached outcome (idempotency)", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const chapterId = await getFirstChapterId(t);

    const battle = await asAlice.mutation(api.game.startStoryBattle, {
      chapterId,
      stageNumber: 1,
    });

    // Surrender to end the match
    await asAlice.mutation(api.game.submitAction, {
      matchId: battle.matchId,
      command: JSON.stringify({ type: "SURRENDER" }),
      seat: "host",
    });

    const first = await asAlice.mutation(api.game.completeStoryStage, {
      matchId: battle.matchId,
    });
    const second = await asAlice.mutation(api.game.completeStoryStage, {
      matchId: battle.matchId,
    });

    expect(second.outcome).toBe(first.outcome);
    expect(second.starsEarned).toBe(first.starsEarned);
  });

  test("lost game awards 0 stars", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const chapterId = await getFirstChapterId(t);

    const battle = await asAlice.mutation(api.game.startStoryBattle, {
      chapterId,
      stageNumber: 1,
    });

    // Surrender = loss
    await asAlice.mutation(api.game.submitAction, {
      matchId: battle.matchId,
      command: JSON.stringify({ type: "SURRENDER" }),
      seat: "host",
    });

    const result = await asAlice.mutation(api.game.completeStoryStage, {
      matchId: battle.matchId,
    });
    expect(result.outcome).toBe("lost");
    expect(result.starsEarned).toBe(0);
  });

  test("rejects unauthenticated call", async () => {
    const t = setupTestConvex();
    await expect(
      t.mutation(api.game.completeStoryStage, { matchId: "fake-match" }),
    ).rejects.toThrow();
  });
});

// ── Section 7: story mode — cancelWaitingStoryMatch ─────────────────

describe("story mode - cancelWaitingStoryMatch", () => {
  test("cancels waiting story match", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const chapterId = await getFirstChapterId(t);

    const battle = await asAlice.mutation(api.game.startStoryBattleForAgent, {
      chapterId,
      stageNumber: 1,
    });

    const result = await asAlice.mutation(api.game.cancelWaitingStoryMatch, {
      matchId: battle.matchId,
    });
    expect(result.canceled).toBe(true);
    expect(result.status).toBe("ended");
    expect(result.outcome).toBe("abandoned");
  });

  test("rejects non-host cancellation", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const { asUser: asBob } = await seedUserWithDeck(t, BOB);
    const chapterId = await getFirstChapterId(t);

    const battle = await asAlice.mutation(api.game.startStoryBattleForAgent, {
      chapterId,
      stageNumber: 1,
    });

    await expect(
      asBob.mutation(api.game.cancelWaitingStoryMatch, {
        matchId: battle.matchId,
      }),
    ).rejects.toThrow(/not the host/);
  });

  test("rejects cancel of active match", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const chapterId = await getFirstChapterId(t);

    // startStoryBattle creates and starts the match (status: active)
    const battle = await asAlice.mutation(api.game.startStoryBattle, {
      chapterId,
      stageNumber: 1,
    });

    await expect(
      asAlice.mutation(api.game.cancelWaitingStoryMatch, {
        matchId: battle.matchId,
      }),
    ).rejects.toThrow(/not cancellable/);
  });

  test("marks storyMatch row as abandoned", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const chapterId = await getFirstChapterId(t);

    const battle = await asAlice.mutation(api.game.startStoryBattleForAgent, {
      chapterId,
      stageNumber: 1,
    });

    await asAlice.mutation(api.game.cancelWaitingStoryMatch, {
      matchId: battle.matchId,
    });

    const storyRow = await t.run(async (ctx) => {
      return ctx.db
        .query("storyMatches")
        .withIndex("by_matchId", (q: any) =>
          q.eq("matchId", battle.matchId),
        )
        .first();
    });
    expect(storyRow).toBeTruthy();
    expect(storyRow!.outcome).toBe("abandoned");
  });
});

// ── Section 8: story queries (extended) ─────────────────────────────

describe("story queries (extended)", () => {
  test("getStoryProgress returns empty for fresh user", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);

    const progress = await asAlice.query(api.game.getStoryProgress, {});
    expect(Array.isArray(progress) || progress === null || progress === undefined).toBe(true);
  });

  test("getStageWithNarrative returns dialogue", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const chapterId = await getFirstChapterId(t);

    const stage = await t.query(api.game.getStageWithNarrative, {
      chapterId,
      stageNumber: 1,
    });
    expect(stage).not.toBeNull();
    expect(stage!.narrative).toBeTruthy();
    expect(Array.isArray(stage!.narrative.preMatchDialogue)).toBe(true);
    expect(Array.isArray(stage!.narrative.postMatchWinDialogue)).toBe(true);
  });

  test("getStageWithNarrative returns null for invalid stage", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const chapterId = await getFirstChapterId(t);

    const stage = await t.query(api.game.getStageWithNarrative, {
      chapterId,
      stageNumber: 99,
    });
    expect(stage).toBeNull();
  });

  test("getFullStoryProgress returns structure", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);

    const progress = await asAlice.query(api.game.getFullStoryProgress, {});
    expect(progress).toBeTruthy();
    expect(progress.chapters).toBeTruthy();
    expect(typeof progress.totalStars).toBe("number");
    expect(progress.totalStars).toBe(0);
  });

  test("getStoryMatchContext returns null for PvP match", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { matchId } = await createActivePvpMatch(t);

    const context = await t.query(api.game.getStoryMatchContext, { matchId });
    expect(context).toBeNull();
  });
});

// ── Section 9: submitAction and match views ─────────────────────────

describe("submitAction and match views", () => {
  test("host submits ADVANCE_PHASE", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, matchId } = await createActivePvpMatch(t);

    const result = await asAlice.mutation(api.game.submitAction, {
      matchId,
      command: JSON.stringify({ type: "ADVANCE_PHASE" }),
      seat: "host",
    });
    // Should return without throwing
    expect(result).toBeTruthy();
  });

  test("wrong seat rejects", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, matchId } = await createActivePvpMatch(t);

    // Alice is host — submitting as "away" should reject
    await expect(
      asAlice.mutation(api.game.submitAction, {
        matchId,
        command: JSON.stringify({ type: "ADVANCE_PHASE" }),
        seat: "away",
      }),
    ).rejects.toThrow(/only access your own seat/);
  });

  test("unauthenticated rejects", async () => {
    const t = setupTestConvex();
    await expect(
      t.mutation(api.game.submitAction, {
        matchId: "fake",
        command: JSON.stringify({ type: "ADVANCE_PHASE" }),
        seat: "host",
      }),
    ).rejects.toThrow();
  });

  test("getPlayerView returns valid game state", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, matchId } = await createActivePvpMatch(t);

    const viewJson = await asAlice.query(api.game.getPlayerView, {
      matchId,
      seat: "host",
    });
    expect(viewJson).toBeTruthy();

    const view = JSON.parse(viewJson);
    expect(view.currentPhase).toBeTruthy();
    expect(Array.isArray(view.hand)).toBe(true);
    expect(view.board !== undefined).toBe(true);
  });

  test("getPlayerView rejects wrong seat", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, matchId } = await createActivePvpMatch(t);

    // Alice is host — viewing "away" seat should reject
    await expect(
      asAlice.query(api.game.getPlayerView, {
        matchId,
        seat: "away",
      }),
    ).rejects.toThrow(/only access your own seat/);
  });

  test("getMatchMeta rejects unauthenticated query", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { matchId } = await createActivePvpMatch(t);

    await expect(
      t.query(api.game.getMatchMeta, { matchId }),
    ).rejects.toThrow();
  });

  test("getMatchMeta rejects non-participant query", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { matchId } = await createActivePvpMatch(t);
    const { asUser: asCharlie } = await seedUserWithDeck(t, CHARLIE);

    await expect(
      asCharlie.query(api.game.getMatchMeta, { matchId }),
    ).rejects.toThrow(/not a participant/);
  });

  test("getMatchMeta returns metadata for participants", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, matchId } = await createActivePvpMatch(t);

    const meta = await asAlice.query(api.game.getMatchMeta, { matchId });
    expect(meta).toBeTruthy();
    expect((meta as any).mode).toBe("pvp");
  });

  test("getRecentEvents returns event batches", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, matchId } = await createActivePvpMatch(t);

    // Submit an action to generate events
    await asAlice.mutation(api.game.submitAction, {
      matchId,
      command: JSON.stringify({ type: "ADVANCE_PHASE" }),
      seat: "host",
    });

    const events = await asAlice.query(api.game.getRecentEvents, {
      matchId,
      sinceVersion: 0,
    });
    expect(Array.isArray(events)).toBe(true);
    if (events.length > 0) {
      expect(events[0].version).toBeTypeOf("number");
    }
  });

  test("getRecentEvents rejects unauthenticated query", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { matchId } = await createActivePvpMatch(t);

    await expect(
      t.query(api.game.getRecentEvents, { matchId, sinceVersion: 0 }),
    ).rejects.toThrow();
  });

  test("getRecentEvents rejects non-participant query", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { matchId } = await createActivePvpMatch(t);
    const { asUser: asCharlie } = await seedUserWithDeck(t, CHARLIE);

    await expect(
      asCharlie.query(api.game.getRecentEvents, { matchId, sinceVersion: 0 }),
    ).rejects.toThrow(/not a participant/);
  });

  test("getRecentEvents redacts hidden setup command card ids for opponents", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, asBob, matchId } = await createActivePvpMatch(t);

    for (let i = 0; i < 6; i += 1) {
      const viewJson = await asAlice.query(api.game.getPlayerView, {
        matchId,
        seat: "host",
      });
      const view = JSON.parse(viewJson) as { currentPhase?: string };
      if (view.currentPhase === "main" || view.currentPhase === "main2") break;
      await asAlice.mutation(api.game.submitAction, {
        matchId,
        command: JSON.stringify({ type: "ADVANCE_PHASE" }),
        seat: "host",
      });
    }

    const hostViewJson = await asAlice.query(api.game.getPlayerView, {
      matchId,
      seat: "host",
    });
    const hostView = JSON.parse(hostViewJson) as { hand?: string[] };
    const hand = Array.isArray(hostView.hand) ? hostView.hand : [];

    let selectedCardId: string | null = null;
    let selectedCommandType: "SET_MONSTER" | "SET_SPELL_TRAP" | null = null;

    for (const cardId of hand) {
      const setMonsterResult = await asAlice.mutation(api.game.submitAction, {
        matchId,
        command: JSON.stringify({ type: "SET_MONSTER", cardId }),
        seat: "host",
      });
      if (setMonsterResult?.events !== "[]") {
        selectedCardId = cardId;
        selectedCommandType = "SET_MONSTER";
        break;
      }

      const setSpellTrapResult = await asAlice.mutation(api.game.submitAction, {
        matchId,
        command: JSON.stringify({ type: "SET_SPELL_TRAP", cardId }),
        seat: "host",
      });
      if (setSpellTrapResult?.events !== "[]") {
        selectedCardId = cardId;
        selectedCommandType = "SET_SPELL_TRAP";
        break;
      }
    }

    expect(selectedCardId).toBeTruthy();
    expect(selectedCommandType).toBeTruthy();

    const awayEvents = await asBob.query(api.game.getRecentEvents, {
      matchId,
      sinceVersion: 0,
    });
    const awayBatch = (awayEvents as any[]).find((batch) => {
      if (batch?.seat !== "host") return false;
      try {
        return JSON.parse(batch.command).type === selectedCommandType;
      } catch {
        return false;
      }
    });

    expect(awayBatch).toBeTruthy();
    const awayCommand = JSON.parse(awayBatch.command);
    expect(awayCommand).toEqual({ type: selectedCommandType });

    const hostEvents = await asAlice.query(api.game.getRecentEvents, {
      matchId,
      sinceVersion: 0,
    });
    const hostBatch = (hostEvents as any[]).find((batch) => {
      if (batch?.seat !== "host") return false;
      try {
        const parsed = JSON.parse(batch.command);
        return parsed.type === selectedCommandType && parsed.cardId === selectedCardId;
      } catch {
        return false;
      }
    });

    expect(hostBatch).toBeTruthy();
  });

  test("getRecentEvents normalizes malformed command payloads to UNKNOWN", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, matchId } = await createActivePvpMatch(t);

    await t.runInComponent("lunchtable_tcg_match", async (ctx: any) => {
      await ctx.db.insert("matchEvents", {
        matchId: matchId as any,
        version: 999_999,
        events: "[]",
        command: "{malformed-json",
        seat: "host",
        createdAt: Date.now(),
      });
    });

    const events = await asAlice.query(api.game.getRecentEvents, {
      matchId,
      sinceVersion: 0,
    });
    const malformedBatch = (events as any[]).find((batch) => batch?.version === 999_999);
    expect(malformedBatch).toBeTruthy();
    expect(JSON.parse(malformedBatch.command)).toEqual({ type: "UNKNOWN" });
  });

  test("getLatestSnapshotVersion returns number", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { matchId } = await createActivePvpMatch(t);

    const version = await t.query(api.game.getLatestSnapshotVersion, {
      matchId,
    });
    expect(typeof version).toBe("number");
    expect(version).toBeGreaterThanOrEqual(0);
  });

  test("SURRENDER ends the match", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, matchId } = await createActivePvpMatch(t);

    await asAlice.mutation(api.game.submitAction, {
      matchId,
      command: JSON.stringify({ type: "SURRENDER" }),
      seat: "host",
    });

    const meta = await asAlice.query(api.game.getMatchMeta, { matchId });
    expect(meta).toBeTruthy();
    expect((meta as any).status).toBe("ended");
    // Host surrendered, so away wins
    expect((meta as any).winner).toBe("away");
  });
});

// ── Section 10: spectator queries (no auth) ─────────────────────────

describe("spectator queries (no auth)", () => {
  test("getSpectatorView returns view without auth", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { matchId } = await createActivePvpMatch(t);

    // No identity — spectator view is public
    const view = await t.query(api.game.getSpectatorView, {
      matchId,
      seat: "host",
    });
    expect(view).not.toBeNull();
    expect(view!.matchId).toBe(matchId);
    expect(view!.seat).toBe("host");
    expect(view!.phase).toBeTruthy();
    expect(view!.players).toBeTruthy();
    expect(view!.fields).toBeTruthy();
  });

  test("getSpectatorView throws for invalid matchId format", async () => {
    const t = setupTestConvex();

    // Component validates matchId as a Convex document ID, so invalid format throws
    await expect(
      t.query(api.game.getSpectatorView, {
        matchId: "nonexistent-match-id",
        seat: "host",
      }),
    ).rejects.toThrow();
  });

  test("getSpectatorEventsPaginated returns pagination shape", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { matchId } = await createActivePvpMatch(t);

    const result = await t.query(api.game.getSpectatorEventsPaginated, {
      matchId,
      seat: "host",
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(result).toBeTruthy();
    expect(Array.isArray(result.page)).toBe(true);
    expect(typeof result.isDone).toBe("boolean");
    expect("continueCursor" in result).toBe(true);
  });
});

// ── Section 12: setActiveDeck (extended) ────────────────────────────

describe("setActiveDeck (extended)", () => {
  test("valid deck succeeds", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice, deckId } = await seedUserWithDeck(t, ALICE);

    await asAlice.mutation(api.game.setActiveDeck, { deckId });

    // Verify via DB
    const user = await t.run(async (ctx) => {
      return ctx.db
        .query("users")
        .withIndex("by_privyId", (q: any) =>
          q.eq("privyId", ALICE.subject),
        )
        .first();
    });
    expect(user!.activeDeckId).toBe(deckId);
  });

  test("reserved IDs rejected", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);

    for (const reserved of ["null", "undefined", "skip"]) {
      await expect(
        asAlice.mutation(api.game.setActiveDeck, { deckId: reserved }),
      ).rejects.toThrow();
    }
  });

  test("whitespace-only string rejected", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);

    await expect(
      asAlice.mutation(api.game.setActiveDeck, { deckId: "   " }),
    ).rejects.toThrow();
  });
});

// ── Section 13: getActiveMatchByHost and getOpenPrompt ──────────────

describe("getActiveMatchByHost and getOpenPrompt", () => {
  test("returns active match for host", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { matchId } = await createActivePvpMatch(t);

    // Get the host user ID
    const hostUser = await t.run(async (ctx) => {
      return ctx.db
        .query("users")
        .withIndex("by_privyId", (q: any) =>
          q.eq("privyId", ALICE.subject),
        )
        .first();
    });

    const activeMatch = await t.query(api.game.getActiveMatchByHost, {
      hostId: hostUser!._id,
    });
    expect(activeMatch).toBeTruthy();
  });

  test("returns null for unknown host", async () => {
    const t = setupTestConvex();

    const activeMatch = await t.query(api.game.getActiveMatchByHost, {
      hostId: "unknown-host-id",
    });
    expect(activeMatch).toBeNull();
  });

  test("getOpenPrompt returns without crashing", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, matchId } = await createActivePvpMatch(t);

    // getOpenPrompt requires auth + seat ownership
    const prompt = await asAlice.query(api.game.getOpenPrompt, {
      matchId,
      seat: "host",
    });
    // Can be null or a prompt object — just verify it doesn't crash
    expect(prompt === null || prompt !== undefined).toBe(true);
  });
});

// ── Section 14: getStageProgress ────────────────────────────────────

describe("getStageProgress", () => {
  test("returns progress for authenticated user", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);

    const progress = await asAlice.query(api.game.getStageProgress, {});
    // Fresh user — empty or null
    expect(
      progress === null ||
        progress === undefined ||
        (Array.isArray(progress) && progress.length === 0),
    ).toBe(true);
  });

  test("rejects unauthenticated call", async () => {
    const t = setupTestConvex();
    await expect(t.query(api.game.getStageProgress, {})).rejects.toThrow();
  });

  test("returns progress after completing a story stage", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const chapterId = await getFirstChapterId(t);

    const battle = await asAlice.mutation(api.game.startStoryBattle, {
      chapterId,
      stageNumber: 1,
    });

    // Surrender to end the match, then complete
    await asAlice.mutation(api.game.submitAction, {
      matchId: battle.matchId,
      command: JSON.stringify({ type: "SURRENDER" }),
      seat: "host",
    });
    await asAlice.mutation(api.game.completeStoryStage, {
      matchId: battle.matchId,
    });

    const progress = await asAlice.query(api.game.getStageProgress, {});
    // After completing, there should be stage progress data
    expect(progress).toBeTruthy();
  });
});

// ── Section 15: submitActionWithClient ──────────────────────────────

describe("submitActionWithClient", () => {
  test("submits action with client tag", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, matchId } = await createActivePvpMatch(t);

    const result = await asAlice.mutation(api.game.submitActionWithClient, {
      matchId,
      command: JSON.stringify({ type: "ADVANCE_PHASE" }),
      seat: "host",
      client: "web",
    });
    expect(result).toBeTruthy();
  });

  test("works without client tag (optional)", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, matchId } = await createActivePvpMatch(t);

    const result = await asAlice.mutation(api.game.submitActionWithClient, {
      matchId,
      command: JSON.stringify({ type: "ADVANCE_PHASE" }),
      seat: "host",
    });
    expect(result).toBeTruthy();
  });

  test("rejects wrong seat same as submitAction", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, matchId } = await createActivePvpMatch(t);

    await expect(
      asAlice.mutation(api.game.submitActionWithClient, {
        matchId,
        command: JSON.stringify({ type: "ADVANCE_PHASE" }),
        seat: "away",
        client: "web",
      }),
    ).rejects.toThrow(/only access your own seat/);
  });

  test("rejects unauthenticated", async () => {
    const t = setupTestConvex();
    await expect(
      t.mutation(api.game.submitActionWithClient, {
        matchId: "fake",
        command: JSON.stringify({ type: "ADVANCE_PHASE" }),
        seat: "host",
      }),
    ).rejects.toThrow();
  });
});

// ── Section 16: Story end-to-end flow ───────────────────────────────

describe("story end-to-end flow", () => {
  test("start → surrender → complete → verify progress and context", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const chapterId = await getFirstChapterId(t);

    // 1. Start
    const battle = await asAlice.mutation(api.game.startStoryBattle, {
      chapterId,
      stageNumber: 1,
    });
    expect(battle.matchId).toBeTruthy();

    // 2. Verify story match context exists
    const context = await t.query(api.game.getStoryMatchContext, {
      matchId: battle.matchId,
    });
    expect(context).not.toBeNull();
    expect(context!.chapterId).toBe(chapterId);
    expect(context!.stageNumber).toBe(1);
    expect(context!.outcome).toBeNull();

    // 3. Match meta shows active
    const metaBefore = await asAlice.query(api.game.getMatchMeta, {
      matchId: battle.matchId,
    });
    expect((metaBefore as any).status).toBe("active");
    expect((metaBefore as any).mode).toBe("story");

    // 4. Surrender
    await asAlice.mutation(api.game.submitAction, {
      matchId: battle.matchId,
      command: JSON.stringify({ type: "SURRENDER" }),
      seat: "host",
    });

    // 5. Match meta shows ended
    const metaAfter = await asAlice.query(api.game.getMatchMeta, {
      matchId: battle.matchId,
    });
    expect((metaAfter as any).status).toBe("ended");

    // 6. Complete
    const completion = await asAlice.mutation(api.game.completeStoryStage, {
      matchId: battle.matchId,
    });
    expect(completion.outcome).toBe("lost");
    expect(completion.starsEarned).toBe(0);
    expect(completion.rewards.gold).toBe(0);
    expect(completion.rewards.xp).toBe(0);

    // 7. Story match context now shows outcome
    const contextAfter = await t.query(api.game.getStoryMatchContext, {
      matchId: battle.matchId,
    });
    expect(contextAfter!.outcome).toBe("lost");

    // 8. Full story progress reflects the attempt
    const fullProgress = await asAlice.query(api.game.getFullStoryProgress, {});
    expect(fullProgress.totalStars).toBe(0);
    expect(fullProgress.chapters).toBeTruthy();
  });

  test("getStoryMatchContext returns dialogue and reward fields", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const chapterId = await getFirstChapterId(t);

    const battle = await asAlice.mutation(api.game.startStoryBattle, {
      chapterId,
      stageNumber: 1,
    });

    const context = await t.query(api.game.getStoryMatchContext, {
      matchId: battle.matchId,
    });
    expect(context).not.toBeNull();
    expect(Array.isArray(context!.preMatchDialogue)).toBe(true);
    expect(Array.isArray(context!.postMatchWinDialogue)).toBe(true);
    expect(Array.isArray(context!.postMatchLoseDialogue)).toBe(true);
    expect(typeof context!.opponentName).toBe("string");
    expect(typeof context!.rewardsGold).toBe("number");
    expect(typeof context!.rewardsXp).toBe("number");
  });
});

// ── Section 17: PvP end-to-end flow ─────────────────────────────────

describe("PvP end-to-end flow", () => {
  test("lobby options (pongEnabled, redemptionEnabled) propagate", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);

    const lobby = await asAlice.mutation(api.game.createPvpLobby, {
      pongEnabled: true,
      redemptionEnabled: true,
    });

    const lobbyRow = await t.run(async (ctx) => {
      return ctx.db
        .query("pvpLobbies")
        .withIndex("by_matchId", (q: any) =>
          q.eq("matchId", lobby.matchId),
        )
        .first();
    });
    expect(lobbyRow!.pongEnabled).toBe(true);
    expect(lobbyRow!.redemptionEnabled).toBe(true);
  });

  test("lobby options propagate into started match snapshot config", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const { asUser: asBob } = await seedUserWithDeck(t, BOB);

    const lobby = await asAlice.mutation(api.game.createPvpLobby, {
      pongEnabled: true,
      redemptionEnabled: true,
    });
    await asBob.mutation(api.game.joinPvpLobby, { matchId: lobby.matchId });
    const latestVersion = await t.query(api.game.getLatestSnapshotVersion, {
      matchId: lobby.matchId,
    });

    const snapshot = await t.runInComponent("lunchtable_tcg_match", async (ctx: any) => {
      return await ctx.db
        .query("matchSnapshots")
        .withIndex("by_match_version", (q: any) =>
          q.eq("matchId", lobby.matchId as any).eq("version", latestVersion),
        )
        .first();
    });

    expect(snapshot).toBeTruthy();
    const state = JSON.parse(snapshot!.state) as {
      config?: { pongEnabled?: boolean; redemptionEnabled?: boolean };
    };
    expect(state.config?.pongEnabled).toBe(true);
    expect(state.config?.redemptionEnabled).toBe(true);
  });

  test("full PvP flow: create → join → play → surrender → verify", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, asBob, matchId } = await createActivePvpMatch(t);

    // Match is active
    const meta = await asAlice.query(api.game.getMatchMeta, { matchId });
    expect((meta as any).status).toBe("active");
    expect((meta as any).mode).toBe("pvp");

    // Both players can view their own seat
    const hostView = await asAlice.query(api.game.getPlayerView, {
      matchId,
      seat: "host",
    });
    expect(hostView).toBeTruthy();

    const awayView = await asBob.query(api.game.getPlayerView, {
      matchId,
      seat: "away",
    });
    expect(awayView).toBeTruthy();

    // Bob (away) surrenders even though it's host's turn — SURRENDER is always allowed
    await asBob.mutation(api.game.submitAction, {
      matchId,
      command: JSON.stringify({ type: "SURRENDER" }),
      seat: "away",
    });

    // Match ended, host wins (Bob surrendered)
    const metaAfter = await asAlice.query(api.game.getMatchMeta, { matchId });
    expect((metaAfter as any).status).toBe("ended");
    expect((metaAfter as any).winner).toBe("host");
  });

  test("getMyPvpLobby returns active lobby after join", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, matchId } = await createActivePvpMatch(t);

    const myLobby = await asAlice.query(api.game.getMyPvpLobby, {});
    expect(myLobby).not.toBeNull();
    expect(myLobby!.matchId).toBe(matchId);
    expect(myLobby!.status).toBe("active");
  });

  test("listOpenPvpLobbies excludes active lobbies", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { matchId } = await createActivePvpMatch(t);
    const { asUser: asCharlie } = await seedUserWithDeck(t, CHARLIE);

    const lobbies = await asCharlie.query(api.game.listOpenPvpLobbies, {});
    for (const l of lobbies) {
      expect(l.matchId).not.toBe(matchId);
    }
  });
});

describe("AI turn resilience", () => {
  test("executeAITurn resolves safely when latest snapshot is malformed", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const chapterId = await getFirstChapterId(t);

    const battle = await asAlice.mutation(api.game.startStoryBattle, {
      chapterId,
      stageNumber: 1,
    });

    const latestVersion = await t.query(api.game.getLatestSnapshotVersion, {
      matchId: battle.matchId,
    });

    await t.runInComponent("lunchtable_tcg_match", async (ctx: any) => {
      await ctx.db.insert("matchSnapshots", {
        matchId: battle.matchId as any,
        version: latestVersion + 999,
        state: "{malformed-json",
        createdAt: Date.now(),
      });
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("aiTurnQueue", {
        matchId: battle.matchId,
        createdAt: Date.now(),
      });
    });

    const versionAfterCorruption = await t.query(api.game.getLatestSnapshotVersion, {
      matchId: battle.matchId,
    });
    expect(versionAfterCorruption).toBe(latestVersion + 999);

    await expect(
      t.mutation(internal.game.executeAITurn, { matchId: battle.matchId }),
    ).resolves.toBeNull();
  });

  test("nudgeAITurnAsActor only queues when the built-in CPU seat is active", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const chapterId = await getFirstChapterId(t);

    const battle = await asAlice.mutation(api.game.startStoryBattle, {
      chapterId,
      stageNumber: 1,
    });

    const aliceUser = await t.run(async (ctx: any) =>
      ctx.db
        .query("users")
        .withIndex("by_privyId", (q: any) => q.eq("privyId", ALICE.subject))
        .first(),
    );
    expect(aliceUser).toBeTruthy();

    const initialHostViewRaw = await asAlice.query(api.game.getPlayerView, {
      matchId: battle.matchId,
      seat: "host",
    });
    const initialHostView = JSON.parse(initialHostViewRaw as string);
    const startedOnCpuTurn = initialHostView.currentTurnPlayer === "away";

    // Nudge only queues when CPU seat is currently active.
    await t.mutation(internal.game.nudgeAITurnAsActor, {
      matchId: battle.matchId,
      actorUserId: aliceUser!._id,
    });

    const queueAfterHostTurn = await t.run(async (ctx: any) => {
      return ctx.db
        .query("aiTurnQueue")
        .withIndex("by_matchId", (q: any) => q.eq("matchId", battle.matchId))
        .collect();
    });
    if (startedOnCpuTurn) {
      expect(queueAfterHostTurn.length).toBeGreaterThan(0);
    } else {
      expect(queueAfterHostTurn.length).toBe(0);
    }

    // Clear any queued jobs before deterministic CPU-turn assertion below.
    await t.run(async (ctx: any) => {
      const rows = await ctx.db
        .query("aiTurnQueue")
        .withIndex("by_matchId", (q: any) => q.eq("matchId", battle.matchId))
        .collect();
      for (const row of rows) {
        await ctx.db.delete(row._id);
      }
    });

    // If host starts, pass turn once so CPU becomes active.
    if (!startedOnCpuTurn) {
      await asAlice.mutation(api.game.submitAction, {
        matchId: battle.matchId,
        command: JSON.stringify({ type: "END_TURN" }),
        seat: "host",
      });
    }

    const hostViewRaw = await asAlice.query(api.game.getPlayerView, {
      matchId: battle.matchId,
      seat: "host",
    });
    const hostView = JSON.parse(hostViewRaw as string);
    expect(hostView.currentTurnPlayer).toBe("away");

    await t.mutation(internal.game.nudgeAITurnAsActor, {
      matchId: battle.matchId,
      actorUserId: aliceUser!._id,
    });

    const queueAfterAiTurnNudge = await t.run(async (ctx: any) => {
      return ctx.db
        .query("aiTurnQueue")
        .withIndex("by_matchId", (q: any) => q.eq("matchId", battle.matchId))
        .collect();
    });
    expect(queueAfterAiTurnNudge.length).toBeGreaterThan(0);
  });
});

describe("agent API mode invariants", () => {
  test("agentStartBattle always provisions a story match with CPU opponent", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const registered = await t.mutation(api.agentAuth.registerAgent, {
      name: "CpuStoryInvariant",
      apiKeyHash: "cpu_story_invariant_hash",
      apiKeyPrefix: "ltcg_cpu_story",
    });
    const chapterId = await getFirstChapterId(t);

    const battle = await t.mutation(api.agentAuth.agentStartBattle, {
      agentUserId: registered.userId,
      chapterId,
      stageNumber: 1,
    });

    const meta = await t.query(internal.game.getMatchMetaAsActor, {
      matchId: battle.matchId,
      actorUserId: registered.userId,
    });
    expect(meta).toBeTruthy();
    expect((meta as any).mode).toBe("story");
    expect((meta as any).awayId).toBe("cpu");
  });

  test("agentJoinMatch rejects story waiting matches (story is CPU-only)", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const chapterId = await getFirstChapterId(t);

    const waitingStoryMatch = await asAlice.mutation(api.game.startStoryBattleForAgent, {
      chapterId,
      stageNumber: 1,
    });

    const joiner = await t.mutation(api.agentAuth.registerAgent, {
      name: "StoryJoinReject",
      apiKeyHash: "story_join_reject_hash",
      apiKeyPrefix: "ltcg_story_join",
    });

    await expect(
      t.mutation(api.agentAuth.agentJoinMatch, {
        agentUserId: joiner.userId,
        matchId: waitingStoryMatch.matchId,
      }),
    ).rejects.toThrow(/Story matches are CPU-only/);
  });
});

// ── Section 18: Spectator deep tests ────────────────────────────────

describe("spectator deep tests", () => {
  test("spectator view reflects game state after actions", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, matchId } = await createActivePvpMatch(t);

    // Advance phase
    await asAlice.mutation(api.game.submitAction, {
      matchId,
      command: JSON.stringify({ type: "ADVANCE_PHASE" }),
      seat: "host",
    });

    const view = await t.query(api.game.getSpectatorView, {
      matchId,
      seat: "host",
    });
    expect(view).not.toBeNull();
    expect(view!.players.agent).toBeTruthy();
    expect(view!.players.opponent).toBeTruthy();
    expect(typeof view!.players.agent.lifePoints).toBe("number");
    expect(typeof view!.players.opponent.lifePoints).toBe("number");
    expect(view!.fields.agent.monsters).toBeTruthy();
    expect(view!.fields.opponent.monsters).toBeTruthy();
  });

  test("spectator view for away seat", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { matchId } = await createActivePvpMatch(t);

    const hostView = await t.query(api.game.getSpectatorView, {
      matchId,
      seat: "host",
    });
    const awayView = await t.query(api.game.getSpectatorView, {
      matchId,
      seat: "away",
    });

    expect(hostView).not.toBeNull();
    expect(awayView).not.toBeNull();
    // Each perspective should be for its own seat
    expect(hostView!.seat).toBe("host");
    expect(awayView!.seat).toBe("away");
  });

  test("spectator events after multiple actions", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, matchId } = await createActivePvpMatch(t);

    // Submit multiple actions
    await asAlice.mutation(api.game.submitAction, {
      matchId,
      command: JSON.stringify({ type: "ADVANCE_PHASE" }),
      seat: "host",
    });
    await asAlice.mutation(api.game.submitAction, {
      matchId,
      command: JSON.stringify({ type: "ADVANCE_PHASE" }),
      seat: "host",
    });

    const result = await t.query(api.game.getSpectatorEventsPaginated, {
      matchId,
      seat: "host",
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(result.page.length).toBeGreaterThan(0);
    for (const entry of result.page) {
      expect(entry.version).toBeTypeOf("number");
      expect(entry.eventType).toBeTypeOf("string");
      expect(entry.summary).toBeTypeOf("string");
      expect(entry.actor).toBeTypeOf("string");
    }
  });
});

// ── Section 19: Match presence edge cases ───────────────────────────

describe("match presence edge cases", () => {
  test("presence with different platforms", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);

    for (const platform of [
      "web",
      "telegram",
      "discord",
      "embedded",
      "agent",
      "cpu",
      "unknown",
    ] as const) {
      await asAlice.mutation(api.game.upsertMatchPresence, {
        matchId: `presence-test-${platform}`,
        platform,
      });
    }

    // Verify all were created
    const rows = await t.run(async (ctx) => {
      return ctx.db.query("matchPresence").collect();
    });
    expect(rows.length).toBe(7);
  });

  test("presence with source field", async () => {
    const t = setupTestConvex();
    const asAlice = await seedUser(t, ALICE, api);

    await asAlice.mutation(api.game.upsertMatchPresence, {
      matchId: "source-test",
      platform: "web",
      source: "game-board-component",
    });

    const row = await t.run(async (ctx) => {
      return ctx.db
        .query("matchPresence")
        .withIndex("by_match", (q: any) => q.eq("matchId", "source-test"))
        .first();
    });
    expect(row).toBeTruthy();
    expect(row!.source).toBe("game-board-component");
  });

  test("presence rejects unauthenticated", async () => {
    const t = setupTestConvex();
    await expect(
      t.mutation(api.game.upsertMatchPresence, {
        matchId: "test",
        platform: "web",
      }),
    ).rejects.toThrow();
  });
});

// ── Section 20: Multi-action game sequences ─────────────────────────

describe("multi-action game sequences", () => {
  test("host can advance through multiple phases", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, matchId } = await createActivePvpMatch(t);

    // Get initial view to know whose turn it is
    const viewJson = await asAlice.query(api.game.getPlayerView, {
      matchId,
      seat: "host",
    });
    const view = JSON.parse(viewJson);

    if (view.currentTurnPlayer === "host") {
      // Advance through draw → standby → main
      for (let i = 0; i < 3; i++) {
        await asAlice.mutation(api.game.submitAction, {
          matchId,
          command: JSON.stringify({ type: "ADVANCE_PHASE" }),
          seat: "host",
        });
      }

      // Verify version advanced
      const version = await t.query(api.game.getLatestSnapshotVersion, {
        matchId,
      });
      expect(version).toBeGreaterThanOrEqual(3);
    }
  });

  test("END_TURN passes to other player", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, asBob, matchId } = await createActivePvpMatch(t);

    // Determine who goes first
    const viewJson = await asAlice.query(api.game.getPlayerView, {
      matchId,
      seat: "host",
    });
    const view = JSON.parse(viewJson);

    if (view.currentTurnPlayer === "host") {
      await asAlice.mutation(api.game.submitAction, {
        matchId,
        command: JSON.stringify({ type: "END_TURN" }),
        seat: "host",
      });

      // After END_TURN, away player should be able to act
      const awayViewJson = await asBob.query(api.game.getPlayerView, {
        matchId,
        seat: "away",
      });
      const awayView = JSON.parse(awayViewJson);
      expect(awayView.currentTurnPlayer).toBe("away");
    } else {
      // Away goes first
      await asBob.mutation(api.game.submitAction, {
        matchId,
        command: JSON.stringify({ type: "END_TURN" }),
        seat: "away",
      });

      const hostViewJson = await asAlice.query(api.game.getPlayerView, {
        matchId,
        seat: "host",
      });
      const hostView = JSON.parse(hostViewJson);
      expect(hostView.currentTurnPlayer).toBe("host");
    }
  });

  test("getRecentEvents accumulates across actions", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, matchId } = await createActivePvpMatch(t);

    const eventsBefore = await asAlice.query(api.game.getRecentEvents, {
      matchId,
      sinceVersion: 0,
    });
    const countBefore = eventsBefore.length;

    await asAlice.mutation(api.game.submitAction, {
      matchId,
      command: JSON.stringify({ type: "ADVANCE_PHASE" }),
      seat: "host",
    });

    const eventsAfter = await asAlice.query(api.game.getRecentEvents, {
      matchId,
      sinceVersion: 0,
    });
    expect(eventsAfter.length).toBeGreaterThan(countBefore);
  });

  test("snapshot version increases with actions", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, matchId } = await createActivePvpMatch(t);

    const versionBefore = await t.query(api.game.getLatestSnapshotVersion, {
      matchId,
    });

    await asAlice.mutation(api.game.submitAction, {
      matchId,
      command: JSON.stringify({ type: "ADVANCE_PHASE" }),
      seat: "host",
    });

    const versionAfter = await t.query(api.game.getLatestSnapshotVersion, {
      matchId,
    });
    expect(versionAfter).toBeGreaterThan(versionBefore);
  });
});

// ── Section 21: Deck management edge cases ──────────────────────────

describe("deck management edge cases", () => {
  test("multiple decks can be created", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);

    const deck1 = await asAlice.mutation(api.game.createDeck, {
      name: "Deck One",
    });
    const deck2 = await asAlice.mutation(api.game.createDeck, {
      name: "Deck Two",
    });

    expect(deck1).not.toBe(deck2);

    const decks = await asAlice.query(api.game.getUserDecks, {});
    // At least 3: starter + 2 custom
    expect(decks.length).toBeGreaterThanOrEqual(3);
  });

  test("switching active deck between created decks", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice, deckId: starterDeckId } = await seedUserWithDeck(
      t,
      ALICE,
    );

    const newDeckId = await asAlice.mutation(api.game.createDeck, {
      name: "Custom Deck",
    });

    // Save valid cards to new deck
    const ownedCards = await asAlice.query(api.game.getUserCardCounts, {});
    await asAlice.mutation(api.game.saveDeck, {
      deckId: newDeckId,
      cards: ownedCards.map((c: any) => ({
        cardDefinitionId: c.cardDefinitionId,
        quantity: c.quantity,
      })),
    });

    // Switch to new deck
    await asAlice.mutation(api.game.setActiveDeck, { deckId: newDeckId });

    const user = await t.run(async (ctx) => {
      return ctx.db
        .query("users")
        .withIndex("by_privyId", (q: any) =>
          q.eq("privyId", ALICE.subject),
        )
        .first();
    });
    expect(user!.activeDeckId).toBe(newDeckId);

    // Switch back
    await asAlice.mutation(api.game.setActiveDeck, {
      deckId: starterDeckId,
    });
    const userAfter = await t.run(async (ctx) => {
      return ctx.db
        .query("users")
        .withIndex("by_privyId", (q: any) =>
          q.eq("privyId", ALICE.subject),
        )
        .first();
    });
    expect(userAfter!.activeDeckId).toBe(starterDeckId);
  });

  test("getDeckWithCards returns null for whitespace deckId", async () => {
    const t = setupTestConvex();
    const deck = await t.query(api.game.getDeckWithCards, { deckId: "   " });
    expect(deck).toBeNull();
  });

  test("getDeckWithCards returns null for 'skip'", async () => {
    const t = setupTestConvex();
    const deck = await t.query(api.game.getDeckWithCards, { deckId: "skip" });
    expect(deck).toBeNull();
  });

  test("selectStarterDeck for different archetypes", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const asAlice = await seedUser(t, ALICE, api);
    const asBob = await seedUser(t, BOB, api);

    const starters = await t.query(api.game.getStarterDecks, {});
    expect(starters.length).toBeGreaterThanOrEqual(2);

    const result1 = await asAlice.mutation(api.game.selectStarterDeck, {
      deckCode: starters[0]!.deckCode,
    });
    const result2 = await asBob.mutation(api.game.selectStarterDeck, {
      deckCode: starters[1]!.deckCode,
    });

    expect(result1.deckId).toBeTruthy();
    expect(result2.deckId).toBeTruthy();
    expect(result1.deckId).not.toBe(result2.deckId);
  });
});

// ── Section 22: Story match context and narrative ───────────────────

describe("story match context and narrative", () => {
  test("getStoryMatchContext returns expected shape for active match", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const chapterId = await getFirstChapterId(t);

    const battle = await asAlice.mutation(api.game.startStoryBattle, {
      chapterId,
      stageNumber: 1,
    });

    const context = await t.query(api.game.getStoryMatchContext, {
      matchId: battle.matchId,
    });
    expect(context).not.toBeNull();
    expect(context!.matchId).toBe(battle.matchId);
    expect(context!.chapterId).toBe(chapterId);
    expect(context!.stageNumber).toBe(1);
    expect(context!.userId).toBeTruthy();
    expect(context!.stageId).toBeTruthy();
    expect(context!.outcome).toBeNull();
    expect(context!.starsEarned).toBeNull();
  });

  test("getChapterStages returns 3 stages per chapter", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const chapters = await t.query(api.game.getChapters, {});
    // Check first 3 chapters all have 3 stages
    for (const chapter of chapters.slice(0, 3)) {
      const stages = await t.query(api.game.getChapterStages, {
        chapterId: chapter._id,
      });
      expect(stages.length).toBe(3);
      for (const stage of stages) {
        expect(stage.stageNumber).toBeTypeOf("number");
      }
    }
  });

  test("getStageWithNarrative has postMatchLoseDialogue", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const chapterId = await getFirstChapterId(t);

    const stage = await t.query(api.game.getStageWithNarrative, {
      chapterId,
      stageNumber: 1,
    });
    expect(stage).not.toBeNull();
    expect(
      Array.isArray(stage!.narrative.postMatchLoseDialogue),
    ).toBe(true);
  });

  test("chapters are ordered by act and chapter number", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const chapters = await t.query(api.game.getChapters, {});
    expect(chapters.length).toBe(16);

    // Verify we have 4 acts
    const acts = new Set(chapters.map((c: any) => c.actNumber));
    expect(acts.size).toBe(4);
  });
});

// ── Section 23: Card catalog consistency ────────────────────────────

describe("card catalog consistency", () => {
  test("all 6 archetypes are represented in catalog", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const catalog = await t.query(api.game.getCatalogCards, {});
    const archetypes = new Set(
      catalog
        .map((c: any) => c.archetype)
        .filter((a: any) => typeof a === "string"),
    );
    // 6 archetypes: dropout, prep, geek, freak, nerd, goodie
    expect(archetypes.size).toBeGreaterThanOrEqual(6);
  });

  test("all card types present (stereotype, spell, trap)", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const catalog = await t.query(api.game.getCatalogCards, {});
    const types = new Set(catalog.map((c: any) => c.cardType));
    expect(types.has("stereotype")).toBe(true);
    expect(types.has("spell")).toBe(true);
    expect(types.has("trap")).toBe(true);
  });

  test("starter deck card counts are >= 30", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);

    const counts = await asAlice.query(api.game.getUserCardCounts, {});
    const totalCards = counts.reduce(
      (sum: number, c: any) => sum + c.quantity,
      0,
    );
    expect(totalCards).toBeGreaterThanOrEqual(30);
  });
});

// ── Section 24: Pure helper functions (unit tests) ──────────────────

describe("getDeckCardIdsFromDeckData", () => {
  test("expands cards with quantity into flat array", () => {
    const deckData = {
      cards: [
        { cardDefinitionId: "a", quantity: 3 },
        { cardDefinitionId: "b", quantity: 2 },
      ],
    };
    const ids = getDeckCardIdsFromDeckData(deckData);
    expect(ids).toEqual(["a", "a", "a", "b", "b"]);
  });

  test("defaults quantity to 1 if missing", () => {
    const deckData = { cards: [{ cardDefinitionId: "x" }] };
    const ids = getDeckCardIdsFromDeckData(deckData);
    expect(ids).toEqual(["x"]);
  });

  test("returns empty array for missing cards field", () => {
    expect(getDeckCardIdsFromDeckData({})).toEqual([]);
    expect(getDeckCardIdsFromDeckData({ cards: null })).toEqual([]);
    // null deckData returns empty array (null guard added)
    expect(getDeckCardIdsFromDeckData(null)).toEqual([]);
  });
});

describe("findStageByNumber", () => {
  test("finds stage matching stageNumber", () => {
    const stages = [
      { stageNumber: 1, name: "one" },
      { stageNumber: 2, name: "two" },
      { stageNumber: 3, name: "three" },
    ];
    expect(findStageByNumber(stages, 2)).toEqual({ stageNumber: 2, name: "two" });
  });

  test("returns undefined for missing stageNumber", () => {
    const stages = [{ stageNumber: 1 }];
    expect(findStageByNumber(stages, 99)).toBeUndefined();
  });

  test("returns undefined for empty/null stages", () => {
    expect(findStageByNumber([], 1)).toBeUndefined();
    expect(findStageByNumber(null, 1)).toBeUndefined();
  });
});

describe("normalizeFirstClearBonus", () => {
  test("passes through finite number", () => {
    expect(normalizeFirstClearBonus(42)).toBe(42);
  });

  test("returns 0 for Infinity", () => {
    expect(normalizeFirstClearBonus(Infinity)).toBe(0);
  });

  test("returns 0 for NaN", () => {
    expect(normalizeFirstClearBonus(NaN)).toBe(0);
  });

  test("returns 0 for null/undefined/string", () => {
    expect(normalizeFirstClearBonus(null)).toBe(0);
    expect(normalizeFirstClearBonus(undefined)).toBe(0);
    expect(normalizeFirstClearBonus("hello")).toBe(0);
  });

  test("sums gold+xp+gems from object", () => {
    expect(normalizeFirstClearBonus({ gold: 10, xp: 20, gems: 5 })).toBe(35);
  });

  test("handles partial object with missing fields", () => {
    expect(normalizeFirstClearBonus({ gold: 10 })).toBe(10);
    expect(normalizeFirstClearBonus({})).toBe(0);
  });
});

// ── Section 25: Off-turn surrender (engine fix validation) ──────────

describe("off-turn surrender", () => {
  test("away player can surrender on host's turn", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asBob, matchId } = await createActivePvpMatch(t);

    // It's host's turn at start, but away can now surrender
    await asBob.mutation(api.game.submitAction, {
      matchId,
      command: JSON.stringify({ type: "SURRENDER" }),
      seat: "away",
    });

    const meta = await asBob.query(api.game.getMatchMeta, { matchId });
    expect((meta as any).status).toBe("ended");
    expect((meta as any).winner).toBe("host");
  });

  test("host can surrender on away's turn", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, matchId } = await createActivePvpMatch(t);

    // Advance through host turn to give away the turn
    await asAlice.mutation(api.game.submitAction, {
      matchId,
      command: JSON.stringify({ type: "END_TURN" }),
      seat: "host",
    });

    // Now it's away's turn — host surrenders
    await asAlice.mutation(api.game.submitAction, {
      matchId,
      command: JSON.stringify({ type: "SURRENDER" }),
      seat: "host",
    });

    const meta = await asAlice.query(api.game.getMatchMeta, { matchId });
    expect((meta as any).status).toBe("ended");
    expect((meta as any).winner).toBe("away");
  });
});

// ── Section 26: joinPvpLobby deep validation ────────────────────────

describe("joinPvpLobby deep validation", () => {
  test("rejects unauthenticated join", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { matchId } = await createActivePvpMatchPartial(t);

    await expect(
      t.mutation(api.game.joinPvpLobby, { matchId }),
    ).rejects.toThrow();
  });

  test("joinPvpLobbyByCode with no matching waiting lobby", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);

    await expect(
      asAlice.mutation(api.game.joinPvpLobbyByCode, { joinCode: "ZZZZZZ" }),
    ).rejects.toThrow(/No waiting lobby found/);
  });

  test("joinPvpLobbyByCode with empty code", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);

    await expect(
      asAlice.mutation(api.game.joinPvpLobbyByCode, { joinCode: "" }),
    ).rejects.toThrow(/6-character/);
  });

  test("cancelPvpLobby rejects already-active lobby", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, matchId } = await createActivePvpMatch(t);

    await expect(
      asAlice.mutation(api.game.cancelPvpLobby, { matchId }),
    ).rejects.toThrow(/not cancelable/);
  });

  test("cancelPvpLobby rejects nonexistent matchId", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);

    await expect(
      asAlice.mutation(api.game.cancelPvpLobby, { matchId: "nonexistent" }),
    ).rejects.toThrow(/not found/);
  });
});

// ── Section 27: Story stage unlock guards ───────────────────────────

describe("story stage unlock guards", () => {
  test("stage 2 requires stage 1 cleared", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const chapterId = await getFirstChapterId(t);

    await expect(
      asAlice.mutation(api.game.startStoryBattle, {
        chapterId,
        stageNumber: 2,
      }),
    ).rejects.toThrow(/Stage 1 must be cleared first/);
  });

  test("stage 3 requires stage 2 cleared", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const chapterId = await getFirstChapterId(t);

    await expect(
      asAlice.mutation(api.game.startStoryBattle, {
        chapterId,
        stageNumber: 3,
      }),
    ).rejects.toThrow(/Stage 2 must be cleared first/);
  });

  test("invalid chapterId rejects", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);

    await expect(
      asAlice.mutation(api.game.startStoryBattle, {
        chapterId: "bogus-chapter-id",
        stageNumber: 1,
      }),
    ).rejects.toThrow();
  });

  test("invalid stageNumber rejects", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const chapterId = await getFirstChapterId(t);

    await expect(
      asAlice.mutation(api.game.startStoryBattle, {
        chapterId,
        stageNumber: 99,
      }),
    ).rejects.toThrow(/Stage 99 not found/);
  });
});

// ── Section 28: completeStoryStage edge cases ───────────────────────

describe("completeStoryStage edge cases", () => {
  test("rejects completing an active (non-ended) match", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const chapterId = await getFirstChapterId(t);

    const result = await asAlice.mutation(api.game.startStoryBattle, {
      chapterId,
      stageNumber: 1,
    });

    await expect(
      asAlice.mutation(api.game.completeStoryStage, {
        matchId: result.matchId,
      }),
    ).rejects.toThrow(/not ended/i);
  });

  test("rejects non-story match", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, matchId } = await createActivePvpMatch(t);

    await expect(
      asAlice.mutation(api.game.completeStoryStage, { matchId }),
    ).rejects.toThrow();
  });

  test("rejects wrong user completing another's story match", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const { asUser: asBob } = await seedUserWithDeck(t, BOB);
    const chapterId = await getFirstChapterId(t);

    const result = await asAlice.mutation(api.game.startStoryBattle, {
      chapterId,
      stageNumber: 1,
    });

    // Surrender to end the match
    await asAlice.mutation(api.game.submitAction, {
      matchId: result.matchId,
      command: JSON.stringify({ type: "SURRENDER" }),
      seat: "host",
    });

    // Bob tries to complete Alice's match
    await expect(
      asBob.mutation(api.game.completeStoryStage, {
        matchId: result.matchId,
      }),
    ).rejects.toThrow(/Not your match/);
  });

  test("idempotent: completing twice returns cached outcome", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const chapterId = await getFirstChapterId(t);

    const battle = await asAlice.mutation(api.game.startStoryBattle, {
      chapterId,
      stageNumber: 1,
    });

    // Surrender to end match
    await asAlice.mutation(api.game.submitAction, {
      matchId: battle.matchId,
      command: JSON.stringify({ type: "SURRENDER" }),
      seat: "host",
    });

    const first = await asAlice.mutation(api.game.completeStoryStage, {
      matchId: battle.matchId,
    });
    const second = await asAlice.mutation(api.game.completeStoryStage, {
      matchId: battle.matchId,
    });

    expect(first.outcome).toBe(second.outcome);
    expect(first.starsEarned).toBe(second.starsEarned);
  });

  test("lost game awards 0 stars", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const chapterId = await getFirstChapterId(t);

    const battle = await asAlice.mutation(api.game.startStoryBattle, {
      chapterId,
      stageNumber: 1,
    });

    // Surrender = loss
    await asAlice.mutation(api.game.submitAction, {
      matchId: battle.matchId,
      command: JSON.stringify({ type: "SURRENDER" }),
      seat: "host",
    });

    const result = await asAlice.mutation(api.game.completeStoryStage, {
      matchId: battle.matchId,
    });

    expect(result.outcome).toBe("lost");
    expect(result.starsEarned).toBe(0);
  });

  test("rejects unauthenticated completeStoryStage", async () => {
    const t = setupTestConvex();
    await expect(
      t.mutation(api.game.completeStoryStage, { matchId: "any" }),
    ).rejects.toThrow();
  });
});

// ── Section 29: cancelWaitingStoryMatch deep ────────────────────────

describe("cancelWaitingStoryMatch deep", () => {
  test("cancels a waiting story match successfully", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const chapterId = await getFirstChapterId(t);

    const battle = await asAlice.mutation(api.game.startStoryBattleForAgent, {
      chapterId,
      stageNumber: 1,
    });

    const result = await asAlice.mutation(api.game.cancelWaitingStoryMatch, {
      matchId: battle.matchId,
    });
    expect(result).toBeTruthy();
  });

  test("rejects non-host cancellation", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const { asUser: asBob } = await seedUserWithDeck(t, BOB);
    const chapterId = await getFirstChapterId(t);

    const battle = await asAlice.mutation(api.game.startStoryBattleForAgent, {
      chapterId,
      stageNumber: 1,
    });

    await expect(
      asBob.mutation(api.game.cancelWaitingStoryMatch, {
        matchId: battle.matchId,
      }),
    ).rejects.toThrow();
  });

  test("rejects cancel of active (started) match", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const chapterId = await getFirstChapterId(t);

    // startStoryBattle (not ForAgent) creates + starts the match
    const battle = await asAlice.mutation(api.game.startStoryBattle, {
      chapterId,
      stageNumber: 1,
    });

    await expect(
      asAlice.mutation(api.game.cancelWaitingStoryMatch, {
        matchId: battle.matchId,
      }),
    ).rejects.toThrow();
  });

  test("rejects unauthenticated cancel", async () => {
    const t = setupTestConvex();
    await expect(
      t.mutation(api.game.cancelWaitingStoryMatch, { matchId: "any" }),
    ).rejects.toThrow();
  });
});

// ── Section 30: PvP lobby visibility and code mechanics ─────────────

describe("PvP lobby visibility and code mechanics", () => {
  test("private lobby has a 6-char join code", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);

    const lobby = await asAlice.mutation(api.game.createPvpLobby, {
      visibility: "private",
    });
    expect(lobby.joinCode).toBeTruthy();
    expect(lobby.joinCode!.length).toBe(6);
  });

  test("public lobby has no join code", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);

    const lobby = await asAlice.mutation(api.game.createPvpLobby, {
      visibility: "public",
    });
    // Public lobbies might have undefined or null joinCode
    expect(!lobby.joinCode || lobby.joinCode === "").toBe(true);
  });

  test("private lobby join with wrong code rejects", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const { asUser: asBob } = await seedUserWithDeck(t, BOB);

    const lobby = await asAlice.mutation(api.game.createPvpLobby, {
      visibility: "private",
    });

    await expect(
      asBob.mutation(api.game.joinPvpLobby, {
        matchId: lobby.matchId,
        joinCode: "WRONG1",
      }),
    ).rejects.toThrow(/Invalid private lobby join code/);
  });

  test("private lobby join with correct code succeeds", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const { asUser: asBob } = await seedUserWithDeck(t, BOB);

    const lobby = await asAlice.mutation(api.game.createPvpLobby, {
      visibility: "private",
    });

    const result = await asBob.mutation(api.game.joinPvpLobby, {
      matchId: lobby.matchId,
      joinCode: lobby.joinCode!,
    });
    expect(result.seat).toBe("away");
    expect(result.status).toBe("active");
  });

  test("private lobby join with lowercase code succeeds (case-insensitive)", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const { asUser: asBob } = await seedUserWithDeck(t, BOB);

    const lobby = await asAlice.mutation(api.game.createPvpLobby, {
      visibility: "private",
    });

    const result = await asBob.mutation(api.game.joinPvpLobby, {
      matchId: lobby.matchId,
      joinCode: lobby.joinCode!.toLowerCase(),
    });
    expect(result.seat).toBe("away");
  });

  test("joinPvpLobbyByCode finds correct private lobby", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    const { asUser: asBob } = await seedUserWithDeck(t, BOB);

    const lobby = await asAlice.mutation(api.game.createPvpLobby, {
      visibility: "private",
    });

    const result = await asBob.mutation(api.game.joinPvpLobbyByCode, {
      joinCode: lobby.joinCode!,
    });
    expect(result.seat).toBe("away");
    expect(result.matchId).toBe(lobby.matchId);
  });
});

// ── Section 31: createDeck and saveDeck edge cases ──────────────────

describe("createDeck and saveDeck edge cases", () => {
  test("createDeck returns deckId for authenticated user", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);

    const deckId = await asAlice.mutation(api.game.createDeck, {
      name: "custom-deck",
    });
    expect(typeof deckId).toBe("string");
    expect(deckId.length).toBeGreaterThan(0);
  });

  test("createDeck rejects unauthenticated", async () => {
    const t = setupTestConvex();
    await expect(
      t.mutation(api.game.createDeck, { name: "test" }),
    ).rejects.toThrow();
  });

  test("saveDeck with owned cards round-trips correctly", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);

    // Get owned cards — use only what's owned, ensuring >= 30 total
    const counts = await asAlice.query(api.game.getUserCardCounts, {});
    const cards: { cardDefinitionId: string; quantity: number }[] = [];
    let total = 0;
    for (const c of counts as any[]) {
      if (total >= 30) break;
      const qty = Math.min(c.quantity, 30 - total);
      cards.push({ cardDefinitionId: c.cardDefinitionId, quantity: qty });
      total += qty;
    }

    // Create a deck and save
    const deckId = await asAlice.mutation(api.game.createDeck, {
      name: "save-test",
    });
    await asAlice.mutation(api.game.saveDeck, { deckId, cards });

    // Verify
    const deckWithCards = await asAlice.query(api.game.getDeckWithCards, {
      deckId,
    });
    expect(deckWithCards).toBeTruthy();
    expect((deckWithCards as any).cards.length).toBe(cards.length);
  });
});

// ── Section 32: selectStarterDeck edge cases ────────────────────────

describe("selectStarterDeck edge cases", () => {
  test("re-selecting same archetype returns existing deck", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const asAlice = await seedUser(t, ALICE, api);
    const starters = await t.query(api.game.getStarterDecks, {});
    const code = starters[0]!.deckCode;

    const first = await asAlice.mutation(api.game.selectStarterDeck, {
      deckCode: code,
    });
    const second = await asAlice.mutation(api.game.selectStarterDeck, {
      deckCode: code,
    });

    expect(first.deckId).toBe(second.deckId);
  });

  test("selecting different archetype after first returns new or existing deck", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const asAlice = await seedUser(t, ALICE, api);
    const starters = await t.query(api.game.getStarterDecks, {});

    const first = await asAlice.mutation(api.game.selectStarterDeck, {
      deckCode: starters[0]!.deckCode,
    });
    // Second selection re-resolves to existing deck (dedup logic)
    const second = await asAlice.mutation(api.game.selectStarterDeck, {
      deckCode: starters[1]!.deckCode,
    });

    // Both return valid deckIds
    expect(first.deckId).toBeTruthy();
    expect(second.deckId).toBeTruthy();
  });

  test("unknown deckCode throws", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const asAlice = await seedUser(t, ALICE, api);

    await expect(
      asAlice.mutation(api.game.selectStarterDeck, {
        deckCode: "nonexistent_archetype_starter",
      }),
    ).rejects.toThrow();
  });
});

// ── Section 33: submitAction validation edge cases ──────────────────

describe("submitAction validation edge cases", () => {
  test("invalid JSON command rejects", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, matchId } = await createActivePvpMatch(t);

    await expect(
      asAlice.mutation(api.game.submitAction, {
        matchId,
        command: "not json{",
        seat: "host",
      }),
    ).rejects.toThrow();
  });

  test("action on ended match rejects", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, matchId } = await createActivePvpMatch(t);

    // End the match
    await asAlice.mutation(api.game.submitAction, {
      matchId,
      command: JSON.stringify({ type: "SURRENDER" }),
      seat: "host",
    });

    // Try to act on ended match
    await expect(
      asAlice.mutation(api.game.submitAction, {
        matchId,
        command: JSON.stringify({ type: "ADVANCE_PHASE" }),
        seat: "host",
      }),
    ).rejects.toThrow();
  });

  test("non-participant rejects", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { matchId } = await createActivePvpMatch(t);
    const { asUser: asCharlie } = await seedUserWithDeck(t, CHARLIE);

    await expect(
      asCharlie.mutation(api.game.submitAction, {
        matchId,
        command: JSON.stringify({ type: "ADVANCE_PHASE" }),
        seat: "host",
      }),
    ).rejects.toThrow(/not a participant/);
  });

  test("wrong seat assignment rejects", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, matchId } = await createActivePvpMatch(t);

    // Alice is host, tries to act as away
    await expect(
      asAlice.mutation(api.game.submitAction, {
        matchId,
        command: JSON.stringify({ type: "ADVANCE_PHASE" }),
        seat: "away",
      }),
    ).rejects.toThrow(/only access your own seat/);
  });

  test("expectedVersion mismatch rejects", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, matchId } = await createActivePvpMatch(t);

    // Submit with wrong expectedVersion
    await expect(
      asAlice.mutation(api.game.submitAction, {
        matchId,
        command: JSON.stringify({ type: "ADVANCE_PHASE" }),
        seat: "host",
        expectedVersion: 999,
      }),
    ).rejects.toThrow(/version mismatch/);
  });
});

// ── Section 34: getPlayerView validation ────────────────────────────

describe("getPlayerView validation", () => {
  test("host can view host seat", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, matchId } = await createActivePvpMatch(t);

    const view = await asAlice.query(api.game.getPlayerView, {
      matchId,
      seat: "host",
    });
    expect(view).toBeTruthy();
    const parsed = JSON.parse(view);
    expect(parsed.currentPhase).toBeTruthy();
  });

  test("away can view away seat", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asBob, matchId } = await createActivePvpMatch(t);

    const view = await asBob.query(api.game.getPlayerView, {
      matchId,
      seat: "away",
    });
    expect(view).toBeTruthy();
  });

  test("host cannot view away seat", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, matchId } = await createActivePvpMatch(t);

    await expect(
      asAlice.query(api.game.getPlayerView, { matchId, seat: "away" }),
    ).rejects.toThrow(/only access your own seat/);
  });

  test("away cannot view host seat", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asBob, matchId } = await createActivePvpMatch(t);

    await expect(
      asBob.query(api.game.getPlayerView, { matchId, seat: "host" }),
    ).rejects.toThrow(/only access your own seat/);
  });

  test("non-participant cannot view any seat", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { matchId } = await createActivePvpMatch(t);
    const { asUser: asCharlie } = await seedUserWithDeck(t, CHARLIE);

    await expect(
      asCharlie.query(api.game.getPlayerView, { matchId, seat: "host" }),
    ).rejects.toThrow(/not a participant/);
  });
});

// ── Section 35: Lobby pong/redemption options ───────────────────────

describe("lobby pong/redemption options", () => {
  test("creates lobby with pongEnabled", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);

    const lobby = await asAlice.mutation(api.game.createPvpLobby, {
      pongEnabled: true,
    });
    expect(lobby.matchId).toBeTruthy();
  });

  test("creates lobby with redemptionEnabled", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);

    const lobby = await asAlice.mutation(api.game.createPvpLobby, {
      redemptionEnabled: true,
    });
    expect(lobby.matchId).toBeTruthy();
  });

  test("creates lobby with both options", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);

    const lobby = await asAlice.mutation(api.game.createPvpLobby, {
      pongEnabled: true,
      redemptionEnabled: true,
    });
    expect(lobby.matchId).toBeTruthy();
  });
});

// ── Section 36: getOpenPrompt and getActiveMatchByHost ───────────────

describe("getOpenPrompt and getActiveMatchByHost extended", () => {
  test("getOpenPrompt returns null for non-chain state", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, matchId } = await createActivePvpMatch(t);

    const prompt = await asAlice.query(api.game.getOpenPrompt, {
      matchId,
      seat: "host",
    });
    // No chain in progress at game start
    expect(prompt).toBeNull();
  });

  test("getActiveMatchByHost returns match after PvP join", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { matchId } = await createActivePvpMatch(t);

    // Get Alice's userId
    const aliceUser = await t.run(async (ctx) => {
      return ctx.db
        .query("users")
        .withIndex("by_privyId", (q: any) => q.eq("privyId", ALICE.subject))
        .first();
    });

    const activeMatch = await t.query(api.game.getActiveMatchByHost, {
      hostId: aliceUser!._id,
    });
    expect(activeMatch).toBeTruthy();
  });

  test("getActiveMatchByHost returns null for unknown hostId", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const activeMatch = await t.query(api.game.getActiveMatchByHost, {
      hostId: "unknown-user-id",
    });
    expect(activeMatch).toBeNull();
  });
});

// ── Section 37: Match presence lifecycle ─────────────────────────────

describe("match presence lifecycle", () => {
  test("upsert creates then updates presence", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, matchId } = await createActivePvpMatch(t);

    // First upsert creates
    await asAlice.mutation(api.game.upsertMatchPresence, {
      matchId,
      platform: "web",
    });

    // Second upsert updates
    await asAlice.mutation(api.game.upsertMatchPresence, {
      matchId,
      platform: "telegram",
    });

    // Verify only one presence row exists
    const presenceRows = await t.run(async (ctx) => {
      return ctx.db
        .query("matchPresence")
        .withIndex("by_match", (q: any) => q.eq("matchId", matchId))
        .collect();
    });

    const aliceUser = await t.run(async (ctx) => {
      return ctx.db
        .query("users")
        .withIndex("by_privyId", (q: any) => q.eq("privyId", ALICE.subject))
        .first();
    });

    const alicePresence = presenceRows.filter(
      (r: any) => r.userId === aliceUser!._id,
    );
    expect(alicePresence.length).toBe(1);
    expect(alicePresence[0].platform).toBe("telegram");
  });

  test("both players can have presence in same match", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { asAlice, asBob, matchId } = await createActivePvpMatch(t);

    await asAlice.mutation(api.game.upsertMatchPresence, {
      matchId,
      platform: "web",
    });
    await asBob.mutation(api.game.upsertMatchPresence, {
      matchId,
      platform: "telegram",
    });

    const presenceRows = await t.run(async (ctx) => {
      return ctx.db
        .query("matchPresence")
        .withIndex("by_match", (q: any) => q.eq("matchId", matchId))
        .collect();
    });
    expect(presenceRows.length).toBe(2);
  });
});

// ── Section 38: Spectator queries edge cases ─────────────────────────

describe("spectator queries edge cases", () => {
  test("getSpectatorView works without authentication", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { matchId } = await createActivePvpMatch(t);

    // No identity — spectator is public
    const view = await t.query(api.game.getSpectatorView, {
      matchId,
      seat: "host",
    });
    expect(view).toBeTruthy();
  });

  test("getSpectatorView for both seats", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { matchId } = await createActivePvpMatch(t);

    const hostView = await t.query(api.game.getSpectatorView, {
      matchId,
      seat: "host",
    });
    const awayView = await t.query(api.game.getSpectatorView, {
      matchId,
      seat: "away",
    });

    expect(hostView).toBeTruthy();
    expect(awayView).toBeTruthy();
  });

  test("getSpectatorEventsPaginated returns pagination shape", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});
    const { matchId } = await createActivePvpMatch(t);

    const result = await t.query(api.game.getSpectatorEventsPaginated, {
      matchId,
      seat: "host",
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(result).toBeTruthy();
    expect(result).toHaveProperty("page");
    expect(result).toHaveProperty("isDone");
    expect(result).toHaveProperty("continueCursor");
  });
});

// ── Section 39: Determinism + legacy command compatibility ──────────

describe("deterministic start + legacy command resolution", () => {
  test("startMatch_deterministic_first_player_for_pvp_join", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const { asAlice, matchId } = await createActivePvpMatch(t);
    const meta = (await asAlice.query(api.game.getMatchMeta, { matchId })) as any;
    const hostViewRaw = await asAlice.query(api.game.getPlayerView, { matchId, seat: "host" });
    const hostView = JSON.parse(hostViewRaw as string) as any;

    const seed = buildMatchSeed([
      "pvpLobbyJoin",
      meta.hostId,
      meta.awayId,
      buildDeckSeedPart(meta.hostDeck),
      buildDeckSeedPart(meta.awayDeck),
    ]);
    const expectedFirstPlayer = seed % 2 === 0 ? "host" : "away";
    expect(hostView.currentTurnPlayer).toBe(expectedFirstPlayer);
  });

  test("agentJoinMatch_deterministic_first_player", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const { asUser: asAlice } = await seedUserWithDeck(t, ALICE);
    await seedUserWithDeck(t, BOB);

    const lobby = await asAlice.mutation(api.game.createPvpLobby, {});

    const aliceUser = await t.run(async (ctx) =>
      ctx.db
        .query("users")
        .withIndex("by_privyId", (q: any) => q.eq("privyId", ALICE.subject))
        .first(),
    );
    const bobUser = await t.run(async (ctx) =>
      ctx.db
        .query("users")
        .withIndex("by_privyId", (q: any) => q.eq("privyId", BOB.subject))
        .first(),
    );

    await t.mutation(api.agentAuth.agentJoinMatch, {
      agentUserId: bobUser!._id,
      matchId: lobby.matchId,
    });

    const meta = await asAlice.query(api.game.getMatchMeta, { matchId: lobby.matchId }) as any;
    const hostViewRaw = await asAlice.query(api.game.getPlayerView, {
      matchId: lobby.matchId,
      seat: "host",
    });
    const hostView = JSON.parse(hostViewRaw as string) as any;
    const seed = buildMatchSeed([
      "agentJoinMatch",
      String(meta.hostId),
      String(bobUser!._id),
      buildDeckSeedPart(meta.hostDeck),
      buildDeckSeedPart(meta.awayDeck),
    ]);
    const expectedFirstPlayer = seed % 2 === 0 ? "host" : "away";
    expect(hostView.currentTurnPlayer).toBe(expectedFirstPlayer);
    expect(String(meta.hostId)).toBe(String(aliceUser!._id));
  });

  test("rejects ambiguous legacy board id commands", async () => {
    const duplicateDefinitionId = "dup_monster_def";
    const viewJson = JSON.stringify({
      hand: [],
      board: [
        { cardId: "h:1:dup_monster_def", definitionId: duplicateDefinitionId, faceDown: false },
        { cardId: "h:2:dup_monster_def", definitionId: duplicateDefinitionId, faceDown: false },
      ],
      spellTrapZone: [],
      fieldSpell: null,
      graveyard: [],
      banished: [],
      opponentBoard: [],
      opponentSpellTrapZone: [],
      opponentFieldSpell: null,
      opponentGraveyard: [],
      opponentBanished: [],
      instanceDefinitions: {
        "h:1:dup_monster_def": duplicateDefinitionId,
        "h:2:dup_monster_def": duplicateDefinitionId,
      },
    });

    expect(() =>
      gameTestHelpers.resolveLegacyCommandPayload(
        JSON.stringify({
          type: "CHANGE_POSITION",
          cardId: duplicateDefinitionId,
        }),
        viewJson,
      ),
    ).toThrow(/Ambiguous legacy cardId/);
  });

  test("legacy hand definition id command resolves deterministically", async () => {
    const duplicateDefinitionId = "dup_monster_def";
    const firstInstance = "h:1:dup_monster_def";
    const secondInstance = "h:2:dup_monster_def";
    const viewJson = JSON.stringify({
      hand: [firstInstance, secondInstance],
      board: [],
      spellTrapZone: [],
      fieldSpell: null,
      graveyard: [],
      banished: [],
      opponentBoard: [],
      opponentSpellTrapZone: [],
      opponentFieldSpell: null,
      opponentGraveyard: [],
      opponentBanished: [],
      instanceDefinitions: {
        [firstInstance]: duplicateDefinitionId,
        [secondInstance]: duplicateDefinitionId,
      },
    });

    const resolvedCommand = gameTestHelpers.resolveLegacyCommandPayload(
      JSON.stringify({
        type: "SUMMON",
        cardId: duplicateDefinitionId,
        position: "attack",
      }),
      viewJson,
    );
    const parsed = JSON.parse(resolvedCommand) as Record<string, unknown>;
    expect(parsed.cardId).toBe(firstInstance);
  });
});
