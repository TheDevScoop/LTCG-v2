/// <reference types="vite/client" />
import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { ConvexProvider } from 'convex/react'
import * as React from 'react'
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary'
import { NotFound } from '~/components/NotFound'
import appCss from '~/styles/app.css?url'
import type { RouterContext } from '~/routerContext'

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      { title: 'LTCG TanStack Migration' },
      {
        name: 'description',
        content:
          'Initial TanStack Start migration shell for LunchTable TCG with Convex integration.',
      },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.ico' },
    ],
  }),
  errorComponent: DefaultCatchBoundary,
  notFoundComponent: () => <NotFound />,
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const { queryClient, convexQueryClient, convexConfigured } =
    Route.useRouteContext()

  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <ConvexProvider client={convexQueryClient.convexClient}>
            <div className="p-4 flex flex-col gap-4">
              <header className="flex items-center justify-between border-b border-stone-700/30 pb-2">
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    to="/"
                    activeProps={{ className: 'font-bold' }}
                    activeOptions={{ exact: true }}
                    className="text-lg"
                  >
                    LTCG TanStack Migration
                  </Link>
                  <Link
                    to="/cards"
                    activeProps={{ className: 'font-semibold text-stone-100' }}
                    className="text-sm text-stone-400"
                  >
                    Cards
                  </Link>
                  <Link
                    to="/collection"
                    activeProps={{ className: 'font-semibold text-stone-100' }}
                    className="text-sm text-stone-400"
                  >
                    Collection
                  </Link>
                  <Link
                    to="/decks"
                    activeProps={{ className: 'font-semibold text-stone-100' }}
                    className="text-sm text-stone-400"
                  >
                    Decks
                  </Link>
                  <Link
                    to="/pvp"
                    activeProps={{ className: 'font-semibold text-stone-100' }}
                    className="text-sm text-stone-400"
                  >
                    PvP
                  </Link>
                  <Link
                    to="/duel"
                    activeProps={{ className: 'font-semibold text-stone-100' }}
                    className="text-sm text-stone-400"
                  >
                    Duel
                  </Link>
                  <Link
                    to="/play/$matchId"
                    params={{ matchId: 'demo-match' }}
                    activeProps={{ className: 'font-semibold text-stone-100' }}
                    className="text-sm text-stone-400"
                  >
                    Play
                  </Link>
                  <Link
                    to="/story"
                    activeProps={{ className: 'font-semibold text-stone-100' }}
                    className="text-sm text-stone-400"
                  >
                    Story
                  </Link>
                  <Link
                    to="/leaderboard"
                    activeProps={{ className: 'font-semibold text-stone-100' }}
                    className="text-sm text-stone-400"
                  >
                    Leaderboard
                  </Link>
                  <Link
                    to="/onboarding"
                    activeProps={{ className: 'font-semibold text-stone-100' }}
                    className="text-sm text-stone-400"
                  >
                    Onboarding
                  </Link>
                  <Link
                    to="/profile"
                    activeProps={{ className: 'font-semibold text-stone-100' }}
                    className="text-sm text-stone-400"
                  >
                    Profile
                  </Link>
                  <Link
                    to="/settings"
                    activeProps={{ className: 'font-semibold text-stone-100' }}
                    className="text-sm text-stone-400"
                  >
                    Settings
                  </Link>
                  <Link
                    to="/about"
                    activeProps={{ className: 'font-semibold text-stone-100' }}
                    className="text-sm text-stone-400"
                  >
                    About
                  </Link>
                  <Link
                    to="/watch"
                    activeProps={{ className: 'font-semibold text-stone-100' }}
                    className="text-sm text-stone-400"
                  >
                    Watch
                  </Link>
                  <Link
                    to="/cliques"
                    activeProps={{ className: 'font-semibold text-stone-100' }}
                    className="text-sm text-stone-400"
                  >
                    Cliques
                  </Link>
                  <Link
                    to="/studio"
                    activeProps={{ className: 'font-semibold text-stone-100' }}
                    className="text-sm text-stone-400"
                  >
                    Studio
                  </Link>
                  <Link
                    to="/agent-dev"
                    activeProps={{ className: 'font-semibold text-stone-100' }}
                    className="text-sm text-stone-400"
                  >
                    Agent
                  </Link>
                  <Link
                    to="/token"
                    activeProps={{ className: 'font-semibold text-stone-100' }}
                    className="text-sm text-stone-400"
                  >
                    Token
                  </Link>
                </div>
                <span
                  className={`text-xs uppercase tracking-wide ${
                    convexConfigured ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {convexConfigured ? 'Convex connected' : 'Convex not configured'}
                </span>
              </header>
              {children}
              <footer className="flex items-center gap-4 border-t border-stone-700/30 pt-3 text-xs text-stone-400">
                <Link to="/privacy" activeProps={{ className: 'text-stone-200' }}>
                  Privacy
                </Link>
                <Link to="/terms" activeProps={{ className: 'text-stone-200' }}>
                  Terms
                </Link>
              </footer>
            </div>
            <TanStackRouterDevtools position="bottom-right" />
            <Scripts />
          </ConvexProvider>
        </QueryClientProvider>
      </body>
    </html>
  )
}
