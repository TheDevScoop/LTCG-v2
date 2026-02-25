import { createFileRoute } from "@tanstack/react-router";
import { Collection } from "@/pages/Collection";
import { Protected } from "./__root";

function CollectionRoute() {
  return (
    <Protected>
      <Collection />
    </Protected>
  );
}

export const Route = createFileRoute("/collection")({
  component: CollectionRoute,
});
