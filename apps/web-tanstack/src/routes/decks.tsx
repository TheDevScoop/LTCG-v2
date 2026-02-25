import { createFileRoute } from "@tanstack/react-router";
import { Decks } from "@/pages/Decks";
import { Protected } from "./__root";

function DecksRoute() {
  return (
    <Protected>
      <Decks />
    </Protected>
  );
}

export const Route = createFileRoute("/decks")({
  component: DecksRoute,
});
