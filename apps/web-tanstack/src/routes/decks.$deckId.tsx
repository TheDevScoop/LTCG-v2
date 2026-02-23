import { convexQuery } from '@convex-dev/react-query'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { api } from '~/lib/convexApi'

type DeckWithCards = {
  deckId?: string
  name?: string
  deckArchetype?: string
  cards?: { cardDefinitionId: string; quantity: number }[]
}

export const Route = createFileRoute('/decks/$deckId')({
  loader: async ({ context, params }) => {
    if (!context.convexConfigured) return
    await context.queryClient.ensureQueryData(
      convexQuery(api.cards.getDeckWithCards, { deckId: params.deckId }),
    )
  },
  component: DeckDetailRoute,
})

function DeckDetailRoute() {
  const { convexConfigured } = Route.useRouteContext()
  const { deckId } = Route.useParams()

  const deck = useQuery({
    ...convexQuery(api.cards.getDeckWithCards, { deckId }),
    enabled: convexConfigured,
    retry: false,
  })
  const stats = useQuery({
    ...convexQuery(api.cards.getDeckStats, { deckId }),
    enabled: convexConfigured,
    retry: false,
  })

  if (!convexConfigured) return null
  if (deck.isLoading) return <p className="text-sm text-stone-400">Loading deck…</p>
  if (deck.isError) return <p className="text-sm text-amber-300">Deck unavailable or unauthorized.</p>
  if (!deck.data) return <p className="text-sm text-stone-400">Deck not found.</p>

  const data = deck.data as DeckWithCards
  const entries = (data.cards ?? []).slice(0, 60)

  return (
    <article className="mt-2 rounded border border-stone-700/40 p-3">
      <h2 className="text-base font-semibold">{data.name ?? deckId}</h2>
      <p className="mt-1 text-xs text-stone-400">
        {data.deckArchetype ?? 'untyped'} · {(data.cards ?? []).length} unique cards
      </p>

      {stats.data ? (
        <p className="mt-2 text-xs text-stone-300">
          Stats snapshot: {JSON.stringify(stats.data)}
        </p>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {entries.map((card) => (
          <div key={card.cardDefinitionId} className="rounded border border-stone-700/30 p-2 text-xs">
            <p className="text-stone-200">{card.cardDefinitionId}</p>
            <p className="text-stone-400">qty {card.quantity}</p>
          </div>
        ))}
      </div>
    </article>
  )
}
