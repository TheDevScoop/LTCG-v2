import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStory } from "./StoryProvider";
import { INK_FRAME } from "@/lib/blobUrls";

export function StoryIntro() {
  const { currentEvent, advanceEvent } = useStory();

  if (!currentEvent || currentEvent.type !== "video") return null;

  return (
    <VideoPlayer
      src={currentEvent.src}
      skippable={currentEvent.skippable}
      onComplete={advanceEvent}
    />
  );
}

function VideoPlayer({
  src,
  skippable,
  onComplete,
}: {
  src: string;
  skippable: boolean;
  onComplete: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showSkip, setShowSkip] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hasError, setHasError] = useState(false);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    setProgress(video.currentTime / video.duration);

    if (video.currentTime >= 2 && skippable) {
      setShowSkip(true);
    }
  }, [skippable]);

  const handleError = useCallback(() => {
    setHasError(true);
    onComplete();
  }, [onComplete]);

  if (hasError) return null;

  return (
    <motion.div
      className="fixed inset-0 z-[60] bg-black flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <video
        ref={videoRef}
        src={src}
        autoPlay
        playsInline
        onTimeUpdate={handleTimeUpdate}
        onEnded={onComplete}
        onError={handleError}
        className="w-full h-full object-cover"
      />

      <div className="absolute inset-0 pointer-events-none">
        <img
          src={INK_FRAME}
          alt=""
          className="w-full h-full object-fill opacity-30"
          draggable={false}
          loading="lazy"
        />
      </div>

      <AnimatePresence>
        {showSkip && (
          <motion.button
            type="button"
            onClick={onComplete}
            className="absolute bottom-8 right-8 tcg-button px-6 py-3 text-sm z-10"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
          >
            SKIP &rarr;
          </motion.button>
        )}
      </AnimatePresence>

      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
        <motion.div
          className="h-full bg-[#ffcc00]"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </motion.div>
  );
}
