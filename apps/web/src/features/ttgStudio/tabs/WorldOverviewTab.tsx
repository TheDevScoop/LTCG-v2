import { useMemo } from "react";
import { playableWorlds, validateDraft } from "@/lib/ttrpgStudio";
import { useActiveProjectDraft, useTTGStudioStore } from "../state/useTTGStudioStore";

export function WorldOverviewTab() {
  const draft = useActiveProjectDraft();
  const {
    projects,
    projectOrder,
    activeProjectId,
    searchQuery,
    genreFilter,
    moodFilter,
    setSearchQuery,
    setGenreFilter,
    setMoodFilter,
    setActiveProject,
    createProjectFromWorld,
    cloneActiveProject,
    setActiveTab,
  } = useTTGStudioStore((state) => ({
    projects: state.projects,
    projectOrder: state.projectOrder,
    activeProjectId: state.activeProjectId,
    searchQuery: state.searchQuery,
    genreFilter: state.genreFilter,
    moodFilter: state.moodFilter,
    setSearchQuery: state.setSearchQuery,
    setGenreFilter: state.setGenreFilter,
    setMoodFilter: state.setMoodFilter,
    setActiveProject: state.setActiveProject,
    createProjectFromWorld: state.createProjectFromWorld,
    cloneActiveProject: state.cloneActiveProject,
    setActiveTab: state.setActiveTab,
  }));

  const items = useMemo(
    () => projectOrder.map((id) => projects[id]).filter(Boolean),
    [projectOrder, projects],
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      const matchesQuery =
        q.length === 0 ||
        item.world.name.toLowerCase().includes(q) ||
        item.world.tagline.toLowerCase().includes(q) ||
        item.world.genre.toLowerCase().includes(q);
      const matchesGenre = genreFilter === "all" || item.world.genre === genreFilter;
      const matchesMood = moodFilter === "all" || item.world.mood === moodFilter;
      return matchesQuery && matchesGenre && matchesMood;
    });
  }, [items, searchQuery, genreFilter, moodFilter]);

  const genres = useMemo(
    () => ["all", ...new Set(items.map((item) => item.world.genre))],
    [items],
  );
  const moods = useMemo(
    () => ["all", ...new Set(items.map((item) => item.world.mood))],
    [items],
  );

  const activeIssues = useMemo(() => (draft ? validateDraft(draft) : []), [draft]);

  return (
    <div className="space-y-6">
      <section className="paper-panel p-4 md:p-6 grid gap-4 md:grid-cols-4">
        <StatCard label="Published Worlds" value={String(items.length)} />
        <StatCard label="Archetypes" value={String(draft?.world.archetypes.length ?? 0)} />
        <StatCard label="Prompt Templates" value={String(draft?.world.creationKit.corePrompts.length ?? 0)} />
        <StatCard
          label="Preflight"
          value={activeIssues.some((issue) => issue.severity === "error") ? "Needs Fixes" : "Ready"}
        />
      </section>

      <section className="paper-panel p-4 md:p-6 grid gap-4 md:grid-cols-4">
        <label className="flex flex-col gap-2">
          <span className="text-xs uppercase font-bold tracking-wide">Search Worlds</span>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="name, genre, tagline"
            className="w-full border-2 border-[#121212] bg-white px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-xs uppercase font-bold tracking-wide">Genre Filter</span>
          <select
            value={genreFilter}
            onChange={(event) => setGenreFilter(event.target.value)}
            className="w-full border-2 border-[#121212] bg-white px-3 py-2"
          >
            {genres.map((genre) => (
              <option key={genre} value={genre}>
                {genre}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-xs uppercase font-bold tracking-wide">Mood Filter</span>
          <select
            value={moodFilter}
            onChange={(event) => setMoodFilter(event.target.value)}
            className="w-full border-2 border-[#121212] bg-white px-3 py-2"
          >
            {moods.map((mood) => (
              <option key={mood} value={mood}>
                {mood}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase font-bold tracking-wide">Quick Actions</span>
          <button className="tcg-button" onClick={() => setActiveTab("playtest")}>
            Launch Playtest
          </button>
          <button className="tcg-button" onClick={() => setActiveTab("publish")}>
            Open Publish Console
          </button>
          <button className="tcg-button" onClick={() => cloneActiveProject()}>
            Clone Active Project
          </button>
        </div>
      </section>

      <section className="paper-panel p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <h3 className="text-2xl">World Library</h3>
          <p className="text-sm text-[#121212]/70">{filtered.length} visible in current filter</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => {
            const isActive = item.id === activeProjectId;
            return (
              <button
                key={item.id}
                onClick={() => setActiveProject(item.id)}
                className={`paper-panel-flat text-left p-4 transition ${
                  isActive ? "ring-4 ring-[#ffcc00]" : "hover:-translate-x-0.5 hover:-translate-y-0.5"
                }`}
              >
                <p className="text-[11px] uppercase text-[#121212]/60">{item.world.genre}</p>
                <h4 className="text-xl">{item.world.name}</h4>
                <p className="text-sm text-[#121212]/70">{item.world.tagline}</p>
                <p className="mt-2 text-xs uppercase">Mood: {item.world.mood}</p>
                <p className="text-xs uppercase">Party: {item.world.recommendedPartySize}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="paper-panel p-4 md:p-6 space-y-3">
        <h3 className="text-xl">Create New Project from Seed World</h3>
        <div className="grid gap-2 md:grid-cols-3">
          {playableWorlds.map((world) => (
            <button key={world.id} className="tcg-button" onClick={() => createProjectFromWorld(world.id)}>
              New: {world.name}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="paper-panel-flat p-3 md:p-4">
      <p className="text-[11px] uppercase text-[#121212]/60">{label}</p>
      <p className="text-3xl font-black">{value}</p>
    </div>
  );
}
