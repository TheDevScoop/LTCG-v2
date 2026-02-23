import { convexQuery, useConvexMutation } from '@convex-dev/react-query'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { api } from '~/lib/convexApi'

type Stage = {
  stageNumber: number
  title?: string
  opponentName?: string
}

type StarterDeck = {
  deckCode: string
  name?: string
}

type UserDeck = {
  deckId: string
}

export const Route = createFileRoute('/story/$chapterId')({
  loader: async ({ context, params }) => {
    if (!context.convexConfigured) return
    await context.queryClient.ensureQueryData(
      convexQuery(api.game.getChapterStages, { chapterId: params.chapterId }),
    )
  },
  component: StoryChapterRoute,
})

function StoryChapterRoute() {
  const { convexConfigured } = Route.useRouteContext()
  const { chapterId } = Route.useParams()
  const navigate = Route.useNavigate()

  const [statusMessage, setStatusMessage] = useState('')
  const [busyStage, setBusyStage] = useState<number | null>(null)

  const stages = useQuery({
    ...convexQuery(api.game.getChapterStages, { chapterId }),
    enabled: convexConfigured,
  })
  const currentUser = useQuery({
    ...convexQuery(api.auth.currentUser, {}),
    enabled: convexConfigured,
  })
  const userDecks = useQuery({
    ...convexQuery(api.game.getUserDecks, {}),
    enabled: convexConfigured && currentUser.data != null,
    retry: false,
  })
  const starterDecks = useQuery({
    ...convexQuery(api.game.getStarterDecks, {}),
    enabled: convexConfigured,
  })
  const openStoryLobby = useQuery({
    ...convexQuery(api.game.getMyOpenStoryLobby, {}),
    enabled: convexConfigured && currentUser.data != null,
    retry: false,
  })

  const setActiveDeck = useConvexMutation(api.game.setActiveDeck)
  const selectStarterDeck = useConvexMutation(api.game.selectStarterDeck)
  const startStoryBattle = useConvexMutation(api.game.startStoryBattle)
  const startStoryBattleForAgent = useConvexMutation(api.game.startStoryBattleForAgent)
  const cancelStoryMatch = useConvexMutation(api.game.cancelWaitingStoryMatch)

  const ensureDeck = async () => {
    const decks = (userDecks.data ?? []) as UserDeck[]
    if (decks.length > 0) {
      await setActiveDeck({ deckId: decks[0]!.deckId })
      return
    }
    const starters = (starterDecks.data ?? []) as StarterDeck[]
    if (starters.length > 0) {
      await selectStarterDeck({ deckCode: starters[0]!.deckCode })
      return
    }
    throw new Error('No deck available. Set up a starter deck first.')
  }

  const stageRows = [...((stages.data ?? []) as Stage[])].sort(
    (a, b) => (a.stageNumber ?? 0) - (b.stageNumber ?? 0),
  )

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Story Chapter</h1>
      <p className="text-xs text-stone-400">chapterId: {chapterId}</p>

      {!convexConfigured ? (
        <p className="text-sm text-amber-300">
          Add <code>VITE_CONVEX_URL</code> to load chapter stages.
        </p>
      ) : currentUser.data == null ? (
        <p className="text-sm text-amber-300">Sign in to start chapter battles.</p>
      ) : (
        <>
          {openStoryLobby.data ? (
            <div className="rounded border border-cyan-800/50 p-3 text-sm">
              <p className="text-cyan-300">
                Open lobby: {(openStoryLobby.data as Record<string, unknown>).matchId as string}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => {
                    const matchId = (openStoryLobby.data as Record<string, unknown>).matchId as string
                    navigate({ to: '/play/$matchId', params: { matchId } })
                  }}
                  className="rounded border border-stone-600 px-2 py-1 text-xs"
                >
                  Open Match
                </button>
                <button
                  onClick={async () => {
                    try {
                      const matchId = (openStoryLobby.data as Record<string, unknown>).matchId as string
                      await cancelStoryMatch({ matchId })
                      setStatusMessage('Canceled waiting story lobby.')
                      await openStoryLobby.refetch()
                    } catch (err) {
                      setStatusMessage(err instanceof Error ? err.message : 'Cancel failed')
                    }
                  }}
                  className="rounded border border-stone-600 px-2 py-1 text-xs"
                >
                  Cancel Lobby
                </button>
              </div>
            </div>
          ) : null}

          {stages.isLoading ? (
            <p className="text-sm text-stone-400">Loading stages…</p>
          ) : stages.isError ? (
            <p className="text-sm text-rose-300">Failed to load stages.</p>
          ) : (
            <div className="grid gap-2">
              {stageRows.map((stage) => (
                <article key={stage.stageNumber} className="rounded border border-stone-700/40 p-3">
                  <h2 className="text-sm font-semibold">
                    Stage {stage.stageNumber}: {stage.title ?? 'Untitled'}
                  </h2>
                  <p className="mt-1 text-xs text-stone-400">
                    Opponent: {stage.opponentName ?? 'unknown'}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={async () => {
                        setBusyStage(stage.stageNumber)
                        setStatusMessage('')
                        try {
                          await ensureDeck()
                          const result = (await startStoryBattle({
                            chapterId,
                            stageNumber: stage.stageNumber,
                          })) as { matchId?: string }
                          if (!result?.matchId) throw new Error('No match id returned')
                          navigate({ to: '/play/$matchId', params: { matchId: result.matchId } })
                        } catch (err) {
                          setStatusMessage(err instanceof Error ? err.message : 'Start failed')
                        } finally {
                          setBusyStage(null)
                        }
                      }}
                      className="rounded border border-stone-600 px-2 py-1 text-xs disabled:opacity-50"
                      disabled={busyStage === stage.stageNumber}
                    >
                      Start Local
                    </button>
                    <button
                      onClick={async () => {
                        setBusyStage(stage.stageNumber)
                        setStatusMessage('')
                        try {
                          await ensureDeck()
                          const result = (await startStoryBattleForAgent({
                            chapterId,
                            stageNumber: stage.stageNumber,
                          })) as { matchId?: string }
                          if (!result?.matchId) throw new Error('No match id returned')
                          setStatusMessage(`Agent lobby created: ${result.matchId}`)
                          await openStoryLobby.refetch()
                        } catch (err) {
                          setStatusMessage(err instanceof Error ? err.message : 'Start failed')
                        } finally {
                          setBusyStage(null)
                        }
                      }}
                      className="rounded border border-stone-600 px-2 py-1 text-xs disabled:opacity-50"
                      disabled={busyStage === stage.stageNumber}
                    >
                      Start Agent Lobby
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {statusMessage ? <p className="text-sm text-stone-300">{statusMessage}</p> : null}
    </section>
  )
}
