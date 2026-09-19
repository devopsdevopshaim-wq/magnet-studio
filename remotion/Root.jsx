// remotion/Root.jsx — רישום הקומפוזיציה. הגודל/אורך נקבעים דינמית לפי הפרויקט (calculateMetadata),
// כי כל פרויקט AIA יכול להיות ביחס מסך ואורך שונה.
import React from "react";
import { Composition } from "remotion";
import { MotionVideo } from "./MotionVideo";

const CANVAS = {
  "16:9": [1920, 1080], "9:16": [1080, 1920], "1:1": [1080, 1080],
  "4:5": [1080, 1350], "21:9": [1920, 822], "4:3": [1440, 1080]
};

export function RemotionRoot() {
  return (
    <Composition
      id="MotionVideo"
      component={MotionVideo}
      fps={30}
      width={1920}
      height={1080}
      durationInFrames={240}
      defaultProps={{ title: "", subtitle: "", palette: [], images: [], aspect: "16:9", durationSec: 8 }}
      calculateMetadata={({ props }) => {
        const [w, h] = CANVAS[props.aspect] || CANVAS["16:9"];
        const fps = 30;
        const durationSec = Math.max(3, Math.min(30, Number(props.durationSec) || 8));
        return { width: w, height: h, fps, durationInFrames: Math.round(durationSec * fps) };
      }}
    />
  );
}
