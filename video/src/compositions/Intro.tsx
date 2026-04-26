import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Sequence,
} from "remotion";
import { C } from "../tokens";

const LINES = [
  "One hundred million people",
  "run complex operations",
  "without software.",
];

function Line({ text, startFrame }: { text: string; startFrame: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(frame - startFrame, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const y = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 20, stiffness: 80, mass: 0.6 },
    from: 28,
    to: 0,
  });

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${y}px)`,
        fontSize: 72,
        fontWeight: 300,
        color: C.text,
        fontFamily: "system-ui, -apple-system, sans-serif",
        letterSpacing: "-0.02em",
        lineHeight: 1.2,
        textAlign: "center",
      }}
    >
      {text}
    </div>
  );
}

export function Intro() {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Fade out near end
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 20, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <div
      style={{
        background: C.bg,
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        opacity: fadeOut,
      }}
    >
      {LINES.map((line, i) => (
        <Line key={line} text={line} startFrame={i * 22} />
      ))}

      {/* Emerald underline that draws in after all lines */}
      <Sequence from={70}>
        <UnderlineBar />
      </Sequence>
    </div>
  );
}

function UnderlineBar() {
  const frame = useCurrentFrame();
  const width = interpolate(frame, [0, 20], [0, 320], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        width,
        height: 2,
        background: C.emerald,
        borderRadius: 2,
        marginTop: 24,
      }}
    />
  );
}
