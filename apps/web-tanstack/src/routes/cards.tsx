import { convexQuery } from '@convex-dev/react-query'
import { useQuery } from '@tanstack/react-query'
import { Link, Outlet, createFileRoute } from '@tanstack/react-router'
import { api } from '~/lib/convexApi'

const getAllCardsQuery = convexQuery(api.cards.getAllCards, {})

export const Route = createFileRoute('/cards')({
  loader: async ({ context }) => {
    if (!context.convexConfigured) return
    await context.queryClient.ensureQueryData(getAllCardsQuery)
  },
  component: CardsRoute,
})

function CardsRoute() {
  const { convexConfigured } = Route.useRouteContext()
  const cardsQuery = useQuery({
    ...getAllCardsQuery,
    enabled: convexConfigured,
  })

  return (
    <section className="space-y-3">
      <h1 className="text-xl font-semibold">Cards</h1>
      {!convexConfigured ? (
        <p className="text-sm text-amber-300">
          Add <code>VITE_CONVEX_URL</code> to load cards.
        </p>
      ) : cardsQuery.isLoading ? (
        <p className="text-sm text-stone-300">Loading cards…</p>
      ) : cardsQuery.isError ? (
        <p className="text-sm text-rose-300">Failed to load cards.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(cardsQuery.data ?? []).slice(0, 60).map((card: Record<string, unknown>) => {
            const id = String(card.id ?? '')
            const name = String(card.name ?? id)
            return (
              <Link
                key={id}
                to="/cards/$cardId"
                params={{ cardId: id }}
                className="rounded border border-stone-700/40 p-3 text-sm hover:border-stone-500"
              >
                <div className="font-medium">{name}</div>
                <div className="text-xs text-stone-400">{id}</div>
              </Link>
            )
          })}
        </div>
      )}
      <Outlet />
    </section>
  )
}
