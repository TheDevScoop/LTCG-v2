import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { TrayNav } from "@/components/layout/TrayNav";
import { LANDING_BG, TITLE } from "@/lib/blobUrls";
import { validateDraft } from "@/lib/ttrpgStudio";
import {
  type StudioTab,
  useActiveProjectDraft,
  useTTGStudioStore,
  WorldOverviewTab,
  CreatorWorkbenchTab,
  MapsDungeonTab,
  PromptStudioTab,
  AgentOpsTab,
  PlaytestTab,
  PublishTab,
} from "@/features/ttgStudio";

const STUDIO_TABS: Array<{ id: StudioTab; label: string; hint: string }> = [
  { id: "overview", label: "Overview", hint: "Library + metrics" },
  { id: "builder", label: "Creator", hint: "Characters, rules, story" },
  { id: "maps", label: "Maps", hint: "Pseudo-3D maps + dungeons" },
  { id: "prompts", label: "Prompts", hint: "Template build + export" },
  { id: "agents", label: "Agents", hint: "Narrator + player ops" },
  { id: "playtest", label: "Playtest", hint: "Deterministic simulation" },
  { id: "publish", label: "Publish", hint: "Preflight + package" },
];

const isStudioTab = (value: string | null): value is StudioTab =>
  value ? STUDIO_TABS.some((tab) => tab.id === value) : false;

function renderTab(tab: StudioTab) {
  if (tab === "overview") return <WorldOverviewTab />;
  if (tab === "builder") return <CreatorWorkbenchTab />;
  if (tab === "maps") return <MapsDungeonTab />;
  if (tab === "prompts") return <PromptStudioTab />;
  if (tab === "agents") return <AgentOpsTab />;
  if (tab === "playtest") return <PlaytestTab />;
  return <PublishTab />;
}

export function Studio() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [quickNotice, setQuickNotice] = useState("");

  const {
    projects,
    projectOrder,
    activeProjectId,
    activeTab,
    setActiveTab,
    setActiveProject,
    undo,
    redo,
    cloneActiveProject,
    createProjectFromWorld,
    past,
    future,
    playtestStatus,
  } = useTTGStudioStore((state) => ({
    projects: state.projects,
    projectOrder: state.projectOrder,
    activeProjectId: state.activeProjectId,
    activeTab: state.activeTab,
    setActiveTab: state.setActiveTab,
    setActiveProject: state.setActiveProject,
    undo: state.undo,
    redo: state.redo,
    cloneActiveProject: state.cloneActiveProject,
    createProjectFromWorld: state.createProjectFromWorld,
    past: state.past,
    future: state.future,
    playtestStatus: state.playtestStatus,
  }));

  const draft = useActiveProjectDraft();

  const preflight = useMemo(() => (draft ? validateDraft(draft) : []), [draft]);
  const preflightErrors = preflight.filter((issue) => issue.severity === "error").length;

  useEffect(() => {
    const queryTab = searchParams.get("tab");
    const queryProject = searchParams.get("project");

    if (isStudioTab(queryTab) && queryTab !== activeTab) {
      setActiveTab(queryTab);
    }
    if (queryProject && queryProject !== activeProjectId && projects[queryProject]) {
      setActiveProject(queryProject);
    }
  }, [searchParams, activeTab, activeProjectId, projects, setActiveProject, setActiveTab]);

  useEffect(() => {
    const currentTab = searchParams.get("tab");
    const currentProject = searchParams.get("project");
    if (currentTab === activeTab && currentProject === activeProjectId) return;

    const next = new URLSearchParams(searchParams);
    next.set("tab", activeTab);
    next.set("project", activeProjectId);
    setSearchParams(next, { replace: true });
  }, [activeTab, activeProjectId, searchParams, setSearchParams]);

  useEffect(() => {
    const numberToTab: Record<string, StudioTab> = {
      "1": "overview",
      "2": "builder",
      "3": "maps",
      "4": "prompts",
      "5": "agents",
      "6": "playtest",
      "7": "publish",
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const isAccel = event.metaKey || event.ctrlKey;
      if (!isAccel) return;

      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }
      if (key === "z" && event.shiftKey) {
        event.preventDefault();
        redo();
        return;
      }
      if (key === "s") {
        event.preventDefault();
        setQuickNotice("Autosaved to local studio storage.");
        window.setTimeout(() => setQuickNotice(""), 1400);
        return;
      }
      if (numberToTab[key]) {
        event.preventDefault();
        setActiveTab(numberToTab[key]);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setActiveTab, undo, redo]);

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat relative pb-28"
      style={{ backgroundImage: `url('${LANDING_BG}')` }}
    >
      <div className="absolute inset-0 bg-black/55" />

      <header className="relative z-10 px-4 pt-8 md:pt-10 text-center">
        <img
          src={TITLE}
          alt="LunchTable"
          className="h-16 md:h-24 mx-auto drop-shadow-[3px_3px_0px_rgba(0,0,0,1)]"
          draggable={false}
        />
        <h1 className="text-4xl md:text-5xl text-[#ffcc00] drop-shadow-[2px_2px_0px_rgba(0,0,0,1)]">
          LUNCHTABLE TTG
        </h1>
        <p
          className="text-sm md:text-lg text-white/85 mt-2"
          style={{ fontFamily: "Special Elite, cursive" }}
        >
          Full-feature tabletop creation platform for worlds, agents, story arcs, maps, and release-ready packs.
        </p>
      </header>

      <div className="relative z-10 max-w-[1240px] mx-auto px-3 md:px-5 mt-5 space-y-4">
        <div className="sticky top-2 z-30 paper-panel p-3 md:p-4 flex flex-wrap items-center gap-2 md:gap-3">
          <label className="text-xs uppercase font-bold">Project</label>
          <select
            value={activeProjectId}
            onChange={(event) => setActiveProject(event.target.value)}
            className="border-2 border-[#121212] bg-white px-3 py-2 min-w-[220px]"
          >
            {projectOrder.map((id) => (
              <option key={id} value={id}>
                {projects[id]?.world.name ?? id}
              </option>
            ))}
          </select>
          <button className="tcg-button" onClick={() => cloneActiveProject()}>
            Clone
          </button>
          <button
            className="tcg-button"
            onClick={() => {
              if (!draft) return;
              createProjectFromWorld(draft.sourceWorldId);
            }}
          >
            New from Seed
          </button>
          <button className="tcg-button" disabled={past.length === 0} onClick={undo}>
            Undo
          </button>
          <button className="tcg-button" disabled={future.length === 0} onClick={redo}>
            Redo
          </button>

          <div className="ml-auto text-right">
            <p className="text-xs uppercase font-black">
              Preflight Errors: {preflightErrors}
            </p>
            <p className="text-[11px] uppercase text-[#121212]/70">{playtestStatus}</p>
          </div>
        </div>

        <nav className="paper-panel p-3 overflow-x-auto hide-scrollbar">
          <div className="flex gap-2 min-w-max">
            {STUDIO_TABS.map((tab, index) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`paper-panel-flat px-3 py-2 text-left min-w-[165px] ${
                  activeTab === tab.id ? "ring-4 ring-[#ffcc00]" : ""
                }`}
              >
                <p className="text-[11px] uppercase text-[#121212]/60">⌘{index + 1}</p>
                <p className="font-black uppercase text-sm">{tab.label}</p>
                <p className="text-xs text-[#121212]/70">{tab.hint}</p>
              </button>
            ))}
          </div>
        </nav>

        <main className="paper-panel p-3 md:p-5">{renderTab(activeTab)}</main>

        <div className="sticky bottom-0 z-20 paper-panel-flat p-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs uppercase">Shortcuts: ⌘/Ctrl+1..7 tabs • ⌘/Ctrl+Z undo • ⇧⌘/Ctrl+Z redo • ⌘/Ctrl+S save</p>
          <p className="text-xs uppercase text-[#121212]/70">{quickNotice || "Autosave enabled"}</p>
        </div>
      </div>

      <TrayNav />
    </div>
  );
}
