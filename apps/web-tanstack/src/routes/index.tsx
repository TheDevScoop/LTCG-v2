import { convexQuery } from '@convex-dev/react-query'
import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { api } from '~/lib/convexApi'

const getAllCardsQuery = convexQuery(api.cards.getAllCards, {})
const currentUserQuery = convexQuery(api.auth.currentUser, {})

export const Route = createFileRoute('/')({
  loader: async ({ context }) => {
    if (!context.convexConfigured) return
    await context.queryClient.ensureQueryData(getAllCardsQuery)
  },
  component: Home,
})

function Home() {
  const { convexConfigured } = Route.useRouteContext()
  const cardsQuery = useQuery({
    ...getAllCardsQuery,
    enabled: convexConfigured,
  })
  const currentUser = useQuery({
    ...currentUserQuery,
    enabled: convexConfigured,
    retry: false,
  })
  const cardCount = cardsQuery.data?.length ?? 0
  const previewNames =
    cardsQuery.data
      ?.slice(0, 5)
      .map((card: Record<string, unknown>) =>
        String(
          card.name ??
            card.id ??
            'unknown',
        ),
      )
      .join(', ') ?? ''

  const signedIn = Boolean(currentUser.data)

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">LunchTable TCG</h1>
      <p className="text-sm text-stone-300">
        TanStack Start migration launchpad with live Convex wiring.
      </p>

      {!convexConfigured ? (
        <p className="text-sm text-amber-300">
          Add <code>VITE_CONVEX_URL</code> to run live data queries.
        </p>
      ) : (
        <>
          <article className="rounded border border-stone-700/40 p-3 text-sm text-stone-200">
            <p>
              <strong>Auth:</strong> {signedIn ? 'signed in' : 'guest'}
            </p>
            <p>
              <strong>Total cards:</strong> {cardCount}
            </p>
            <p>
              <strong>Sample cards:</strong> {previewNames || 'No cards returned yet'}
            </p>
          </article>

          <article className="rounded border border-stone-700/40 p-3 text-sm">
            <h2 className="text-xs uppercase tracking-wide text-stone-400">Core modes</h2>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <LaunchLink
                to="/story"
                title="Story Mode"
                subtitle="Chapter map + stage launches"
                requiresAuth
                signedIn={signedIn}
              />
              <LaunchLink
                to="/collection"
                title="Collection"
                subtitle="Owned cards and catalog"
                requiresAuth
                signedIn={signedIn}
              />
              <LaunchLink
                to="/decks"
                title="Deck Builder"
                subtitle="Build and save legal decks"
                requiresAuth
                signedIn={signedIn}
              />
              <LaunchLink
                to="/pvp"
                title="PvP Lobby"
                subtitle="Create/join public and private lobbies"
                requiresAuth
                signedIn={signedIn}
              />
              <LaunchLink
                to="/duel"
                title="Direct Duel"
                subtitle="Share match IDs and deep links"
                requiresAuth
                signedIn={signedIn}
              />
              <LaunchLink
                to="/watch"
                title="Watch Live"
                subtitle="retake.tv stream directory"
                requiresAuth={false}
                signedIn={signedIn}
              />
            </div>
          </article>

          <article className="rounded border border-stone-700/40 p-3 text-sm">
            <h2 className="text-xs uppercase tracking-wide text-stone-400">Ops + diagnostics</h2>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <LaunchLink
                to="/leaderboard"
                title="Leaderboard"
                subtitle="Ranked data and tiers"
                requiresAuth={false}
                signedIn={signedIn}
              />
              <LaunchLink
                to="/stream-overlay"
                title="Stream Overlay"
                subtitle="Agent/match spectator diagnostics"
                requiresAuth={false}
                signedIn={signedIn}
              />
              <LaunchLink
                to="/agent-dev"
                title="Agent Dev"
                subtitle="Agent tooling shell"
                requiresAuth={false}
                signedIn={signedIn}
              />
            </div>
          </article>
        </>
      )}
    </section>
  )
}

function LaunchLink({
  to,
  title,
  subtitle,
  requiresAuth,
  signedIn,
}: {
  to:
    | '/story'
    | '/collection'
    | '/decks'
    | '/pvp'
    | '/duel'
    | '/watch'
    | '/leaderboard'
    | '/stream-overlay'
    | '/agent-dev'
  title: string
  subtitle: string
  requiresAuth: boolean
  signedIn: boolean
}) {
  const blocked = requiresAuth && !signedIn

  return (
    <Link
      to={to}
      disabled={blocked}
      className={`rounded border p-3 transition-colors ${
        blocked
          ? 'cursor-not-allowed border-stone-800/80 bg-stone-950/40 text-stone-500'
          : 'border-stone-700/40 hover:border-stone-500 text-stone-200'
      }`}
    >
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-xs text-stone-400">{subtitle}</p>
      {blocked ? <p className="mt-2 text-[11px] text-amber-400">Sign in required</p> : null}
    </Link>
  )
}
