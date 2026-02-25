import { createFileRoute } from "@tanstack/react-router";
import { DeckBuilder } from "@/pages/DeckBuilder";
import { Protected } from "./__root";

function DeckBuilderRoute() {
  return (
    <Protected>
      <DeckBuilder />
    </Protected>
  );
}

export const Route = createFileRoute("/decks/$deckId")({
  component: DeckBuilderRoute,
});
