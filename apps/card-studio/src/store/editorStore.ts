import { create } from "zustand";
import type { CardProjectV1 } from "@lunchtable-tcg/card-studio-sdk";
import { cloneDefaultProject } from "../../shared/defaults";
import { applyCommand, type StudioCommand } from "./commands";

export type RunSnapshot = {
  runId: string;
  status: "queued" | "running" | "completed" | "failed" | "canceled";
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  canceledJobs: number;
  updatedAt: number;
};

type EditorStore = {
  project: CardProjectV1;
  selectedCardId: string;
  history: CardProjectV1[];
  future: CardProjectV1[];
  maxHistory: number;
  run: RunSnapshot | null;
  hydrate: (project: CardProjectV1) => void;
  execute: (command: StudioCommand) => void;
  undo: () => void;
  redo: () => void;
  setSelectedCard: (cardId: string) => void;
  setRun: (run: RunSnapshot | null) => void;
};

const initialProject = cloneDefaultProject();
const initialCardId = initialProject.cards[0]?.id ?? "";

export const useEditorStore = create<EditorStore>((set) => ({
  project: initialProject,
  selectedCardId: initialCardId,
  history: [],
  future: [],
  maxHistory: 120,
  run: null,
  hydrate: (project) =>
    set(() => ({
      project,
      selectedCardId: project.cards[0]?.id ?? "",
      history: [],
      future: [],
    })),
  execute: (command) =>
    set((state) => {
      const nextProject = applyCommand(state.project, command);
      const history = [...state.history, state.project].slice(-state.maxHistory);
      const selectedCardId =
        nextProject.cards.some((card) => card.id === state.selectedCardId)
          ? state.selectedCardId
          : nextProject.cards[0]?.id ?? "";
      return {
        project: nextProject,
        selectedCardId,
        history,
        future: [],
      };
    }),
  undo: () =>
    set((state) => {
      const previous = state.history[state.history.length - 1];
      if (!previous) return state;
      const history = state.history.slice(0, -1);
      const future = [state.project, ...state.future];
      const selectedCardId = previous.cards.some((card) => card.id === state.selectedCardId)
        ? state.selectedCardId
        : previous.cards[0]?.id ?? "";
      return {
        project: previous,
        history,
        future,
        selectedCardId,
      };
    }),
  redo: () =>
    set((state) => {
      const next = state.future[0];
      if (!next) return state;
      const future = state.future.slice(1);
      const history = [...state.history, state.project].slice(-state.maxHistory);
      const selectedCardId = next.cards.some((card) => card.id === state.selectedCardId)
        ? state.selectedCardId
        : next.cards[0]?.id ?? "";
      return {
        project: next,
        history,
        future,
        selectedCardId,
      };
    }),
  setSelectedCard: (cardId) => set(() => ({ selectedCardId: cardId })),
  setRun: (run) => set(() => ({ run })),
}));
