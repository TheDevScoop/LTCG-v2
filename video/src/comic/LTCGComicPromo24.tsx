import {Audio} from "@remotion/media";
import type {FC} from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  aboutAssets,
  backgroundCycleAssets,
  castPanelAssets,
  signupAvatarAssets,
  stageAssets,
  storyAssets,
  viceAssets,
} from "./assetManifest";
import {ACCENT_FRAMES, BAR_FRAMES} from "./beatMap";
import {
  AccentPulseOverlay,
  BoundaryInkWipe,
  HalftoneOverlay,
  PanelGutterOverlay,
  SpeedLinesOverlay,
} from "./comicFx";

export type ComicIntensity = "full";

export type CopyPack = {
  hook: string;
  subhook: string;
  midA: string;
  midB: string;
  ctaTop: string;
  ctaMain: string;
};

export type ComicPromoProps = {
  themeTrack: string;
  durationSec: 24;
  copyPack: CopyPack;
  comicIntensity: ComicIntensity;
};

export const comicFps = 30;
export const comicWidth = 1080;
export const comicHeight = 1920;
export const comicDurationInFrames = 720;

const ACT_STARTS = {
  coldOpen: 0,
  hook: 4,
  cast: 149,
  vices: 293,
  story: 438,
  cta: 583,
} as const;

const ACT_DURATIONS = {
  coldOpen: 4,
  hook: 145,
  cast: 144,
  vices: 145,
  story: 145,
  cta: 137,
} as const;

const ACT_BOUNDARIES = [149, 293, 438, 583] as const;

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const textStyle = {
  fontFamily: "Outfit, Arial, sans-serif",
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
  color: "#fff8c2",
  textShadow: "0 4px 0 rgba(0,0,0,0.8), 0 10px 24px rgba(0,0,0,0.65)",
};

const nearestDistance = (value: number, points: readonly number[]) =>
  points.reduce((best, point) => Math.min(best, Math.abs(point - value)), Number.POSITIVE_INFINITY);

const cycleAsset = (assets: readonly string[], frame: number, holdFrames: number) =>
  assets[Math.floor(frame / holdFrames) % assets.length];

const BackdropCycle: FC<{
  assets: readonly string[];
  holdFrames: number;
  tint?: string;
  zoom?: number;
}> = ({assets, holdFrames, tint = "rgba(0,0,0,0.45)", zoom = 0.1}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const src = cycleAsset(assets, frame, holdFrames);
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], clamp);
  const scale = 1 + zoom * progress;
  const x = interpolate(progress, [0, 1], [-20, 20], clamp);
  const y = interpolate(progress, [0, 1], [12, -12], clamp);

  return (
    <AbsoluteFill style={{overflow: "hidden"}}>
      <Img
        src={staticFile(src)}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `translate(${x}px, ${y}px) scale(${scale})`,
        }}
      />
      <AbsoluteFill style={{backgroundColor: tint}} />
    </AbsoluteFill>
  );
};

const ColdOpenScene: FC = () => {
  const frame = useCurrentFrame();
  const flash = interpolate(frame, [0, 1, 2, 3], [0, 1, 0.35, 0], clamp);

  return (
    <AbsoluteFill style={{backgroundColor: "#000"}}>
      <Img
        src={staticFile("lunchtable/ink-frame.png")}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: 0.55 + flash * 0.25,
          filter: "contrast(140%) saturate(65%)",
        }}
      />
      <AbsoluteFill
        style={{
          backgroundColor: "#ffffff",
          opacity: flash * 0.35,
          mixBlendMode: "screen",
        }}
      />
    </AbsoluteFill>
  );
};

const ActHookScene: FC<{copyPack: CopyPack}> = ({copyPack}) => {
  const frame = useCurrentFrame();
  const globalFrame = ACT_STARTS.hook + frame;
  const {fps} = useVideoConfig();

  const titleIn = spring({frame, fps, config: {damping: 18, stiffness: 170}});
  const titleScale = interpolate(titleIn, [0, 1], [0.8, 1], clamp);
  const titleY = interpolate(titleIn, [0, 1], [36, 0], clamp);

  const accentDistance = nearestDistance(globalFrame, ACCENT_FRAMES);
  const accentBoost = interpolate(accentDistance, [0, 10], [1.18, 1], clamp);

  return (
    <AbsoluteFill>
      <BackdropCycle assets={backgroundCycleAssets} holdFrames={24} tint="rgba(0,0,0,0.56)" zoom={0.14} />

      <AbsoluteFill style={{justifyContent: "center", alignItems: "center", padding: "0 74px", gap: 20}}>
        <Img
          src={staticFile("lunchtable/logo.png")}
          style={{
            width: 290,
            height: "auto",
            transform: `scale(${titleScale * accentBoost})`,
            filter: "drop-shadow(0 14px 22px rgba(0,0,0,0.65))",
          }}
        />
        <h1
          style={{
            ...textStyle,
            margin: 0,
            textAlign: "center",
            fontSize: 70,
            lineHeight: 1,
            transform: `translateY(${titleY}px) scale(${accentBoost})`,
          }}
        >
          {copyPack.hook}
        </h1>
        <p
          style={{
            ...textStyle,
            margin: 0,
            textAlign: "center",
            fontSize: 33,
            color: "#fde68a",
            letterSpacing: "0.05em",
          }}
        >
          {copyPack.subhook}
        </p>
      </AbsoluteFill>

      {[0, 1, 2].map((slot) => {
        const delay = slot * 7;
        const pop = spring({
          frame: frame - delay,
          fps,
          config: {damping: 16, stiffness: 170},
        });
        const scale = interpolate(pop, [0, 1], [0.72, 1], clamp) * accentBoost;
        const y = interpolate(pop, [0, 1], [70, 0], clamp);
        // 145 frames / 5 = 29 steps -> guarantees all signup avatars appear in the hook act.
        const image =
          signupAvatarAssets[
            (Math.floor(frame / 5) + slot * 10) % signupAvatarAssets.length
          ];

        const positions = [
          {left: 24, top: 210, rotate: -8},
          {left: 720, top: 250, rotate: 9},
          {left: 378, top: 1180, rotate: -3},
        ] as const;
        const position = positions[slot];

        return (
          <div
            key={`${image}-${slot}`}
            style={{
              position: "absolute",
              left: position.left,
              top: position.top,
              width: slot === 2 ? 320 : 300,
              height: slot === 2 ? 360 : 390,
              overflow: "hidden",
              border: "4px solid #111",
              boxShadow: "8px 8px 0 rgba(0,0,0,0.6)",
              transform: `translateY(${y}px) scale(${scale}) rotate(${position.rotate}deg)`,
              background: "rgba(0,0,0,0.45)",
            }}
          >
            <Img src={staticFile(image)} style={{width: "100%", height: "100%", objectFit: "cover"}} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const ActCastScene: FC<{copyPack: CopyPack}> = ({copyPack}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const segment = Math.floor(frame / 8);
  const panels = [
    {left: 34, top: 210, width: 300, height: 290, rotate: -4},
    {left: 377, top: 170, width: 300, height: 280, rotate: 2},
    {left: 720, top: 210, width: 300, height: 290, rotate: 4},
    {left: 58, top: 540, width: 330, height: 310, rotate: 3},
    {left: 390, top: 520, width: 300, height: 320, rotate: -3},
    {left: 716, top: 565, width: 300, height: 300, rotate: 5},
  ] as const;

  return (
    <AbsoluteFill>
      <BackdropCycle
        assets={[
          "lunchtable/menu-texture.png",
          "lunchtable/crumpled-paper.png",
          "lunchtable/collection-bg.png",
          "lunchtable/privacy-bg.png",
        ]}
        holdFrames={18}
        tint="rgba(6,6,6,0.52)"
        zoom={0.08}
      />

      {panels.map((panel, index) => {
        const castAsset = castPanelAssets[(segment * 3 + index) % castPanelAssets.length];
        const avatarAsset =
          signupAvatarAssets[(segment * panels.length + index) % signupAvatarAssets.length];
        const asset = index % 2 === 0 ? avatarAsset : castAsset;
        const pop = spring({
          frame: frame - index * 2,
          fps,
          config: {damping: 20, stiffness: 220},
        });
        const scale = interpolate(pop, [0, 1], [0.65, 1], clamp);
        const y = Math.sin(frame * 0.08 + index) * 6;

        return (
          <div
            key={`${asset}-${index}`}
            style={{
              position: "absolute",
              left: panel.left,
              top: panel.top + y,
              width: panel.width,
              height: panel.height,
              overflow: "hidden",
              border: "3px solid #111",
              boxShadow: "8px 8px 0 rgba(0,0,0,0.58)",
              transform: `scale(${scale}) rotate(${panel.rotate}deg)`,
              transformOrigin: "center center",
              backgroundColor: "rgba(0,0,0,0.4)",
            }}
          >
            <Img src={staticFile(asset)} style={{width: "100%", height: "100%", objectFit: "cover"}} />
          </div>
        );
      })}

      <AbsoluteFill style={{justifyContent: "flex-end", padding: "0 54px 248px"}}>
        <h2
          style={{
            ...textStyle,
            margin: 0,
            fontSize: 66,
            lineHeight: 1.02,
            transform: `rotate(-1.2deg)`,
          }}
        >
          {copyPack.midA}
        </h2>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const ActVicesScene: FC<{copyPack: CopyPack}> = ({copyPack}) => {
  const frame = useCurrentFrame();
  const globalFrame = ACT_STARTS.vices + frame;
  const {fps} = useVideoConfig();
  const accentDistance = nearestDistance(globalFrame, ACCENT_FRAMES);
  const accentBoost = interpolate(accentDistance, [0, 9], [1.15, 1], clamp);

  return (
    <AbsoluteFill>
      <BackdropCycle
        assets={[
          "lunchtable/vices/vice-splash.png",
          "lunchtable/story-bg.png",
          "lunchtable/watch-bg.png",
        ]}
        holdFrames={28}
        tint="rgba(0,0,0,0.6)"
        zoom={0.11}
      />

      <AbsoluteFill style={{alignItems: "center", paddingTop: 62, gap: 8}}>
        <h2 style={{...textStyle, margin: 0, fontSize: 58, transform: `scale(${accentBoost})`}}>
          {copyPack.midA}
        </h2>
        <p
          style={{
            ...textStyle,
            margin: 0,
            fontSize: 28,
            color: "#fde68a",
            textTransform: "none",
            letterSpacing: "0.03em",
            textAlign: "center",
            maxWidth: 900,
          }}
        >
          {copyPack.midB}
        </p>
      </AbsoluteFill>

      <AbsoluteFill style={{padding: "228px 54px 240px"}}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 18,
            width: "100%",
            height: "100%",
          }}
        >
          {viceAssets.map((asset, index) => {
            const pop = spring({
              frame: frame - index,
              fps,
              config: {damping: 15, stiffness: 180},
            });
            const scale = interpolate(pop, [0, 1], [0.72, 1], clamp);
            const label = asset
              .split("/")
              .pop()
              ?.replace(".png", "")
              .replace(/-/g, " ")
              .toUpperCase();

            return (
              <div
                key={asset}
                style={{
                  border: "3px solid #111",
                  backgroundColor: "rgba(0,0,0,0.5)",
                  boxShadow: "6px 6px 0 rgba(0,0,0,0.55)",
                  overflow: "hidden",
                  transform: `scale(${scale}) rotate(${index % 2 === 0 ? -1.8 : 1.8}deg)`,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <Img src={staticFile(asset)} style={{width: "100%", height: 160, objectFit: "cover"}} />
                <div
                  style={{
                    ...textStyle,
                    fontSize: 15,
                    textAlign: "center",
                    letterSpacing: "0.06em",
                    padding: "6px 8px",
                  }}
                >
                  {label}
                </div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const ActStoryScene: FC = () => {
  const frame = useCurrentFrame();
  const storyStep = Math.floor(frame / 9);
  const stageIndex = Math.min(stageAssets.length - 1, Math.floor(frame / 48));

  const slots = [
    {left: 48, top: 168, width: 460, height: 360, rotate: -3},
    {left: 572, top: 174, width: 460, height: 355, rotate: 3},
    {left: 48, top: 564, width: 460, height: 350, rotate: 2},
    {left: 572, top: 564, width: 460, height: 350, rotate: -2},
  ] as const;

  return (
    <AbsoluteFill>
      <BackdropCycle
        assets={["lunchtable/story-bg.png", "lunchtable/deck-bg.png", "lunchtable/watch-bg.png"]}
        holdFrames={20}
        tint="rgba(5,5,5,0.6)"
        zoom={0.09}
      />

      {slots.map((slot, index) => {
        const asset = storyAssets[(storyStep * 4 + index) % storyAssets.length];
        return (
          <div
            key={`${slot.left}-${asset}`}
            style={{
              position: "absolute",
              left: slot.left,
              top: slot.top,
              width: slot.width,
              height: slot.height,
              overflow: "hidden",
              border: "3px solid #111",
              boxShadow: "8px 8px 0 rgba(0,0,0,0.58)",
              transform: `rotate(${slot.rotate}deg)`,
              backgroundColor: "rgba(0,0,0,0.48)",
            }}
          >
            <Img src={staticFile(asset)} style={{width: "100%", height: "100%", objectFit: "cover"}} />
          </div>
        );
      })}

      <div
        style={{
          position: "absolute",
          left: 210,
          right: 210,
          bottom: 236,
          height: 230,
          border: "4px solid #111",
          boxShadow: "8px 8px 0 rgba(0,0,0,0.58)",
          overflow: "hidden",
          transform: "rotate(-1.4deg)",
          backgroundColor: "rgba(0,0,0,0.42)",
        }}
      >
        <Img
          src={staticFile(stageAssets[stageIndex])}
          style={{width: "100%", height: "100%", objectFit: "cover"}}
        />
      </div>

      <Img
        src={staticFile("lunchtable/deco-shield.png")}
        style={{
          position: "absolute",
          width: 190,
          height: "auto",
          top: 1115,
          left: 445,
          opacity: 0.96,
          filter: "drop-shadow(0 8px 14px rgba(0,0,0,0.55))",
        }}
      />
    </AbsoluteFill>
  );
};

const ActCtaScene: FC<{copyPack: CopyPack}> = ({copyPack}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const pop = spring({frame, fps, config: {damping: 18, stiffness: 170}});
  const scale = interpolate(pop, [0, 1], [0.7, 1], clamp);
  const textOpacity = interpolate(frame, [0, 20], [0, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });

  const avatarBase = Math.floor(frame / 4);
  const miniStrip = [
    signupAvatarAssets[(avatarBase + 0) % signupAvatarAssets.length],
    signupAvatarAssets[(avatarBase + 10) % signupAvatarAssets.length],
    signupAvatarAssets[(avatarBase + 20) % signupAvatarAssets.length],
  ];

  const tickerText =
    " NOW PLAYING: THEME // WELCOME TO THE SCHOOL OF HARD KNOCKS // BUILD YOUR CLIQUE // CHAIN COMBOS // PLAY LUNCHTABLE TCG // ";
  const travel = tickerText.length * 15;
  const tickerX = interpolate(frame, [0, durationInFrames], [0, -travel], clamp);

  return (
    <AbsoluteFill>
      <BackdropCycle assets={aboutAssets} holdFrames={34} tint="rgba(0,0,0,0.62)" zoom={0.1} />

      <AbsoluteFill style={{justifyContent: "center", alignItems: "center", gap: 14, opacity: textOpacity}}>
        <p style={{...textStyle, margin: 0, fontSize: 30, color: "#fde68a"}}>{copyPack.ctaTop}</p>
        <Img
          src={staticFile("lunchtable/title.png")}
          style={{
            width: 920,
            maxWidth: "90%",
            height: "auto",
            transform: `scale(${scale})`,
            filter: "drop-shadow(0 14px 22px rgba(0,0,0,0.65))",
          }}
        />
        <div
          style={{
            ...textStyle,
            fontSize: 42,
            padding: "14px 22px",
            border: "3px solid #111",
            backgroundColor: "#fef08a",
            color: "#121212",
            boxShadow: "8px 8px 0 rgba(0,0,0,0.58)",
            transform: "rotate(-1deg)",
          }}
        >
          {copyPack.ctaMain}
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{justifyContent: "flex-end", paddingBottom: 192, gap: 10, alignItems: "center"}}>
        <div style={{display: "flex", gap: 10}}>
          {miniStrip.map((asset) => (
            <div
              key={asset}
              style={{
                width: 210,
                height: 120,
                overflow: "hidden",
                border: "3px solid #111",
                boxShadow: "6px 6px 0 rgba(0,0,0,0.52)",
                transform: "rotate(-1.5deg)",
              }}
            >
              <Img src={staticFile(asset)} style={{width: "100%", height: "100%", objectFit: "cover"}} />
            </div>
          ))}
        </div>
      </AbsoluteFill>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 174,
          borderTop: "4px solid #111",
          background: "linear-gradient(180deg, rgba(19,19,19,0.95), rgba(7,7,7,0.98))",
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "0 18px",
          boxShadow: "0 -8px 26px rgba(0,0,0,0.58)",
        }}
      >
        <div style={{display: "flex", gap: 10, alignItems: "center", minWidth: 302}}>
          <div
            style={{
              width: 72,
              height: 72,
              border: "3px solid #fef08a",
              borderRadius: 12,
              overflow: "hidden",
              backgroundColor: "#101010",
              display: "grid",
              placeItems: "center",
            }}
          >
            <Img src={staticFile("lunchtable/music-button.png")} style={{width: 62, height: 62, objectFit: "cover"}} />
          </div>
          {["<<", "II", ">>"].map((label) => (
            <div
              key={label}
              style={{
                width: 54,
                height: 54,
                border: "2px solid #fef08a",
                borderRadius: 10,
                display: "grid",
                placeItems: "center",
                color: "#fff8c2",
                fontWeight: 800,
                fontFamily: "Outfit, Arial, sans-serif",
                backgroundColor: "rgba(24,24,24,0.88)",
              }}
            >
              {label}
            </div>
          ))}
          <Img
            src={staticFile("comic/music-1600.png")}
            style={{width: 44, height: 44, objectFit: "contain", opacity: 0.95}}
          />
        </div>

        <div
          style={{
            position: "relative",
            flex: 1,
            overflow: "hidden",
            border: "2px solid rgba(254,240,138,0.6)",
            borderRadius: 10,
            height: 66,
            backgroundColor: "rgba(0,0,0,0.45)",
          }}
        >
          <div
            style={{
              ...textStyle,
              position: "absolute",
              top: "50%",
              transform: `translate(${tickerX}px, -50%)`,
              whiteSpace: "nowrap",
              fontSize: 26,
              paddingLeft: 12,
            }}
          >
            {tickerText.repeat(3)}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const defaultCopyPack: CopyPack = {
  hook: "WELCOME TO THE SCHOOL OF HARD KNOCKS",
  subhook: "VICE-POWERED DECK DUELS",
  midA: "BUILD YOUR CLIQUE",
  midB: "CHAIN COMBOS. BREAK THE META.",
  ctaTop: "CONTROL THE CHAOS",
  ctaMain: "PLAY LUNCHTABLE TCG",
};

export const defaultComicPromoProps: ComicPromoProps = {
  themeTrack: "lunchtable/soundtrack/THEME.mp3",
  durationSec: 24,
  comicIntensity: "full",
  copyPack: defaultCopyPack,
};

export const LTCGComicPromo24: FC<ComicPromoProps> = (props) => {
  const frame = useCurrentFrame();
  const finalFade = interpolate(frame, [comicDurationInFrames - 22, comicDurationInFrames - 1], [0, 1], clamp);
  const speedStrength = frame < ACT_STARTS.cast ? 0.35 : frame < ACT_STARTS.vices ? 0.24 : frame < ACT_STARTS.story ? 0.32 : 0.26;

  return (
    <AbsoluteFill style={{backgroundColor: "#050505"}}>
      <Audio
        src={staticFile(props.themeTrack)}
        trimAfter={comicDurationInFrames}
        volume={(f) => interpolate(f, [0, 12, 696, 719], [0, 1, 1, 0], clamp)}
      />

      <Sequence from={ACT_STARTS.coldOpen} durationInFrames={ACT_DURATIONS.coldOpen} premountFor={comicFps}>
        <ColdOpenScene />
      </Sequence>
      <Sequence from={ACT_STARTS.hook} durationInFrames={ACT_DURATIONS.hook} premountFor={comicFps}>
        <ActHookScene copyPack={props.copyPack} />
      </Sequence>
      <Sequence from={ACT_STARTS.cast} durationInFrames={ACT_DURATIONS.cast} premountFor={comicFps}>
        <ActCastScene copyPack={props.copyPack} />
      </Sequence>
      <Sequence from={ACT_STARTS.vices} durationInFrames={ACT_DURATIONS.vices} premountFor={comicFps}>
        <ActVicesScene copyPack={props.copyPack} />
      </Sequence>
      <Sequence from={ACT_STARTS.story} durationInFrames={ACT_DURATIONS.story} premountFor={comicFps}>
        <ActStoryScene />
      </Sequence>
      <Sequence from={ACT_STARTS.cta} durationInFrames={ACT_DURATIONS.cta} premountFor={comicFps}>
        <ActCtaScene copyPack={props.copyPack} />
      </Sequence>

      {props.comicIntensity === "full" ? (
        <>
          <HalftoneOverlay opacity={0.18} />
          <SpeedLinesOverlay strength={speedStrength} />
          <PanelGutterOverlay />
          <BoundaryInkWipe boundaries={ACT_BOUNDARIES} />
          <AccentPulseOverlay accentFrames={ACCENT_FRAMES} />
        </>
      ) : null}

      {BAR_FRAMES.map((bar) => {
        if (Math.abs(frame - bar) > 1) {
          return null;
        }
        const opacity = interpolate(Math.abs(frame - bar), [0, 1], [0.42, 0], clamp);
        return (
          <AbsoluteFill
            key={bar}
            style={{
              opacity,
              pointerEvents: "none",
              background: "linear-gradient(180deg, rgba(255,240,140,0.22), transparent 26%, transparent 74%, rgba(255,240,140,0.22))",
            }}
          />
        );
      })}

      <AbsoluteFill style={{backgroundColor: "#000", opacity: finalFade}} />
    </AbsoluteFill>
  );
};
