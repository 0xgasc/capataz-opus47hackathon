import { Composition } from "remotion";
import { Intro } from "./compositions/Intro";
import { MeetCapataz } from "./compositions/MeetCapataz";
import { CostTicker } from "./compositions/CostTicker";
import { ClosingSlate } from "./compositions/ClosingSlate";
import { FPS, W, H } from "./tokens";

export function RemotionRoot() {
  return (
    <>
      {/* 0:00 – 0:20 | 6s black open — "Cien millones..." */}
      <Composition
        id="Intro"
        component={Intro}
        durationInFrames={FPS * 6}
        fps={FPS}
        width={W}
        height={H}
      />

      {/* Model architecture card — drop after onboard beat */}
      <Composition
        id="MeetCapataz"
        component={MeetCapataz}
        durationInFrames={FPS * 5}
        fps={FPS}
        width={W}
        height={H}
      />

      {/* Stats grid — for cost/efficiency beat */}
      <Composition
        id="CostTicker"
        component={CostTicker}
        durationInFrames={FPS * 6}
        fps={FPS}
        width={W}
        height={H}
      />

      {/* Closing slate — final 8s */}
      <Composition
        id="ClosingSlate"
        component={ClosingSlate}
        durationInFrames={FPS * 8}
        fps={FPS}
        width={W}
        height={H}
      />
    </>
  );
}
