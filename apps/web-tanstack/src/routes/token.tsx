import { createFileRoute } from "@tanstack/react-router";
import { Token } from "@/pages/Token";

export const Route = createFileRoute("/token")({
  component: Token,
});
