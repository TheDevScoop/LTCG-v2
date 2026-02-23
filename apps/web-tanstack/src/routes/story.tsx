import { convexQuery } from '@convex-dev/react-query'
import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { api } from '~/lib/convexApi'

type StoryChapter = {
  _id: string
  title?: string
  chapterTitle?: string
  actNumber?: number
  chapterNumber?: number
  status?: string
}

const chaptersQuery = convexQuery(api.game.getChapters, {})
const currentUserQuery = convexQuery(api.auth.currentUser, {})
const storyProgressQuery = convexQuery(api.game.getStoryProgress, {})
const stageProgressQuery = convexQuery(api.game.getStageProgress, {})

export const Route = createFileRoute('/story')({
  loader: async ({ context }) => {
    if (!context.convexConfigured) return
    await context.queryClient.ensureQueryData(chaptersQuery)
  },
  component: StoryRoute,
})

function StoryRoute() {
  const { convexConfigured } = Route.useRouteContext()
  const chapters = useQuery({
    ...chaptersQuery,
    enabled: convexConfigured,
  })
  const currentUser = useQuery({
    ...currentUserQuery,
    enabled: convexConfigured,
  })
  const chapterProgress = useQuery({
    ...storyProgressQuery,
    enabled: convexConfigured && currentUser.data != null,
    retry: false,
  })
  const stageProgress = useQuery({
    ...stageProgressQuery,
    enabled: convexConfigured && currentUser.data != null,
    retry: false,
  })

  const rows = [...((chapters.data ?? []) as StoryChapter[])].sort((a, b) => {
    const act = (a.actNumber ?? 0) - (b.actNumber ?? 0)
    if (act !== 0) return act
    return (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0)
  })

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Story</h1>

      {!convexConfigured ? (
        <p className="text-sm text-amber-300">
          Add <code>VITE_CONVEX_URL</code> to load story data.
        </p>
      ) : (
        <>
          <div className="rounded border border-stone-700/40 p-3 text-xs text-stone-300">
            <p>Published chapters: {rows.length}</p>
            <p>
              Progress entries: {Array.isArray(chapterProgress.data) ? chapterProgress.data.length : 0}
            </p>
            <p>
              Stage clears: {Array.isArray(stageProgress.data) ? stageProgress.data.length : 0}
            </p>
          </div>

          {chapters.isLoading ? (
            <p className="text-sm text-stone-400">Loading chapters…</p>
          ) : chapters.isError ? (
            <p className="text-sm text-rose-300">Failed to load chapters.</p>
          ) : (
            <div className="grid gap-2">
              {rows.map((chapter) => (
                <Link
                  key={chapter._id}
                  to="/story/$chapterId"
                  params={{ chapterId: chapter._id }}
                  className="rounded border border-stone-700/40 p-3 hover:border-stone-500"
                >
                  <h2 className="text-sm font-semibold">
                    {chapter.title ?? chapter.chapterTitle ?? chapter._id}
                  </h2>
                  <p className="mt-1 text-xs text-stone-400">
                    Act {chapter.actNumber ?? '?'} · Chapter {chapter.chapterNumber ?? '?'} ·{' '}
                    {chapter.status ?? 'published'}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
