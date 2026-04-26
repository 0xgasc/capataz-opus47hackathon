import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { C } from "../tokens";

const MODELS = [
  { name: "Opus 4.7", role: "Thinks", color: C.emerald, delay: 0 },
  { name: "Sonnet 4.6", role: "Executes", color: "#6366f1", delay: 18 },
  { name: "Haiku 4.5", role: "Monitors", color: C.amber, delay: 36 },
];

function ModelPill({
  name,
  role,
  color,
  delay,
}: {
  name: string;
  role: string;
  color: string;
  delay: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame: frame - delay,
    fps,
    config: { damping: 18, stiffness: 100, mass: 0.5 },
    from: 0.7,
    to: 1,
  });
  const opacity = interpolate(frame - delay, [0, 10], [0, 1], {
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
        gap: 12,
        padding: "32px 48px",
        borderRadius: 20,
        border: `1px solid ${color}33`,
        background: `${color}0d`,
        minWidth: 240,
      }}
    >
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 16px ${color}`,
        }}
      />
      <div
        style={{
          fontSize: 36,
          fontWeight: 600,
          color: C.text,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {name}
      </div>
      <div
        style={{
          fontSize: 22,
          color,
          fontFamily: "system-ui, sans-serif",
          fontWeight: 500,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {role}
      </div>
    </div>
  );
}

function CostLine() {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [54, 70], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(frame, [54, 70], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${y}px)`,
        marginTop: 64,
        fontSize: 28,
        color: C.sub,
        fontFamily: "system-ui, sans-serif",
        fontWeight: 300,
        letterSpacing: "0.02em",
      }}
    >
      ~$0.05 per interaction · Open source · Every business, its own agent
    </div>
  );
}

export function MeetCapataz() {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, 12], [0, 1], {
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
        opacity: fadeOut,
      }}
    >
      <div
        style={{
          opacity: titleOpacity,
          fontSize: 18,
          color: C.emerald,
          fontFamily: "system-ui, sans-serif",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          marginBottom: 48,
          fontWeight: 500,
        }}
      >
        Capataz · Model Architecture
      </div>

      <div style={{ display: "flex", gap: 32 }}>
        {MODELS.map((m) => (
          <ModelPill key={m.name} {...m} />
        ))}
      </div>

      <CostLine />
    </div>
  );
}
