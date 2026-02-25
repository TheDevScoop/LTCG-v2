import { convexQuery } from '@convex-dev/react-query'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { api } from '~/lib/convexApi'

export const Route = createFileRoute('/cards/$cardId')({
  loader: async ({ context, params }) => {
    if (!context.convexConfigured) return
    await context.queryClient.ensureQueryData(
      convexQuery(api.cards.getCard, { cardId: params.cardId }),
    )
  },
  component: CardDetailsRoute,
})

function CardDetailsRoute() {
  const { convexConfigured } = Route.useRouteContext()
  const { cardId } = Route.useParams()
  const cardQuery = useQuery({
    ...convexQuery(api.cards.getCard, { cardId }),
    enabled: convexConfigured,
  })

  if (!convexConfigured) return null
  if (cardQuery.isLoading) return <p className="text-sm text-stone-300">Loading card…</p>
  if (cardQuery.isError) return <p className="text-sm text-rose-300">Failed to load card.</p>
  if (!cardQuery.data) return <p className="text-sm text-amber-300">Card not found.</p>

  const card = cardQuery.data as Record<string, unknown>
  const entries = Object.entries(card).slice(0, 16)

  return (
    <article className="mt-3 rounded border border-stone-700/40 p-3 text-sm">
      <h2 className="text-base font-semibold">
        {String(card.name ?? card.id ?? cardId)}
      </h2>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        {entries.map(([key, value]) => (
          <div key={key}>
            <dt className="text-xs uppercase tracking-wide text-stone-400">{key}</dt>
            <dd className="text-stone-200">
              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  )
}
