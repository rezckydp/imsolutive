import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncStockToGroup } from "@/lib/stock-sync";
import { getCurrentUser } from "@/lib/current-user";
import { logActivity, snapshotOrder, snapshotOrderItem } from "@/lib/activity-log";
import { loadBundleEngineConfig } from "@/lib/bundle-config";
import { calculateBundlePrice } from "@/lib/bundle-pricing";

interface CheckoutItem {
  variantId: string;
  qty: number;
}

// Compute the next POS-xxxxxx order number the same way /api/orders/next-number
// does for PICK/ADJ — scans for the highest existing POS number rather than
// trusting a client-supplied value, so two near-simultaneous checkouts can't
// collide.
async function nextPosOrderNo(): Promise<string> {
  const orders = await db.order.findMany({
    where: { orderNo: { startsWith: "POS" } },
    select: { orderNo: true },
  });
  const pattern = /^POS-?(\d+)$/i;
  let maxNum = 0;
  for (const o of orders) {
    const match = o.orderNo.trim().match(pattern);
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
  }
  return `POS-${String(maxNum + 1).padStart(6, "0")}`;
}

// POST /api/pos/checkout — create a completed POS sale: Order (status
// Completed) + OrderItems (status Ready), decrement stock immediately (POS
// items are physical ready stock, not something to produce), snapshot each
// item's unit price for the receipt.
//
// Items whose Product belongs to a BundleCategory (pos-pricing-promo-spec.md)
// are priced ENTIRELY by the bundle engine — grouped by category and run
// through calculateBundlePrice server-side, never trusting a client-computed
// total. Items outside any bundle category keep the plain
// ProductVariant.price × qty behavior unchanged.
export async function POST(request: NextRequest) {
  const user = getCurrentUser(request);
  try {
    const body = await request.json();
    const {
      items,
      discountAmount = 0,
      paymentMethod,
      cashReceived,
    }: { items: CheckoutItem[]; discountAmount?: number; paymentMethod: string; cashReceived?: number } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Keranjang kosong" }, { status: 400 });
    }
    if (paymentMethod !== "Cash" && paymentMethod !== "QRIS") {
      return NextResponse.json({ error: "Metode pembayaran harus Cash atau QRIS" }, { status: 400 });
    }

    // Validate variants + prices up front
    const variantIds = items.map((i) => i.variantId);
    const variants = await db.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: { product: { include: { bundleCategory: true } } },
    });
    const variantMap = new Map(variants.map((v) => [v.id, v]));

    for (const item of items) {
      const variant = variantMap.get(item.variantId);
      if (!variant) {
        return NextResponse.json({ error: `Varian ${item.variantId} tidak ditemukan` }, { status: 404 });
      }
      if (!item.qty || item.qty < 1) {
        return NextResponse.json({ error: "Qty setiap item harus minimal 1" }, { status: 400 });
      }
      // Bundle-category items are priced by BundleCategory.normalPrice (a
      // required field) via the engine below — only plain items need their
      // own ProductVariant.price filled in.
      if (!variant.product.bundleCategory && variant.price == null) {
        return NextResponse.json(
          { error: `${variant.product.sku} belum punya harga jual — isi dulu di Stock Management` },
          { status: 400 }
        );
      }
    }

    // Group bundle-category items by category code; everything else stays plain.
    const qtyByCategory: Record<string, number> = {};
    let plainSubtotal = 0;
    for (const item of items) {
      const variant = variantMap.get(item.variantId)!;
      const category = variant.product.bundleCategory;
      if (category) {
        qtyByCategory[category.code] = (qtyByCategory[category.code] ?? 0) + item.qty;
      } else {
        plainSubtotal += variant.price! * item.qty;
      }
    }

    const hasBundleItems = Object.keys(qtyByCategory).length > 0;
    let bundleResult: ReturnType<typeof calculateBundlePrice> | null = null;
    if (hasBundleItems) {
      const engineConfig = await loadBundleEngineConfig();
      bundleResult = calculateBundlePrice(qtyByCategory, engineConfig.packages, engineConfig.bulkTiers, engineConfig.normalPriceByCategory);
    }

    const subtotalAmount = plainSubtotal + (bundleResult?.total ?? 0);
    const clampedDiscount = Math.max(0, Math.min(discountAmount || 0, subtotalAmount));
    const totalAmount = subtotalAmount - clampedDiscount;

    const orderNo = await nextPosOrderNo();

    // Build OrderItem rows — unitPrice + allocatedRevenue per line. Bundle
    // items get pro-rata revenue allocation (spec bagian 6) since a
    // package's price doesn't belong to 1 SKU; plain items allocate exactly
    // unitPrice × qty (no rounding ever needed there).
    const itemsData = items.map((item) => {
      const variant = variantMap.get(item.variantId)!;
      const category = variant.product.bundleCategory;
      if (category) {
        const unitPrice = category.normalPrice;
        const contribution = unitPrice * item.qty;
        const normalTotal = bundleResult!.normalTotal;
        const allocated = normalTotal > 0 ? Math.round(bundleResult!.total * (contribution / normalTotal)) : 0;
        return { variantId: item.variantId, qty: item.qty, status: "Ready" as const, unitPrice, allocatedRevenue: allocated, isBundle: true };
      }
      const unitPrice = variant.price!;
      return { variantId: item.variantId, qty: item.qty, status: "Ready" as const, unitPrice, allocatedRevenue: unitPrice * item.qty, isBundle: false };
    });

    // Rounding remainder from the pro-rata split lands on the LAST bundle
    // item, so allocatedRevenue sums exactly to bundleResult.total.
    if (bundleResult) {
      const bundleIndices = itemsData.map((d, i) => (d.isBundle ? i : -1)).filter((i) => i >= 0);
      if (bundleIndices.length > 0) {
        const sumAllocated = bundleIndices.reduce((s, i) => s + itemsData[i].allocatedRevenue, 0);
        const diff = bundleResult.total - sumAllocated;
        const lastIdx = bundleIndices[bundleIndices.length - 1];
        itemsData[lastIdx].allocatedRevenue += diff;
      }
    }

    const order = await db.order.create({
      data: {
        orderNo,
        status: "Completed",
        paymentMethod,
        discountAmount: clampedDiscount,
        subtotalAmount,
        totalAmount,
        cashReceived: paymentMethod === "Cash" && cashReceived != null ? cashReceived : null,
        bundlePricingSnapshot: bundleResult
          ? JSON.stringify({ lines: bundleResult.lines, normalTotal: bundleResult.normalTotal, savings: bundleResult.savings })
          : null,
        orderItems: {
          create: itemsData.map((d) => ({
            variantId: d.variantId,
            qty: d.qty,
            status: d.status,
            unitPrice: d.unitPrice,
            allocatedRevenue: d.allocatedRevenue,
          })),
        },
      },
      include: {
        orderItems: {
          include: { variant: { include: { product: true } } },
        },
      },
    });

    // Decrement stock immediately — POS sells physical ready stock, bypassing
    // the Not Ready -> Print Queue -> In Production pipeline entirely.
    for (const item of items) {
      await db.productVariant.update({
        where: { id: item.variantId },
        data: { qty: { decrement: item.qty } },
      });
      await syncStockToGroup(item.variantId, -item.qty);
    }

    await logActivity({
      userId: user?.id ?? null, username: user?.username ?? 'unknown',
      action: 'CREATE', entityType: 'Order', entityId: order.id,
      entityLabel: order.orderNo, after: snapshotOrder(order),
    });
    for (const item of order.orderItems) {
      await logActivity({
        userId: user?.id ?? null, username: user?.username ?? 'unknown',
        action: 'CREATE', entityType: 'OrderItem', entityId: item.id,
        entityLabel: `${order.orderNo} - ${item.variant.product.sku}`,
        after: snapshotOrderItem(item),
      });
    }

    const change = paymentMethod === "Cash" && cashReceived != null ? cashReceived - totalAmount : null;

    return NextResponse.json({ order, change }, { status: 201 });
  } catch (error) {
    console.error("Error processing POS checkout:", error);
    return NextResponse.json({ error: "Gagal memproses transaksi" }, { status: 500 });
  }
}
