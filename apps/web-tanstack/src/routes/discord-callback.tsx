import { createFileRoute } from "@tanstack/react-router";
import { DiscordCallback } from "@/pages/DiscordCallback";

export const Route = createFileRoute("/discord-callback")({
  component: DiscordCallback,
});
