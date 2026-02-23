import { convexQuery, useConvexMutation } from '@convex-dev/react-query'
import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_SIGNUP_AVATAR_PATH,
  SIGNUP_AVATAR_OPTIONS,
  type SignupAvatarPath,
  isSignupAvatarPath,
} from '~/lib/signupAvatarCatalog'
import { api } from '~/lib/convexApi'

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/

type OnboardingStatus = {
  exists: boolean
  hasUsername: boolean
  hasAvatar: boolean
  hasStarterDeck: boolean
}

type CurrentUser = {
  _id: string
  username?: string
  avatarPath?: string
}

type StarterDeck = {
  name: string
  deckCode: string
  archetype: string
  description: string
  playstyle: string
  cardCount: number
}

const currentUserQuery = convexQuery(api.auth.currentUser, {})
const onboardingStatusQuery = convexQuery(api.auth.getOnboardingStatus, {})
const starterDecksQuery = convexQuery(api.game.getStarterDecks, {})

export const Route = createFileRoute('/onboarding')({
  loader: async ({ context }) => {
    if (!context.convexConfigured) return
    await Promise.all([
      context.queryClient.ensureQueryData(currentUserQuery),
      context.queryClient.ensureQueryData(starterDecksQuery),
    ])
  },
  component: OnboardingRoute,
})

function OnboardingRoute() {
  const { convexConfigured } = Route.useRouteContext()
  const navigate = Route.useNavigate()

  const currentUser = useQuery({
    ...currentUserQuery,
    enabled: convexConfigured,
  })
  const onboarding = useQuery({
    ...onboardingStatusQuery,
    enabled: convexConfigured && currentUser.data != null,
    retry: false,
  })
  const starterDecks = useQuery({
    ...starterDecksQuery,
    enabled: convexConfigured,
  })

  const setUsername = useConvexMutation(api.auth.setUsername)
  const setAvatarPath = useConvexMutation(api.auth.setAvatarPath)
  const selectStarterDeck = useConvexMutation(api.game.selectStarterDeck)

  const [usernameInput, setUsernameInput] = useState('')
  const [selectedAvatarPath, setSelectedAvatarPath] = useState<SignupAvatarPath>(
    DEFAULT_SIGNUP_AVATAR_PATH,
  )
  const [selectedDeckCode, setSelectedDeckCode] = useState('')

  const [busyStep, setBusyStep] = useState<'username' | 'avatar' | 'deck' | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const status = (onboarding.data ?? null) as OnboardingStatus | null
  const user = (currentUser.data ?? null) as CurrentUser | null
  const deckRows = (starterDecks.data ?? []) as StarterDeck[]

  useEffect(() => {
    if (!user) return
    setUsernameInput((previous) =>
      previous.length > 0 ? previous : String(user.username ?? '').replace(/^player_\d+$/, ''),
    )
    if (isSignupAvatarPath(user.avatarPath)) {
      setSelectedAvatarPath(user.avatarPath)
    }
  }, [user])

  const step = useMemo<'username' | 'avatar' | 'deck' | 'complete'>(() => {
    if (!status) return 'username'
    if (!status.hasUsername) return 'username'
    if (!status.hasAvatar) return 'avatar'
    if (!status.hasStarterDeck) return 'deck'
    return 'complete'
  }, [status])

  const stepLabel = useMemo(() => {
    switch (step) {
      case 'username':
        return 'Step 1/3 · Choose username'
      case 'avatar':
        return 'Step 2/3 · Pick avatar'
      case 'deck':
        return 'Step 3/3 · Select starter deck'
      default:
        return 'Onboarding complete'
    }
  }, [step])

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Onboarding</h1>
      <p className="text-sm text-stone-300">{stepLabel}</p>

      {!convexConfigured ? (
        <p className="text-sm text-amber-300">
          Add <code>VITE_CONVEX_URL</code> to run onboarding flows.
        </p>
      ) : currentUser.data == null ? (
        <p className="text-sm text-amber-300">Sign in to continue onboarding.</p>
      ) : onboarding.isLoading ? (
        <p className="text-sm text-stone-400">Loading onboarding status…</p>
      ) : onboarding.isError ? (
        <p className="text-sm text-rose-300">Failed to load onboarding state.</p>
      ) : (
        <>
          <OnboardingChecklist status={status} />

          {step === 'username' ? (
            <article className="rounded border border-stone-700/40 p-3 text-sm space-y-2">
              <h2 className="text-xs uppercase tracking-wide text-stone-400">Username</h2>
              <input
                value={usernameInput}
                onChange={(event) => setUsernameInput(event.target.value)}
                placeholder="player_tag"
                maxLength={20}
                className="w-full rounded border border-stone-600 bg-stone-950 px-2 py-1 text-sm"
              />
              <p className="text-xs text-stone-500">
                3-20 chars. Letters, numbers, underscores only.
              </p>
              <button
                onClick={async () => {
                  const trimmed = usernameInput.trim()
                  if (!USERNAME_PATTERN.test(trimmed)) {
                    setError('Username must be 3-20 chars (letters, numbers, underscores).')
                    return
                  }
                  setBusyStep('username')
                  setError('')
                  setMessage('')
                  try {
                    await setUsername({ username: trimmed })
                    await Promise.all([onboarding.refetch(), currentUser.refetch()])
                    setMessage('Username saved.')
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to save username.')
                  } finally {
                    setBusyStep(null)
                  }
                }}
                disabled={busyStep != null}
                className="rounded border border-stone-600 px-3 py-1 text-xs disabled:opacity-50"
              >
                {busyStep === 'username' ? 'Saving…' : 'Save Username'}
              </button>
            </article>
          ) : null}

          {step === 'avatar' ? (
            <article className="rounded border border-stone-700/40 p-3 text-sm space-y-2">
              <h2 className="text-xs uppercase tracking-wide text-stone-400">Avatar</h2>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {SIGNUP_AVATAR_OPTIONS.map((avatar) => (
                  <button
                    key={avatar.id}
                    onClick={() => setSelectedAvatarPath(avatar.path)}
                    className={`rounded border p-1 ${
                      selectedAvatarPath === avatar.path
                        ? 'border-cyan-700/60'
                        : 'border-stone-700/40'
                    }`}
                  >
                    <img
                      src={avatar.url}
                      alt={avatar.id}
                      className="h-20 w-full rounded object-cover"
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
              <button
                onClick={async () => {
                  setBusyStep('avatar')
                  setError('')
                  setMessage('')
                  try {
                    await setAvatarPath({ avatarPath: selectedAvatarPath })
                    await Promise.all([onboarding.refetch(), currentUser.refetch()])
                    setMessage('Avatar saved.')
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to save avatar.')
                  } finally {
                    setBusyStep(null)
                  }
                }}
                disabled={busyStep != null}
                className="rounded border border-stone-600 px-3 py-1 text-xs disabled:opacity-50"
              >
                {busyStep === 'avatar' ? 'Saving…' : 'Save Avatar'}
              </button>
            </article>
          ) : null}

          {step === 'deck' ? (
            <article className="rounded border border-stone-700/40 p-3 text-sm space-y-2">
              <h2 className="text-xs uppercase tracking-wide text-stone-400">Starter deck</h2>
              {starterDecks.isLoading ? (
                <p className="text-stone-400">Loading starter decks…</p>
              ) : starterDecks.isError ? (
                <p className="text-rose-300">Failed to load starter decks.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {deckRows.map((deck) => (
                    <button
                      key={deck.deckCode}
                      onClick={() => setSelectedDeckCode(deck.deckCode)}
                      className={`rounded border p-3 text-left ${
                        selectedDeckCode === deck.deckCode
                          ? 'border-cyan-700/60'
                          : 'border-stone-700/40'
                      }`}
                    >
                      <p className="font-semibold text-stone-200">{deck.name}</p>
                      <p className="text-xs text-stone-400">
                        {deck.archetype} · {deck.cardCount} cards
                      </p>
                      <p className="mt-1 text-xs text-stone-500">{deck.playstyle}</p>
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={async () => {
                  if (!selectedDeckCode) {
                    setError('Pick a starter deck first.')
                    return
                  }
                  setBusyStep('deck')
                  setError('')
                  setMessage('')
                  try {
                    await selectStarterDeck({ deckCode: selectedDeckCode })
                    await Promise.all([onboarding.refetch(), currentUser.refetch()])
                    setMessage('Starter deck selected.')
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to select deck.')
                  } finally {
                    setBusyStep(null)
                  }
                }}
                disabled={busyStep != null || selectedDeckCode.length === 0}
                className="rounded border border-stone-600 px-3 py-1 text-xs disabled:opacity-50"
              >
                {busyStep === 'deck' ? 'Selecting…' : 'Confirm Starter Deck'}
              </button>
            </article>
          ) : null}

          {step === 'complete' ? (
            <article className="rounded border border-emerald-700/40 p-3 text-sm">
              <p className="text-emerald-300">Onboarding complete.</p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => navigate({ to: '/' })}
                  className="rounded border border-stone-600 px-3 py-1 text-xs"
                >
                  Go Home
                </button>
                <Link
                  to="/decks"
                  className="rounded border border-stone-600 px-3 py-1 text-xs"
                >
                  Open Decks
                </Link>
              </div>
            </article>
          ) : null}
        </>
      )}

      {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
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
