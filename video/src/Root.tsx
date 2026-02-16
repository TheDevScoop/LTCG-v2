import {Composition} from "remotion";
import {z} from "zod";
import {
  PromoComposition,
  promoDurationInFrames,
  promoFps,
  promoHeight,
  promoWidth,
  type PromoProps,
} from "./composition";
import {
  LTCGComicPromo24,
  comicDurationInFrames,
  comicFps,
  comicHeight,
  comicWidth,
  defaultComicPromoProps,
} from "./comic/LTCGComicPromo24";
import {
  LTCGGameplayAmbientLoop,
  gameplayAmbientDurationInFrames,
  gameplayAmbientFps,
  gameplayAmbientHeight,
  gameplayAmbientWidth,
} from "./gameplay/LTCGGameplayAmbientLoop";

const PromoSchema = z.object({
  headline: z.string(),
  subheadline: z.string(),
  cta: z.string(),
  accentColor: z.string(),
  themeTrack: z.string(),
});

const defaultProps: PromoProps = {
  headline: "School of Hard Knocks",
  subheadline: "Vice-themed deck duels with no training wheels.",
  cta: "Play LunchTable TCG",
  accentColor: "#fde047",
  themeTrack: "lunchtable/soundtrack/THEME.mp3",
};

const ComicPromoSchema = z.object({
  themeTrack: z.string(),
  durationSec: z.literal(24),
  comicIntensity: z.literal("full"),
  copyPack: z.object({
    hook: z.string(),
    subhook: z.string(),
    midA: z.string(),
    midB: z.string(),
    ctaTop: z.string(),
    ctaMain: z.string(),
  }),
});

export const Root = () => {
  return (
    <>
      <Composition
        id="LTCGPromoPortrait"
        component={PromoComposition}
        durationInFrames={promoDurationInFrames}
        fps={promoFps}
        width={promoWidth}
        height={promoHeight}
        schema={PromoSchema}
        defaultProps={defaultProps}
      />
      <Composition
        id="LTCGComicPromo24"
        component={LTCGComicPromo24}
        durationInFrames={comicDurationInFrames}
        fps={comicFps}
        width={comicWidth}
        height={comicHeight}
        schema={ComicPromoSchema}
        defaultProps={defaultComicPromoProps}
      />
      <Composition
        id="LTCGGameplayAmbientLoop"
        component={LTCGGameplayAmbientLoop}
        durationInFrames={gameplayAmbientDurationInFrames}
        fps={gameplayAmbientFps}
        width={gameplayAmbientWidth}
        height={gameplayAmbientHeight}
      />
    </>
  );
};
