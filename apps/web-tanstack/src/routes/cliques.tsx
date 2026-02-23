import { convexQuery, useConvexMutation } from '@convex-dev/react-query'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { api } from '~/lib/convexApi'

type Dashboard = {
  myArchetype: string | null
  myClique: { name: string; archetype: string; memberCount: number; totalWins: number } | null
  totalPlayers: number
  leaderboard: Array<{
    _id: string
    name: string
    archetype: string
    memberCount: number
    totalWins: number
    rank: number
    isMyClique: boolean
  }>
}

const currentUserQuery = convexQuery(api.auth.currentUser, {})
const dashboardQuery = convexQuery(api.cliques.getCliqueDashboard, {})

export const Route = createFileRoute('/cliques')({
  loader: async ({ context }) => {
    if (!context.convexConfigured) return
    await context.queryClient.ensureQueryData(currentUserQuery)
  },
  component: CliquesRoute,
})

function CliquesRoute() {
  const { convexConfigured } = Route.useRouteContext()
  const [message, setMessage] = useState('')

  const currentUser = useQuery({
    ...currentUserQuery,
    enabled: convexConfigured,
  })
  const dashboard = useQuery({
    ...dashboardQuery,
    enabled: convexConfigured && currentUser.data != null,
    retry: false,
  })
  const ensureAssignment = useConvexMutation(api.cliques.ensureMyCliqueAssignment)

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Cliques</h1>
      {!convexConfigured ? (
        <p className="text-sm text-amber-300">
          Add <code>VITE_CONVEX_URL</code> to load clique data.
        </p>
      ) : currentUser.data == null ? (
        <p className="text-sm text-amber-300">Sign in to join and view cliques.</p>
      ) : dashboard.isLoading ? (
        <p className="text-sm text-stone-400">Loading clique dashboard…</p>
      ) : dashboard.isError ? (
        <p className="text-sm text-rose-300">Failed to load clique dashboard.</p>
      ) : (
        <CliquesDashboard
          data={dashboard.data as Dashboard}
          onRefresh={async () => {
            try {
              const result = await ensureAssignment({})
              setMessage(JSON.stringify(result))
              await dashboard.refetch()
            } catch (err) {
              setMessage(err instanceof Error ? err.message : 'Refresh failed')
            }
          }}
        />
      )}
      {message ? <p className="text-sm text-stone-300">{message}</p> : null}
    </section>
  )
}

function CliquesDashboard({
  data,
  onRefresh,
}: {
  data: Dashboard
  onRefresh: () => Promise<void>
}) {
  return (
    <div className="space-y-3">
      <article className="rounded border border-stone-700/40 p-3 text-sm">
        <h2 className="text-xs uppercase tracking-wide text-stone-400">My clique</h2>
        <p className="mt-2 text-stone-200">
          {data.myClique ? `${data.myClique.name} (${data.myClique.archetype})` : 'Not assigned'}
        </p>
        <p className="text-xs text-stone-400">
          Archetype: {data.myArchetype ?? 'none'} · Total players: {data.totalPlayers}
        </p>
        <button
          onClick={onRefresh}
          className="mt-2 rounded border border-stone-600 px-2 py-1 text-xs"
        >
          Refresh assignment
        </button>
      </article>

      <article className="rounded border border-stone-700/40 p-3 text-sm">
        <h2 className="text-xs uppercase tracking-wide text-stone-400">Leaderboard</h2>
        <div className="mt-2 space-y-1">
          {data.leaderboard.slice(0, 12).map((row) => (
            <div
              key={row._id}
              className={`flex items-center justify-between rounded border px-2 py-1 text-xs ${
                row.isMyClique ? 'border-cyan-700/60' : 'border-stone-700/40'
              }`}
            >
              <span>
                #{row.rank} {row.name}
              </span>
              <span className="text-stone-400">
                {row.memberCount} members · {row.totalWins} wins
              </span>
            </div>
          ))}
        </div>
      </article>
    </div>
  )
}
