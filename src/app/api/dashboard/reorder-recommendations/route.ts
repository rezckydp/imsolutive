import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/dashboard/reorder-recommendations
//
// SHELL VERSION — simple avg-demand estimate, not a full forecasting model.
// Logic: avg daily demand over the last LOOKBACK_DAYS (Picking List orders
// only), projected forward LEAD_TIME_DAYS, minus current stock. Only
// Master/Standalone products are considered (same convention as Stok Minus).
// A more sophisticated model (seasonality, trend, per-SKU lead time, etc.)
// is planned as a follow-up — this just gets a usable number on the board.
const LOOKBACK_DAYS = 30;
const LEAD_TIME_DAYS = 14;

export async function GET() {
  try {
    const since = new Date();
    since.setDate(since.getDate() - LOOKBACK_DAYS);

    const [variants, recentOrderItems] = await Promise.all([
      db.productVariant.findMany({
        include: {
          product: { select: { id: true, sku: true, name: true, parentProductId: true } },
        },
      }),
      db.orderItem.findMany({
        where: {
          order: {
            status: { not: "Cancelled" },
            NOT: { orderNo: { startsWith: "ADJ" } },
            createdAt: { gte: since },
          },
        },
        select: { variantId: true, qty: true },
      }),
    ]);

    const demandMap = new Map<string, number>();
    for (const item of recentOrderItems) {
      demandMap.set(item.variantId, (demandMap.get(item.variantId) || 0) + item.qty);
    }

    const recommendations = variants
      .filter((v) => !v.product.parentProductId) // Master/Standalone only
      .map((v) => {
        const totalDemand = demandMap.get(v.id) || 0;
        const avgDailyDemand = totalDemand / LOOKBACK_DAYS;
        const projectedNeed = avgDailyDemand * LEAD_TIME_DAYS;
        const suggestedQty = Math.ceil(projectedNeed - v.qty);
        return {
          variantId: v.id,
          sku: v.product.sku,
          name: v.product.name,
          color: v.color,
          colorHex: v.colorHex,
          type: v.type,
          currentQty: v.qty,
          avgDailyDemand: Math.round(avgDailyDemand * 10) / 10,
          suggestedQty,
        };
      })
      .filter((r) => r.suggestedQty > 0 && r.avgDailyDemand > 0) // only real, recurring demand
      .sort((a, b) => b.suggestedQty - a.suggestedQty);

    return NextResponse.json({ recommendations, lookbackDays: LOOKBACK_DAYS, leadTimeDays: LEAD_TIME_DAYS });
  } catch (error) {
    console.error("Error building reorder recommendations:", error);
    return NextResponse.json({ error: "Failed to build recommendations" }, { status: 500 });
  }
}
