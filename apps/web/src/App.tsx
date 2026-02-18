import { BrowserRouter, Navigate, Routes, Route, useLocation } from "react-router";
import { lazy, Suspense, useEffect } from "react";
import * as Sentry from "@sentry/react";
import { Toaster } from "sonner";
import { useIframeMode } from "@/hooks/useIframeMode";
import { useDiscordActivity } from "@/hooks/useDiscordActivity";
import { useDiscordAuth } from "@/hooks/auth/useDiscordAuth";
import { useTelegramAuth } from "@/hooks/auth/useTelegramAuth";
import { useTelegramStartParamRouting } from "@/hooks/auth/useTelegramStartParam";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { AgentSpectatorView } from "@/components/game/AgentSpectatorView";
import { AudioContextGate, AudioControlsDock, useAudio } from "@/components/audio/AudioProvider";
import { getAudioContextFromPath } from "@/lib/audio/routeContext";
import { resolveDiscordEntryRedirect } from "@/lib/discordEntry";
import { Home } from "@/pages/Home";

const Onboarding = lazy(() => import("@/pages/Onboarding").then(m => ({ default: m.Onboarding })));
const Collection = lazy(() => import("@/pages/Collection").then(m => ({ default: m.Collection })));
const Story = lazy(() => import("@/pages/Story").then(m => ({ default: m.Story })));
const StoryChapter = lazy(() => import("@/pages/StoryChapter").then(m => ({ default: m.StoryChapter })));
const Decks = lazy(() => import("@/pages/Decks").then(m => ({ default: m.Decks })));
const Play = lazy(() => import("@/pages/Play").then(m => ({ default: m.Play })));
const Duel = lazy(() => import("@/pages/Duel").then(m => ({ default: m.Duel })));
const Privacy = lazy(() => import("@/pages/Privacy").then(m => ({ default: m.Privacy })));
const Terms = lazy(() => import("@/pages/Terms").then(m => ({ default: m.Terms })));
const About = lazy(() => import("@/pages/About").then(m => ({ default: m.About })));
const Token = lazy(() => import("@/pages/Token").then(m => ({ default: m.Token })));
const AgentDev = lazy(() => import("@/pages/AgentDev").then(m => ({ default: m.AgentDev })));
const Leaderboard = lazy(() => import("@/pages/Leaderboard").then(m => ({ default: m.Leaderboard })));
const Watch = lazy(() => import("@/pages/Watch").then(m => ({ default: m.Watch })));
const DeckBuilder = lazy(() => import("@/pages/DeckBuilder").then(m => ({ default: m.DeckBuilder })));
const Cliques = lazy(() => import("@/pages/Cliques").then(m => ({ default: m.Cliques })));
const Profile = lazy(() => import("@/pages/Profile").then(m => ({ default: m.Profile })));
const Settings = lazy(() => import("@/pages/Settings").then(m => ({ default: m.Settings })));

const SentryRoutes = Sentry.withSentryReactRouterV7Routing(Routes);

function PageErrorFallback({ resetError }: { resetError: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#fdfdfb] px-6">
      <h1
        className="text-3xl font-black uppercase tracking-tighter text-[#121212] mb-3"
        style={{ fontFamily: "Outfit, sans-serif" }}
      >
        Page Crashed
      </h1>
      <p
        className="text-[#121212]/60 text-sm mb-6 max-w-md text-center"
        style={{ fontFamily: "Special Elite, cursive" }}
      >
        This page broke down. Vice counter +1.
      </p>
      <div className="flex gap-3">
        <button onClick={resetError} className="tcg-button px-6 py-2">
          Retry
        </button>
        <button onClick={() => window.location.assign("/")} className="tcg-button-primary px-6 py-2">
          Go Home
        </button>
      </div>
    </div>
  );
}

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fdfdfb]">
      <div className="w-8 h-8 border-4 border-[#ffcc00] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function RouteAudioContextSync() {
  const location = useLocation();
  const { setContextKey } = useAudio();

  useEffect(() => {
    setContextKey(getAudioContextFromPath(location.pathname));
  }, [location.pathname, setContextKey]);

  return null;
}

function TelegramMiniAppBootstrap() {
  useTelegramStartParamRouting();
  return null;
}

function Guarded({ children }: { children: React.ReactNode }) {
  return (
    <Sentry.ErrorBoundary fallback={PageErrorFallback}>
      <Suspense fallback={<PageLoader />}>
        <AuthGuard>{children}</AuthGuard>
      </Suspense>
    </Sentry.ErrorBoundary>
  );
}

function Public({ children }: { children: React.ReactNode }) {
  return (
    <Sentry.ErrorBoundary fallback={PageErrorFallback}>
      <Suspense fallback={<PageLoader />}>
        {children}
      </Suspense>
    </Sentry.ErrorBoundary>
  );
}

function HomeEntry() {
  if (typeof window === "undefined") return <Home />;
  const redirect = resolveDiscordEntryRedirect(window.location.pathname, window.location.search);
  if (!redirect) return <Home />;
  return <Navigate to={redirect} replace />;
}

const CONVEX_SITE_URL = (import.meta.env.VITE_CONVEX_URL ?? "")
  .replace(".convex.cloud", ".convex.site");

export function App() {
  const { isEmbedded, authToken, isApiKey } = useIframeMode();
  useTelegramAuth();
  useDiscordActivity();
  useDiscordAuth();

  if (isApiKey && authToken) {
    return (
      <Sentry.ErrorBoundary fallback={PageErrorFallback}>
        <AudioContextGate context="play" />
        <AgentSpectatorView apiKey={authToken} apiUrl={CONVEX_SITE_URL} />
        <AudioControlsDock />
      </Sentry.ErrorBoundary>
    );
  }

  return (
    <BrowserRouter>
      <TelegramMiniAppBootstrap />
      <RouteAudioContextSync />
      <SentryRoutes>
        <Route path="/" element={<Public><HomeEntry /></Public>} />
        <Route path="/_discord/join" element={<Public><HomeEntry /></Public>} />
        <Route path="/privacy" element={<Public><Privacy /></Public>} />
        <Route path="/terms" element={<Public><Terms /></Public>} />
        <Route path="/about" element={<Public><About /></Public>} />
        <Route path="/token" element={<Public><Token /></Public>} />
        <Route path="/agent-dev" element={<Public><AgentDev /></Public>} />
        <Route path="/leaderboard" element={<Public><Leaderboard /></Public>} />
        <Route path="/watch" element={<Public><Watch /></Public>} />

        <Route path="/onboarding" element={<Guarded><Onboarding /></Guarded>} />
        <Route path="/collection" element={<Guarded><Collection /></Guarded>} />
        <Route path="/story" element={<Guarded><Story /></Guarded>} />
        <Route path="/story/:chapterId" element={<Guarded><StoryChapter /></Guarded>} />
        <Route path="/decks" element={<Guarded><Decks /></Guarded>} />
        <Route path="/duel" element={<Guarded><Duel /></Guarded>} />
        <Route path="/decks/:deckId" element={<Guarded><DeckBuilder /></Guarded>} />
        <Route path="/cliques" element={<Guarded><Cliques /></Guarded>} />
        <Route path="/profile" element={<Guarded><Profile /></Guarded>} />
        <Route path="/settings" element={<Guarded><Settings /></Guarded>} />
        <Route path="/play/:matchId" element={<Guarded><Play /></Guarded>} />
      </SentryRoutes>
      <AudioControlsDock />
      <Toaster
        position={isEmbedded ? "bottom-center" : "bottom-right"}
        toastOptions={{
          className: "paper-panel !rounded-none",
          style: {
            border: "2px solid #121212",
            fontFamily: "Outfit, sans-serif",
          },
        }}
      />
    </BrowserRouter>
  );
}
