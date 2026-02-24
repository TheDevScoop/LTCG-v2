import { useEffect, useMemo } from "react";
import { useSearchParams } from "@/router/react-router";

function getTrimmedParam(params: URLSearchParams, key: string): string | null {
  const value = params.get(key);
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function DiscordCallback() {
  const [params] = useSearchParams();

  const { hasAuthResult, message, isError } = useMemo(() => {
    const error = getTrimmedParam(params, "error");
    const errorDescription = getTrimmedParam(params, "error_description");
    const code = getTrimmedParam(params, "code");

    if (error) {
      const detail = errorDescription ? ` (${errorDescription})` : "";
      return {
        hasAuthResult: true,
        isError: true,
        message: `Discord authorization failed: ${error}${detail}`,
      };
    }

    if (code) {
      return {
        hasAuthResult: true,
        isError: false,
        message: "Discord authorization complete. You can close this window and return to Discord.",
      };
    }

    return {
      hasAuthResult: false,
      isError: false,
      message: "This is the Discord OAuth callback page. You can return to the game.",
    };
  }, [params]);

  useEffect(() => {
    if (!hasAuthResult) return;

    // Best-effort: if this page was opened as a popup, try to close it after a short delay.
    const timeoutId = window.setTimeout(() => {
      try {
        window.close();
      } catch {
        // Ignore - some browsers disallow closing windows not opened via script.
      }
    }, 800);

    return () => window.clearTimeout(timeoutId);
  }, [hasAuthResult]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fdfdfb] px-6">
      <div className="paper-panel max-w-lg w-full p-6">
        <h1
          className="text-2xl font-black uppercase tracking-tighter text-[#121212] mb-3"
          style={{ fontFamily: "Outfit, sans-serif" }}
        >
          Discord Callback
        </h1>
        <p
          className="text-sm text-[#121212]/70"
          style={{ fontFamily: "Special Elite, cursive" }}
        >
          {message}
        </p>

        <div className="mt-6 flex gap-3">
          <button
            onClick={() => window.location.assign("/")}
            className={isError ? "tcg-button" : "tcg-button-primary"}
          >
            Return Home
          </button>
          <button onClick={() => window.close()} className="tcg-button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

