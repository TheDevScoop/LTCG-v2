import { createFileRoute } from "@tanstack/react-router";
import { Story } from "@/pages/Story";
import { Protected } from "./__root";

function StoryRoute() {
  return (
    <Protected>
      <Story />
    </Protected>
  );
}

export const Route = createFileRoute("/story")({
  component: StoryRoute,
});
