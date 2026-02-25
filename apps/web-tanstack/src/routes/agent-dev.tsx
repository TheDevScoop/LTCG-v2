import { createFileRoute } from "@tanstack/react-router";
import { AgentDev } from "@/pages/AgentDev";

export const Route = createFileRoute("/agent-dev")({
  component: AgentDev,
});
