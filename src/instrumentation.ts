// Next.js instrumentation hook — runs once when the server process starts.
// Used to start the production-countdown auto-complete background check
// (ims-feature-production-countdown-autocomplete.md), so it runs as part of
// the normal `next start` process with no separate cron/OS-level setup
// needed on deploy. Guarded to the Node.js runtime only — this file also
// loads under the Edge runtime, where Prisma/DB access isn't available.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startProductionAutoCompleteJob } = await import("@/lib/production-autocomplete");
    startProductionAutoCompleteJob();
  }
}
