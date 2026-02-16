import {Audio} from "@remotion/media";
import type {FC} from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {linearTiming, TransitionSeries} from "@remotion/transitions";
import {fade} from "@remotion/transitions/fade";
import {slide} from "@remotion/transitions/slide";

export interface PromoProps {
  headline: string;
  subheadline: string;
  cta: string;
  accentColor: string;
  themeTrack: string;
}

export const promoFps = 30;
export const promoWidth = 1080;
export const promoHeight = 1920;

const SCENE = {
  hook: 210,
  product: 240,
  cta: 240,
} as const;
const TRANSITION = 18;

export const promoDurationInFrames =
  SCENE.hook + SCENE.product + SCENE.cta - TRANSITION * 2;

const FrameNoise: FC = () => {
  const frame = useCurrentFrame();
  const opacity = 0.06 + (Math.sin(frame * 0.2) + 1) * 0.02;
  return (
    <AbsoluteFill
      style={{
        backgroundImage:
          "repeating-linear-gradient(0deg, rgba(255,255,255,0.08) 0px, rgba(255,255,255,0.08) 1px, transparent 1px, transparent 4px)",
        opacity,
        mixBlendMode: "screen",
      }}
    />
  );
};

const HookScene: FC<PromoProps> = ({headline, subheadline, accentColor}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({frame, fps, config: {damping: 200}});
  const scale = interpolate(enter, [0, 1], [0.8, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(enter, [0, 1], [50, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <Img
        src={staticFile("lunchtable/landing-bg.jpg")}
        style={{position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover"}}
      />
      <AbsoluteFill style={{backgroundColor: "rgba(0,0,0,0.58)"}} />

      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "0 96px",
          gap: 22,
          transform: `translateY(${y}px) scale(${scale})`,
        }}
      >
        <Img src={staticFile("lunchtable/logo.png")} style={{width: 300, height: "auto"}} />
        <h1
          style={{
            margin: 0,
            fontSize: 88,
            lineHeight: 1,
            color: "#fefce8",
            fontFamily: "Outfit, Arial, sans-serif",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            textShadow: "0 8px 20px rgba(0,0,0,0.45)",
          }}
        >
          {headline}
        </h1>
        <p
          style={{
            margin: 0,
            color: accentColor,
            fontSize: 40,
            fontWeight: 700,
            lineHeight: 1.15,
            fontFamily: "Outfit, Arial, sans-serif",
          }}
        >
          {subheadline}
        </p>
      </AbsoluteFill>
      <FrameNoise />
    </AbsoluteFill>
  );
};

const ProductScene: FC<PromoProps> = ({accentColor}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const cardIn = (delay: number) =>
    spring({
      frame: frame - delay,
      fps,
      config: {damping: 180},
    });

  const cardStyles = [0, 14, 28].map((delay, index) => {
    const inValue = cardIn(delay);
    const y = interpolate(inValue, [0, 1], [120, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const scale = interpolate(inValue, [0, 1], [0.78, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    return {
      transform: `translateY(${y}px) scale(${scale}) rotate(${index === 1 ? 0 : index === 0 ? -3 : 3}deg)`,
    };
  });

  return (
    <AbsoluteFill>
      <Img
        src={staticFile("lunchtable/story-bg.png")}
        style={{position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover"}}
      />
      <AbsoluteFill style={{backgroundColor: "rgba(0,0,0,0.62)"}} />

      <AbsoluteFill style={{padding: "170px 72px 120px"}}>
        <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
          <div
            style={{
              width: 290,
              border: `3px solid ${accentColor}`,
              boxShadow: "10px 10px 0 rgba(0,0,0,0.45)",
              overflow: "hidden",
              ...cardStyles[0],
            }}
          >
            <Img src={staticFile("lunchtable/story/story-1-2.png")} style={{width: "100%", height: 430, objectFit: "cover"}} />
          </div>
          <div
            style={{
              width: 310,
              border: `3px solid ${accentColor}`,
              boxShadow: "10px 10px 0 rgba(0,0,0,0.45)",
              overflow: "hidden",
              ...cardStyles[1],
            }}
          >
            <Img src={staticFile("lunchtable/story/story-3-3.png")} style={{width: "100%", height: 450, objectFit: "cover"}} />
          </div>
          <div
            style={{
              width: 290,
              border: `3px solid ${accentColor}`,
              boxShadow: "10px 10px 0 rgba(0,0,0,0.45)",
              overflow: "hidden",
              ...cardStyles[2],
            }}
          >
            <Img src={staticFile("lunchtable/story/story-4-4.png")} style={{width: "100%", height: 430, objectFit: "cover"}} />
          </div>
        </div>

        <div style={{marginTop: 88, textAlign: "center"}}>
          <h2
            style={{
              margin: 0,
              color: "#fefce8",
              fontSize: 74,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontFamily: "Outfit, Arial, sans-serif",
              textShadow: "0 8px 18px rgba(0,0,0,0.45)",
            }}
          >
            Build. Duel. Break the Meta.
          </h2>
        </div>
      </AbsoluteFill>
      <FrameNoise />
    </AbsoluteFill>
  );
};

const CtaScene: FC<PromoProps> = ({cta, accentColor}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 18], [0, 1], {
    easing: Easing.out(Easing.quad),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{opacity}}>
      <Img
        src={staticFile("lunchtable/stream-bg.png")}
        style={{position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover"}}
      />
      <AbsoluteFill style={{backgroundColor: "rgba(0,0,0,0.58)"}} />
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "0 80px",
          gap: 30,
        }}
      >
        <Img src={staticFile("lunchtable/title.png")} style={{width: 920, maxWidth: "92%", height: "auto"}} />
        <div
          style={{
            color: "#121212",
            backgroundColor: accentColor,
            border: "3px solid #121212",
            boxShadow: "8px 8px 0 rgba(0,0,0,0.45)",
            padding: "20px 30px",
            fontFamily: "Outfit, Arial, sans-serif",
            textTransform: "uppercase",
            fontWeight: 900,
            fontSize: 52,
            letterSpacing: "0.05em",
          }}
        >
          {cta}
        </div>
      </AbsoluteFill>
      <FrameNoise />
    </AbsoluteFill>
  );
};

export const PromoComposition: FC<PromoProps> = (props) => {
  return (
    <AbsoluteFill style={{backgroundColor: "#000"}}>
      <Audio
        src={staticFile(props.themeTrack)}
        trimAfter={promoDurationInFrames}
        volume={(f) =>
          interpolate(f, [0, 24, promoDurationInFrames - 24, promoDurationInFrames], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        }
      />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={SCENE.hook} premountFor={promoFps}>
          <HookScene {...props} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({durationInFrames: TRANSITION})}
        />
        <TransitionSeries.Sequence durationInFrames={SCENE.product} premountFor={promoFps}>
          <ProductScene {...props} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({direction: "from-bottom"})}
          timing={linearTiming({durationInFrames: TRANSITION})}
        />
        <TransitionSeries.Sequence durationInFrames={SCENE.cta} premountFor={promoFps}>
          <CtaScene {...props} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
