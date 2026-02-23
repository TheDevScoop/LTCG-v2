import { convexQuery, useConvexMutation } from '@convex-dev/react-query'
import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { api } from '~/lib/convexApi'
import { normalizeDeckId } from '~/lib/deckIds'

type Deck = {
  _id?: string
  deckId: string
  name?: string
  deckArchetype?: string
  cards?: { cardDefinitionId: string; quantity: number }[]
}

type CurrentUser = {
  activeDeckId?: string
}

const userDecksQuery = convexQuery(api.game.getUserDecks, {})
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
  const navigate = Route.useNavigate()

  const currentUser = useQuery({
    ...currentUserQuery,
    enabled: convexConfigured,
  })
  const decks = useQuery({
    ...userDecksQuery,
    enabled: convexConfigured && currentUser.data != null,
    retry: false,
  })

  const setActiveDeck = useConvexMutation(api.game.setActiveDeck)
  const createDeck = useConvexMutation(api.game.createDeck)

  const [creating, setCreating] = useState(false)
  const [settingDeckId, setSettingDeckId] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const user = (currentUser.data ?? null) as CurrentUser | null
  const rows = (decks.data ?? []) as Deck[]
  const hasAnyDeck = rows.length > 0
  const hasActiveDeck = normalizeDeckId(user?.activeDeckId ?? null) != null
  const canCreateDeck = hasAnyDeck || hasActiveDeck

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Decks</h1>
          <p className="mt-1 text-sm text-stone-400">
            Manage active deck selection and open deck builder.
          </p>
        </div>
        <button
          onClick={async () => {
            if (!canCreateDeck) {
              setErrorMessage('Select a starter deck before creating custom decks.')
              return
            }
            setCreating(true)
            setStatusMessage('')
            setErrorMessage('')
            try {
              const result = (await createDeck({
                name: `Deck ${(rows.length || 0) + 1}`,
              })) as { deckId?: string } | string
              const createdId = normalizeDeckId(
                typeof result === 'string' ? result : result.deckId,
              )
              if (!createdId) throw new Error('Deck creation did not return a valid deck id.')
              setStatusMessage(`Deck created: ${createdId}`)
              await decks.refetch()
              navigate({ to: '/decks/$deckId', params: { deckId: createdId } })
            } catch (err) {
              setErrorMessage(err instanceof Error ? err.message : 'Failed to create deck.')
            } finally {
              setCreating(false)
            }
          }}
          disabled={!convexConfigured || currentUser.data == null || creating}
          className="rounded border border-stone-600 px-3 py-1 text-xs disabled:opacity-50"
        >
          {creating ? 'Creating…' : '+ New Deck'}
        </button>
      </div>

      {!convexConfigured ? (
        <p className="text-sm text-amber-300">
          Add <code>VITE_CONVEX_URL</code> to load deck data.
        </p>
      ) : currentUser.data == null ? (
        <p className="text-sm text-amber-300">Sign in to load your decks.</p>
      ) : !canCreateDeck ? (
        <p className="text-sm text-amber-300">
          Pick a starter deck in <Link to="/onboarding" className="underline">onboarding</Link> before creating custom decks.
        </p>
      ) : null}

      {decks.isLoading ? (
        <p className="text-sm text-stone-400">Loading decks…</p>
      ) : decks.isError ? (
        <p className="text-sm text-rose-300">Failed to load decks.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-stone-400">No decks found.</p>
      ) : (
        <div className="grid gap-2">
          {rows.map((deck) => {
            const deckId = normalizeDeckId(deck.deckId)
            if (!deckId) return null
            const cardCount = (deck.cards ?? []).reduce((sum, card) => sum + card.quantity, 0)
            const isActive = normalizeDeckId(user?.activeDeckId ?? null) === deckId
            return (
              <article
                key={deck._id ?? deckId}
                className={`rounded border p-3 ${
                  isActive ? 'border-emerald-700/60' : 'border-stone-700/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-stone-100">
                      {deck.name ?? deckId}
                    </h2>
                    <p className="mt-1 text-xs text-stone-400">
                      {deck.deckArchetype ?? 'untyped'} · {cardCount} cards
                    </p>
                    <p className="text-xs text-stone-500">id: {deckId}</p>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      to="/decks/$deckId"
                      params={{ deckId }}
                      className="rounded border border-stone-600 px-3 py-1 text-xs"
                    >
                      Edit
                    </Link>
                    {!isActive ? (
                      <button
                        onClick={async () => {
                          setSettingDeckId(deckId)
                          setStatusMessage('')
                          setErrorMessage('')
                          try {
                            await setActiveDeck({ deckId })
                            setStatusMessage(`Active deck set to ${deck.name ?? deckId}.`)
                            await Promise.all([currentUser.refetch(), decks.refetch()])
                          } catch (err) {
                            setErrorMessage(
                              err instanceof Error ? err.message : 'Failed to set active deck.',
                            )
                          } finally {
                            setSettingDeckId(null)
                          }
                        }}
                        disabled={settingDeckId === deckId}
                        className="rounded border border-stone-600 px-3 py-1 text-xs disabled:opacity-50"
                      >
                        {settingDeckId === deckId ? 'Setting…' : 'Set Active'}
                      </button>
                    ) : (
                      <span className="rounded border border-emerald-700/60 px-3 py-1 text-xs text-emerald-300">
                        Active
                      </span>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {statusMessage ? <p className="text-sm text-emerald-300">{statusMessage}</p> : null}
      {errorMessage ? <p className="text-sm text-rose-300">{errorMessage}</p> : null}
    </section>
  )
}
