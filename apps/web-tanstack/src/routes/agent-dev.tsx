import { convexQuery, useConvexMutation } from '@convex-dev/react-query'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { api } from '~/lib/convexApi'

type StarterDeck = {
  deckCode: string
  name?: string
  archetype?: string
  description?: string
}

const currentUserQuery = convexQuery(api.auth.currentUser, {})
const starterDecksQuery = convexQuery(api.game.getStarterDecks, {})

export const Route = createFileRoute('/agent-dev')({
  loader: async ({ context }) => {
    if (!context.convexConfigured) return
    await context.queryClient.ensureQueryData(starterDecksQuery)
  },
  component: AgentDevRoute,
})

function AgentDevRoute() {
  const { convexConfigured } = Route.useRouteContext()
  const [selectedDeckCode, setSelectedDeckCode] = useState('')
  const [message, setMessage] = useState('')

  const currentUser = useQuery({
    ...currentUserQuery,
    enabled: convexConfigured,
  })
  const starterDecks = useQuery({
    ...starterDecksQuery,
    enabled: convexConfigured,
  })
  const selectStarterDeck = useConvexMutation(api.game.selectStarterDeck)

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Agent Dev</h1>

      {!convexConfigured ? (
        <p className="text-sm text-amber-300">
          Add <code>VITE_CONVEX_URL</code> to load starter deck tooling.
        </p>
      ) : (
        <>
          {currentUser.data == null ? (
            <p className="text-sm text-amber-300">Sign in to assign starter decks.</p>
          ) : null}

          <article className="rounded border border-stone-700/40 p-3 text-sm">
            <h2 className="text-xs uppercase tracking-wide text-stone-400">Starter Decks</h2>
            {starterDecks.isLoading ? (
              <p className="mt-2 text-stone-400">Loading starter decks…</p>
            ) : starterDecks.isError ? (
              <p className="mt-2 text-rose-300">Failed to load starter decks.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {((starterDecks.data ?? []) as StarterDeck[]).map((deck) => (
                  <button
                    key={deck.deckCode}
                    onClick={() => setSelectedDeckCode(deck.deckCode)}
                    className={`block w-full rounded border px-2 py-2 text-left text-xs ${
                      selectedDeckCode === deck.deckCode
                        ? 'border-cyan-700/60'
                        : 'border-stone-700/40'
                    }`}
                  >
                    <p className="font-semibold text-stone-200">{deck.name ?? deck.deckCode}</p>
                    <p className="text-stone-400">
                      {deck.archetype ?? 'unknown'} · {deck.description ?? 'No description'}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </article>

          <div className="flex gap-2">
            <button
              onClick={async () => {
                if (!selectedDeckCode) return
                try {
                  const result = await selectStarterDeck({ deckCode: selectedDeckCode })
                  setMessage(JSON.stringify(result))
                } catch (err) {
                  setMessage(err instanceof Error ? err.message : 'Selection failed')
                }
              }}
              disabled={!selectedDeckCode || currentUser.data == null}
              className="rounded border border-stone-600 px-3 py-1 text-xs disabled:opacity-50"
            >
              Assign Starter Deck
            </button>
          </div>
        </>
      )}

      {message ? <p className="text-sm text-stone-300">{message}</p> : null}
    </section>
  )
}
