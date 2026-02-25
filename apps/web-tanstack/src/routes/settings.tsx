import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "@/pages/Settings";
import { Protected } from "./__root";

function SettingsRoute() {
  return (
    <Protected>
      <Settings />
    </Protected>
  );
}

export const Route = createFileRoute("/settings")({
  component: SettingsRoute,
});
