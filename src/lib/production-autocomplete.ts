import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";

// Production countdown auto-complete (ims-feature-production-countdown-
// autocomplete.md) — staff often forget to click "Mark Completed" after a
// print job physically finishes, so items that have a per-pcs duration
// configured (Product.estPrintMinutes) get a scheduledDoneAt at creation
// time and are auto-transitioned to Completed here once it passes. This is
// the SOURCE OF TRUTH for the transition — it runs on a server-side timer
// (started from instrumentation.ts) so it fires even if nobody has the
// dashboard open; the UI countdown is purely cosmetic and never drives the
// actual status change itself.

const CHECK_INTERVAL_MS = 60_000;
let intervalStarted = false;

export function startProductionAutoCompleteJob(): void {
  // register() in instrumentation.ts can run more than once (e.g. dev HMR) —
  // guard so we never stack up duplicate timers in the same process.
  if (intervalStarted) return;
  intervalStarted = true;

  const tick = () => {
    runAutoCompleteCheck().catch((err) => {
      console.error("[production-autocomplete] check failed:", err);
    });
  };

  // Run once immediately so a server restart doesn't leave an already-overdue
  // item waiting up to a full interval before being caught.
  tick();
  setInterval(tick, CHECK_INTERVAL_MS);
}

export async function runAutoCompleteCheck(): Promise<number> {
  const now = new Date();
  const due = await db.productionItem.findMany({
    where: { status: "In Progress", scheduledDoneAt: { not: null, lte: now } },
    include: { variant: { include: { product: true } } },
  });

  for (const item of due) {
    await db.productionItem.update({
      where: { id: item.id },
      data: { status: "Completed", completedAt: now },
    });

    await logActivity({
      userId: null,
      username: "system",
      action: "UPDATE",
      entityType: "ProductionItem",
      entityId: item.id,
      entityLabel: `${item.variant.product.sku} — Auto-completed (countdown)`,
      before: { status: "In Progress" },
      after: { status: "Completed", source: "auto-countdown", completedAt: now },
    });
  }

  return due.length;
}
