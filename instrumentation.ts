// Boot-time hook (Next.js 16). We start a single in-process scheduler that
// hits the internal /api/cron/checkins endpoint at a regular interval. This
// is the proactive heartbeat: every tick, Haiku reviews each business's due
// tasks and decides whether to ping the operator.
//
// Knobs:
//   CRON_DISABLED=true             — skip the scheduler entirely
//   CRON_INTERVAL_MIN=30           — minutes between ticks (default 30)
//   CRON_BASE_URL=https://...      — base URL to call (default: localhost:PORT or Railway domain)
//   ADMIN_SECRET=...               — passed as x-admin-secret header
//
// The scheduler boots once per Node process. On Railway redeploys it resumes
// automatically because the process restarts.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.CRON_DISABLED === "true") return;

  // Avoid double-registration on HMR / multiple imports.
  const g = globalThis as unknown as { __capatazCronStarted?: boolean };
  if (g.__capatazCronStarted) return;
  g.__capatazCronStarted = true;

  const intervalMin = Math.max(5, Number(process.env.CRON_INTERVAL_MIN ?? 30));
  const intervalMs = intervalMin * 60 * 1000;
  const baseUrl =
    process.env.CRON_BASE_URL ??
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null) ??
    `http://localhost:${process.env.PORT ?? 3000}`;
  const adminSecret = process.env.ADMIN_SECRET ?? "";

  const fire = async () => {
    try {
      const res = await fetch(`${baseUrl}/api/cron/checkins`, {
        method: "POST",
        headers: adminSecret ? { "x-admin-secret": adminSecret } : {},
      });
      const data = await res.json().catch(() => ({}));
      const summary = Array.isArray(data?.results)
        ? data.results.map((r: { slug: string; status: string }) => `${r.slug}=${r.status}`).join(" ")
        : "(no results)";
      console.log(`[cron] tick ${new Date().toISOString()} → ${res.status} ${summary}`);
    } catch (err) {
      console.error("[cron] tick failed", err instanceof Error ? err.message : err);
    }
  };

  // First tick after a short delay so the server is fully ready.
  setTimeout(() => void fire(), 30_000);
  setInterval(() => void fire(), intervalMs);

  console.log(
    `[cron] scheduler started — every ${intervalMin}min against ${baseUrl}`,
  );
}
