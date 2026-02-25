import { createFileRoute } from "@tanstack/react-router";
import { Cliques } from "@/pages/Cliques";
import { Protected } from "./__root";

function CliquesRoute() {
  return (
    <Protected>
      <Cliques />
    </Protected>
  );
}

export const Route = createFileRoute("/cliques")({
  component: CliquesRoute,
});
