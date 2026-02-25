import posthog from "posthog-js";
import { isDiscordActivityFrame } from "./clientPlatform";

const posthogKey = import.meta.env.VITE_POSTHOG_KEY;

// Discord Activities run behind a restrictive CSP (connect-src). PostHog is optional,
// so we disable it in Activities to avoid noisy CSP errors or brittle runtime issues.
if (typeof window !== "undefined" && posthogKey && !isDiscordActivityFrame()) {
  posthog.init(posthogKey, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com",
    person_profiles: "identified_only",
    loaded: (posthogClient) => {
      if (import.meta.env.DEV) posthogClient.debug();
    },
  });
} else if (!posthogKey && import.meta.env.DEV) {
  // Avoid initializing PostHog with an empty token and keep local diagnostics explicit.
  // The production app should set VITE_POSTHOG_KEY in the deployment environment.
  // eslint-disable-next-line no-console
  console.warn("[PostHog] VITE_POSTHOG_KEY is not configured. Analytics disabled.");
}

export default posthog;
