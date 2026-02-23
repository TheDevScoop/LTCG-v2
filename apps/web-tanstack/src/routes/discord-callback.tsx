import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo } from 'react'
import { z } from 'zod'

const discordCallbackSearch = z.object({
  error: z.string().optional(),
  error_description: z.string().optional(),
  code: z.string().optional(),
})

export const Route = createFileRoute('/discord-callback')({
  validateSearch: discordCallbackSearch,
  component: DiscordCallbackRoute,
})

function DiscordCallbackRoute() {
  const search = Route.useSearch()

  const { hasAuthResult, message, isError } = useMemo(() => {
    const error = search.error?.trim()
    const errorDescription = search.error_description?.trim()
    const code = search.code?.trim()

    if (error) {
      const detail = errorDescription ? ` (${errorDescription})` : ''
      return {
        hasAuthResult: true,
        isError: true,
        message: `Discord authorization failed: ${error}${detail}`,
      }
    }

    if (code) {
      return {
        hasAuthResult: true,
        isError: false,
        message:
          'Discord authorization complete. You can close this window and return to Discord.',
      }
    }

    return {
      hasAuthResult: false,
      isError: false,
      message: 'This is the Discord OAuth callback page. You can return to the game.',
    }
  }, [search.code, search.error, search.error_description])

  useEffect(() => {
    if (!hasAuthResult) return

    const timeoutId = window.setTimeout(() => {
      try {
        window.close()
      } catch {
        // Some browsers disallow closing windows not opened via script.
      }
    }, 800)

    return () => window.clearTimeout(timeoutId)
  }, [hasAuthResult])

  return (
    <section className="min-h-screen flex items-center justify-center px-6">
      <article className="max-w-lg w-full rounded border border-stone-700/40 bg-stone-900/80 p-6">
        <h1 className="text-2xl font-black uppercase tracking-tighter text-stone-100 mb-3">
          Discord Callback
        </h1>
        <p className="text-sm text-stone-300">{message}</p>

        <div className="mt-6 flex gap-3">
          <a
            href="/"
            className={`rounded border px-4 py-2 text-sm ${
              isError
                ? 'border-rose-500/60 text-rose-200'
                : 'border-emerald-500/60 text-emerald-200'
            }`}
          >
            Return Home
          </a>
          <button
            onClick={() => window.close()}
            className="rounded border border-stone-600 px-4 py-2 text-sm text-stone-200"
          >
            Close
          </button>
        </div>
      </article>
    </section>
  )
}
