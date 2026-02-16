export type BeatPoint = {
  frame: number;
  sec: number;
  kind: "bar" | "accent";
};

export const PROMO_FPS = 30;

export const BAR_FRAMES = [4, 76, 149, 221, 293, 366, 438, 511, 583, 656] as const;

export const ACCENT_FRAMES = [
  28,
  76,
  125,
  200,
  224,
  294,
  322,
  395,
  407,
  419,
  432,
  468,
  481,
  493,
  530,
  560,
  576,
  591,
  614,
  628,
  652,
  668,
  689,
  711,
] as const;

export const beatPoints: BeatPoint[] = [...BAR_FRAMES]
  .map((frame) => ({frame, sec: frame / PROMO_FPS, kind: "bar" as const}))
  .concat(
    [...ACCENT_FRAMES].map((frame) => ({
      frame,
      sec: frame / PROMO_FPS,
      kind: "accent" as const,
    })),
  )
  .sort((a, b) => a.frame - b.frame);

export const isNearFrame = (frame: number, target: number, tolerance = 2): boolean =>
  Math.abs(frame - target) <= tolerance;

export const nearestAccentInfo = (frame: number): {index: number; frame: number; distance: number} => {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  ACCENT_FRAMES.forEach((accent, index) => {
    const distance = Math.abs(accent - frame);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return {
    index: bestIndex,
    frame: ACCENT_FRAMES[bestIndex],
    distance: bestDistance,
  };
};

