import { convexQuery } from '@convex-dev/react-query'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { api } from '~/lib/convexApi'

type UserDoc = {
  _id: string
  username?: string
  email?: string
  activeDeckId?: string
  createdAt?: number
}

const currentUserQuery = convexQuery(api.auth.currentUser, {})
const rankQuery = convexQuery(api.ranked.getPlayerRank, {})

export const Route = createFileRoute('/profile')({
  loader: async ({ context }) => {
    if (!context.convexConfigured) return
    await context.queryClient.ensureQueryData(currentUserQuery)
  },
  component: ProfileRoute,
})

function ProfileRoute() {
  const { convexConfigured } = Route.useRouteContext()
  const currentUser = useQuery({
    ...currentUserQuery,
    enabled: convexConfigured,
  })
  const rank = useQuery({
    ...rankQuery,
    enabled: convexConfigured && currentUser.data != null,
    retry: false,
  })

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Profile</h1>
      {!convexConfigured ? (
        <p className="text-sm text-amber-300">
          Add <code>VITE_CONVEX_URL</code> to load profile data.
        </p>
      ) : currentUser.data == null ? (
        <p className="text-sm text-amber-300">Sign in to view profile.</p>
      ) : (
        <ProfileDetails
          user={currentUser.data as UserDoc}
          rank={rank.data as Record<string, unknown> | undefined}
        />
      )}
    </section>
  )
}

function ProfileDetails({
  user,
  rank,
}: {
  user: UserDoc
  rank: Record<string, unknown> | undefined
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <article className="rounded border border-stone-700/40 p-3 text-sm">
        <h2 className="text-xs uppercase tracking-wide text-stone-400">User</h2>
        <p className="mt-2 text-stone-200">{user.username ?? 'Unknown user'}</p>
        <p className="text-xs text-stone-400">{user.email ?? 'no email'}</p>
        <p className="mt-1 text-xs text-stone-400">id: {user._id}</p>
      </article>
      <article className="rounded border border-stone-700/40 p-3 text-sm">
        <h2 className="text-xs uppercase tracking-wide text-stone-400">Ranked</h2>
        {rank ? (
          <pre className="mt-2 overflow-x-auto text-xs text-stone-300">
            {JSON.stringify(rank, null, 2)}
          </pre>
        ) : (
          <p className="mt-2 text-stone-400">No ranked snapshot available.</p>
        )}
      </article>
    </div>
  )
}
