import { convexQuery } from '@convex-dev/react-query'
import { useQuery } from '@tanstack/react-query'
import { Link, Outlet, createFileRoute } from '@tanstack/react-router'
import { api } from '~/lib/convexApi'

type Deck = {
  deckId: string
  name?: string
  deckArchetype?: string
  cards?: { cardDefinitionId: string; quantity: number }[]
}

const userDecksQuery = convexQuery(api.cards.getUserDecks, {})
const currentUserQuery = convexQuery(api.auth.currentUser, {})

export const Route = createFileRoute('/decks')({
  loader: async ({ context }) => {
    if (!context.convexConfigured) return
    await context.queryClient.ensureQueryData(currentUserQuery)
  },
  component: DecksRoute,
})

function DecksRoute() {
  const { convexConfigured } = Route.useRouteContext()
  const currentUser = useQuery({
    ...currentUserQuery,
    enabled: convexConfigured,
  })
  const decks = useQuery({
    ...userDecksQuery,
    enabled: convexConfigured,
    retry: false,
  })

  const rows = (decks.data ?? []) as Deck[]

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Decks</h1>

      {!convexConfigured ? (
        <p className="text-sm text-amber-300">
          Add <code>VITE_CONVEX_URL</code> to load deck data.
        </p>
      ) : currentUser.data == null ? (
        <p className="text-sm text-amber-300">
          Sign in to load your decks.
        </p>
      ) : decks.isLoading ? (
        <p className="text-sm text-stone-400">Loading decks…</p>
      ) : decks.isError ? (
        <p className="text-sm text-rose-300">Failed to load decks.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-stone-400">No decks found for this user.</p>
      ) : (
        <div className="grid gap-2">
          {rows.map((deck) => {
            const count = (deck.cards ?? []).reduce((sum, c) => sum + c.quantity, 0)
            return (
              <Link
                key={deck.deckId}
                to="/decks/$deckId"
                params={{ deckId: deck.deckId }}
                className="rounded border border-stone-700/40 p-3 hover:border-stone-500"
              >
                <h2 className="text-sm font-semibold">
                  {deck.name ?? deck.deckId}
                </h2>
                <p className="mt-1 text-xs text-stone-400">
                  {deck.deckArchetype ?? 'untyped'} · {count} cards
                </p>
              </Link>
            )
          })}
        </div>
      )}

      <Outlet />
    </section>
  )
}
