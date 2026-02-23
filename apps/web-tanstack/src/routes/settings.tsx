import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/settings')({
  component: SettingsRoute,
})

function SettingsRoute() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="text-sm text-stone-300">
        Settings route migrated to TanStack Start. Account, audio, and game
        preferences will be ported in the next pass.
      </p>
      <div className="rounded border border-stone-700/40 p-3 text-sm text-stone-300">
        <p>Planned modules:</p>
        <ul className="mt-2 list-disc pl-5">
          <li>Account preferences</li>
          <li>Audio and accessibility toggles</li>
          <li>Gameplay defaults</li>
        </ul>
      </div>
    </section>
  )
}
