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

// POST "Generate Rencana" — REPLACES all existing cards with a fresh spread
// of each roster variant's current shortage (kurang) across today..eventDate
// (inclusive), front-loading any remainder onto the earliest days. The
// frontend is responsible for confirming with the user before calling this
// when a plan already has cards, since this always overwrites everything.
export async function POST() {
  try {
    const settings = await db.boothSettings.findFirst();
    if (!settings?.eventDate) {
      return NextResponse.json({ error: "Set Tanggal Event dulu di atas" }, { status: 400 });
    }

    const today = todayJakartaUtcMidnight();
    const eventDate = new Date(settings.eventDate);
    eventDate.setUTCHours(0, 0, 0, 0);

    const dayCount = Math.floor((eventDate.getTime() - today.getTime()) / 86400000) + 1;
    if (dayCount < 1) {
      return NextResponse.json({ error: "Tanggal Event sudah lewat" }, { status: 400 });
    }

    const products = await db.product.findMany({
      where: { parentProductId: null, isBoothEnabled: true },
      include: {
        variants: {
          include: {
            printQueueItems: { select: { qty: true } },
            productionItems: { select: { qty: true } },
          },
        },
      },
    });

    const shortages: Array<{ variantId: string; kurang: number }> = [];
    for (const p of products) {
      for (const v of p.variants) {
        const queued =
          v.printQueueItems.reduce((s, i) => s + i.qty, 0) +
          v.productionItems.reduce((s, i) => s + i.qty, 0);
        const target = v.boothMinStock ?? 0;
        const kurang = target - (v.qty + queued);
        if (kurang > 0) shortages.push({ variantId: v.id, kurang });
      }
    }

    // Front-load the remainder: the first `remainder` days get one extra pcs.
    const rows: Array<{ variantId: string; qty: number; scheduledDate: Date }> = [];
    for (const s of shortages) {
      const base = Math.floor(s.kurang / dayCount);
      const remainder = s.kurang % dayCount;
      for (let day = 0; day < dayCount; day++) {
        const qty = base + (day < remainder ? 1 : 0);
        if (qty <= 0) continue;
        const date = new Date(today);
        date.setUTCDate(date.getUTCDate() + day);
        rows.push({ variantId: s.variantId, qty, scheduledDate: date });
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
