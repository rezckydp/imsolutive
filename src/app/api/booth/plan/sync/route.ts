import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const PLAN_INCLUDE = {
  variant: { include: { product: true } },
} as const;

// "Today" as a UTC-midnight Date representing the current calendar day in
// Jakarta time — matches how the frontend stores/reads dates (plain
// "YYYY-MM-DD" strings parsed as UTC midnight).
function todayJakartaUtcMidnight(): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${ymd}T00:00:00.000Z`);
}

// POST "Sync Stock" — recomputes each variant's current shortage (kurang)
// and reconciles it against the cards already on the board WITHOUT wiping
// the schedule, unlike "Hitung Kebutuhan" (which always deletes everything
// and redrops it on today). Per variant:
//   - shortage grew since the board was last built (sales ate into stock,
//     target was raised, etc.) → the gap is added as a brand-new card on
//     today's column; existing cards keep their dates/qty untouched.
//   - shortage shrank (already produced elsewhere, target lowered) → the
//     surplus is trimmed off the LATEST-dated cards first (the
//     least-committed ones), deleting any that hit zero.
//   - shortage is fully resolved, or the SKU left the Booth roster →
//     all its remaining cards are removed.
export async function POST() {
  try {
    const today = todayJakartaUtcMidnight();

    const products = await db.product.findMany({
      where: { parentProductId: null, isBoothEnabled: true },
      include: {
        variants: {
          include: {
            printQueueItems: { select: { qty: true } },
            productionItems: { where: { status: "In Progress" }, select: { qty: true } },
          },
        },
      },
    });

    const kurangByVariant = new Map<string, number>();
    for (const p of products) {
      for (const v of p.variants) {
        const queued =
          v.printQueueItems.reduce((s, i) => s + i.qty, 0) +
          v.productionItems.reduce((s, i) => s + i.qty, 0);
        const target = v.boothMinStock ?? 0;
        kurangByVariant.set(v.id, target - (v.qty + queued));
      }
    }

    const existingPlans = await db.boothProductionPlan.findMany();
    const plansByVariant = new Map<string, typeof existingPlans>();
    for (const plan of existingPlans) {
      const list = plansByVariant.get(plan.variantId) ?? [];
      list.push(plan);
      plansByVariant.set(plan.variantId, list);
    }

    const toDelete: string[] = [];
    const toUpdateQty: Array<{ id: string; qty: number }> = [];
    const toCreate: Array<{ variantId: string; qty: number; scheduledDate: Date }> = [];

    const allVariantIds = new Set<string>([...kurangByVariant.keys(), ...plansByVariant.keys()]);
    for (const variantId of allVariantIds) {
      // Not in kurangByVariant means the SKU left the Booth roster — treat
      // it as fully resolved so its leftover cards get cleaned up below.
      const kurang = kurangByVariant.get(variantId) ?? 0;
      const cards = plansByVariant.get(variantId) ?? [];
      const existingTotal = cards.reduce((s, c) => s + c.qty, 0);

      if (kurang <= 0) {
        for (const c of cards) toDelete.push(c.id);
        continue;
      }

      const diff = kurang - existingTotal;
      if (diff === 0) continue;

      if (diff > 0) {
        toCreate.push({ variantId, qty: diff, scheduledDate: today });
      } else {
        let remaining = -diff;
        const latestFirst = [...cards].sort(
          (a, b) => b.scheduledDate.getTime() - a.scheduledDate.getTime()
        );
        for (const c of latestFirst) {
          if (remaining <= 0) break;
          if (c.qty <= remaining) {
            toDelete.push(c.id);
            remaining -= c.qty;
          } else {
            toUpdateQty.push({ id: c.id, qty: c.qty - remaining });
            remaining = 0;
          }
        }
      }
    }

    await db.$transaction([
      ...toDelete.map((id) => db.boothProductionPlan.delete({ where: { id } })),
      ...toUpdateQty.map(({ id, qty }) => db.boothProductionPlan.update({ where: { id }, data: { qty } })),
      ...(toCreate.length > 0 ? [db.boothProductionPlan.createMany({ data: toCreate })] : []),
    ]);

    const plans = await db.boothProductionPlan.findMany({
      include: PLAN_INCLUDE,
      orderBy: [{ scheduledDate: "asc" as const }, { createdAt: "asc" as const }],
    });
    return NextResponse.json({ plans });
  } catch (error) {
    console.error("Error syncing booth plan:", error);
    return NextResponse.json({ error: "Failed to sync booth plan" }, { status: 500 });
  }
}
