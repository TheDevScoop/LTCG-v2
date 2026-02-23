import { convexQuery } from '@convex-dev/react-query'
import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  DEFAULT_SIGNUP_AVATAR_PATH,
  isSignupAvatarPath,
} from '~/lib/signupAvatarCatalog'
import { blob } from '~/lib/blob'
import { api } from '~/lib/convexApi'

type CurrentUser = {
  _id: string
  username?: string
  name?: string
  email?: string
  avatarPath?: string
  createdAt?: number
  activeDeckId?: string
}

type PlayerRank = {
  rank?: number | null
  rating?: number
  peakRating?: number
  tier?: string
  gamesPlayed?: number
}

type DeckSummary = {
  deckId: string
}

const currentUserQuery = convexQuery(api.auth.currentUser, {})
const rankQuery = convexQuery(api.ranked.getPlayerRank, {})
const userDecksQuery = convexQuery(api.game.getUserDecks, {})

export const Route = createFileRoute('/profile')({
  loader: async ({ context }) => {
    if (!context.convexConfigured) return
    await context.queryClient.ensureQueryData(currentUserQuery)
  },
  component: ProfileRoute,
})

function formatJoinedDate(timestamp: number | undefined): string {
  if (!timestamp) return 'Unknown'
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(timestamp)
}

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
  const decks = useQuery({
    ...userDecksQuery,
    enabled: convexConfigured && currentUser.data != null,
    retry: false,
  })

  const user = (currentUser.data ?? null) as CurrentUser | null
  const ranking = (rank.data ?? null) as PlayerRank | null
  const deckRows = (decks.data ?? []) as DeckSummary[]

  const avatarPath =
    user && isSignupAvatarPath(user.avatarPath)
      ? user.avatarPath
      : DEFAULT_SIGNUP_AVATAR_PATH
  const avatarUrl = blob(avatarPath)

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
        <>
          <article className="rounded border border-stone-700/40 p-3">
            <div className="flex gap-4">
              <img
                src={avatarUrl}
                alt={`${user?.username ?? 'Player'} avatar`}
                className="h-24 w-24 rounded object-cover"
                loading="lazy"
              />
              <div className="space-y-1 text-sm">
                <p className="text-lg font-semibold text-stone-100">
                  {user?.name ?? user?.username ?? 'Player'}
                </p>
                <p className="text-stone-300">{user?.email ?? 'no email'}</p>
                <p className="text-xs text-stone-500">Joined: {formatJoinedDate(user?.createdAt)}</p>
                <p className="text-xs text-stone-500">
                  Active deck: {user?.activeDeckId ?? 'none selected'}
                </p>
              </div>
            </div>
          </article>

          <div className="grid gap-3 sm:grid-cols-2">
            <article className="rounded border border-stone-700/40 p-3 text-sm">
              <h2 className="text-xs uppercase tracking-wide text-stone-400">Decks</h2>
              {decks.isLoading ? (
                <p className="mt-2 text-stone-400">Loading deck stats…</p>
              ) : decks.isError ? (
                <p className="mt-2 text-amber-300">Could not load deck count.</p>
              ) : (
                <>
                  <p className="mt-2 text-stone-200">
                    {deckRows.length} deck{deckRows.length === 1 ? '' : 's'} in collection.
                  </p>
                  <Link
                    to="/decks"
                    className="mt-3 inline-block rounded border border-stone-600 px-3 py-1 text-xs"
                  >
                    Open Decks
                  </Link>
                </>
              )}
            </article>

            <article className="rounded border border-stone-700/40 p-3 text-sm">
              <h2 className="text-xs uppercase tracking-wide text-stone-400">Ranked Snapshot</h2>
              {rank.isLoading ? (
                <p className="mt-2 text-stone-400">Loading rank data…</p>
              ) : rank.isError ? (
                <p className="mt-2 text-stone-400">No ranked data yet.</p>
              ) : (
                <div className="mt-2 space-y-1">
                  <p className="text-stone-200">Tier: {ranking?.tier ?? 'bronze'}</p>
                  <p className="text-stone-200">Rating: {ranking?.rating ?? 1000}</p>
                  <p className="text-stone-200">Peak: {ranking?.peakRating ?? 1000}</p>
                  <p className="text-stone-200">
                    Rank: {ranking?.rank == null ? 'unranked' : `#${ranking.rank}`}
                  </p>
                  <p className="text-stone-200">Games: {ranking?.gamesPlayed ?? 0}</p>
                </div>
              )}
            </article>
          </div>
        </>
      )}

      <div className="flex gap-2">
        <Link to="/settings" className="rounded border border-stone-600 px-3 py-1 text-xs">
          Edit Settings
        </Link>
        <Link to="/collection" className="rounded border border-stone-600 px-3 py-1 text-xs">
          Collection
        </Link>
        <Link to="/cliques" className="rounded border border-stone-600 px-3 py-1 text-xs">
          Cliques
        </Link>
      </div>
    </section>
  )
}
