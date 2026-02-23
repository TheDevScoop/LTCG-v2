import { convexQuery, useConvexMutation } from '@convex-dev/react-query'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { api } from '~/lib/convexApi'

type Seat = 'host' | 'away'

type MatchMeta = {
  status?: string
  mode?: string
  hostId?: string
  awayId?: string
  winner?: string | null
}

type CurrentUser = {
  _id: string
}

type EventBatch = {
  command: string
  events: string
  seat: string
  version: number
  createdAt: number
}

type PlayerViewSummary = {
  phase: string
  turnNumber: number
  gameOver: boolean
  winner: string | null
  currentTurnPlayer: string | null
  currentPriorityPlayer: string | null
  myLifePoints: number | null
  opponentLifePoints: number | null
  myDeckCount: number | null
  opponentDeckCount: number | null
  myHandCount: number | null
  opponentHandCount: number | null
}

function asSeat(value: unknown): Seat | null {
  return value === 'host' || value === 'away' ? value : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null
  try {
    const parsed = JSON.parse(value)
    return asRecord(parsed)
  } catch {
    return null
  }
}

function resolveSeat(meta: MatchMeta | null | undefined, userId: string | undefined): Seat | null {
  if (!meta || !userId) return null
  if (meta.hostId === userId) return 'host'
  if (meta.awayId === userId) return 'away'
  return null
}

function summarizePlayerView(
  view: Record<string, unknown> | null,
  seat: Seat,
): PlayerViewSummary | null {
  if (!view) return null
  const opponentSeat: Seat = seat === 'host' ? 'away' : 'host'
  const players = asRecord(view.players)
  const myPlayer = asRecord(players?.[seat])
  const opponentPlayer = asRecord(players?.[opponentSeat])

  const hand = Array.isArray(view.hand) ? view.hand : []
  const myHandCount = hand.length

  return {
    phase: asString(view.currentPhase) ?? 'draw',
    turnNumber: asNumber(view.turnNumber) ?? 1,
    gameOver: view.gameOver === true,
    winner: asString(view.winner),
    currentTurnPlayer: asString(view.currentTurnPlayer),
    currentPriorityPlayer: asString(view.currentPriorityPlayer),
    myLifePoints: asNumber(view.lifePoints) ?? asNumber(myPlayer?.lifePoints),
    opponentLifePoints:
      asNumber(view.opponentLifePoints) ?? asNumber(opponentPlayer?.lifePoints),
    myDeckCount: asNumber(view.deckCount) ?? asNumber(myPlayer?.deckCount),
    opponentDeckCount:
      asNumber(view.opponentDeckCount) ?? asNumber(opponentPlayer?.deckCount),
    myHandCount,
    opponentHandCount:
      asNumber(view.opponentHandCount) ?? asNumber(opponentPlayer?.handCount),
  }
}

function parseCommandType(batch: EventBatch): string {
  const command = parseJsonRecord(batch.command)
  return asString(command?.type) ?? 'UNKNOWN'
}

function parseEventCount(batch: EventBatch): number {
  try {
    const parsed = JSON.parse(batch.events)
    return Array.isArray(parsed) ? parsed.length : 0
  } catch {
    return 0
  }
}

export const Route = createFileRoute('/play/$matchId')({
  loader: async ({ context }) => {
    if (!context.convexConfigured) return
    await context.queryClient.ensureQueryData(convexQuery(api.auth.currentUser, {}))
  },
  component: PlayRoute,
})

function PlayRoute() {
  const { convexConfigured } = Route.useRouteContext()
  const { matchId } = Route.useParams()

  const [actionMessage, setActionMessage] = useState('')
  const [actionBusy, setActionBusy] = useState(false)

  const submitAction = useConvexMutation(api.game.submitAction)

  const currentUser = useQuery({
    ...convexQuery(api.auth.currentUser, {}),
    enabled: convexConfigured,
  })
  const meta = useQuery({
    ...convexQuery(api.game.getMatchMeta, { matchId }),
    enabled: convexConfigured && currentUser.data != null,
    retry: false,
    refetchInterval: 2000,
  })

  const seat = useMemo(
    () =>
      resolveSeat(
        (meta.data ?? null) as MatchMeta | null,
        (currentUser.data as CurrentUser | undefined)?._id,
      ),
    [meta.data, currentUser.data],
  )

  const storyContext = useQuery({
    ...convexQuery(api.game.getStoryMatchContext, { matchId }),
    enabled:
      convexConfigured &&
      currentUser.data != null &&
      (meta.data as MatchMeta | undefined)?.mode === 'story',
    retry: false,
  })
  const snapshotVersion = useQuery({
    ...convexQuery(api.game.getLatestSnapshotVersion, { matchId }),
    enabled: convexConfigured && currentUser.data != null,
    retry: false,
    refetchInterval: 1200,
  })
  const playerView = useQuery({
    ...convexQuery(api.game.getPlayerView, { matchId, seat: seat ?? 'host' }),
    enabled: convexConfigured && currentUser.data != null && seat != null,
    retry: false,
    refetchInterval: 1000,
  })
  const openPrompt = useQuery({
    ...convexQuery(api.game.getOpenPrompt, { matchId, seat: seat ?? 'host' }),
    enabled: convexConfigured && currentUser.data != null && seat != null,
    retry: false,
    refetchInterval: 1000,
  })
  const recentEvents = useQuery({
    ...convexQuery(api.game.getRecentEvents, { matchId, sinceVersion: 0 }),
    enabled: convexConfigured && currentUser.data != null,
    retry: false,
    refetchInterval: 1000,
  })

  const parsedView = useMemo(
    () => summarizePlayerView(parseJsonRecord(playerView.data), seat ?? 'host'),
    [playerView.data, seat],
  )

  const eventRows = useMemo(
    () => ((recentEvents.data as EventBatch[] | undefined) ?? []).slice(-20).reverse(),
    [recentEvents.data],
  )

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Play Match</h1>
      <p className="text-xs text-stone-400">matchId: {matchId}</p>

      {!convexConfigured ? (
        <p className="text-sm text-amber-300">
          Add <code>VITE_CONVEX_URL</code> to load match data.
        </p>
      ) : currentUser.data == null ? (
        <p className="text-sm text-amber-300">Sign in to access this match.</p>
      ) : meta.isLoading ? (
        <p className="text-sm text-stone-400">Loading match meta…</p>
      ) : meta.isError ? (
        <p className="text-sm text-rose-300">
          Match unavailable or you are not a participant.
        </p>
      ) : seat == null ? (
        <p className="text-sm text-rose-300">You are not a participant in this match.</p>
      ) : (
        <>
          <article className="rounded border border-stone-700/40 p-3 text-sm">
            <h2 className="text-xs uppercase tracking-wide text-stone-400">Match state</h2>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Seat" value={seat} />
              <Stat
                label="Status"
                value={String((meta.data as MatchMeta | undefined)?.status ?? 'unknown')}
              />
              <Stat
                label="Phase"
                value={parsedView?.phase ?? 'loading'}
              />
              <Stat
                label="Turn"
                value={String(parsedView?.turnNumber ?? '-')}
              />
              <Stat
                label="My LP"
                value={String(parsedView?.myLifePoints ?? '-')}
              />
              <Stat
                label="Opponent LP"
                value={String(parsedView?.opponentLifePoints ?? '-')}
              />
              <Stat
                label="My Deck/Hand"
                value={`${parsedView?.myDeckCount ?? '-'} / ${parsedView?.myHandCount ?? '-'}`}
              />
              <Stat
                label="Opp Deck/Hand"
                value={`${parsedView?.opponentDeckCount ?? '-'} / ${parsedView?.opponentHandCount ?? '-'}`}
              />
            </div>
            <p className="mt-2 text-xs text-stone-400">
              Snapshot version: {String(snapshotVersion.data ?? 'n/a')}
            </p>
          </article>

          <article className="rounded border border-stone-700/40 p-3 text-sm">
            <h2 className="text-xs uppercase tracking-wide text-stone-400">Quick actions</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={async () => {
                  if (typeof snapshotVersion.data !== 'number') {
                    setActionMessage('State not synced yet. Wait and retry.')
                    return
                  }
                  setActionBusy(true)
                  setActionMessage('')
                  try {
                    await submitAction({
                      matchId,
                      seat,
                      expectedVersion: snapshotVersion.data,
                      command: JSON.stringify({ type: 'ADVANCE_PHASE' }),
                    })
                    setActionMessage('ADVANCE_PHASE submitted.')
                    await Promise.all([
                      meta.refetch(),
                      snapshotVersion.refetch(),
                      playerView.refetch(),
                      recentEvents.refetch(),
                    ])
                  } catch (error) {
                    setActionMessage(
                      error instanceof Error ? error.message : 'Advance phase failed.',
                    )
                  } finally {
                    setActionBusy(false)
                  }
                }}
                disabled={actionBusy}
                className="rounded border border-stone-600 px-3 py-1 text-xs disabled:opacity-50"
              >
                Advance Phase
              </button>
              <button
                onClick={async () => {
                  if (typeof snapshotVersion.data !== 'number') {
                    setActionMessage('State not synced yet. Wait and retry.')
                    return
                  }
                  setActionBusy(true)
                  setActionMessage('')
                  try {
                    await submitAction({
                      matchId,
                      seat,
                      expectedVersion: snapshotVersion.data,
                      command: JSON.stringify({ type: 'END_TURN' }),
                    })
                    setActionMessage('END_TURN submitted.')
                    await Promise.all([
                      meta.refetch(),
                      snapshotVersion.refetch(),
                      playerView.refetch(),
                      recentEvents.refetch(),
                    ])
                  } catch (error) {
                    setActionMessage(
                      error instanceof Error ? error.message : 'End turn failed.',
                    )
                  } finally {
                    setActionBusy(false)
                  }
                }}
                disabled={actionBusy}
                className="rounded border border-stone-600 px-3 py-1 text-xs disabled:opacity-50"
              >
                End Turn
              </button>
              <button
                onClick={async () => {
                  if (typeof snapshotVersion.data !== 'number') {
                    setActionMessage('State not synced yet. Wait and retry.')
                    return
                  }
                  setActionBusy(true)
                  setActionMessage('')
                  try {
                    await submitAction({
                      matchId,
                      seat,
                      expectedVersion: snapshotVersion.data,
                      command: JSON.stringify({ type: 'SURRENDER' }),
                    })
                    setActionMessage('SURRENDER submitted.')
                    await Promise.all([
                      meta.refetch(),
                      snapshotVersion.refetch(),
                      playerView.refetch(),
                      recentEvents.refetch(),
                    ])
                  } catch (error) {
                    setActionMessage(
                      error instanceof Error ? error.message : 'Surrender failed.',
                    )
                  } finally {
                    setActionBusy(false)
                  }
                }}
                disabled={actionBusy}
                className="rounded border border-rose-700/60 px-3 py-1 text-xs text-rose-300 disabled:opacity-50"
              >
                Surrender
              </button>
            </div>
            {actionMessage ? <p className="mt-2 text-xs text-stone-300">{actionMessage}</p> : null}
          </article>

          <article className="rounded border border-stone-700/40 p-3 text-sm">
            <h2 className="text-xs uppercase tracking-wide text-stone-400">Open prompt</h2>
            {openPrompt.isLoading ? (
              <p className="mt-2 text-stone-400">Checking prompt…</p>
            ) : openPrompt.isError ? (
              <p className="mt-2 text-rose-300">Failed to load open prompt.</p>
            ) : !openPrompt.data ? (
              <p className="mt-2 text-stone-400">No open prompt.</p>
            ) : (
              <pre className="mt-2 overflow-x-auto text-xs text-stone-300">
                {JSON.stringify(openPrompt.data, null, 2)}
              </pre>
            )}
          </article>

          <article className="rounded border border-stone-700/40 p-3 text-sm">
            <h2 className="text-xs uppercase tracking-wide text-stone-400">Recent events</h2>
            {recentEvents.isLoading ? (
              <p className="mt-2 text-stone-400">Loading events…</p>
            ) : recentEvents.isError ? (
              <p className="mt-2 text-rose-300">Failed to load events.</p>
            ) : eventRows.length === 0 ? (
              <p className="mt-2 text-stone-400">No events yet.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-xs">
                {eventRows.map((row) => (
                  <li
                    key={`${row.version}:${row.createdAt}`}
                    className="rounded border border-stone-700/40 px-2 py-1 text-stone-300"
                  >
                    <span className="text-stone-500">v{row.version}</span>{' '}
                    <span className="text-stone-400">{row.seat}</span>{' '}
                    <span>{parseCommandType(row)}</span>{' '}
                    <span className="text-stone-500">({parseEventCount(row)} events)</span>
                  </li>
                ))}
              </ul>
            )}
          </article>

          {(meta.data as MatchMeta | undefined)?.mode === 'story' ? (
            <article className="rounded border border-stone-700/40 p-3 text-sm">
              <h2 className="text-xs uppercase tracking-wide text-stone-400">Story Context</h2>
              {storyContext.isLoading ? (
                <p className="mt-2 text-stone-400">Loading story context…</p>
              ) : storyContext.isError ? (
                <p className="mt-2 text-rose-300">Failed to load story context.</p>
              ) : (
                <pre className="mt-2 overflow-x-auto text-xs text-stone-300">
                  {JSON.stringify(storyContext.data, null, 2)}
                </pre>
              )}
            </article>
          ) : null}

          <article className="rounded border border-stone-700/40 p-3 text-sm text-stone-400">
            Full board rendering remains pending. This route now includes live state,
            prompt visibility, recent event tracking, and core turn-control actions.
          </article>
        </>
      )}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-stone-700/40 p-2">
      <p className="text-[10px] uppercase tracking-wide text-stone-500">{label}</p>
      <p className="text-sm text-stone-200">{value}</p>
    </div>
  )
}
