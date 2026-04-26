import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { C } from "../tokens";

const STATS = [
  { label: "per interaction", value: "$0.05", color: C.emerald, delay: 0 },
  { label: "cache hit rate", value: "~99%", color: "#6366f1", delay: 20 },
  { label: "models in stack", value: "3", color: C.amber, delay: 40 },
  { label: "supported verticals", value: "∞", color: C.emerald, delay: 60 },
];

function StatBlock({
  label,
  value,
  color,
  delay,
}: {
  label: string;
  value: string;
  color: string;
  delay: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame: frame - delay,
    fps,
    config: { damping: 22, stiffness: 90 },
    from: 0.8,
    to: 1,
  });
  const opacity = interpolate(frame - delay, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        opacity,
        transform: `scale(${scale})`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        padding: "40px 56px",
        borderRadius: 24,
        border: `1px solid ${C.border}`,
        background: C.surface,
        minWidth: 280,
      }}
    >
      <div
        style={{
          fontSize: 80,
          fontWeight: 700,
          color,
          fontFamily: "system-ui, sans-serif",
          lineHeight: 1,
          letterSpacing: "-0.03em",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 18,
          color: C.muted,
          fontFamily: "system-ui, sans-serif",
          fontWeight: 400,
          textAlign: "center",
        }}
      >
        {label}
      </div>
    </div>
  );
}

export function CostTicker() {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const titleOp = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 18, durationInFrames],
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
        gap: 56,
        opacity: fadeOut,
      }}
    >
      <div
        style={{
          opacity: titleOp,
          fontSize: 18,
          color: C.muted,
          fontFamily: "system-ui, sans-serif",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        Real efficiency · Anthropic Hackathon 2026
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 24,
        }}
      >
        {STATS.map((s) => (
          <StatBlock key={s.label} {...s} />
        ))}
      </div>
    </div>
  );
}
