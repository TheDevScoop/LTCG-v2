import { convexQuery } from '@convex-dev/react-query'
import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { api } from '~/lib/convexApi'

type CatalogCard = {
  _id: string
  name: string
  cardType: string
  archetype?: string
  attack?: number
  defense?: number
  rarity?: string
  isActive: boolean
}

type UserCardCount = {
  cardDefinitionId: string
  quantity: number
}

const catalogCardsQuery = convexQuery(api.game.getCatalogCards, {})
const userCountsQuery = convexQuery(api.game.getUserCardCounts, {})

type FilterKey = 'all' | `type:${string}` | `archetype:${string}`

export const Route = createFileRoute('/collection')({
  loader: async ({ context }) => {
    if (!context.convexConfigured) return
    await context.queryClient.ensureQueryData(catalogCardsQuery)
  },
  component: CollectionRoute,
})

function CollectionRoute() {
  const { convexConfigured } = Route.useRouteContext()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [ownedOnly, setOwnedOnly] = useState(false)

  const catalogCards = useQuery({
    ...catalogCardsQuery,
    enabled: convexConfigured,
  })
  const userCounts = useQuery({
    ...userCountsQuery,
    enabled: convexConfigured,
    retry: false,
  })

  const cards = ((catalogCards.data ?? []) as CatalogCard[]).filter((card) => card.isActive)

  const quantityByCardId = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of (userCounts.data ?? []) as UserCardCount[]) {
      if (typeof row.cardDefinitionId === 'string' && typeof row.quantity === 'number') {
        map.set(row.cardDefinitionId, row.quantity)
      }
    }
    return map
  }, [userCounts.data])

  const archetypes = useMemo(
    () =>
      [...new Set(cards.map((card) => card.archetype).filter((value): value is string => Boolean(value)))]
        .sort((a, b) => a.localeCompare(b)),
    [cards],
  )

  const filteredCards = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return cards.filter((card) => {
      if (ownedOnly && !quantityByCardId.has(card._id)) {
        return false
      }

      if (filter.startsWith('type:')) {
        const expectedType = filter.slice('type:'.length)
        if (card.cardType !== expectedType) return false
      }

      if (filter.startsWith('archetype:')) {
        const expectedArchetype = filter.slice('archetype:'.length)
        if (card.archetype !== expectedArchetype) return false
      }

      if (normalizedSearch.length === 0) return true

      const searchTarget = `${card.name} ${card.cardType} ${card.archetype ?? ''}`.toLowerCase()
      return searchTarget.includes(normalizedSearch)
    })
  }, [cards, filter, ownedOnly, quantityByCardId, search])

  const ownedUniqueCount = quantityByCardId.size
  const ownedTotalCopies = [...quantityByCardId.values()].reduce((sum, quantity) => sum + quantity, 0)

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Collection</h1>

      {!convexConfigured ? (
        <p className="text-sm text-amber-300">
          Add <code>VITE_CONVEX_URL</code> to load collection data.
        </p>
      ) : (
        <>
          <div className="rounded border border-stone-700/40 p-3 text-sm text-stone-300">
            <p>Active cards: {cards.length}</p>
            <p>Owned unique cards: {ownedUniqueCount}</p>
            <p>Owned total copies: {ownedTotalCopies}</p>
            <p>Filtered result count: {filteredCards.length}</p>
          </div>

          {userCounts.isError ? (
            <p className="text-sm text-amber-300">Sign in required to load owned card counts.</p>
          ) : null}

          <article className="rounded border border-stone-700/40 p-3 text-sm">
            <h2 className="text-xs uppercase tracking-wide text-stone-400">Filters</h2>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs text-stone-300">
                Search
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Card name"
                  className="mt-1 w-full rounded border border-stone-700/40 bg-stone-950/40 px-2 py-1 text-sm"
                />
              </label>

              <label className="text-xs text-stone-300">
                Filter
                <select
                  value={filter}
                  onChange={(event) => setFilter(event.target.value as FilterKey)}
                  className="mt-1 w-full rounded border border-stone-700/40 bg-stone-950/40 px-2 py-1 text-sm"
                >
                  <option value="all">All cards</option>
                  <option value="type:stereotype">Stereotypes</option>
                  <option value="type:spell">Spells</option>
                  <option value="type:trap">Traps</option>
                  {archetypes.map((archetype) => (
                    <option key={archetype} value={`archetype:${archetype}`}>
                      Archetype: {archetype}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2 text-xs text-stone-300">
                <input
                  type="checkbox"
                  checked={ownedOnly}
                  onChange={(event) => setOwnedOnly(event.target.checked)}
                />
                Owned cards only
              </label>
            </div>
          </article>

          {catalogCards.isLoading ? (
            <p className="text-sm text-stone-400">Loading cards…</p>
          ) : catalogCards.isError ? (
            <p className="text-sm text-rose-300">Failed to load card catalog.</p>
          ) : filteredCards.length === 0 ? (
            <p className="text-sm text-stone-400">No cards match this filter set.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {filteredCards.map((card) => {
                const quantity = quantityByCardId.get(card._id) ?? 0
                return (
                  <article
                    key={card._id}
                    className={`rounded border p-3 text-sm ${
                      quantity > 0 ? 'border-emerald-700/60' : 'border-stone-700/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="font-medium">{card.name}</h2>
                      <span className="rounded border border-stone-700/40 px-2 py-[2px] text-[10px] text-stone-300">
                        {card.rarity ?? 'common'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-stone-400">
                      {card.cardType}
                      {card.archetype ? ` · ${card.archetype}` : ''}
                    </p>
                    {typeof card.attack === 'number' || typeof card.defense === 'number' ? (
                      <p className="mt-1 text-xs text-stone-500">
                        ATK {card.attack ?? '-'} · DEF {card.defense ?? '-'}
                      </p>
                    ) : null}
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-xs text-stone-300">
                        {quantity > 0 ? `Owned · x${quantity}` : 'Not owned'}
                      </p>
                      <Link
                        to="/cards/$cardId"
                        params={{ cardId: card._id }}
                        className="text-xs text-cyan-300 hover:text-cyan-200"
                      >
                        Details
                      </Link>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </>
      )}
    </section>
  )
}
