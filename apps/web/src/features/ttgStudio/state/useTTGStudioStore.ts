import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createDraftFromWorld, deserializeDraft, serializeDraft } from "@/lib/ttrpgStudio";
import type {
  TTGPlaytestEvent,
  TTGProjectDraft,
} from "@/lib/ttrpgStudio";
import { playableWorlds } from "@/lib/ttrpgStudio";

export type StudioTab =
  | "overview"
  | "builder"
  | "maps"
  | "prompts"
  | "agents"
  | "playtest"
  | "publish";

export const STUDIO_STORAGE_KEY = "ltcg.ttg.studio.v1";

const memoryStorage = (() => {
  const bucket = new Map<string, string>();
  return {
    getItem: (name: string) => bucket.get(name) ?? null,
    setItem: (name: string, value: string) => {
      bucket.set(name, value);
    },
    removeItem: (name: string) => {
      bucket.delete(name);
    },
  };
})();

const safeStorage = createJSONStorage(() => {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return memoryStorage;
});

const toClone = <T>(value: T): T => {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

const buildInitialDrafts = () => {
  const drafts = playableWorlds.map((world) => createDraftFromWorld(world.id));
  const projects = Object.fromEntries(drafts.map((draft) => [draft.id, draft]));
  const projectOrder = drafts.map((draft) => draft.id);
  return {
    projects,
    projectOrder,
    activeProjectId: projectOrder[0] ?? "",
  };
};

interface PersistedStudioState {
  projects: Record<string, TTGProjectDraft>;
  projectOrder: string[];
  activeProjectId: string;
  activeTab: StudioTab;
  searchQuery: string;
  genreFilter: string;
  moodFilter: string;
  past: TTGProjectDraft[];
  future: TTGProjectDraft[];
}

interface TTGStudioState extends PersistedStudioState {
  playtestEvents: TTGPlaytestEvent[];
  playtestRunning: boolean;
  playtestStatus: string;
  setActiveTab: (tab: StudioTab) => void;
  setActiveProject: (projectId: string) => void;
  setSearchQuery: (value: string) => void;
  setGenreFilter: (value: string) => void;
  setMoodFilter: (value: string) => void;
  createProjectFromWorld: (worldId: string) => string;
  cloneActiveProject: () => string;
  updateActiveProject: (updater: (draft: TTGProjectDraft) => TTGProjectDraft) => void;
  undo: () => void;
  redo: () => void;
  setPlaytestRunning: (value: boolean) => void;
  setPlaytestStatus: (value: string) => void;
  clearPlaytest: () => void;
  setPlaytestEvents: (events: TTGPlaytestEvent[]) => void;
  appendPlaytestEvents: (events: TTGPlaytestEvent[]) => void;
  appendTranscriptLine: (line: string) => void;
  clearTranscript: () => void;
  importProjectFromJson: (payload: string) => { ok: true; id: string } | { ok: false; error: string };
  exportActiveProjectJson: () => string;
}

const initialData = buildInitialDrafts();

export const useTTGStudioStore = create<TTGStudioState>()(
  persist(
    (set, get) => ({
      ...initialData,
      activeTab: "overview",
      searchQuery: "",
      genreFilter: "all",
      moodFilter: "all",
      past: [],
      future: [],
      playtestEvents: [],
      playtestRunning: false,
      playtestStatus: "idle",

      setActiveTab: (tab) => set({ activeTab: tab }),

      setActiveProject: (projectId) => {
        const exists = Boolean(get().projects[projectId]);
        if (exists) set({ activeProjectId: projectId });
      },

      setSearchQuery: (value) => set({ searchQuery: value }),
      setGenreFilter: (value) => set({ genreFilter: value }),
      setMoodFilter: (value) => set({ moodFilter: value }),

      createProjectFromWorld: (worldId) => {
        const draft = createDraftFromWorld(worldId);
        set((state) => ({
          projects: {
            ...state.projects,
            [draft.id]: draft,
          },
          projectOrder: [draft.id, ...state.projectOrder],
          activeProjectId: draft.id,
          past: [],
          future: [],
        }));
        return draft.id;
      },

      cloneActiveProject: () => {
        const state = get();
        const current = state.projects[state.activeProjectId];
        if (!current) return "";
        const clone = toClone(current);
        clone.id = `${clone.id}-clone-${Date.now().toString(36)}`;
        clone.world.name = `${clone.world.name} (Clone)`;
        clone.publish.packageName = `${clone.world.name} Creator Pack`;
        clone.createdAt = Date.now();
        clone.updatedAt = Date.now();
        set({
          projects: {
            ...state.projects,
            [clone.id]: clone,
          },
          projectOrder: [clone.id, ...state.projectOrder],
          activeProjectId: clone.id,
          past: [],
          future: [],
        });
        return clone.id;
      },

      updateActiveProject: (updater) => {
        set((state) => {
          const current = state.projects[state.activeProjectId];
          if (!current) return {};
          const previous = toClone(current);
          const next = updater(toClone(current));
          next.updatedAt = Date.now();
          return {
            projects: {
              ...state.projects,
              [state.activeProjectId]: next,
            },
            past: [...state.past, previous].slice(-60),
            future: [],
          };
        });
      },

      undo: () => {
        set((state) => {
          const current = state.projects[state.activeProjectId];
          const previous = state.past[state.past.length - 1];
          if (!current || !previous) return {};
          return {
            projects: {
              ...state.projects,
              [state.activeProjectId]: toClone(previous),
            },
            past: state.past.slice(0, -1),
            future: [toClone(current), ...state.future].slice(0, 60),
          };
        });
      },

      redo: () => {
        set((state) => {
          const current = state.projects[state.activeProjectId];
          const futureDraft = state.future[0];
          if (!current || !futureDraft) return {};
          return {
            projects: {
              ...state.projects,
              [state.activeProjectId]: toClone(futureDraft),
            },
            future: state.future.slice(1),
            past: [...state.past, toClone(current)].slice(-60),
          };
        });
      },

      setPlaytestRunning: (value) => set({ playtestRunning: value }),
      setPlaytestStatus: (value) => set({ playtestStatus: value }),

      clearPlaytest: () =>
        set({
          playtestEvents: [],
          playtestRunning: false,
          playtestStatus: "idle",
        }),

      setPlaytestEvents: (events) => set({ playtestEvents: events }),

      appendPlaytestEvents: (events) => {
        set((state) => ({
          playtestEvents: [...state.playtestEvents, ...events],
          playtestStatus: events[events.length - 1]?.message ?? state.playtestStatus,
        }));
      },

      appendTranscriptLine: (line) => {
        set((state) => {
          const current = state.projects[state.activeProjectId];
          if (!current) return {};
          const nextDraft = toClone(current);
          nextDraft.agentOps.transcript = [...nextDraft.agentOps.transcript, line].slice(-120);
          nextDraft.updatedAt = Date.now();
          return {
            projects: {
              ...state.projects,
              [state.activeProjectId]: nextDraft,
            },
          };
        });
      },

      clearTranscript: () => {
        set((state) => {
          const current = state.projects[state.activeProjectId];
          if (!current) return {};
          const nextDraft = toClone(current);
          nextDraft.agentOps.transcript = [];
          nextDraft.updatedAt = Date.now();
          return {
            projects: {
              ...state.projects,
              [state.activeProjectId]: nextDraft,
            },
          };
        });
      },

      importProjectFromJson: (payload) => {
        try {
          const imported = deserializeDraft(payload);
          const nowId = `${imported.id || imported.sourceWorldId}-${Date.now().toString(36)}`;
          imported.id = nowId;
          imported.updatedAt = Date.now();
          set((state) => ({
            projects: {
              ...state.projects,
              [imported.id]: imported,
            },
            projectOrder: [imported.id, ...state.projectOrder],
            activeProjectId: imported.id,
            past: [],
            future: [],
          }));
          return { ok: true, id: imported.id };
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : "Import failed.",
          };
        }
      },

      exportActiveProjectJson: () => {
        const state = get();
        const current = state.projects[state.activeProjectId];
        if (!current) return "";
        return serializeDraft(current);
      },
    }),
    {
      name: STUDIO_STORAGE_KEY,
      storage: safeStorage,
      partialize: (state) => ({
        projects: state.projects,
        projectOrder: state.projectOrder,
        activeProjectId: state.activeProjectId,
        activeTab: state.activeTab,
        searchQuery: state.searchQuery,
        genreFilter: state.genreFilter,
        moodFilter: state.moodFilter,
        past: state.past,
        future: state.future,
      }),
    },
  ),
);

export const selectActiveProject = (state: TTGStudioState) =>
  state.projects[state.activeProjectId] ?? null;

export const useActiveProjectDraft = () => useTTGStudioStore(selectActiveProject);

export function resetTTGStudioStoreForTests() {
  const defaults = buildInitialDrafts();
  useTTGStudioStore.persist.clearStorage();
  useTTGStudioStore.setState(
    {
      ...defaults,
      activeTab: "overview",
      searchQuery: "",
      genreFilter: "all",
      moodFilter: "all",
      past: [],
      future: [],
      playtestEvents: [],
      playtestRunning: false,
      playtestStatus: "idle",
    },
    false,
  );
}
