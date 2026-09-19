import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncStockToGroup } from "@/lib/stock-sync";
import { getCurrentUser } from "@/lib/current-user";
import { logActivity, snapshotOrder, snapshotOrderItem } from "@/lib/activity-log";

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
      include: { product: true },
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
      if (variant.product.price == null) {
        return NextResponse.json(
          { error: `${variant.product.sku} belum punya harga jual — isi dulu di Stock Management` },
          { status: 400 }
        );
      }
    }

    const subtotalAmount = items.reduce((sum, item) => {
      const price = variantMap.get(item.variantId)!.product.price!;
      return sum + price * item.qty;
    }, 0);
    const clampedDiscount = Math.max(0, Math.min(discountAmount || 0, subtotalAmount));
    const totalAmount = subtotalAmount - clampedDiscount;

    const orderNo = await nextPosOrderNo();

    const order = await db.order.create({
      data: {
        orderNo,
        status: "Completed",
        paymentMethod,
        discountAmount: clampedDiscount,
        subtotalAmount,
        totalAmount,
        orderItems: {
          create: items.map((item) => {
            const variant = variantMap.get(item.variantId)!;
            return {
              variantId: item.variantId,
              qty: item.qty,
              status: "Ready",
              unitPrice: variant.product.price!,
            };
          }),
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
