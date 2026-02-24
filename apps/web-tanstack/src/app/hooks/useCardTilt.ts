import { useRef, useCallback, useState, useEffect } from "react";

interface CardTiltOptions {
  maxTilt?: number;
}

interface CardTiltResult {
  tiltStyle: { rotateX: number; rotateY: number };
  onMouseMove: (e: React.MouseEvent<HTMLElement>) => void;
  onMouseLeave: () => void;
}

export function useCardTilt({ maxTilt = 8 }: CardTiltOptions = {}): CardTiltResult {
  const ref = useRef<HTMLElement | null>(null);
  const [tilt, setTilt] = useState({ rotateX: 0, rotateY: 0 });
  const [prefersReduced, setPrefersReduced] = useState(false);
  const animFrame = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReduced(mq.matches);
    const handler = () => setPrefersReduced(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (prefersReduced) return;
      const el = e.currentTarget;
      ref.current = el;
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const rotateY = (x - 0.5) * 2 * maxTilt;
      const rotateX = (0.5 - y) * 2 * maxTilt;

      cancelAnimationFrame(animFrame.current);
      animFrame.current = requestAnimationFrame(() => {
        setTilt({ rotateX, rotateY });
      });
    },
    [maxTilt, prefersReduced],
  );

  const onMouseLeave = useCallback(() => {
    cancelAnimationFrame(animFrame.current);
    setTilt({ rotateX: 0, rotateY: 0 });
  }, []);

  return { tiltStyle: tilt, onMouseMove, onMouseLeave };
}
