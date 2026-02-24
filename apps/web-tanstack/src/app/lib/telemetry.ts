import * as Sentry from "@sentry/react";
import posthog from "@/lib/posthog";

type TelemetryProperties = Record<string, unknown>;

function isPostHogEnabled(): boolean {
  return typeof window !== "undefined" && Boolean(import.meta.env.VITE_POSTHOG_KEY);
}

export function trackEvent(name: string, properties: TelemetryProperties = {}): void {
  if (!isPostHogEnabled()) return;
  try {
    posthog.capture(name, properties);
  } catch {
    // Keep analytics side-effects from affecting app behavior.
  }
}

export function captureError(error: unknown, context: TelemetryProperties = {}): void {
  const normalizedError = error instanceof Error ? error : new Error(String(error));
  Sentry.captureException(normalizedError, { extra: context });
}
