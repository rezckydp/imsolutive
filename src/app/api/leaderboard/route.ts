import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/dashboard/leaderboard?from=ISO&to=ISO&limit=10
// Ranks products by total ordered qty (Picking List orders only — Adjustment
// entries like cancellations/failed prints/restocks aren't real sales), with
// a color/variant breakdown per product. No from/to → all-time.
export async function GET(request: NextRequest) {
  try {
    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "10", 10);

    const orderItems = await db.orderItem.findMany({
      where: {
        order: {
          status: { not: "Cancelled" },
          NOT: { orderNo: { startsWith: "ADJ" } },
          ...(from && to
            ? {
                createdAt: {
                  gte: new Date(from),
                  lte: new Date(new Date(to).setHours(23, 59, 59, 999)),
                },
              }
            : {}),
        },
      },
      include: {
        variant: {
          include: { product: true },
        },
      },
    });

    type VariantBreakdown = { color: string; colorHex: string; type: string; qty: number };
    type ProductAgg = {
      productId: string;
      sku: string;
      name: string;
      totalQty: number;
      variantMap: Map<string, VariantBreakdown>;
    };

    const productMap = new Map<string, ProductAgg>();

    for (const item of orderItems) {
      const product = item.variant.product;
      let agg = productMap.get(product.id);
      if (!agg) {
        agg = { productId: product.id, sku: product.sku, name: product.name, totalQty: 0, variantMap: new Map() };
        productMap.set(product.id, agg);
      }
      agg.totalQty += item.qty;

      const variantKey = `${item.variant.color}|${item.variant.type}`;
      const existingVariant = agg.variantMap.get(variantKey);
      if (existingVariant) {
        existingVariant.qty += item.qty;
      } else {
        agg.variantMap.set(variantKey, {
          color: item.variant.color,
          colorHex: item.variant.colorHex,
          type: item.variant.type,
          qty: item.qty,
        });
      }
    }

    const leaderboard = Array.from(productMap.values())
      .map((p) => ({
        productId: p.productId,
        sku: p.sku,
        name: p.name,
        totalQty: p.totalQty,
        variants: Array.from(p.variantMap.values()).sort((a, b) => b.qty - a.qty),
      }))
      .sort((a, b) => b.totalQty - a.totalQty)
      .slice(0, limit);

    return NextResponse.json({ leaderboard });
  } catch (error) {
    console.error("Error building leaderboard:", error);
    return NextResponse.json({ error: "Failed to build leaderboard" }, { status: 500 });
  }
}
