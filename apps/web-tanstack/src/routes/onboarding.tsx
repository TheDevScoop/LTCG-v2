import { convexQuery } from '@convex-dev/react-query'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { api } from '~/lib/convexApi'

type OnboardingStatus = {
  exists: boolean
  hasUsername: boolean
  hasAvatar: boolean
  hasStarterDeck: boolean
}

const statusQuery = convexQuery(api.auth.getOnboardingStatus, {})
const currentUserQuery = convexQuery(api.auth.currentUser, {})

export const Route = createFileRoute('/onboarding')({
  loader: async ({ context }) => {
    if (!context.convexConfigured) return
    await context.queryClient.ensureQueryData(currentUserQuery)
  },
  component: OnboardingRoute,
})

function OnboardingRoute() {
  const { convexConfigured } = Route.useRouteContext()
  const currentUser = useQuery({
    ...currentUserQuery,
    enabled: convexConfigured,
  })
  const onboarding = useQuery({
    ...statusQuery,
    enabled: convexConfigured && currentUser.data != null,
    retry: false,
  })

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Onboarding</h1>

      {!convexConfigured ? (
        <p className="text-sm text-amber-300">
          Add <code>VITE_CONVEX_URL</code> to run onboarding checks.
        </p>
      ) : currentUser.data == null ? (
        <p className="text-sm text-amber-300">Sign in to continue onboarding.</p>
      ) : onboarding.isLoading ? (
        <p className="text-sm text-stone-400">Loading onboarding status…</p>
      ) : onboarding.isError ? (
        <p className="text-sm text-rose-300">Failed to load onboarding state.</p>
      ) : (
        <OnboardingChecklist status={onboarding.data as OnboardingStatus | null} />
      )}
    </section>
  )
}

function OnboardingChecklist({ status }: { status: OnboardingStatus | null }) {
  if (!status) return <p className="text-sm text-stone-400">No onboarding status yet.</p>
  const checks: Array<{ label: string; ok: boolean }> = [
    { label: 'User exists', ok: status.exists },
    { label: 'Username set', ok: status.hasUsername },
    { label: 'Avatar selected', ok: status.hasAvatar },
    { label: 'Starter deck selected', ok: status.hasStarterDeck },
  ]
  return (
    <ul className="space-y-2">
      {checks.map((check) => (
        <li
          key={check.label}
          className="flex items-center justify-between rounded border border-stone-700/40 px-3 py-2 text-sm"
        >
          <span>{check.label}</span>
          <span className={check.ok ? 'text-emerald-400' : 'text-amber-300'}>
            {check.ok ? 'Complete' : 'Pending'}
          </span>
        </li>
      ))}
    </ul>
  )
}
