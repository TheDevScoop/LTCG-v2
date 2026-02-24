import * as Sentry from "@sentry/react";

export function captureError(error: unknown, context?: Record<string, unknown>) {
  const err = error instanceof Error ? error : new Error(String(error));
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

export function captureMessage(message: string, level: "info" | "warning" | "error" = "error") {
  Sentry.captureMessage(message, level);
}
