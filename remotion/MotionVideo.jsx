// remotion/MotionVideo.jsx — קומפוזיציית וידאו מבוססת-React לסטודיו עיצוב AIA.
// למה בכלל Remotion ולא רק ffmpeg (aiaRender.js הקיים)? כי ffmpeg's drawtext לא תומך ב-BiDi —
// טקסט עברי נאלץ להיהפך תו-תו כדי להיראות נכון (ראו heDraw ב-lib/aiaRender.js). כאן זה דפדפן אמיתי
// שמרנדר טקסט RTL כמו שצריך, פלוס אנימציות spring עשירות שקשה מאוד לחקות ב-ffmpeg.

import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, Img } from "remotion";
import { loadFont as loadFrankRuhl } from "@remotion/google-fonts/FrankRuhlLibre";
import { loadFont as loadAssistant } from "@remotion/google-fonts/Assistant";

const { fontFamily: FONT_HE } = loadFrankRuhl("normal", { weights: ["700"] });
const { fontFamily: FONT_BODY } = loadAssistant("normal", { weights: ["600"] });

function GradientBG({ palette }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const [c0, c1, c2] = palette;
  const angle = interpolate(frame, [0, durationInFrames], [110, 250]);
  const shift = interpolate(frame, [0, durationInFrames], [0, 40]);
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${angle}deg, ${c0} 0%, ${c1} ${50 + shift * 0.2}%, ${c2} 100%)`
      }}
    />
  );
}

function Vignette() {
  return (
    <AbsoluteFill
      style={{
        background: "radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.45) 100%)"
      }}
    />
  );
}

// רקע תמונות (Ken Burns) — כשיש תמונות ייחוס בפרויקט
function ImageLayer({ images, durationInFrames }) {
  const frame = useCurrentFrame();
  if (!images || !images.length) return null;
  const per = durationInFrames / images.length;
  const idx = Math.min(images.length - 1, Math.floor(frame / per));
  const localFrame = frame - idx * per;
  const t = localFrame / per;
  const zoom = interpolate(t, [0, 1], [1.05, 1.22]);
  const panX = idx % 2 === 0 ? interpolate(t, [0, 1], [0, -18]) : interpolate(t, [0, 1], [-18, 0]);
  const opacityIn = interpolate(localFrame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const opacityOut = interpolate(localFrame, [per - 15, per], [1, 0], { extrapolateLeft: "clamp" });
  return (
    <AbsoluteFill style={{ opacity: Math.min(opacityIn, opacityOut) }}>
      <Img
        src={images[idx].url}
        style={{
          width: "100%", height: "100%", objectFit: "cover",
          transform: `scale(${zoom}) translateX(${panX}px)`,
          filter: "brightness(0.55) saturate(1.05)"
        }}
      />
    </AbsoluteFill>
  );
}

function AccentLine({ color, delay }) {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const progress = spring({ frame: frame - delay, fps, config: { damping: 200, mass: 0.6 } });
  const w = interpolate(progress, [0, 1], [0, width * 0.5]);
  return (
    <div style={{
      position: "absolute", top: "52%", left: "50%", transform: "translateX(-50%)",
      width: Math.max(0, w), height: 4, background: color, borderRadius: 4,
      boxShadow: `0 0 24px ${color}`
    }} />
  );
}

function TitleText({ text, delay, size, color }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame: frame - delay, fps, config: { damping: 14, mass: 0.9, stiffness: 90 } });
  const y = interpolate(progress, [0, 1], [40, 0]);
  const opacity = interpolate(progress, [0, 1], [0, 1]);
  const scale = interpolate(progress, [0, 1], [0.92, 1]);
  return (
    <div style={{
      position: "absolute", top: "38%", left: "50%",
      transform: `translate(-50%, calc(-50% + ${y}px)) scale(${scale})`,
      opacity, textAlign: "center", direction: "rtl", width: "88%",
      fontFamily: FONT_HE, fontWeight: 700, fontSize: size, color,
      textShadow: "0 4px 26px rgba(0,0,0,0.55)", lineHeight: 1.25
    }}>
      {text}
    </div>
  );
}

function SubtitleText({ text, delay, color }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame - delay, [0, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const y = interpolate(frame - delay, [0, 20], [12, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{
      position: "absolute", top: "58%", left: "50%", transform: `translate(-50%, ${y}px)`,
      opacity, textAlign: "center", direction: "rtl", width: "80%",
      fontFamily: FONT_BODY, fontWeight: 600, fontSize: 34, color, letterSpacing: 0.5
    }}>
      {text}
    </div>
  );
}

export function MotionVideo({ title, subtitle, palette, images }) {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const pal = (palette && palette.length >= 3) ? palette : ["#1b1611", "#db8b42", "#8ba07c"];
  const hasImages = images && images.length > 0;
  const outStart = durationInFrames - Math.round(fps * 0.6);
  const fadeIn = interpolate(frame, [0, Math.round(fps * 0.35)], [1, 0], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [outStart, durationInFrames], [0, 1], { extrapolateLeft: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: pal[0] }}>
      {hasImages ? <ImageLayer images={images} durationInFrames={durationInFrames} /> : <GradientBG palette={pal} />}
      <Vignette />
      <Sequence from={0} durationInFrames={durationInFrames}>
        <AccentLine color={pal[1] || "#db8b42"} delay={Math.round(fps * 0.4)} />
        {title ? <TitleText text={title} delay={Math.round(fps * 0.2)} size={hasImages ? 78 : 96} color="#f1e7d4" /> : null}
        {subtitle ? <SubtitleText text={subtitle} delay={Math.round(fps * 0.9)} color={pal[2] || "#ddc39a"} /> : null}
      </Sequence>
      {/* עמעום כניסה/יציאה עדין על כל הפריים */}
      <AbsoluteFill style={{ backgroundColor: "#000", opacity: Math.max(fadeIn, fadeOut), pointerEvents: "none" }} />
    </AbsoluteFill>
  );
}
