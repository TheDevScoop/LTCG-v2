/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import { buildDeckSeedPart, buildMatchSeed } from "../agentSeed";
import { ALICE, BOB, seedUser, setupTestConvex } from "./setup.test-helpers";

function expandDeckCards(cards: Array<{ cardDefinitionId: string; quantity: number }>): string[] {
  const expanded: string[] = [];
  for (const entry of cards) {
    const count = Number(entry.quantity ?? 0);
    for (let i = 0; i < count; i += 1) {
      expanded.push(entry.cardDefinitionId);
    }
  }
  return expanded;
}

describe("match.startMatch", () => {
  test("builds deterministic canonical initial state", async () => {
    const t = setupTestConvex();
    await t.mutation(api.seed.seedAll, {});

    const asAlice = await seedUser(t, ALICE, api);
    const asBob = await seedUser(t, BOB, api);
    const starters = await t.query(api.game.getStarterDecks, {});
    const starterCode = starters[0]!.deckCode;

    const aliceStarter = await asAlice.mutation(api.game.selectStarterDeck, { deckCode: starterCode });
    const bobStarter = await asBob.mutation(api.game.selectStarterDeck, { deckCode: starterCode });

    const aliceDeck = await asAlice.query(api.game.getDeckWithCards, { deckId: aliceStarter.deckId });
    const bobDeck = await asBob.query(api.game.getDeckWithCards, { deckId: bobStarter.deckId });
    expect(aliceDeck).toBeTruthy();
    expect(bobDeck).toBeTruthy();

    const hostDeck = expandDeckCards((aliceDeck as any).cards);
    const awayDeck = expandDeckCards((bobDeck as any).cards);
    expect(hostDeck.length).toBeGreaterThanOrEqual(30);
    expect(awayDeck.length).toBeGreaterThanOrEqual(30);

    const matchId = await asAlice.mutation(api.match.createMatch, {
      mode: "pvp",
      hostDeck,
      awayDeck,
      isAIOpponent: true,
    });

    await asAlice.mutation(api.match.startMatch, {
      matchId,
      // Legacy payload is accepted but ignored; server builds canonical state.
      initialState: "{}",
    });

    const meta = (await asAlice.query(api.match.getMatchMeta, { matchId })) as any;
    const viewRaw = await asAlice.query(api.match.getPlayerView, { matchId, seat: "host" });
    const view = JSON.parse(viewRaw as string) as any;

    const seed = buildMatchSeed([
      "convex.match.startMatch",
      meta.hostId,
      meta.awayId,
      buildDeckSeedPart(meta.hostDeck),
      buildDeckSeedPart(meta.awayDeck),
    ]);
    const expectedFirstPlayer = seed % 2 === 0 ? "host" : "away";

    expect(view.currentTurnPlayer).toBe(expectedFirstPlayer);
    expect(view.hand.every((id: string) => id.includes(":"))).toBe(true);
  });
});
