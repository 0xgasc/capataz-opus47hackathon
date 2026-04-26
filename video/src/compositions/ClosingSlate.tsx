import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { C } from "../tokens";

export function ClosingSlate() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const taglineOp = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const taglineY = spring({
    frame,
    fps,
    config: { damping: 20, stiffness: 60 },
    from: 40,
    to: 0,
  });

  const subOp = interpolate(frame, [28, 48], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const urlOp = interpolate(frame, [52, 70], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const badgeScale = spring({
    frame: frame - 60,
    fps,
    config: { damping: 18, stiffness: 100 },
    from: 0.6,
    to: 1,
  });
  const badgeOp = interpolate(frame - 60, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Emerald dot pulse
  const pulse = interpolate(
    Math.sin((frame / 12) * Math.PI),
    [-1, 1],
    [0.4, 1]
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
        gap: 0,
      }}
    >
      {/* Logo dot */}
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: C.emerald,
          opacity: taglineOp * pulse,
          marginBottom: 32,
          boxShadow: `0 0 24px ${C.emerald}`,
        }}
      />

      {/* Main tagline */}
      <div
        style={{
          opacity: taglineOp,
          transform: `translateY(${taglineY}px)`,
          fontSize: 64,
          fontWeight: 300,
          color: C.text,
          fontFamily: "system-ui, -apple-system, sans-serif",
          letterSpacing: "-0.02em",
          textAlign: "center",
          lineHeight: 1.15,
          maxWidth: 900,
        }}
      >
        Capataz.
      </div>

      <div
        style={{
          opacity: subOp,
          fontSize: 36,
          fontWeight: 300,
          color: C.sub,
          fontFamily: "system-ui, sans-serif",
          letterSpacing: "-0.01em",
          textAlign: "center",
          maxWidth: 800,
          marginTop: 20,
          lineHeight: 1.4,
        }}
      >
        El agente para los cien millones
        <br />
        que el software olvidó.
      </div>

      {/* URL */}
      <div
        style={{
          opacity: urlOp,
          marginTop: 48,
          fontSize: 20,
          color: C.muted,
          fontFamily: "system-ui, sans-serif",
          letterSpacing: "0.04em",
        }}
      >
        capataz-web-production.up.railway.app
      </div>

      {/* Hackathon badge */}
      <div
        style={{
          opacity: badgeOp,
          transform: `scale(${badgeScale})`,
          marginTop: 56,
          padding: "10px 24px",
          borderRadius: 100,
          border: `1px solid ${C.emerald}33`,
          background: `${C.emerald}0d`,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: C.emerald,
          }}
        />
        <span
          style={{
            fontSize: 14,
            color: C.emerald,
            fontFamily: "system-ui, sans-serif",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          Built with Claude Opus 4.7 · Anthropic Hackathon 2026
        </span>
      </div>
    </div>
  );
}
