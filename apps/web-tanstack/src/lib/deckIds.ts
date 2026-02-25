const RESERVED_DECK_IDS = new Set(['undefined', 'null', 'skip'])

export function normalizeDeckId(deckId: string | null | undefined): string | null {
  if (!deckId) return null
  const trimmed = deckId.trim()
  if (trimmed.length === 0) return null
  if (RESERVED_DECK_IDS.has(trimmed.toLowerCase())) return null
  return trimmed
}
