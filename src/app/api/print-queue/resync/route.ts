import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncOrderItemsToQueue } from "@/lib/stock-sync";

// POST — reconcile ALL existing Print Queue items against Recent Order statuses.
// Safe to run anytime: only touches order items that are currently "Not Ready",
// so it never re-queues something already marked "In Queue" or "Ready".
export async function POST() {
  try {
    const grouped = await db.printQueueItem.groupBy({
      by: ["variantId"],
      _sum: { qty: true },
    });

    let variantsProcessed = 0;
    for (const g of grouped) {
      const totalQueued = g._sum.qty || 0;
      if (totalQueued <= 0) continue;
      await syncOrderItemsToQueue(g.variantId, totalQueued);
      variantsProcessed++;
    }

    return NextResponse.json({
      success: true,
      variantsProcessed,
      message: `Sinkron selesai untuk ${variantsProcessed} varian yang ada di Print Queue.`,
    });
  } catch (error) {
    console.error("Error resyncing print queue statuses:", error);
    return NextResponse.json(
      { error: "Gagal sinkronisasi status" },
      { status: 500 }
    );
  }
}
