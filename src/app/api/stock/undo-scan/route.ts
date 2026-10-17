import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncStockToGroup, getGroupVariantIds, refreshOrderItemStatuses } from "@/lib/stock-sync";
import { getCurrentUser } from "@/lib/current-user";
import { logActivity } from "@/lib/activity-log";

function todayJakartaUtcMidnight(): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${ymd}T00:00:00.000Z`);
}

async function getTodayScanTotal(): Promise<number> {
  const todayStart = todayJakartaUtcMidnight();
  const [scans, undos] = await Promise.all([
    db.activityLog.count({
      where: {
        entityType: "ProductVariant",
        action: "UPDATE",
        createdAt: { gte: todayStart },
        afterData: { contains: '"source":"receive-scan"' },
      },
    }),
    db.activityLog.count({
      where: {
        entityType: "ProductVariant",
        action: "UPDATE",
        createdAt: { gte: todayStart },
        afterData: { contains: '"source":"undo-scan"' },
      },
    }),
  ]);
  return scans - undos;
}

// POST /api/stock/undo-scan — exact inverse of receive-scan (§4.3), for
// client-side "Undo Scan Terakhir". Only meant to be called with a
// {variantId, jobId} pair the client itself just got back from a
// receive-scan response in the same still-open modal session.
export async function POST(request: NextRequest) {
  try {
    const user = getCurrentUser(request);
    const body = await request.json();
    const variantId = (body.variantId || "").toString();
    const jobId = body.jobId ? body.jobId.toString() : null;

    if (!variantId) {
      return NextResponse.json({ error: "variantId wajib diisi" }, { status: 400 });
    }

    const variant = await db.productVariant.findUnique({
      where: { id: variantId },
      include: { product: true },
    });
    if (!variant) {
      return NextResponse.json({ error: "Variant tidak ditemukan" }, { status: 404 });
    }

    if (jobId) {
      const job = await db.productionItem.findUnique({ where: { id: jobId } });
      if (job && job.scannedQty > 0) {
        await db.productionItem.update({
          where: { id: jobId },
          data: { scannedQty: { decrement: 1 }, closedAt: null },
        });
      }
    }

    await db.productVariant.update({
      where: { id: variantId },
      data: { qty: { decrement: 1 } },
    });
    await syncStockToGroup(variantId, -1);

    const groupVariantIds = await getGroupVariantIds(variant.product.id);
    for (const vid of groupVariantIds) {
      await refreshOrderItemStatuses(vid);
    }

    await logActivity({
      userId: user?.id ?? null,
      username: user?.username ?? "unknown",
      action: "UPDATE",
      entityType: "ProductVariant",
      entityId: variant.id,
      entityLabel: `${variant.product.sku} — Undo Scan`,
      after: { source: "undo-scan", jobId },
    });

    const todayTotal = await getTodayScanTotal();

    return NextResponse.json({
      variantId,
      jobId,
      qtyAfter: variant.qty - 1,
      todayTotal,
    });
  } catch (error) {
    console.error("Error undoing stock scan:", error);
    return NextResponse.json({ error: "Gagal undo scan" }, { status: 500 });
  }
}
