import { Link, createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

const studioSearch = z.object({
  tab: z
    .enum(['overview', 'cards', 'decks', 'campaigns', 'community'])
    .optional(),
})

type StudioPanel = {
  id: 'cards' | 'decks' | 'campaigns' | 'community'
  title: string
  subtitle: string
  status: 'planned' | 'in-progress'
}

const PANELS: StudioPanel[] = [
  {
    id: 'cards',
    title: 'Card Designer',
    subtitle: 'Draft custom cards and effect text using engine-valid patterns.',
    status: 'planned',
  },
  {
    id: 'decks',
    title: 'Deck Lab',
    subtitle: 'Assemble archetypes, save variants, and test build constraints.',
    status: 'planned',
  },
  {
    id: 'campaigns',
    title: 'Campaign Builder',
    subtitle: 'Define story chapters, stage progression, and opponent behavior.',
    status: 'in-progress',
  },
  {
    id: 'community',
    title: 'Community Hub',
    subtitle: 'Share creations, remix tools, and publish playable content packs.',
    status: 'planned',
  },
]

export const Route = createFileRoute('/studio')({
  validateSearch: studioSearch,
  component: StudioRoute,
})

function StudioRoute() {
  const search = Route.useSearch()
  const activeTab = search.tab ?? 'overview'

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Studio</h1>
      <p className="text-sm text-stone-300">
        Creator workspace migration. Routes are staged while full tools are ported.
      </p>

      <nav className="flex flex-wrap gap-2">
        <StudioTab to="/studio" label="Overview" active={activeTab === 'overview'} />
        <StudioTab
          to="/studio"
          search={{ tab: 'cards' }}
          label="Cards"
          active={activeTab === 'cards'}
        />
        <StudioTab
          to="/studio"
          search={{ tab: 'decks' }}
          label="Decks"
          active={activeTab === 'decks'}
        />
        <StudioTab
          to="/studio"
          search={{ tab: 'campaigns' }}
          label="Campaigns"
          active={activeTab === 'campaigns'}
        />
        <StudioTab
          to="/studio"
          search={{ tab: 'community' }}
          label="Community"
          active={activeTab === 'community'}
        />
      </nav>

      {activeTab === 'overview' ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {PANELS.map((panel) => (
            <article key={panel.id} className="rounded border border-stone-700/40 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">{panel.title}</h2>
                <span
                  className={`rounded border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                    panel.status === 'in-progress'
                      ? 'border-amber-600/60 text-amber-300'
                      : 'border-stone-600 text-stone-400'
                  }`}
                >
                  {panel.status}
                </span>
              </div>
              <p className="mt-1 text-stone-400">{panel.subtitle}</p>
            </article>
          ))}
        </div>
      ) : (
        <article className="rounded border border-stone-700/40 p-3 text-sm">
          <h2 className="font-semibold">
            {PANELS.find((panel) => panel.id === activeTab)?.title ?? 'Studio tab'}
          </h2>
          <p className="mt-1 text-stone-400">
            Detailed tool UI for <code>{activeTab}</code> is not migrated yet.
          </p>
          <p className="mt-2 text-stone-300">
            Use this tab route as the target for next component conversion.
          </p>
        </article>
      )}
    </section>
  )
}

function StudioTab({
  to,
  search,
  label,
  active,
}: {
  to: '/studio'
  search?: { tab: 'cards' | 'decks' | 'campaigns' | 'community' }
  label: string
  active: boolean
}) {
  return (
    <Link
      to={to}
      search={search}
      className={`rounded border px-2 py-1 text-xs ${
        active
          ? 'border-cyan-700/60 text-cyan-200'
          : 'border-stone-700/40 text-stone-400 hover:border-stone-500'
      }`}
    >
      {label}
    </Link>
  )
}
