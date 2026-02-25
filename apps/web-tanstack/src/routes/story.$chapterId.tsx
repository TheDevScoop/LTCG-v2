import { createFileRoute } from "@tanstack/react-router";
import { StoryChapter } from "@/pages/StoryChapter";
import { Protected } from "./__root";

function StoryChapterRoute() {
  return (
    <Protected>
      <StoryChapter />
    </Protected>
  );
}

export const Route = createFileRoute("/story/$chapterId")({
  component: StoryChapterRoute,
});
