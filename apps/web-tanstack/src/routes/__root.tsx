/// <reference types="vite/client" />
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import * as Sentry from "@sentry/react";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { PostHogProvider } from "posthog-js/react";
import * as React from "react";
import { Toaster } from "sonner";
import { DefaultCatchBoundary } from "~/components/DefaultCatchBoundary";
import { NotFound } from "~/components/NotFound";
import type { RouterContext } from "~/routerContext";
import appCss from "~/styles/app.css?url";
import legacyCss from "~/styles/legacy.css?url";
import { AudioContextGate, AudioControlsDock, AudioProvider, useAudio } from "@/components/audio/AudioProvider";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { PrivyAuthProvider } from "@/components/auth/PrivyAuthProvider";
import { AgentSpectatorView } from "@/components/game/AgentSpectatorView";
import { Breadcrumb, BreadcrumbSpacer } from "@/components/layout/Breadcrumb";
import { useTelegramAuth } from "@/hooks/auth/useTelegramAuth";
import { usePrivyAuthForConvex } from "@/hooks/auth/usePrivyAuthForConvex";
import { useIframeMode } from "@/hooks/useIframeMode";
import { getAudioContextFromPath } from "@/lib/audio/routeContext";
import { enableDiscordUrlMappingsForActivity } from "@/lib/discordUrlMappings";
import { sendChatToHost } from "@/lib/iframe";
import posthog from "@/lib/posthog";

const convexUrl = ((import.meta.env.VITE_CONVEX_URL as string | undefined) ?? "").trim();
const convexClient = new ConvexReactClient(convexUrl || "https://example.invalid");
const convexSiteUrl = convexUrl.replace(".convex.cloud", ".convex.site").replace(/\/$/, "");

const RouterDevtools = import.meta.env.DEV
  ? React.lazy(async () => {
      const mod = await import("@tanstack/react-router-devtools");
      return { default: mod.TanStackRouterDevtools };
    })
  : null;

let sentryInitialized = false;

function ensureSentryInit() {
  if (sentryInitialized) return;
  sentryInitialized = true;

  const dsn = ((import.meta.env.VITE_SENTRY_DSN as string | undefined) ?? "").trim();
  if (!dsn) return;

  Sentry.init({
    dsn,
    integrations: [
      Sentry.replayIntegration(),
      Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
    ],
    enableLogs: true,
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "LunchTable: School of Hard Knocks" },
      {
        name: "description",
        content: "LunchTable TCG web client powered by TanStack Start and Convex.",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: legacyCss },
      { rel: "icon", href: "/favicon.ico" },
    ],
  }),
  errorComponent: DefaultCatchBoundary,
  notFoundComponent: () => <NotFound />,
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  ensureSentryInit();

  const { queryClient } = Route.useRouteContext();

  React.useEffect(() => {
    enableDiscordUrlMappingsForActivity();
  }, []);

  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <Sentry.ErrorBoundary fallback={({ error, resetError }) => (
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
              {error instanceof Error ? error.message : "The cafeteria just exploded. Our janitors have been notified."}
            </p>
            <button onClick={resetError} className="tcg-button px-6 py-3">
              Try Again
            </button>
          </div>
        )}>
          <QueryClientProvider client={queryClient}>
            <PostHogProvider client={posthog}>
              <PrivyAuthProvider>
                <ConvexProviderWithAuth client={convexClient} useAuth={usePrivyAuthForConvex}>
                  <AudioProvider>
                    <LegacyRuntime>{children}</LegacyRuntime>
                  </AudioProvider>
                </ConvexProviderWithAuth>
              </PrivyAuthProvider>
            </PostHogProvider>
          </QueryClientProvider>
        </Sentry.ErrorBoundary>
        <Analytics />
        <SpeedInsights />
        {RouterDevtools ? (
          <React.Suspense fallback={null}>
            <RouterDevtools position="bottom-right" />
          </React.Suspense>
        ) : null}
        <Scripts />
      </body>
    </html>
  );
}

function LegacyRuntime({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { setContextKey } = useAudio();

  const {
    isEmbedded,
    authToken,
    agentId,
    isApiKey,
    startMatchCommand,
    clearStartMatchCommand,
    chatState,
    chatEvent,
  } = useIframeMode();

  useTelegramAuth();

  React.useEffect(() => {
    setContextKey(getAudioContextFromPath(location.pathname));
  }, [location.pathname, setContextKey]);

  React.useEffect(() => {
    if (!startMatchCommand) return;

    if (startMatchCommand.matchId) {
      navigate({ to: "/play/$matchId", params: { matchId: startMatchCommand.matchId } as never });
      clearStartMatchCommand();
      return;
    }

    if (startMatchCommand.mode === "pvp") {
      navigate({ to: "/pvp" });
      clearStartMatchCommand();
      return;
    }

    if (startMatchCommand.chapterId) {
      navigate({ to: "/story/$chapterId", params: { chapterId: startMatchCommand.chapterId } as never });
      clearStartMatchCommand();
      return;
    }

    navigate({ to: "/story" });
    clearStartMatchCommand();
  }, [clearStartMatchCommand, navigate, startMatchCommand]);

  if (isApiKey && authToken) {
    return (
      <>
        <AudioContextGate context="play" />
        <AgentSpectatorView
          apiKey={authToken}
          apiUrl={convexSiteUrl}
          agentId={agentId}
          hostChatState={chatState}
          hostChatEvent={chatEvent}
          onSendChat={(text, matchId) =>
            sendChatToHost({
              text,
              matchId,
              agentId: agentId ?? undefined,
            })
          }
        />
        <AudioControlsDock />
      </>
    );
  }

  return (
    <>
      {!isEmbedded && <Breadcrumb />}
      {!isEmbedded && <BreadcrumbSpacer />}
      <React.Suspense fallback={null}>{children}</React.Suspense>
      <RouteAwareAudioDock pathname={location.pathname} />
      <Toaster richColors position="top-right" />
    </>
  );
}

function RouteAwareAudioDock({ pathname }: { pathname: string }) {
  if (pathname.startsWith("/play/")) return null;
  if (pathname.startsWith("/stream-overlay")) return null;
  return <AudioControlsDock />;
}

export function Protected({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
