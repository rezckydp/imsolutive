import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { refreshAllOrderStatuses } from "@/lib/stock-sync";

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
      // Production items (In Progress only for cards)
      db.productionItem.findMany({
        where: { status: "In Progress" },
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
      // Recent orders with items → variant → product
      db.order.findMany({
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
        take: 300,
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

    // Low Stock: 0 <= qty < minStock (need to print to keep printers working)
    const lowStockProducts = masterVariants.filter(
      (v) => v.qty >= 0 && v.qty < v.product.minStock
    );

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
      lowStockCount: lowStockProducts.length,
      printQueueCount: printQueueItems.length,
      printQueueDurationMinutes,
      printQueueItemsMissingEstimate,
      productionCount: productionItems.length,
      totalOrders,
    };

    return NextResponse.json({
      minusStockProducts,
      lowStockProducts,
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
