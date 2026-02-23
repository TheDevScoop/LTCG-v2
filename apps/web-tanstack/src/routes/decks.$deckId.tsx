import { convexQuery, useConvexMutation } from '@convex-dev/react-query'
import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '~/lib/convexApi'
import { normalizeDeckId } from '~/lib/deckIds'

type CardDef = {
  _id: string
  name: string
  cardType: string
  archetype?: string
  attack?: number
  defense?: number
  isActive?: boolean
}

type DeckCard = { cardDefinitionId: string; quantity: number }
type UserCardCount = { cardDefinitionId: string; quantity: number }
type DeckData = {
  name?: string
  deckArchetype?: string
  cards?: DeckCard[]
}

const MAX_COPIES = 3
const MIN_DECK_SIZE = 30
const MAX_DECK_SIZE = 40

export const Route = createFileRoute('/decks/$deckId')({
  loader: async ({ context, params }) => {
    if (!context.convexConfigured) return
    const deckId = normalizeDeckId(params.deckId)
    if (!deckId) return
    await Promise.all([
      context.queryClient.ensureQueryData(convexQuery(api.game.getDeckWithCards, { deckId })),
      context.queryClient.ensureQueryData(convexQuery(api.game.getCatalogCards, {})),
    ])
  },
  component: DeckBuilderRoute,
})

function DeckBuilderRoute() {
  const { convexConfigured } = Route.useRouteContext()
  const { deckId: rawDeckId } = Route.useParams()
  const deckId = normalizeDeckId(rawDeckId)

  const [filter, setFilter] = useState('')
  const [localCards, setLocalCards] = useState<Map<string, number> | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const initializedDeckIdRef = useRef<string | null>(null)
  const saveDeck = useConvexMutation(api.game.saveDeck)

  const deck = useQuery({
    ...convexQuery(api.game.getDeckWithCards, { deckId: deckId ?? '' }),
    enabled: convexConfigured && deckId != null,
    retry: false,
  })
  const catalog = useQuery({
    ...convexQuery(api.game.getCatalogCards, {}),
    enabled: convexConfigured && deckId != null,
  })
  const userCardCounts = useQuery({
    ...convexQuery(api.game.getUserCardCounts, {}),
    enabled: convexConfigured && deckId != null,
    retry: false,
  })

  useEffect(() => {
    initializedDeckIdRef.current = null
    setLocalCards(null)
    setSaved(false)
    setErrorMessage('')
  }, [deckId])

  useEffect(() => {
    if (!deckId) return
    const data = (deck.data ?? null) as DeckData | null
    if (!data?.cards) return
    if (initializedDeckIdRef.current === deckId) return
    const next = new Map<string, number>()
    for (const card of data.cards) {
      if (card.quantity > 0) {
        next.set(card.cardDefinitionId, card.quantity)
      }
    }
    setLocalCards(next)
    initializedDeckIdRef.current = deckId
  }, [deck.data, deckId])

  const cards = localCards ?? new Map<string, number>()
  const catalogRows = (catalog.data ?? []) as CardDef[]
  const userRows = (userCardCounts.data ?? []) as UserCardCount[]
  const deckData = (deck.data ?? null) as DeckData | null

  const cardLookup = useMemo(() => {
    const map = new Map<string, CardDef>()
    for (const card of catalogRows) {
      map.set(card._id, card)
    }
    return map
  }, [catalogRows])

  const ownedMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of userRows) {
      map.set(row.cardDefinitionId, (map.get(row.cardDefinitionId) ?? 0) + row.quantity)
    }
    return map
  }, [userRows])

  const availableCards = useMemo(() => {
    const loweredFilter = filter.trim().toLowerCase()
    const results: CardDef[] = []
    for (const [cardId] of ownedMap.entries()) {
      const def = cardLookup.get(cardId)
      if (!def || !def.isActive) continue
      if (loweredFilter.length > 0 && !def.name.toLowerCase().includes(loweredFilter)) continue
      results.push(def)
    }
    results.sort((a, b) => a.name.localeCompare(b.name))
    return results
  }, [cardLookup, filter, ownedMap])

  const deckTotal = useMemo(() => {
    let total = 0
    for (const quantity of cards.values()) total += quantity
    return total
  }, [cards])

  const deckEntries = useMemo(
    () =>
      [...cards.entries()]
        .map(([cardDefinitionId, quantity]) => ({
          def: cardLookup.get(cardDefinitionId),
          cardDefinitionId,
          quantity,
        }))
        .filter((entry) => entry.def != null)
        .sort((a, b) => a.def!.name.localeCompare(b.def!.name)),
    [cardLookup, cards],
  )

  const addCard = useCallback(
    (cardDefinitionId: string) => {
      const inDeck = cards.get(cardDefinitionId) ?? 0
      const owned = ownedMap.get(cardDefinitionId) ?? 0
      if (inDeck >= MAX_COPIES || inDeck >= owned || deckTotal >= MAX_DECK_SIZE) return
      const next = new Map(cards)
      next.set(cardDefinitionId, inDeck + 1)
      setLocalCards(next)
      setSaved(false)
    },
    [cards, deckTotal, ownedMap],
  )

  const removeCard = useCallback(
    (cardDefinitionId: string) => {
      const inDeck = cards.get(cardDefinitionId) ?? 0
      if (inDeck <= 0) return
      const next = new Map(cards)
      if (inDeck === 1) next.delete(cardDefinitionId)
      else next.set(cardDefinitionId, inDeck - 1)
      setLocalCards(next)
      setSaved(false)
    },
    [cards],
  )

  const isDeckValid = deckTotal >= MIN_DECK_SIZE && deckTotal <= MAX_DECK_SIZE

  if (!convexConfigured) {
    return (
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold">Deck Builder</h1>
        <p className="text-sm text-amber-300">
          Add <code>VITE_CONVEX_URL</code> to use deck builder.
        </p>
      </section>
    )
  }

  if (!deckId) {
    return (
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold">Deck Builder</h1>
        <p className="text-sm text-rose-300">Invalid deck id.</p>
        <Link to="/decks" className="inline-block rounded border border-stone-600 px-3 py-1 text-xs">
          Back to Decks
        </Link>
      </section>
    )
  }

  if (deck.isLoading || catalog.isLoading || userCardCounts.isLoading) {
    return <p className="text-sm text-stone-400">Loading deck builder…</p>
  }

  if (deck.isError || catalog.isError) {
    return <p className="text-sm text-rose-300">Failed to load deck data.</p>
  }

  if (!deckData) {
    return <p className="text-sm text-stone-400">Deck not found.</p>
  }

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{deckData.name ?? deckId}</h1>
          <p className="mt-1 text-xs text-stone-400">
            {deckData.deckArchetype ?? 'untyped'} · {deckTotal} cards selected
          </p>
        </div>
        <Link to="/decks" className="rounded border border-stone-600 px-3 py-1 text-xs">
          Back to Decks
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <article className="rounded border border-stone-700/40 p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs uppercase tracking-wide text-stone-400">Owned Cards</h2>
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Search cards"
              className="rounded border border-stone-600 bg-stone-950 px-2 py-1 text-xs"
            />
          </div>
          {userCardCounts.isError ? (
            <p className="text-sm text-amber-300">Sign in to load card inventory.</p>
          ) : availableCards.length === 0 ? (
            <p className="text-sm text-stone-400">No cards match the current filter.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {availableCards.map((card) => {
                const inDeck = cards.get(card._id) ?? 0
                const owned = ownedMap.get(card._id) ?? 0
                const atLimit = inDeck >= MAX_COPIES || inDeck >= owned || deckTotal >= MAX_DECK_SIZE
                return (
                  <button
                    key={card._id}
                    onClick={() => addCard(card._id)}
                    disabled={atLimit}
                    className="rounded border border-stone-700/40 p-2 text-left disabled:opacity-40"
                  >
                    <p className="text-sm font-medium text-stone-100">{card.name}</p>
                    <p className="text-xs text-stone-400">{card.cardType}</p>
                    {card.cardType === 'stereotype' ? (
                      <p className="text-xs text-stone-500">
                        {card.attack ?? '?'} / {card.defense ?? '?'}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-stone-500">
                      {inDeck}/{owned} in deck
                    </p>
                  </button>
                )
              })}
            </div>
          )}
        </article>

        <article className="rounded border border-stone-700/40 p-3 space-y-3">
          <h2 className="text-xs uppercase tracking-wide text-stone-400">Deck Contents</h2>
          <p className={`text-xs ${isDeckValid ? 'text-emerald-300' : 'text-amber-300'}`}>
            {deckTotal} / {MIN_DECK_SIZE}-{MAX_DECK_SIZE} cards
          </p>
          {!isDeckValid ? (
            <p className="text-xs text-stone-500">
              Deck must contain {MIN_DECK_SIZE} to {MAX_DECK_SIZE} cards.
            </p>
          ) : null}
          {deckEntries.length === 0 ? (
            <p className="text-sm text-stone-400">Add cards from the left panel.</p>
          ) : (
            <div className="space-y-2">
              {deckEntries.map((entry) => (
                <div
                  key={entry.cardDefinitionId}
                  className="rounded border border-stone-700/30 px-2 py-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium text-stone-100">{entry.def!.name}</p>
                      <p className="text-[11px] text-stone-500">{entry.def!.cardType}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => removeCard(entry.cardDefinitionId)}
                        className="rounded border border-stone-600 px-2 py-0.5 text-xs"
                      >
                        -
                      </button>
                      <span className="w-6 text-center text-xs text-stone-200">
                        {entry.quantity}
                      </span>
                      <button
                        onClick={() => addCard(entry.cardDefinitionId)}
                        className="rounded border border-stone-600 px-2 py-0.5 text-xs"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={async () => {
              if (!isDeckValid) return
              setSaving(true)
              setSaved(false)
              setErrorMessage('')
              try {
                await saveDeck({
                  deckId,
                  cards: [...cards.entries()].map(([cardDefinitionId, quantity]) => ({
                    cardDefinitionId,
                    quantity,
                  })),
                })
                setSaved(true)
              } catch (err) {
                setErrorMessage(err instanceof Error ? err.message : 'Failed to save deck.')
              } finally {
                setSaving(false)
              }
            }}
            disabled={saving || !isDeckValid}
            className="rounded border border-stone-600 px-3 py-1 text-xs disabled:opacity-50"
          >
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save Deck'}
          </button>
        </article>
      </div>

      {errorMessage ? <p className="text-sm text-rose-300">{errorMessage}</p> : null}
    </section>
  )
}
