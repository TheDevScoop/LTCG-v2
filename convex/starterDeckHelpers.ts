type ExistingDeckLike = {
  name?: string;
  deckArchetype?: unknown;
  deckId?: string;
};

export function resolveStarterDeck(existingDecks: ExistingDeckLike[], deckCode: string) {
  const requestedArchetype = deckCode.replace("_starter", "").toLowerCase();

  return (
    existingDecks.find((deck) => deck.name === deckCode) ??
    existingDecks.find((deck) => {
      const archetype = deck.deckArchetype;
      return (
        typeof archetype === "string" &&
        archetype.toLowerCase() === requestedArchetype
      );
    }) ??
    existingDecks[0]
  );
}

export async function activateDeckForUser(
  ctx: any,
  userId: string,
  activeDeckId: string | undefined,
  nextDeckId: string,
  setActiveDeck: (ctx: any, userId: string, deckId: string) => Promise<unknown>,
) {
  await setActiveDeck(ctx, userId, nextDeckId);
  if (activeDeckId !== nextDeckId) {
    await ctx.db.patch(userId, { activeDeckId: nextDeckId });
  }
}
