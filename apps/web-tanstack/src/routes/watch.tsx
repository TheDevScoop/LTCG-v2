import { createFileRoute } from "@tanstack/react-router";
import { Watch } from "@/pages/Watch";

export const Route = createFileRoute("/watch")({
  component: Watch,
});
