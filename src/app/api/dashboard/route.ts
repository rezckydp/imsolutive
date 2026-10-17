import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { refreshAllOrderStatuses } from "@/lib/stock-sync";
import { getPipelineStatus } from "@/lib/pipeline-status";

export async function GET() {
  try {
    // Auto-refresh all order item statuses based on current stock levels
    // This ensures "Not Ready" items become "Ready" when stock becomes available
    await refreshAllOrderStatuses();

    const [
      allVariants,
      printQueueItems,
      productionItems,
      allProductionItems,
      recentOrders,
      totalProducts,
      totalVariants,
      totalOrders,
    ] = await Promise.all([
      // All variants with product info for low stock filtering
      // Only include Master/Standalone products (exclude SKU Variants)
      db.productVariant.findMany({
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              minStock: true,
              parentProductId: true,
            },
          },
        },
        orderBy: { qty: "asc" },
      }),
      // Print queue with variant → product
      db.printQueueItem.findMany({
        include: {
          variant: {
            include: { product: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      // Production items for the "In Production" card: still actively
      // printing, OR Completed but still waiting to be scanned into the
      // warehouse (ims-real-stock-scan-pipeline-spec.md §5.4).
      db.productionItem.findMany({
        where: {
          OR: [{ status: "In Progress" }, { status: "Completed", closedAt: null }],
        },
        include: {
          variant: {
            include: { product: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      // All production items (including completed) for history
      db.productionItem.findMany({
        include: {
          variant: {
            include: { product: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      // Recent orders with items → variant → product — POS transactions have
      // their own history view and shouldn't crowd out Picking List/Adjustment here
      db.order.findMany({
        where: { NOT: { orderNo: { startsWith: "POS-" } } },
        include: {
          orderItems: {
            include: {
              variant: {
                include: {
                  product: {
                    include: { parentProduct: true },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      db.product.count(),
      db.productVariant.count(),
      db.order.count(),
    ]);

    // Filter stock alerts: only from Master/Standalone products (exclude SKU Variants)
    const masterVariants = allVariants.filter(
      (v) => !v.product.parentProductId
    );

    // Stok Minus: qty < 0 (urgent, must produce immediately)
    const minusStockProducts = masterVariants.filter((v) => v.qty < 0);

    // Pipeline (ims-real-stock-scan-pipeline-spec.md §4.5/§5.2) — supersedes the
    // old simple Low Stock check: credits what's already in the production
    // pipeline (scanned-pending, in-progress, queued) against real stock before
    // deciding something still needs attention.
    const pipelineStatusMap = await getPipelineStatus(masterVariants.map((v) => v.id));
    const pipelineBySkuColorType: Record<string, (typeof pipelineStatusMap)[string]> = {};
    for (const v of masterVariants) {
      const status = pipelineStatusMap[v.id];
      if (!status) continue;
      pipelineBySkuColorType[`${v.product.sku}|${v.color}|${v.type}`] = status;
    }
    const pipelineProducts = masterVariants
      .filter((v) => {
        const status = pipelineStatusMap[v.id];
        return status && status.real < status.required;
      })
      .map((v) => {
        const status = pipelineStatusMap[v.id];
        return {
          variantId: v.id,
          sku: v.product.sku,
          name: v.product.name,
          color: v.color,
          colorHex: v.colorHex,
          type: v.type || "",
          ...status,
        };
      });

    // Print Queue duration estimate — sum(qty × product.estPrintMinutes), skipping
    // items whose product doesn't have an estimate set yet
    let printQueueDurationMinutes = 0;
    let printQueueItemsMissingEstimate = 0;
    for (const item of printQueueItems) {
      const estPerPcs = item.variant.product.estPrintMinutes;
      if (estPerPcs != null) {
        printQueueDurationMinutes += estPerPcs * item.qty;
      } else {
        printQueueItemsMissingEstimate++;
      }
    }

    const summary = {
      totalProducts,
      totalVariants,
      minusStockCount: minusStockProducts.length,
      pipelineCount: pipelineProducts.filter((p) => p.kurang > 0).length,
      printQueueCount: printQueueItems.length,
      printQueueDurationMinutes,
      printQueueItemsMissingEstimate,
      productionCount: productionItems.length,
      totalOrders,
    };

    return NextResponse.json({
      minusStockProducts,
      pipelineProducts,
      pipelineBySkuColorType,
      printQueueItems,
      productionItems,
      allProductionItems,
      recentOrders,
      summary,
    });
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
