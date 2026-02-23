import { convexQuery } from '@convex-dev/react-query'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { api } from '~/lib/convexApi'

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

  const currentUser = useQuery({
    ...convexQuery(api.auth.currentUser, {}),
    enabled: convexConfigured,
  })
  const meta = useQuery({
    ...convexQuery(api.game.getMatchMeta, { matchId }),
    enabled: convexConfigured && currentUser.data != null,
    retry: false,
  })
  const storyContext = useQuery({
    ...convexQuery(api.game.getStoryMatchContext, { matchId }),
    enabled:
      convexConfigured &&
      currentUser.data != null &&
      (meta.data as Record<string, unknown> | undefined)?.mode === 'story',
    retry: false,
  })
  const snapshotVersion = useQuery({
    ...convexQuery(api.game.getLatestSnapshotVersion, { matchId }),
    enabled: convexConfigured && currentUser.data != null,
    retry: false,
  })

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
      ) : (
        <>
          <article className="rounded border border-stone-700/40 p-3 text-sm">
            <h2 className="text-xs uppercase tracking-wide text-stone-400">Meta</h2>
            <pre className="mt-2 overflow-x-auto text-xs text-stone-300">
              {JSON.stringify(meta.data, null, 2)}
            </pre>
          </article>
          <article className="rounded border border-stone-700/40 p-3 text-sm">
            <h2 className="text-xs uppercase tracking-wide text-stone-400">Snapshot</h2>
            {snapshotVersion.isLoading ? (
              <p className="mt-2 text-stone-400">Loading snapshot version…</p>
            ) : snapshotVersion.isError ? (
              <p className="mt-2 text-rose-300">Failed to load snapshot version.</p>
            ) : (
              <p className="mt-2 text-stone-300">
                Latest version: {String(snapshotVersion.data)}
              </p>
            )}
          </article>
          {(meta.data as Record<string, unknown> | undefined)?.mode === 'story' ? (
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
          <div className="rounded border border-stone-700/40 p-3 text-sm text-stone-400">
            Gameplay board migration is pending. This route is now wired for match
            metadata and story context retrieval.
          </div>
        </>
      )}
    </section>
  )
}
