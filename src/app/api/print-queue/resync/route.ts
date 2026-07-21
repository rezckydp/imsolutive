import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resyncOrderItemStatuses, getGroupSiblingVariantIds } from "@/lib/stock-sync";

// POST — reconcile ALL existing Print Queue + Production items against Recent Order statuses.
// Recomputes each variant GROUP's Not Ready / In Queue / In Production split from scratch
// (grouping sibling SKUs — master + child products of the same color/type — since they
// share one physical stock pool), so it's safe to run anytime, including as a one-off
// repair for data that existed before this sync logic was added.
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

    const allVariantIds = new Set<string>([...queueMap.keys(), ...productionMap.keys()]);

    // Group sibling variants together and sum their totals, so a group with
    // queue/production entries spread across multiple sibling SKUs (master +
    // child products) gets resynced with the correct combined amount instead
    // of each sibling overwriting the others' result.
    const processedVariants = new Set<string>();
    let groupsProcessed = 0;

    for (const variantId of allVariantIds) {
      if (processedVariants.has(variantId)) continue;

      const siblingIds = await getGroupSiblingVariantIds(variantId);
      siblingIds.forEach((id) => processedVariants.add(id));

      const totalQueued = siblingIds.reduce((sum, id) => sum + (queueMap.get(id) || 0), 0);
      const totalProduction = siblingIds.reduce((sum, id) => sum + (productionMap.get(id) || 0), 0);

      await resyncOrderItemStatuses(variantId, totalQueued, totalProduction);
      groupsProcessed++;
    }

    return NextResponse.json({
      success: true,
      variantsProcessed: groupsProcessed,
      message: `Sinkron selesai untuk ${groupsProcessed} grup produk (Print Queue + Production).`,
    });
  } catch (error) {
    console.error("Error resyncing print queue statuses:", error);
    return NextResponse.json(
      { error: "Gagal sinkronisasi status" },
      { status: 500 }
    );
  }
}
