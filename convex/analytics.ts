"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { PostHog } from "posthog-node";
import * as Sentry from "@sentry/node";
// Initialize Sentry
if (process.env.SENTRY_DSN) {
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        tracesSampleRate: 1.0,
    });
}

// Initialize PostHog
let posthog: PostHog | null = null;
if (process.env.POSTHOG_KEY) {
    posthog = new PostHog(process.env.POSTHOG_KEY, {
        host: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
    });
}

/**
 * Validates environment variables are set for analytics.
 */
function ensureEnv() {
    if (!process.env.POSTHOG_KEY) {
        console.warn("POSTHOG_KEY is not set. Analytics will not be tracked.");
    }
    if (!process.env.SENTRY_DSN) {
        console.warn("SENTRY_DSN is not set. Errors will not be reported to Sentry.");
    }
}

export const trackEvent = action({
    args: {
        event: v.string(),
        distinctId: v.string(),
        properties: v.optional(v.any()),
    },
    handler: async (_ctx, args) => {
        ensureEnv();
        if (posthog) {
            posthog.capture({
                distinctId: args.distinctId,
                event: args.event,
                properties: args.properties,
            });
            await posthog.shutdown(); // Ensure events are flushed
        }
    },
});

export const reportError = action({
    args: {
        message: v.string(),
        context: v.optional(v.any()),
    },
    handler: async (_ctx, args) => {
        ensureEnv();
        Sentry.captureException(new Error(args.message), {
            extra: args.context,
        });
        await Sentry.flush(2000);
    },
});
