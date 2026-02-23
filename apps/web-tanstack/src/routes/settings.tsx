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

type SettingsUser = {
  _id: string
  username?: string
  avatarPath?: string
  email?: string
}

const currentUserQuery = convexQuery(api.auth.currentUser, {})

export const Route = createFileRoute('/settings')({
  loader: async ({ context }) => {
    if (!context.convexConfigured) return
    await context.queryClient.ensureQueryData(currentUserQuery)
  },
  component: SettingsRoute,
})

function SettingsRoute() {
  const { convexConfigured } = Route.useRouteContext()

  const currentUser = useQuery({
    ...currentUserQuery,
    enabled: convexConfigured,
  })
  const setUsername = useConvexMutation(api.auth.setUsername)
  const setAvatarPath = useConvexMutation(api.auth.setAvatarPath)

  const [usernameInput, setUsernameInput] = useState('')
  const [selectedAvatarPath, setSelectedAvatarPath] = useState<SignupAvatarPath>(
    DEFAULT_SIGNUP_AVATAR_PATH,
  )
  const [savingUsername, setSavingUsername] = useState(false)
  const [savingAvatar, setSavingAvatar] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const user = (currentUser.data ?? null) as SettingsUser | null

  useEffect(() => {
    if (!user) return
    setUsernameInput(user.username ?? '')
    if (isSignupAvatarPath(user.avatarPath)) {
      setSelectedAvatarPath(user.avatarPath)
    } else {
      setSelectedAvatarPath(DEFAULT_SIGNUP_AVATAR_PATH)
    }
  }, [user])

  const trimmedUsername = usernameInput.trim()
  const usernameUnchanged = trimmedUsername === (user?.username ?? '')
  const usernameValid = useMemo(
    () => USERNAME_PATTERN.test(trimmedUsername),
    [trimmedUsername],
  )
  const avatarUnchanged = selectedAvatarPath === (user?.avatarPath ?? DEFAULT_SIGNUP_AVATAR_PATH)

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>

      {!convexConfigured ? (
        <p className="text-sm text-amber-300">
          Add <code>VITE_CONVEX_URL</code> to load account settings.
        </p>
      ) : currentUser.data == null ? (
        <p className="text-sm text-amber-300">Sign in to update account settings.</p>
      ) : (
        <>
          <article className="rounded border border-stone-700/40 p-3 text-sm space-y-3">
            <h2 className="text-xs uppercase tracking-wide text-stone-400">Account</h2>
            <p className="text-xs text-stone-500">User id: {user?._id}</p>
            <p className="text-xs text-stone-500">Email: {user?.email ?? 'not set'}</p>

            <label className="block text-xs uppercase tracking-wide text-stone-400" htmlFor="settings-username">
              Username
            </label>
            <input
              id="settings-username"
              value={usernameInput}
              onChange={(event) => setUsernameInput(event.target.value)}
              maxLength={20}
              className="w-full rounded border border-stone-600 bg-stone-950 px-2 py-1 text-sm"
            />
            <p className="text-xs text-stone-500">
              3-20 chars. Letters, numbers, underscores only.
            </p>

            <button
              onClick={async () => {
                if (!usernameValid) {
                  setErrorMessage('Username must be 3-20 chars with letters, numbers, underscores.')
                  return
                }
                if (usernameUnchanged) {
                  setStatusMessage('Username unchanged.')
                  setErrorMessage('')
                  return
                }
                setSavingUsername(true)
                setStatusMessage('')
                setErrorMessage('')
                try {
                  await setUsername({ username: trimmedUsername })
                  await currentUser.refetch()
                  setStatusMessage('Username saved.')
                } catch (err) {
                  setErrorMessage(err instanceof Error ? err.message : 'Failed to save username.')
                } finally {
                  setSavingUsername(false)
                }
              }}
              disabled={savingUsername}
              className="rounded border border-stone-600 px-3 py-1 text-xs disabled:opacity-50"
            >
              {savingUsername ? 'Saving…' : 'Save Username'}
            </button>
          </article>

          <article className="rounded border border-stone-700/40 p-3 text-sm space-y-3">
            <h2 className="text-xs uppercase tracking-wide text-stone-400">Avatar</h2>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {SIGNUP_AVATAR_OPTIONS.map((avatar) => (
                <button
                  key={avatar.id}
                  onClick={() => setSelectedAvatarPath(avatar.path)}
                  className={`rounded border p-1 ${
                    selectedAvatarPath === avatar.path ? 'border-cyan-700/60' : 'border-stone-700/40'
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
                if (avatarUnchanged) {
                  setStatusMessage('Avatar unchanged.')
                  setErrorMessage('')
                  return
                }
                setSavingAvatar(true)
                setStatusMessage('')
                setErrorMessage('')
                try {
                  await setAvatarPath({ avatarPath: selectedAvatarPath })
                  await currentUser.refetch()
                  setStatusMessage('Avatar saved.')
                } catch (err) {
                  setErrorMessage(err instanceof Error ? err.message : 'Failed to save avatar.')
                } finally {
                  setSavingAvatar(false)
                }
              }}
              disabled={savingAvatar}
              className="rounded border border-stone-600 px-3 py-1 text-xs disabled:opacity-50"
            >
              {savingAvatar ? 'Saving…' : 'Save Avatar'}
            </button>
          </article>
        </>
      )}

      <div className="flex gap-2">
        <Link to="/profile" className="rounded border border-stone-600 px-3 py-1 text-xs">
          Profile
        </Link>
        <Link to="/onboarding" className="rounded border border-stone-600 px-3 py-1 text-xs">
          Onboarding
        </Link>
      </div>

      {statusMessage ? <p className="text-sm text-emerald-300">{statusMessage}</p> : null}
      {errorMessage ? <p className="text-sm text-rose-300">{errorMessage}</p> : null}
    </section>
  )
}
