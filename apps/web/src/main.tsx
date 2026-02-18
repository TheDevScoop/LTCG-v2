import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  useLocation,
  useNavigationType,
  createRoutesFromChildren,
  matchRoutes,
} from "react-router";
import * as Sentry from "@sentry/react";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { PrivyAuthProvider } from "@/components/auth/PrivyAuthProvider";
import { usePrivyAuthForConvex } from "@/hooks/auth/usePrivyAuthForConvex";
import { App } from "./App";
import "./globals.css";
import { PostHogProvider } from "posthog-js/react";
import posthog from "./lib/posthog";
import { AudioProvider } from "@/components/audio/AudioProvider";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  integrations: [
    Sentry.reactRouterV7BrowserTracingIntegration({
      useEffect,
      useLocation,
      useNavigationType,
      createRoutesFromChildren,
      matchRoutes,
    }),
    Sentry.replayIntegration(),
    Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
  ],
  enableLogs: true,
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

const convexUrl =
  ((import.meta.env.VITE_CONVEX_URL as string | undefined) ?? "").trim();
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Sentry.ErrorBoundary
      fallback={({ resetError }) => (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#fdfdfb] px-6">
          <h1
            className="text-4xl font-black uppercase tracking-tighter text-[#121212] mb-4"
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            Something Broke
          </h1>
          <p
            className="text-[#121212]/60 text-sm mb-6 max-w-md text-center"
            style={{ fontFamily: "Special Elite, cursive" }}
          >
            The cafeteria just exploded. Our janitors have been notified.
          </p>
          <button onClick={resetError} className="tcg-button px-6 py-3">
            Try Again
          </button>
        </div>
      )}
      showDialog
    >
      <PostHogProvider client={posthog}>
        <PrivyAuthProvider>
          {convex ? (
            <ConvexProviderWithAuth
              client={convex}
              useAuth={usePrivyAuthForConvex}
            >
              <AudioProvider>
                <App />
              </AudioProvider>
            </ConvexProviderWithAuth>
          ) : (
            <AudioProvider>
              <App />
            </AudioProvider>
          )}
        </PrivyAuthProvider>
      </PostHogProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>,
);
