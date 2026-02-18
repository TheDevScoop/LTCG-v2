import { beforeEach, describe, expect, it } from "vitest";
import { playableWorlds } from "@/lib/ttrpgStudio";
import { resetTTGStudioStoreForTests, useTTGStudioStore } from "./useTTGStudioStore";

describe("useTTGStudioStore", () => {
  beforeEach(() => {
    resetTTGStudioStoreForTests();
  });

  it("supports draft updates with undo/redo", () => {
    const store = useTTGStudioStore.getState();
    const originalName =
      store.projects[store.activeProjectId]?.world.name ?? "";

    store.updateActiveProject((draft) => {
      draft.world.name = "Edited Draft Name";
      return draft;
    });
    expect(useTTGStudioStore.getState().projects[store.activeProjectId]?.world.name).toBe(
      "Edited Draft Name",
    );

    useTTGStudioStore.getState().undo();
    expect(useTTGStudioStore.getState().projects[store.activeProjectId]?.world.name).toBe(
      originalName,
    );

    useTTGStudioStore.getState().redo();
    expect(useTTGStudioStore.getState().projects[store.activeProjectId]?.world.name).toBe(
      "Edited Draft Name",
    );
  });

  it("creates drafts from world seeds and handles tab transitions", () => {
    const before = useTTGStudioStore.getState().projectOrder.length;
    const worldId = playableWorlds[0].id;
    useTTGStudioStore.getState().createProjectFromWorld(worldId);
    const after = useTTGStudioStore.getState().projectOrder.length;
    expect(after).toBe(before + 1);

    useTTGStudioStore.getState().setActiveTab("maps");
    expect(useTTGStudioStore.getState().activeTab).toBe("maps");
  });

  it("exports and imports full project payloads", () => {
    const payload = useTTGStudioStore.getState().exportActiveProjectJson();
    const result = useTTGStudioStore.getState().importProjectFromJson(payload);
    expect(result.ok).toBe(true);
  });
});
