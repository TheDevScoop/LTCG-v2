import { convexQuery } from '@convex-dev/react-query'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { api } from '~/lib/convexApi'

type UserCardCount = {
  cardDefinitionId: string
  quantity: number
}

type CardDef = {
  _id?: string
  id?: string
  name?: string
  cardType?: string
  archetype?: string
}

const allCardsQuery = convexQuery(api.cards.getAllCards, {})
const userCardsQuery = convexQuery(api.cards.getUserCards, {})

export const Route = createFileRoute('/collection')({
  loader: async ({ context }) => {
    if (!context.convexConfigured) return
    await context.queryClient.ensureQueryData(allCardsQuery)
  },
  component: CollectionRoute,
})

function CollectionRoute() {
  const { convexConfigured } = Route.useRouteContext()
  const allCards = useQuery({
    ...allCardsQuery,
    enabled: convexConfigured,
  })
  const userCards = useQuery({
    ...userCardsQuery,
    enabled: convexConfigured,
    retry: false,
  })

  const cards = (allCards.data ?? []) as CardDef[]
  const counts = (userCards.data ?? []) as UserCardCount[]
  const owned = new Set(counts.map((c) => c.cardDefinitionId))

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
            <p>Total cards: {cards.length}</p>
            <p>Owned entries: {counts.length}</p>
            <p>Unique owned card defs: {owned.size}</p>
          </div>

          {userCards.isError ? (
            <p className="text-sm text-amber-300">
              Sign in required to load owned card counts.
            </p>
          ) : null}

          {allCards.isLoading ? (
            <p className="text-sm text-stone-400">Loading cards…</p>
          ) : allCards.isError ? (
            <p className="text-sm text-rose-300">Failed to load card catalog.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {cards.slice(0, 60).map((card) => {
                const id = String(card._id ?? card.id ?? '')
                const name = String(card.name ?? id)
                const type = String(card.cardType ?? 'unknown')
                const archetype = String(card.archetype ?? 'none')
                const isOwned = owned.has(id)
                return (
                  <article
                    key={id}
                    className={`rounded border p-3 text-sm ${
                      isOwned
                        ? 'border-emerald-700/60'
                        : 'border-stone-700/40'
                    }`}
                  >
                    <h2 className="font-medium">{name}</h2>
                    <p className="mt-1 text-xs text-stone-400">
                      {type} · {archetype}
                    </p>
                    <p className="mt-2 text-xs text-stone-300">
                      {isOwned ? 'Owned' : 'Not owned'}
                    </p>
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
