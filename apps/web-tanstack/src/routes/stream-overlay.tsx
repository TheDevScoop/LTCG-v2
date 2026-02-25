import { createFileRoute } from "@tanstack/react-router";
import { StreamOverlay } from "@/pages/StreamOverlay";

export const Route = createFileRoute("/stream-overlay")({
  component: StreamOverlay,
});
