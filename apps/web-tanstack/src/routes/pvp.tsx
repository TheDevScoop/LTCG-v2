import { createFileRoute } from "@tanstack/react-router";
import { Pvp } from "@/pages/Pvp";
import { Protected } from "./__root";

function PvpRoute() {
  return (
    <Protected>
      <Pvp />
    </Protected>
  );
}

export const Route = createFileRoute("/pvp")({
  component: PvpRoute,
});
