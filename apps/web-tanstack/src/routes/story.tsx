import { convexQuery } from '@convex-dev/react-query'
import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { api } from '~/lib/convexApi'

type StoryChapter = {
  _id: string
  title?: string
  chapterTitle?: string
  actNumber?: number
  chapterNumber?: number
  status?: string
}

type ChapterProgress = {
  actNumber?: number
  chapterNumber?: number
  status?: string
  starsEarned?: number
  timesCompleted?: number
  lastAttemptedAt?: number
}

type StageProgress = {
  chapterId?: string
  status?: string
  starsEarned?: number
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

  const rows = useMemo(
    () =>
      [...((chapters.data ?? []) as StoryChapter[])].sort((a, b) => {
        const act = (a.actNumber ?? 0) - (b.actNumber ?? 0)
        if (act !== 0) return act
        return (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0)
      }),
    [chapters.data],
  )

  const chapterProgressByKey = useMemo(() => {
    const map = new Map<string, ChapterProgress>()
    for (const row of (chapterProgress.data ?? []) as ChapterProgress[]) {
      const act = typeof row.actNumber === 'number' ? row.actNumber : null
      const chapter = typeof row.chapterNumber === 'number' ? row.chapterNumber : null
      if (act == null || chapter == null) continue
      map.set(`${act}:${chapter}`, row)
    }
    return map
  }, [chapterProgress.data])

  const stageProgressByChapterId = useMemo(() => {
    const map = new Map<string, StageProgress[]>()
    for (const row of (stageProgress.data ?? []) as StageProgress[]) {
      if (typeof row.chapterId !== 'string') continue
      const existing = map.get(row.chapterId) ?? []
      existing.push(row)
      map.set(row.chapterId, existing)
    }
    return map
  }, [stageProgress.data])

  const completedChapters = [...chapterProgressByKey.values()].filter(
    (entry) => entry.status === 'completed',
  ).length

  const totalStageClears = [...stageProgressByChapterId.values()]
    .flat()
    .filter((entry) => entry.status === 'completed' || entry.status === 'starred').length

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
            <p>Completed chapters: {completedChapters}</p>
            <p>Total stage clears: {totalStageClears}</p>
            <p>
              Story progress entries:{' '}
              {Array.isArray(chapterProgress.data) ? chapterProgress.data.length : 0}
            </p>
          </div>

          {chapters.isLoading ? (
            <p className="text-sm text-stone-400">Loading chapters…</p>
          ) : chapters.isError ? (
            <p className="text-sm text-rose-300">Failed to load chapters.</p>
          ) : (
            <div className="grid gap-2">
              {rows.map((chapter) => {
                const chapterKey = `${chapter.actNumber ?? 0}:${chapter.chapterNumber ?? 0}`
                const progress = chapterProgressByKey.get(chapterKey)
                const chapterStageProgress = stageProgressByChapterId.get(chapter._id) ?? []
                const clearedStages = chapterStageProgress.filter(
                  (entry) => entry.status === 'completed' || entry.status === 'starred',
                ).length
                const chapterStars = chapterStageProgress.reduce(
                  (sum, entry) => sum + (entry.starsEarned ?? 0),
                  0,
                )

                return (
                  <Link
                    key={chapter._id}
                    to="/story/$chapterId"
                    params={{ chapterId: chapter._id }}
                    className="rounded border border-stone-700/40 p-3 hover:border-stone-500"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-sm font-semibold">
                        {chapter.title ?? chapter.chapterTitle ?? chapter._id}
                      </h2>
                      <span className="rounded border border-stone-700/40 px-2 py-[2px] text-[10px] uppercase tracking-wide text-stone-300">
                        {progress?.status ?? 'available'}
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-stone-400">
                      Act {chapter.actNumber ?? '?'} · Chapter {chapter.chapterNumber ?? '?'} ·{' '}
                      {chapter.status ?? 'published'}
                    </p>

                    <div className="mt-2 grid gap-1 text-xs text-stone-300 sm:grid-cols-3">
                      <p>Stars: {chapterStars}</p>
                      <p>Stage clears: {clearedStages}</p>
                      <p>Chapter clears: {progress?.timesCompleted ?? 0}</p>
                    </div>

                    {typeof progress?.lastAttemptedAt === 'number' ? (
                      <p className="mt-1 text-[11px] text-stone-500">
                        Last attempt:{' '}
                        {new Date(progress.lastAttemptedAt).toLocaleString()}
                      </p>
                    ) : null}
                  </Link>
                )
              })}
            </div>
          )}
        </>
      )}
    </section>
  )
}
