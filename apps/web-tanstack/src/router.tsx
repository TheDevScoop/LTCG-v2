import { ConvexQueryClient } from '@convex-dev/react-query'
import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { routeTree } from './routeTree.gen'
import { DefaultCatchBoundary } from './components/DefaultCatchBoundary'
import { NotFound } from './components/NotFound'
import type { RouterContext } from './routerContext'

const convexUrl =
  ((import.meta.env.VITE_CONVEX_URL as string | undefined) ?? '').trim() ||
  'https://example.invalid'

export function getRouter() {
  const convexQueryClient = new ConvexQueryClient(convexUrl)
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryFn: convexQueryClient.queryFn(),
        queryKeyHashFn: convexQueryClient.hashFn(),
      },
    },
  })
  convexQueryClient.connect(queryClient)

  const context: RouterContext = {
    queryClient,
    convexQueryClient,
    convexConfigured: convexUrl !== 'https://example.invalid',
  }

  const router = createRouter({
    routeTree,
    context,
    defaultPreload: 'intent',
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    scrollRestoration: true,
  })
  setupRouterSsrQueryIntegration({ router, queryClient })
  return router
}
