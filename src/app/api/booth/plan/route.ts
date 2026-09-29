import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const PLAN_INCLUDE = {
  variant: { include: { product: true } },
} as const;

// "Today" as a UTC-midnight Date representing the current calendar day in
// Jakarta time, regardless of the server process's own timezone setting —
// matches how the frontend stores/reads dates (plain "YYYY-MM-DD" strings
// parsed as UTC midnight), so day-count math here lines up with what the
// kanban columns show.
function todayJakartaUtcMidnight(): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${ymd}T00:00:00.000Z`);
}

// GET all Kalender Produksi cards, oldest date first (for the kanban columns)
export async function GET() {
  try {
    const plans = await db.boothProductionPlan.findMany({
      include: PLAN_INCLUDE,
      orderBy: [{ scheduledDate: "asc" as const }, { createdAt: "asc" as const }],
    });
    return NextResponse.json({ plans });
  } catch (error) {
    console.error("Error fetching booth plan:", error);
    return NextResponse.json({ error: "Failed to fetch booth plan" }, { status: 500 });
  }
}

// POST "Hitung Kebutuhan" — REPLACES all existing cards with one fresh card
// per roster variant carrying its FULL current shortage (kurang), dropped
// on today's column. Deliberately does NOT spread this across days — daily
// print capacity is Rezcky's call, not something this app can guess, so the
// total sits as one card and he drags/edits/sends-partial-to-queue it
// himself day by day. The frontend confirms with the user before calling
// this when a plan already has cards, since this always overwrites
// everything (including any manual splitting already done).
export async function POST() {
  try {
    const settings = await db.boothSettings.findFirst();
    if (!settings?.eventDate) {
      return NextResponse.json({ error: "Set Tanggal Event dulu di atas" }, { status: 400 });
    }

    const today = todayJakartaUtcMidnight();

    const products = await db.product.findMany({
      where: { parentProductId: null, isBoothEnabled: true },
      include: {
        variants: {
          include: {
            printQueueItems: { select: { qty: true } },
            // Completed rows stay in this table forever (Production History) —
            // only "In Progress" ones are still physically pending, not yet
            // added back to stock.qty.
            productionItems: { where: { status: "In Progress" }, select: { qty: true } },
          },
        },
      },
    });

    const rows: Array<{ variantId: string; qty: number; scheduledDate: Date }> = [];
    for (const p of products) {
      for (const v of p.variants) {
        const queued =
          v.printQueueItems.reduce((s, i) => s + i.qty, 0) +
          v.productionItems.reduce((s, i) => s + i.qty, 0);
        const target = v.boothMinStock ?? 0;
        const kurang = target - (v.qty + queued);
        if (kurang > 0) rows.push({ variantId: v.id, qty: kurang, scheduledDate: today });
      }
    }

    await db.boothProductionPlan.deleteMany({});
    if (rows.length > 0) {
      await db.boothProductionPlan.createMany({ data: rows });
    }

    const plans = await db.boothProductionPlan.findMany({
      include: PLAN_INCLUDE,
      orderBy: [{ scheduledDate: "asc" as const }, { createdAt: "asc" as const }],
    });
    return NextResponse.json({ plans });
  } catch (error) {
    console.error("Error generating booth plan:", error);
    return NextResponse.json({ error: "Failed to generate booth plan" }, { status: 500 });
  }
}
