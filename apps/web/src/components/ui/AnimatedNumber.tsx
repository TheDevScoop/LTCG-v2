import { useState, useEffect } from "react";

type AnimatedNumberProps = {
  value: number;
  duration?: number;
  delay?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
};

const formatter = new Intl.NumberFormat();

export function AnimatedNumber({
  value,
  duration = 800,
  delay = 0,
  prefix = "",
  suffix = "",
  className,
}: AnimatedNumberProps) {
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const [displayed, setDisplayed] = useState(prefersReducedMotion ? value : 0);

  useEffect(() => {
    if (prefersReducedMotion) {
      setDisplayed(value);
      return;
    }

    setDisplayed(0);

    const stepInterval = 40;
    const steps = Math.max(1, Math.round(duration / stepInterval));
    const stepValue = value / steps;
    let current = 0;
    let stepCount = 0;

    const timeoutId = setTimeout(() => {
      const intervalId = setInterval(() => {
        stepCount += 1;
        if (stepCount >= steps) {
          setDisplayed(value);
          clearInterval(intervalId);
        } else {
          current += stepValue;
          setDisplayed(Math.round(current));
        }
      }, stepInterval);

      return () => clearInterval(intervalId);
    }, delay);

    return () => clearTimeout(timeoutId);
  }, [value, duration, delay, prefersReducedMotion]);

  return (
    <span className={className}>
      {prefix}
      {formatter.format(displayed)}
      {suffix}
    </span>
  );
}
