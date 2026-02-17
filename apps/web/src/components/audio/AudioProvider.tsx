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
import { MUSIC_BUTTON } from "@/lib/blobUrls";

const AUDIO_SETTINGS_STORAGE_KEY = "ltcg.audio.settings.v1";
const AUDIO_DOCK_MODE_STORAGE_KEY = "ltcg.audio.dock.mode.v1";
const SOUNDTRACK_MANIFEST_SOURCE = "/api/soundtrack";
const MUSIC_BUTTON_FALLBACK = "/lunchtable/music-button.png";

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

function loadStoredSettings(): AudioSettings {
  if (typeof window === "undefined") return DEFAULT_AUDIO_SETTINGS;
  return parseStoredSettings(window.localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY));
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
  const manualPauseRef = useRef(false);

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
    } catch {
      setAutoplayBlocked(true);
    }
  }, []);

  const preloadTrack = useCallback((trackUrl: string) => {
    const preload = musicPreloadRef.current;
    if (!preload) return;

    const absolute = toAbsoluteTrackUrl(trackUrl);
    if (preload.src !== absolute) {
      preload.src = absolute;
      preload.load();
    }
  }, []);

  const playTrackAtIndex = useCallback(
    (index: number) => {
      const audio = musicAudioRef.current;
      const queue = currentQueueRef.current;
      if (!audio || queue.length === 0 || index < 0 || index >= queue.length) return;

      manualPauseRef.current = false;
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

      if (unlockedRef.current) {
        void safePlay(audio);
      }
    },
    [safePlay, preloadTrack],
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
          manualPauseRef.current = true;
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
    [playTrackAtIndex],
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
      if (manualPauseRef.current) return;
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
      } catch {
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

    if (audio.src && audio.paused && unlockedRef.current && !manualPauseRef.current) {
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
      manualPauseRef.current = true;
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
    manualPauseRef.current = true;
    audio.pause();
  }, []);

  const resumeMusic = useCallback(() => {
    const audio = musicAudioRef.current;
    if (!audio) return;

    const currentSettings = settingsRef.current;
    if (currentSettings.musicMuted || currentSettings.musicVolume <= 0) return;

    manualPauseRef.current = false;

    if (!audio.src) {
      const queue = currentQueueRef.current;
      if (queue.length === 0) return;
      const index = Math.min(Math.max(trackIndexRef.current, 0), queue.length - 1);
      playTrackAtIndex(index);
      return;
    }

    void safePlay(audio);
  }, [playTrackAtIndex, safePlay]);

  const stopMusic = useCallback(() => {
    const audio = musicAudioRef.current;
    if (!audio) return;
    manualPauseRef.current = true;
    audio.pause();
    audio.currentTime = 0;
  }, []);

  const skipToNextTrack = useCallback(() => {
    manualPauseRef.current = false;
    advanceTrack("manual");
  }, [advanceTrack]);

  const skipToPreviousTrack = useCallback(() => {
    const audio = musicAudioRef.current;
    const queue = currentQueueRef.current;
    if (!audio || queue.length === 0) return;

    manualPauseRef.current = false;
    if (audio.currentTime > 5) {
      audio.currentTime = 0;
      if (audio.paused) void safePlay(audio);
      return;
    }

    let previousIndex = trackIndexRef.current - 1;
    if (previousIndex < 0) previousIndex = queue.length - 1;
    playTrackAtIndex(previousIndex);
  }, [playTrackAtIndex, safePlay]);

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
  if (mode === "one") return "REP 1";
  if (mode === "off") return "REP OFF";
  return "REP ALL";
}

function loadDockModePreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = window.localStorage.getItem(AUDIO_DOCK_MODE_STORAGE_KEY);
    if (!stored) return true;
    return stored === "ticker";
  } catch {
    return true;
  }
}

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
    stopMusic,
    skipToNextTrack,
    skipToPreviousTrack,
    cycleRepeatMode,
  } = useAudio();
  const [buttonImageSrc, setButtonImageSrc] = useState(MUSIC_BUTTON);
  const [showTickerBar, setShowTickerBar] = useState<boolean>(() => loadDockModePreference());

  const musicVolumePercent = Math.round(settings.musicVolume * 100);
  const trackLabel = formatTrackLabel(currentTrack);
  const repeatLabel = repeatModeLabel(repeatMode);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        AUDIO_DOCK_MODE_STORAGE_KEY,
        showTickerBar ? "ticker" : "floating",
      );
    } catch {
      // Ignore storage write failures.
    }
  }, [showTickerBar]);

  const transportButtons = () => {
    const buttonClass =
      "text-[9px] sm:text-[10px] px-2 py-1 border border-[#121212] bg-white text-[#121212] font-bold uppercase tracking-wide transition hover:bg-[#121212] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffcc00]";

    return (
      <>
        <button
          type="button"
          onClick={skipToPreviousTrack}
          className={buttonClass}
          aria-label="Previous track"
          title="Previous track"
        >
          Prev
        </button>
        <button
          type="button"
          onClick={togglePlayPause}
          className={buttonClass}
          aria-label={isPlaying ? "Pause music" : "Resume music"}
          title={isPlaying ? "Pause music" : "Resume music"}
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          onClick={stopMusic}
          className={buttonClass}
          aria-label="Stop music"
          title="Stop music"
        >
          Stop
        </button>
        <button
          type="button"
          onClick={skipToNextTrack}
          className={buttonClass}
          aria-label="Next track"
          title="Next track"
        >
          Next
        </button>
        <button
          type="button"
          onClick={cycleRepeatMode}
          className={`${buttonClass} ${repeatMode === "off" ? "" : "bg-[#ffcc00]/20"}`}
          aria-label={`Cycle repeat mode, current mode ${repeatLabel}`}
          title={`Repeat mode: ${repeatLabel}`}
        >
          {repeatLabel}
        </button>
      </>
    );
  };

  return (
    <>
      <div className="fixed top-3 right-3 z-[60]">
        <button
          type="button"
          onClick={() => setShowTickerBar((current) => !current)}
          aria-label={showTickerBar ? "Hide audio ticker" : "Show audio ticker"}
          title={showTickerBar ? "Hide audio ticker" : "Show audio ticker"}
          className="group block rounded-sm transition-transform duration-150 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ffcc00]"
          aria-pressed={showTickerBar}
        >
          <img
            src={buttonImageSrc}
            alt="Open music options"
            className="w-[110px] h-auto select-none drop-shadow-[0_6px_10px_rgba(0,0,0,0.45)] transition-transform duration-150 group-hover:drop-shadow-[0_8px_14px_rgba(0,0,0,0.55)]"
            draggable={false}
            loading="eager"
            width={110}
            height={35}
            onError={() => {
              setButtonImageSrc((current) =>
                current === MUSIC_BUTTON_FALLBACK ? current : MUSIC_BUTTON_FALLBACK,
              );
            }}
          />
        </button>
      </div>

      {showTickerBar && (
        <div className="fixed bottom-0 left-0 right-0 z-[65] border-t-2 border-[#121212] bg-[#fef8c8]/95 backdrop-blur-sm">
          <div className="flex items-center gap-2 px-2 py-1.5 sm:px-3 sm:py-2">
            <div className="min-w-0 flex-1 overflow-hidden border border-[#121212] bg-white/80 px-2 py-1">
              <p
                className="ltcg-ticker-marquee text-[10px] sm:text-[11px] uppercase tracking-wide text-[#121212]"
                style={{ fontFamily: "Outfit, sans-serif" }}
                title={trackLabel}
              >
                {`${trackLabel} • ${trackLabel} • ${trackLabel}`}
              </p>
            </div>
            <div className="shrink-0 flex items-center gap-1">{transportButtons()}</div>
            <div className="shrink-0 flex items-center gap-1 border border-[#121212] bg-white/90 px-2 py-1">
              <button
                type="button"
                onClick={toggleMusicMuted}
                aria-label={settings.musicMuted ? "Unmute music" : "Mute music"}
                className="text-[9px] sm:text-[10px] px-1.5 py-1 border border-[#121212] font-bold uppercase tracking-wide transition hover:bg-[#121212] hover:text-white"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                {settings.musicMuted ? "Unmute" : "Mute"}
              </button>
              <span
                className="text-[9px] sm:text-[10px] text-[#121212]"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                Vol {musicVolumePercent}%
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={musicVolumePercent}
                onChange={(event) => setMusicVolume(Number(event.target.value) / 100)}
                aria-label="Music volume"
                className="h-1.5 w-20 sm:w-28 cursor-pointer accent-[#121212] rounded-full bg-[#121212]/15"
              />
            </div>
          </div>
          {autoplayBlocked && (
            <p
              className="px-3 pb-2 text-[10px] text-[#b45309]"
              style={{ fontFamily: "Special Elite, cursive" }}
            >
              Browser blocked autoplay. Click anywhere once to enable music.
            </p>
          )}
        </div>
      )}
    </>
  );
}

export function AudioContextGate({ context }: { context: string }) {
  const { setContextKey } = useAudio();

  useEffect(() => {
    setContextKey(context);
  }, [context, setContextKey]);

  return null;
}
