import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resyncOrderItemStatuses } from "@/lib/stock-sync";

// POST — reconcile ALL existing Print Queue + Production items against Recent Order statuses.
// Recomputes each variant's Not Ready / In Queue / In Production split from scratch,
// so it's safe to run anytime — including as a one-off repair for data that existed
// before this sync logic was added.
export async function POST() {
  try {
    const queueGrouped = await db.printQueueItem.groupBy({
      by: ["variantId"],
      _sum: { qty: true },
    });
    const productionGrouped = await db.productionItem.groupBy({
      by: ["variantId"],
      _sum: { qty: true },
      where: { status: { not: "Completed" } },
    });

    const queueMap = new Map<string, number>(queueGrouped.map((g) => [g.variantId, g._sum.qty || 0]));
    const productionMap = new Map<string, number>(productionGrouped.map((g) => [g.variantId, g._sum.qty || 0]));

    const variantIds = new Set<string>([...queueMap.keys(), ...productionMap.keys()]);

    for (const variantId of variantIds) {
      await resyncOrderItemStatuses(variantId, queueMap.get(variantId) || 0, productionMap.get(variantId) || 0);
    }

    return NextResponse.json({
      success: true,
      variantsProcessed: variantIds.size,
      message: `Sinkron selesai untuk ${variantIds.size} varian (Print Queue + Production).`,
    });
  } catch (error) {
    console.error("Error resyncing print queue statuses:", error);
    return NextResponse.json(
      { error: "Gagal sinkronisasi status" },
      { status: 500 }
    );
  }
}
