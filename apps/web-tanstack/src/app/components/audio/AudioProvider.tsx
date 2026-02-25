import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  loadSoundtrackManifest,
  resolvePlaylist,
  toAbsoluteTrackUrl,
  type SoundtrackManifest,
} from "@/lib/audio/soundtrack";
import { captureError, trackEvent } from "@/lib/telemetry";

const AUDIO_SETTINGS_STORAGE_KEY = "ltcg.audio.settings.v1";
const AUDIO_PLAYBACK_INTENT_STORAGE_KEY = "ltcg.audio.playback.intent.v1";
const SOUNDTRACK_MANIFEST_SOURCE = "/api/soundtrack";
type AudioPlaybackIntent = "playing" | "paused" | "stopped";
const VALID_AUDIO_PLAYBACK_INTENTS = new Set<AudioPlaybackIntent>([
  "playing",
  "paused",
  "stopped",
]);

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function normalizeStoredVolume(value: unknown, fallback: number): number {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : NaN;
  if (!Number.isFinite(numericValue)) return fallback;
  const normalized = numericValue >= 1 ? numericValue / 100 : numericValue;
  return clamp01(normalized);
}

function normalizeStoredBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off", ""].includes(normalized)) return false;
  }
  return fallback;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

export interface AudioSettings {
  musicVolume: number;
  sfxVolume: number;
  musicMuted: boolean;
  sfxMuted: boolean;
}

export type RepeatMode = "all" | "one" | "off";

const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  musicVolume: 0.65,
  sfxVolume: 0.8,
  musicMuted: false,
  sfxMuted: false,
};

function parseStoredSettings(raw: string | null): AudioSettings {
  if (typeof window === "undefined") return DEFAULT_AUDIO_SETTINGS;
  try {
    if (!raw) return DEFAULT_AUDIO_SETTINGS;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      musicVolume: normalizeStoredVolume(parsed.musicVolume, DEFAULT_AUDIO_SETTINGS.musicVolume),
      sfxVolume: normalizeStoredVolume(parsed.sfxVolume, DEFAULT_AUDIO_SETTINGS.sfxVolume),
      musicMuted: normalizeStoredBoolean(
        parsed.musicMuted,
        DEFAULT_AUDIO_SETTINGS.musicMuted,
      ),
      sfxMuted: normalizeStoredBoolean(parsed.sfxMuted, DEFAULT_AUDIO_SETTINGS.sfxMuted),
    };
  } catch {
    return DEFAULT_AUDIO_SETTINGS;
  }
}

function parseStoredPlaybackIntent(raw: string | null): AudioPlaybackIntent {
  if (raw === "playing" || raw === "paused" || raw === "stopped") return raw;
  if (!raw) return "playing";

  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === "string" &&
      VALID_AUDIO_PLAYBACK_INTENTS.has(parsed as AudioPlaybackIntent)
    ) {
      return parsed as AudioPlaybackIntent;
    }
  } catch {
    // Fallback below.
  }

  return "playing";
}

function loadStoredSettings(): AudioSettings {
  if (typeof window === "undefined") return DEFAULT_AUDIO_SETTINGS;
  return parseStoredSettings(window.localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY));
}

function loadStoredPlaybackIntent(): AudioPlaybackIntent {
  if (typeof window === "undefined") return "playing";
  return parseStoredPlaybackIntent(window.localStorage.getItem(AUDIO_PLAYBACK_INTENT_STORAGE_KEY));
}

function saveStoredPlaybackIntent(intent: AudioPlaybackIntent): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUDIO_PLAYBACK_INTENT_STORAGE_KEY, intent);
  } catch {
    // Ignore storage errors so local audio prefs never break playback.
  }
}

interface AudioContextValue {
  loading: boolean;
  ready: boolean;
  contextKey: string;
  currentTrack: string | null;
  autoplayBlocked: boolean;
  isPlaying: boolean;
  repeatMode: RepeatMode;
  settings: AudioSettings;
  setContextKey: (contextKey: string) => void;
  setMusicVolume: (volume: number) => void;
  setSfxVolume: (volume: number) => void;
  setMusicMuted: (muted: boolean) => void;
  setSfxMuted: (muted: boolean) => void;
  toggleMusicMuted: () => void;
  toggleSfxMuted: () => void;
  pauseMusic: () => void;
  resumeMusic: () => void;
  togglePlayPause: () => void;
  stopMusic: () => void;
  skipToNextTrack: () => void;
  skipToPreviousTrack: () => void;
  cycleRepeatMode: () => void;
  playSfx: (sfxId: string) => void;
  soundtrack: SoundtrackManifest | null;
}

const AudioContext = createContext<AudioContextValue | null>(null);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AudioSettings>(() => loadStoredSettings());
  const [contextKey, setContextKey] = useState("landing");
  const [soundtrack, setSoundtrack] = useState<SoundtrackManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTrack, setCurrentTrack] = useState<string | null>(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("all");
  const [isPlaying, setIsPlaying] = useState(false);

  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const sfxPoolRef = useRef<HTMLAudioElement[]>([]);
  const musicPreloadRef = useRef<HTMLAudioElement | null>(null);
  const settingsRef = useRef<AudioSettings>(settings);
  const soundtrackRef = useRef<SoundtrackManifest | null>(soundtrack);
  const currentQueueRef = useRef<string[]>([]);
  const trackIndexRef = useRef(0);
  const shuffleModeRef = useRef(false);
  const repeatModeRef = useRef<RepeatMode>(repeatMode);
  const unlockedRef = useRef(false);
  const playbackIntentRef = useRef<AudioPlaybackIntent>(loadStoredPlaybackIntent());

  settingsRef.current = settings;
  soundtrackRef.current = soundtrack;
  repeatModeRef.current = repeatMode;

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.crossOrigin = "anonymous";
    musicAudioRef.current = audio;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    const pool: HTMLAudioElement[] = [];
    for (let i = 0; i < 8; i += 1) {
      const sfx = new Audio();
      sfx.preload = "auto";
      sfx.crossOrigin = "anonymous";
      pool.push(sfx);
    }
    sfxPoolRef.current = pool;
    musicPreloadRef.current = new Audio();
    musicPreloadRef.current.preload = "auto";
    musicPreloadRef.current.crossOrigin = "anonymous";

    return () => {
      audio.pause();
      audio.src = "";
      musicAudioRef.current = null;
      for (const sfx of sfxPoolRef.current) {
        sfx.pause();
        sfx.src = "";
      }
      if (musicPreloadRef.current) {
        musicPreloadRef.current.pause();
        musicPreloadRef.current.src = "";
      }
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      sfxPoolRef.current = [];
      musicPreloadRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onStorage = (event: StorageEvent) => {
      if (event.key !== AUDIO_SETTINGS_STORAGE_KEY) return;
      const nextSettings = parseStoredSettings(event.newValue);
      setSettings(nextSettings);
    };

    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const safePlay = useCallback(async (audio: HTMLAudioElement) => {
    try {
      await audio.play();
      setAutoplayBlocked(false);
      trackEvent("audio_play_attempt", {
        action: "play",
        context: contextKey,
      });
    } catch (error) {
      setAutoplayBlocked(true);
      captureError(error, { action: "audio_play_attempt", context: contextKey });
      trackEvent("audio_play_failed", {
        action: "play",
        context: contextKey,
      });
    }
  }, [contextKey]);

  const preloadTrack = useCallback((trackUrl: string) => {
    const preload = musicPreloadRef.current;
    if (!preload) return;

    const absolute = toAbsoluteTrackUrl(trackUrl);
    if (preload.src !== absolute) {
      preload.src = absolute;
      preload.load();
    }
  }, []);

  const setPlaybackIntent = useCallback((intent: AudioPlaybackIntent) => {
    if (playbackIntentRef.current === intent) return;
    playbackIntentRef.current = intent;
    saveStoredPlaybackIntent(intent);
    trackEvent("audio_playback_intent_set", {
      context: contextKey,
      intent,
      isPlaying: intent === "playing",
    });
  }, [contextKey]);

  const playTrackAtIndex = useCallback(
    (index: number, options?: { forcePlay?: boolean }) => {
      const audio = musicAudioRef.current;
      const queue = currentQueueRef.current;
      if (!audio || queue.length === 0 || index < 0 || index >= queue.length) return;

      const next = queue[index]!;
      trackIndexRef.current = index;
      setCurrentTrack(next);

      const nextUrl = toAbsoluteTrackUrl(next);
      if (audio.src !== nextUrl) {
        audio.src = nextUrl;
        audio.load();
      }
      audio.currentTime = 0;

      const currentSettings = settingsRef.current;
      audio.volume = currentSettings.musicMuted ? 0 : clamp01(currentSettings.musicVolume);
      if (currentSettings.musicMuted || currentSettings.musicVolume <= 0) {
        audio.pause();
        return;
      }

      const prefetchIndex = index + 1 >= queue.length ? 0 : index + 1;
      const prefetchTrack = queue[prefetchIndex];
      if (prefetchTrack) preloadTrack(prefetchTrack);

      const shouldPlay = options?.forcePlay || playbackIntentRef.current === "playing";
      if (unlockedRef.current && shouldPlay) {
        void safePlay(audio);
      }
    },
    [safePlay, preloadTrack, playbackIntentRef],
  );

  const advanceTrack = useCallback(
    (trigger: "ended" | "manual" = "ended") => {
      const queue = currentQueueRef.current;
      if (queue.length === 0) return;

      if (trigger === "ended" && repeatModeRef.current === "one") {
        playTrackAtIndex(trackIndexRef.current);
        return;
      }

      let nextIndex = trackIndexRef.current + 1;
      if (nextIndex >= queue.length) {
        if (trigger === "ended" && repeatModeRef.current === "off") {
          setPlaybackIntent("stopped");
          const audio = musicAudioRef.current;
          if (audio) {
            audio.pause();
            audio.currentTime = 0;
          }
          return;
        }

        if (shuffleModeRef.current) {
          currentQueueRef.current = shuffle([...queue]);
        }
        nextIndex = 0;
      }

      playTrackAtIndex(nextIndex);
    },
    [playTrackAtIndex, setPlaybackIntent],
  );

  useEffect(() => {
    const audio = musicAudioRef.current;
    if (!audio) return;
    const onEnded = () => advanceTrack("ended");
    audio.addEventListener("ended", onEnded);
    return () => audio.removeEventListener("ended", onEnded);
  }, [advanceTrack]);

  useEffect(() => {
    const unlock = () => {
      unlockedRef.current = true;
      const current = musicAudioRef.current;
      if (!current) return;
      const currentSettings = settingsRef.current;
      if (!current.src) return;
      if (currentSettings.musicMuted || currentSettings.musicVolume <= 0) return;
      if (playbackIntentRef.current !== "playing") return;
      void safePlay(current);
    };

    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [safePlay]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const manifest = await loadSoundtrackManifest(SOUNDTRACK_MANIFEST_SOURCE);
        if (!cancelled) setSoundtrack(manifest);
      } catch (error) {
        captureError(error, { action: "audio_manifest_load_failed", source: SOUNDTRACK_MANIFEST_SOURCE });
        trackEvent("audio_manifest_load_failed", {
          source: SOUNDTRACK_MANIFEST_SOURCE,
        });
        if (!cancelled) {
          setSoundtrack({
            playlists: { default: [] },
            sfx: {},
            source: SOUNDTRACK_MANIFEST_SOURCE,
            loadedAt: Date.now(),
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const audio = musicAudioRef.current;
    if (!audio) return;

    audio.volume = settings.musicMuted ? 0 : clamp01(settings.musicVolume);
    if (settings.musicMuted || settings.musicVolume <= 0) {
      if (!audio.paused) audio.pause();
      return;
    }

    if (
      audio.src &&
      audio.paused &&
      unlockedRef.current &&
      playbackIntentRef.current === "playing"
    ) {
      void safePlay(audio);
    }
  }, [settings.musicMuted, settings.musicVolume, safePlay]);

  useEffect(() => {
    if (!soundtrack) return;

    const resolved = resolvePlaylist(soundtrack, contextKey);
    shuffleModeRef.current = resolved.shuffle;

    const queue = resolved.shuffle ? shuffle([...resolved.tracks]) : [...resolved.tracks];
    currentQueueRef.current = queue;

    if (queue.length === 0) {
      // Don't persist "stopped" — just pause. When the user navigates to a
      // route with tracks, their original intent ("playing") should resume.
      const audio = musicAudioRef.current;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      setCurrentTrack(null);
      return;
    }

    playTrackAtIndex(0);
  }, [soundtrack, contextKey, playTrackAtIndex]);

  useEffect(() => {
    try {
      window.localStorage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Ignore storage failures (private mode, quota exceeded, blocked storage)
    }
  }, [settings]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onStorage = (event: StorageEvent) => {
      if (event.key !== AUDIO_PLAYBACK_INTENT_STORAGE_KEY) return;
      const nextIntent = parseStoredPlaybackIntent(event.newValue);
      setPlaybackIntent(nextIntent);
    };

    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, [setPlaybackIntent]);

  const playSfx = useCallback((sfxId: string) => {
    const manifest = soundtrackRef.current;
    const src = manifest?.sfx[sfxId.toLowerCase()];
    if (!src) return;

    const currentSettings = settingsRef.current;
    if (currentSettings.sfxMuted || currentSettings.sfxVolume <= 0) return;

    const pool = sfxPoolRef.current;
    if (pool.length === 0) return;

    const slot = pool.find((audio) => audio.paused || audio.ended) ?? pool[0];
    if (!slot) return;

    slot.pause();
    slot.currentTime = 0;
    slot.src = toAbsoluteTrackUrl(src);
    slot.volume = clamp01(currentSettings.sfxVolume);
    void slot.play().catch(() => {});
  }, []);

  const pauseMusic = useCallback(() => {
    const audio = musicAudioRef.current;
    if (!audio) return;
    setPlaybackIntent("paused");
    audio.pause();
    trackEvent("audio_paused", {
      action: "pause",
      context: contextKey,
      track: currentTrack,
    });
  }, [setPlaybackIntent, contextKey, currentTrack]);

  const resumeMusic = useCallback(() => {
    const audio = musicAudioRef.current;
    if (!audio) return;

    const currentSettings = settingsRef.current;
    if (currentSettings.musicMuted || currentSettings.musicVolume <= 0) return;

    setPlaybackIntent("playing");
    trackEvent("audio_resumed", {
      action: "resume",
      context: contextKey,
      track: currentTrack,
    });

    if (!audio.src) {
      const queue = currentQueueRef.current;
      if (queue.length === 0) return;
      const index = Math.min(Math.max(trackIndexRef.current, 0), queue.length - 1);
      playTrackAtIndex(index, { forcePlay: true });
      return;
    }

    void safePlay(audio);
  }, [playTrackAtIndex, safePlay, setPlaybackIntent, contextKey, currentTrack]);

  const stopMusic = useCallback(() => {
    const audio = musicAudioRef.current;
    if (!audio) return;
    setPlaybackIntent("stopped");
    audio.pause();
    audio.currentTime = 0;
    trackEvent("audio_stopped", {
      action: "stop",
      context: contextKey,
      track: currentTrack,
    });
  }, [setPlaybackIntent, contextKey, currentTrack]);

  const skipToNextTrack = useCallback(() => {
    setPlaybackIntent("playing");
    advanceTrack("manual");
  }, [advanceTrack, setPlaybackIntent]);

  const skipToPreviousTrack = useCallback(() => {
    const audio = musicAudioRef.current;
    const queue = currentQueueRef.current;
    if (!audio || queue.length === 0) return;

    setPlaybackIntent("playing");
    if (audio.currentTime > 5) {
      audio.currentTime = 0;
      if (audio.paused) void safePlay(audio);
      return;
    }

    let previousIndex = trackIndexRef.current - 1;
    if (previousIndex < 0) previousIndex = queue.length - 1;
    playTrackAtIndex(previousIndex);
  }, [playTrackAtIndex, safePlay, setPlaybackIntent]);

  const togglePlayPause = useCallback(() => {
    const audio = musicAudioRef.current;
    if (!audio) return;
    if (audio.paused) {
      resumeMusic();
      return;
    }
    pauseMusic();
  }, [pauseMusic, resumeMusic]);

  const cycleRepeatMode = useCallback(() => {
    setRepeatMode((previous) => {
      if (previous === "all") return "one";
      if (previous === "one") return "off";
      return "all";
    });
  }, []);

  const value = useMemo<AudioContextValue>(
    () => ({
      loading,
      ready: Boolean(soundtrack),
      contextKey,
      currentTrack,
      autoplayBlocked,
      isPlaying,
      repeatMode,
      settings,
      setContextKey,
      setMusicVolume: (volume: number) =>
        setSettings((prev) => ({ ...prev, musicVolume: clamp01(volume) })),
      setSfxVolume: (volume: number) =>
        setSettings((prev) => ({ ...prev, sfxVolume: clamp01(volume) })),
      setMusicMuted: (muted: boolean) =>
        setSettings((prev) => ({ ...prev, musicMuted: muted })),
      setSfxMuted: (muted: boolean) =>
        setSettings((prev) => ({ ...prev, sfxMuted: muted })),
      toggleMusicMuted: () =>
        setSettings((prev) => ({ ...prev, musicMuted: !prev.musicMuted })),
      toggleSfxMuted: () =>
        setSettings((prev) => ({ ...prev, sfxMuted: !prev.sfxMuted })),
      pauseMusic,
      resumeMusic,
      togglePlayPause,
      stopMusic,
      skipToNextTrack,
      skipToPreviousTrack,
      cycleRepeatMode,
      playSfx,
      soundtrack,
    }),
    [
      loading,
      soundtrack,
      contextKey,
      currentTrack,
      autoplayBlocked,
      isPlaying,
      repeatMode,
      settings,
      pauseMusic,
      resumeMusic,
      togglePlayPause,
      stopMusic,
      skipToNextTrack,
      skipToPreviousTrack,
      cycleRepeatMode,
      playSfx,
    ],
  );

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

export function useAudio(): AudioContextValue {
  const value = useContext(AudioContext);
  if (!value) {
    throw new Error("useAudio must be used within AudioProvider");
  }
  return value;
}

function formatTrackLabel(track: string | null): string {
  if (!track) return "No track";
  const [clean = ""] = track.split("?");
  const parts = clean.split("/");
  const raw = parts.at(-1) ?? track;
  try {
    const decoded = decodeURIComponent(raw) || track;
    return decoded
      .replace(/\.[^/.]+$/, "")
      .replace(/[_-]+/g, " ")
      .trim();
  } catch {
    return (raw || track).replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ").trim();
  }
}

function repeatModeLabel(mode: RepeatMode): string {
  if (mode === "one") return "1";
  if (mode === "off") return "OFF";
  return "ALL";
}

/* ── Draggable hook ─────────────────────────────────────── */

function useDraggable(initialX: number, initialY: number) {
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    hasMoved.current = false;
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [pos.x, pos.y]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    hasMoved.current = true;
    setPos({ x: e.clientX - offset.current.x, y: e.clientY - offset.current.y });
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragging.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  return { pos, hasMoved, onPointerDown, onPointerMove, onPointerUp };
}

/* ── SVG icons (inline to avoid extra fetches) ──────────── */

const IconPlay = () => (
  <svg viewBox="0 0 448 512" className="w-3 h-3 fill-current">
    <path d="M424.4 214.7L72.4 6.6C43.8-10.3 0 6.1 0 47.9V464c0 37.5 40.7 60.1 72.4 41.3l352-208c31.4-18.5 31.5-64.1 0-82.6z" />
  </svg>
);
const IconPause = () => (
  <svg viewBox="0 0 448 512" className="w-3 h-3 fill-current">
    <path d="M144 479H48c-26.5 0-48-21.5-48-48V79c0-26.5 21.5-48 48-48h96c26.5 0 48 21.5 48 48v352c0 26.5-21.5 48-48 48zm304-48V79c0-26.5-21.5-48-48-48h-96c-26.5 0-48 21.5-48 48v352c0 26.5 21.5 48 48 48h96c26.5 0 48-21.5 48-48z" />
  </svg>
);
const IconPrev = () => (
  <svg viewBox="0 0 512 512" className="w-2.5 h-2.5 fill-current">
    <path d="M11.5 280.6l192 160c20.6 17.2 52.5 2.8 52.5-24.6V96c0-27.4-31.9-41.8-52.5-24.6l-192 160c-15.3 12.8-15.3 36.4 0 49.2zm256 0l192 160c20.6 17.2 52.5 2.8 52.5-24.6V96c0-27.4-31.9-41.8-52.5-24.6l-192 160c-15.3 12.8-15.3 36.4 0 49.2z" />
  </svg>
);
const IconNext = () => (
  <svg viewBox="0 0 512 512" className="w-2.5 h-2.5 fill-current">
    <path d="M500.5 231.4l-192-160C287.9 54.3 256 68.6 256 96v320c0 27.4 31.9 41.8 52.5 24.6l192-160c15.3-12.8 15.3-36.4 0-49.2zm-256 0l-192-160C31.9 54.3 0 68.6 0 96v320c0 27.4 31.9 41.8 52.5 24.6l192-160c15.3-12.8 15.3-36.4 0-49.2z" />
  </svg>
);
const IconPower = () => (
  <svg viewBox="0 0 512 512" className="w-3.5 h-3.5 fill-current">
    <path d="M400 54.1c63 45 104 118.6 104 201.9 0 136.8-110.8 247.7-247.5 248C120 504.3 8.2 393 8 256.4 7.9 173.1 48.9 99.3 111.8 54.2c11.7-8.3 28-4.8 35 7.7L162.6 90c5.9 10.5 3.1 23.8-6.6 31-41.5 30.8-68 79.6-68 134.9-.1 92.3 74.5 168.1 168 168.1 91.6 0 168.6-74.2 168-169.1-.3-51.8-24.7-101.8-68.1-134-9.7-7.2-12.4-20.5-6.5-30.9l15.8-28.1c7-12.4 23.2-16.1 34.8-7.8zM296 264V24c0-13.3-10.7-24-24-24h-32c-13.3 0-24 10.7-24 24v240c0 13.3 10.7 24 24 24h32c13.3 0 24-10.7 24-24z" />
  </svg>
);
const IconStop = () => (
  <svg viewBox="0 0 448 512" className="w-2.5 h-2.5 fill-current">
    <path d="M400 32H48C21.5 32 0 53.5 0 80v352c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48V80c0-26.5-21.5-48-48-48z" />
  </svg>
);

/* ── Boombox Colours (zine-themed) ──────────────────────── */

const BB = {
  main: "#121212",
  body: "#1a1a1a",
  accent: "#ffcc00",
  speaker: "#222",
  speakerRing: "#333",
  chrome: "#e0e0e0",
  tape: "#2a2a2a",
  tapeWindow: "#fef8c8",
  text: "#fdfdfb",
  knob: "#ffcc00",
};
const BOOMBOX_W = 164;

/* ── Boombox Component ──────────────────────────────────── */

export function AudioControlsDock() {
  const {
    settings,
    setMusicVolume,
    toggleMusicMuted,
    autoplayBlocked,
    currentTrack,
    isPlaying,
    repeatMode,
    togglePlayPause,
    resumeMusic,
    stopMusic,
    skipToNextTrack,
    skipToPreviousTrack,
    cycleRepeatMode,
  } = useAudio();

  const [poweredOn, setPoweredOn] = useState(true);
  const { pos, hasMoved, onPointerDown, onPointerMove, onPointerUp } = useDraggable(
    typeof window !== "undefined" ? window.innerWidth - BOOMBOX_W - 16 : 0,
    10,
  );

  const volPct = Math.round(settings.musicVolume * 100);
  const trackLabel = formatTrackLabel(currentTrack);
  const repLabel = repeatModeLabel(repeatMode);

  const handlePower = useCallback(() => {
    if (hasMoved.current) return;
    setPoweredOn((v) => {
      if (v) {
        stopMusic();
        if (!settings.musicMuted) toggleMusicMuted();
      } else {
        if (settings.musicMuted) toggleMusicMuted();
        resumeMusic();
      }
      return !v;
    });
  }, [hasMoved, stopMusic, resumeMusic, toggleMusicMuted, settings.musicMuted]);

  const stopDrag = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    hasMoved.current = false;
  }, [hasMoved]);

  const spkr = `radial-gradient(circle,
    ${BB.main} 3px,${BB.speakerRing} 3px,${BB.speakerRing} 5px,
    ${BB.speaker} 5px,${BB.speaker} 10px,${BB.speakerRing} 10px,
    ${BB.speakerRing} 11px,${BB.speaker} 11px,${BB.speaker} 15px,
    ${BB.speakerRing} 15px,${BB.speakerRing} 16px,${BB.body} 16px)`;

  const reel = (x: string) => `radial-gradient(circle at ${x},
    ${BB.accent} 3px,${BB.main} 3px,${BB.main} 4px,transparent 4px)`;

  const tapeGrad = `${reel("30%")},${reel("70%")},
    linear-gradient(180deg,transparent 35%,${BB.main} 35%,${BB.main} 37%,
    ${BB.accent}44 37%,${BB.accent}44 63%,${BB.main} 63%,${BB.main} 65%,transparent 65%)`;

  const tb = "w-5 h-5 flex items-center justify-center border border-[#333] bg-[#2a2a2a] text-[#fdfdfb] transition-colors hover:bg-[#ffcc00] hover:text-[#121212] active:scale-95";

  return (
    <div
      className="fixed z-[60] select-none touch-none cursor-grab active:cursor-grabbing"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div style={{ width: BOOMBOX_W }}>
        {/* Handle */}
        <div
          className="mx-5 h-3 border border-b-0 border-[#121212]"
          style={{
            background: `${BB.chrome} linear-gradient(180deg,${BB.accent} 4px,${BB.main} 4px,${BB.main} 5px,${BB.chrome} 5px) no-repeat`,
            borderRadius: "2px 2px 0 0",
          }}
        />

        {/* Body */}
        <div
          className="border-2 border-[#121212] relative overflow-hidden"
          style={{
            background: `${BB.body} repeat-x bottom left`,
            backgroundImage: `${spkr},${spkr}`,
            backgroundSize: "33% 65%,33% 65%",
            backgroundPosition: "left bottom,right bottom",
            borderRadius: 2,
          }}
        >
          {/* Volume + Power strip */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 border-b border-[#121212]"
            style={{ background: BB.speaker }}
          >
            <div className="flex-1 flex flex-col items-center">
              <input
                type="range" min={0} max={100} step={1} value={volPct}
                onChange={(e) => setMusicVolume(Number(e.target.value) / 100)}
                onPointerDown={stopDrag}
                aria-label="Volume"
                className="w-full h-1 cursor-pointer rounded-full"
                style={{ accentColor: BB.knob }}
              />
              <span className="text-[6px] uppercase tracking-widest mt-0.5"
                style={{ color: BB.text, fontFamily: "Outfit,sans-serif" }}>
                Vol {volPct}%
              </span>
            </div>
            <button
              type="button" onClick={handlePower} onPointerDown={stopDrag}
              aria-label="Power"
              className="w-5 h-5 rounded-full border flex items-center justify-center transition-colors"
              style={{
                borderColor: BB.main,
                background: poweredOn ? BB.accent : BB.speaker,
                color: poweredOn ? BB.main : BB.text,
              }}
            >
              <IconPower />
            </button>
          </div>

          {/* Tape */}
          <div className="mx-auto my-1.5 relative" style={{ width: 120 }}>
            <div
              className="h-10 border border-[#121212] relative overflow-hidden"
              style={{
                background: `${BB.tapeWindow} no-repeat center center`,
                backgroundImage: tapeGrad,
                backgroundSize: "100% 100%,100% 100%,40% 100%",
                borderRadius: 2,
              }}
            >
              <div className="absolute inset-x-0 bottom-0 h-3.5 flex items-center overflow-hidden bg-[#121212]/80 px-1">
                <p className="ltcg-ticker-marquee text-[7px] uppercase tracking-wide whitespace-nowrap"
                  style={{ color: BB.accent, fontFamily: "Outfit,sans-serif" }}
                  title={trackLabel}>
                  {poweredOn ? `${trackLabel} \u2022 ${trackLabel} \u2022 ${trackLabel}` : "OFF"}
                </p>
              </div>
            </div>

            {/* Transport */}
            <div className="flex items-center justify-center gap-0.5 mt-1">
              <button type="button" onClick={skipToPreviousTrack} onPointerDown={stopDrag} className={tb} aria-label="Previous"><IconPrev /></button>
              <button type="button" onClick={stopMusic} onPointerDown={stopDrag} className={tb} aria-label="Stop"><IconStop /></button>
              <button type="button" onClick={togglePlayPause} onPointerDown={stopDrag}
                className={`${tb} !w-6 !h-6 !border-[#ffcc00]`} aria-label={isPlaying ? "Pause" : "Play"}>
                {isPlaying ? <IconPause /> : <IconPlay />}
              </button>
              <button type="button" onClick={skipToNextTrack} onPointerDown={stopDrag} className={tb} aria-label="Next"><IconNext /></button>
              <button type="button" onClick={cycleRepeatMode} onPointerDown={stopDrag}
                className={`${tb} text-[6px] font-bold`}
                style={{ fontFamily: "Outfit,sans-serif", background: repeatMode !== "off" ? `${BB.accent}33` : undefined }}
                aria-label={`Repeat: ${repLabel}`}>
                {repLabel}
              </button>
            </div>
          </div>

          {autoplayBlocked && (
            <p className="text-center text-[6px] pb-1"
              style={{ color: BB.accent, fontFamily: "Special Elite,cursive" }}>
              Click anywhere to enable music
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function AudioContextGate({ context }: { context: string }) {
  const { setContextKey } = useAudio();

  useEffect(() => {
    setContextKey(context);
  }, [context, setContextKey]);

  return null;
}
