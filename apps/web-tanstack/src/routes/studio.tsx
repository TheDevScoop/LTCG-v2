import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/studio')({
  component: StudioRoute,
})

function StudioRoute() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Studio</h1>
      <p className="text-sm text-stone-300">
        Studio route migrated. Feature panels and creator workflows are staged for
        the next migration pass.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <article className="rounded border border-stone-700/40 p-3 text-sm">
          <h2 className="font-semibold">Card Designer</h2>
          <p className="mt-1 text-stone-400">Draft custom cards and effects.</p>
        </article>
        <article className="rounded border border-stone-700/40 p-3 text-sm">
          <h2 className="font-semibold">Deck Lab</h2>
          <p className="mt-1 text-stone-400">Assemble archetypes and test lineups.</p>
        </article>
        <article className="rounded border border-stone-700/40 p-3 text-sm">
          <h2 className="font-semibold">Campaign Builder</h2>
          <p className="mt-1 text-stone-400">Define stages and narrative hooks.</p>
        </article>
        <article className="rounded border border-stone-700/40 p-3 text-sm">
          <h2 className="font-semibold">Community Hub</h2>
          <p className="mt-1 text-stone-400">Share, remix, and publish tools.</p>
        </article>
      </div>
    </section>
  )
}
