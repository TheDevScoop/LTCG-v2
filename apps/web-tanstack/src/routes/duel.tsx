import { createFileRoute } from "@tanstack/react-router";
import { Duel } from "@/pages/Duel";
import { Protected } from "./__root";

function DuelRoute() {
  return (
    <Protected>
      <Duel />
    </Protected>
  );
}

export const Route = createFileRoute("/duel")({
  component: DuelRoute,
});
