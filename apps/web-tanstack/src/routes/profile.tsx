import { createFileRoute } from "@tanstack/react-router";
import { Profile } from "@/pages/Profile";
import { Protected } from "./__root";

function ProfileRoute() {
  return (
    <Protected>
      <Profile />
    </Protected>
  );
}

export const Route = createFileRoute("/profile")({
  component: ProfileRoute,
});
