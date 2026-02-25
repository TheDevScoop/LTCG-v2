import { createFileRoute } from "@tanstack/react-router";
import { Onboarding } from "@/pages/Onboarding";
import { Protected } from "./__root";

function OnboardingRoute() {
  return (
    <Protected>
      <Onboarding />
    </Protected>
  );
}

export const Route = createFileRoute("/onboarding")({
  component: OnboardingRoute,
});
