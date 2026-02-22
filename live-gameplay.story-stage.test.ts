import { describe, expect, test } from "vitest";
import { resolveStoryChapter } from "./scripts/live-gameplay/scenarios/storyStage";

describe("resolveStoryChapter", () => {
  test("matches chapter by convex _id when provided", () => {
    const chapters = [
      { _id: "chapter-a", chapterId: "chapter_1" },
      { _id: "chapter-b", chapterId: "chapter_2" },
    ];

    const resolved = resolveStoryChapter(chapters, "chapter-b");
    expect(resolved.chapter?._id).toBe("chapter-b");
    expect(resolved.fallbackFrom).toBeNull();
  });

  test("matches chapter by external chapterId when _id differs", () => {
    const chapters = [
      { _id: "jh1", chapterId: "chapter_1" },
      { _id: "jh2", chapterId: "chapter_2" },
    ];

    const resolved = resolveStoryChapter(chapters, "chapter_2");
    expect(resolved.chapter?._id).toBe("jh2");
    expect(resolved.fallbackFrom).toBeNull();
  });

  test("falls back to first chapter when requested chapter is unknown", () => {
    const chapters = [
      { _id: "first", chapterId: "chapter_1" },
      { _id: "second", chapterId: "chapter_2" },
    ];

    const resolved = resolveStoryChapter(chapters, "missing");
    expect(resolved.chapter?._id).toBe("first");
    expect(resolved.fallbackFrom).toBe("missing");
  });

  test("returns null chapter for an empty chapter list", () => {
    const resolved = resolveStoryChapter([], "missing");
    expect(resolved.chapter).toBeNull();
    expect(resolved.fallbackFrom).toBe("missing");
  });
});
