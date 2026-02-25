import { useState, useCallback, useRef, useEffect } from "react";

export type VisualEventType =
  | "attack_slash"
  | "spell_flash"
  | "trap_snap"
  | "effect_burst"
  | "card_destroyed"
  | "screen_shake";

export type VisualEvent = {
  id: number;
  type: VisualEventType;
  data?: Record<string, unknown>;
};

let counter = 0;

export function useVisualEvents() {
  const [events, setEvents] = useState<VisualEvent[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const push = useCallback(
    (type: VisualEventType, data?: Record<string, unknown>, durationMs = 1500) => {
      const id = ++counter;
      const event: VisualEvent = { id, type, data };
      setEvents((prev) => [...prev, event]);

      const timer = setTimeout(() => {
        setEvents((prev) => prev.filter((e) => e.id !== id));
        timersRef.current.delete(id);
      }, durationMs);
      timersRef.current.set(id, timer);

      return id;
    },
    [],
  );

  const clear = useCallback(() => {
    for (const timer of timersRef.current.values()) clearTimeout(timer);
    timersRef.current.clear();
    setEvents([]);
  }, []);

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) clearTimeout(timer);
    };
  }, []);

  return { events, push, clear };
}

/**
 * Detects LP drops and triggers screen shake.
 * Returns true when the board should be shaking.
 */
export function useScreenShake(playerLP: number): boolean {
  const prevLp = useRef(playerLP);
  const [shaking, setShaking] = useState(false);

  useEffect(() => {
    if (playerLP < prevLp.current && prevLp.current > 0) {
      setShaking(true);
      const timer = setTimeout(() => setShaking(false), 500);
      prevLp.current = playerLP;
      return () => clearTimeout(timer);
    }
    prevLp.current = playerLP;
  }, [playerLP]);

  return shaking;
}
