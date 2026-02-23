import { convexQuery, useConvexMutation } from '@convex-dev/react-query'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '~/lib/convexApi'

type Clique = {
  _id: string
  name: string
  archetype: string
  description: string
  memberCount: number
  totalWins: number
}

type CliqueMember = {
  _id: string
  username?: string
  name?: string
  cliqueRole?: 'member' | 'leader' | 'founder'
  createdAt: number
}

type LeaderboardClique = Clique & {
  rank: number
  isMyClique: boolean
}

type Dashboard = {
  myArchetype: string | null
  myClique: Clique | null
  myCliqueMembers: CliqueMember[]
  myCliqueMemberOverflow: number
  totalPlayers: number
  leaderboard: LeaderboardClique[]
}

type EnsureAssignmentResult = {
  status: 'assigned' | 'already_assigned' | 'missing_starter_deck' | 'missing_clique'
  reason: string
  archetype: string | null
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
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [assigning, setAssigning] = useState(false)
  const attemptedAutoAssign = useRef(false)

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

  const data = (dashboard.data ?? null) as Dashboard | null
  const myRank = useMemo(
    () => data?.leaderboard.find((row) => row.isMyClique)?.rank ?? null,
    [data?.leaderboard],
  )
  const membershipShare =
    data?.myClique && data.totalPlayers > 0
      ? Math.round((data.myClique.memberCount / data.totalPlayers) * 100)
      : 0

  useEffect(() => {
    if (!convexConfigured || currentUser.data == null) return
    if (!data) return
    if (data.myClique) {
      attemptedAutoAssign.current = false
      return
    }
    if (!data.myArchetype || attemptedAutoAssign.current) return

    attemptedAutoAssign.current = true
    setAssigning(true)
    setError('')
    setNotice('')

    void ensureAssignment({})
      .then((result) => {
        const typed = result as EnsureAssignmentResult
        if (typed.status === 'assigned' || typed.status === 'already_assigned') {
          setNotice(`Clique assignment ready: ${typed.reason}`)
        } else {
          setError(typed.reason)
        }
        return dashboard.refetch()
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Auto-assignment failed.')
      })
      .finally(() => {
        setAssigning(false)
      })
  }, [
    convexConfigured,
    currentUser.data,
    data,
    ensureAssignment,
    dashboard,
  ])

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Cliques</h1>
      <p className="text-sm text-stone-300">
        Guild standings and roster data tied to your starter archetype.
      </p>

      {!convexConfigured ? (
        <p className="text-sm text-amber-300">
          Add <code>VITE_CONVEX_URL</code> to load clique data.
        </p>
      ) : currentUser.data == null ? (
        <p className="text-sm text-amber-300">Sign in to view and join cliques.</p>
      ) : dashboard.isLoading ? (
        <p className="text-sm text-stone-400">Loading clique dashboard…</p>
      ) : dashboard.isError ? (
        <p className="text-sm text-rose-300">Failed to load clique dashboard.</p>
      ) : !data ? (
        <p className="text-sm text-stone-400">No dashboard data available.</p>
      ) : (
        <>
          <article className="rounded border border-stone-700/40 p-3 text-sm">
            <h2 className="text-xs uppercase tracking-wide text-stone-400">My clique</h2>
            <p className="mt-2 text-stone-200">
              {data.myClique ? `${data.myClique.name} (${data.myClique.archetype})` : 'Unassigned'}
            </p>
            <p className="text-xs text-stone-400">
              Archetype: {data.myArchetype ?? 'none'} · Total players: {data.totalPlayers}
            </p>
            {data.myClique ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <Stat label="Rank" value={myRank != null ? `#${myRank}` : '-'} />
                <Stat label="Members" value={String(data.myClique.memberCount)} />
                <Stat label="Share" value={`${membershipShare}%`} />
              </div>
            ) : null}
            <button
              onClick={async () => {
                setAssigning(true)
                setError('')
                setNotice('')
                try {
                  const result = (await ensureAssignment({})) as EnsureAssignmentResult
                  if (result.status === 'assigned' || result.status === 'already_assigned') {
                    setNotice(result.reason)
                  } else {
                    setError(result.reason)
                  }
                  await dashboard.refetch()
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Refresh failed')
                } finally {
                  setAssigning(false)
                }
              }}
              disabled={assigning}
              className="mt-2 rounded border border-stone-600 px-2 py-1 text-xs disabled:opacity-50"
            >
              {assigning ? 'Assigning…' : 'Refresh assignment'}
            </button>
          </article>

          <article className="rounded border border-stone-700/40 p-3 text-sm">
            <h2 className="text-xs uppercase tracking-wide text-stone-400">My roster</h2>
            {!data.myClique ? (
              <p className="mt-2 text-stone-400">Join/assign a clique to see roster data.</p>
            ) : data.myCliqueMembers.length === 0 ? (
              <p className="mt-2 text-stone-400">No members loaded yet.</p>
            ) : (
              <div className="mt-2 space-y-1">
                {data.myCliqueMembers.map((member) => (
                  <div
                    key={member._id}
                    className="flex items-center justify-between rounded border border-stone-700/40 px-2 py-1 text-xs"
                  >
                    <span className="text-stone-200">
                      {member.username ?? member.name ?? member._id}
                    </span>
                    <span className="text-stone-500">{member.cliqueRole ?? 'member'}</span>
                  </div>
                ))}
                {data.myCliqueMemberOverflow > 0 ? (
                  <p className="text-xs text-stone-500">
                    +{data.myCliqueMemberOverflow} more members not shown
                  </p>
                ) : null}
              </div>
            )}
          </article>

          <article className="rounded border border-stone-700/40 p-3 text-sm">
            <h2 className="text-xs uppercase tracking-wide text-stone-400">Leaderboard</h2>
            <div className="mt-2 space-y-1">
              {data.leaderboard.slice(0, 16).map((row) => (
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
        </>
      )}

      {notice ? <p className="text-sm text-emerald-300">{notice}</p> : null}
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
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
