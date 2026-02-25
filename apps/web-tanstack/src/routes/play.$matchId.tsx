import { createFileRoute } from "@tanstack/react-router";
import { Play } from "@/pages/Play";
import { Protected } from "./__root";

function PlayRoute() {
  return (
    <Protected>
      <Play />
    </Protected>
  );
}

export const Route = createFileRoute("/play/$matchId")({
  component: PlayRoute,
});
