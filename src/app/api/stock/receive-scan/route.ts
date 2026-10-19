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

// POST /api/stock/receive-scan — the ONLY way ProductVariant.qty increases now
// (ims-real-stock-scan-pipeline-spec.md §4.2). Resolves the scanned code to a
// variant, credits the oldest outstanding Completed production job (FIFO) if
// one exists, and always adds the physical stock regardless — a scan that
// doesn't match any outstanding job is still real stock in hand (§5.5).
export async function POST(request: NextRequest) {
  try {
    const user = getCurrentUser(request);
    const body = await request.json();
    const code = (body.code || "").toString().trim();

    if (!code) {
      return NextResponse.json({ error: "Code wajib diisi" }, { status: 400 });
    }

    let variant = await db.productVariant.findFirst({
      where: { barcode: code },
      include: { product: true },
    });

    if (!variant) {
      const product = await db.product.findUnique({
        where: { sku: code.toUpperCase() },
        include: { variants: true },
      });

      if (!product || product.variants.length === 0) {
        return NextResponse.json({ error: `Barcode/SKU "${code}" tidak ditemukan` }, { status: 404 });
      }
      if (product.variants.length > 1) {
        return NextResponse.json(
          { error: "SKU ini punya beberapa varian warna — scan barcode spesifik warnanya, bukan SKU umum" },
          { status: 400 }
        );
      }
      variant = { ...product.variants[0], product };
    }

    // Oldest outstanding Completed job for this variant, FIFO
    const job = await db.productionItem.findFirst({
      where: { variantId: variant.id, status: "Completed", closedAt: null },
      orderBy: { createdAt: "asc" },
    });

    let jobId: string | null = null;
    const source: "production" | "unlinked" = job ? "production" : "unlinked";

    if (job) {
      jobId = job.id;
      const newScannedQty = job.scannedQty + 1;
      await db.productionItem.update({
        where: { id: job.id },
        data: {
          scannedQty: newScannedQty,
          ...(newScannedQty + job.writeOffQty >= job.qty ? { closedAt: new Date() } : {}),
        },
      });
    }

    await db.productVariant.update({
      where: { id: variant.id },
      data: { qty: { increment: 1 } },
    });
    await syncStockToGroup(variant.id, 1);

    // BOM deduct (ims-feature-bom-checklist-product-form.md) — this scan is
    // the moment 1 physical pcs of the Product is confirmed in hand, so every
    // Material it consumes gets decremented here. Deduct never blocks the
    // scan and is allowed to go negative — a low-stock badge on Inventory
    // Management is the only consequence.
    const boms = await db.productBOM.findMany({
      where: { productId: variant.product.id },
    });
    for (const b of boms) {
      if (b.materialVariantId) {
        await db.materialVariant.update({
          where: { id: b.materialVariantId },
          data: { stock: { decrement: b.qty } },
        });
      } else {
        await db.material.update({
          where: { id: b.materialId },
          data: { stock: { decrement: b.qty } },
        });
      }
      await db.materialMovement.create({
        data: {
          materialId: b.materialId,
          materialVariantId: b.materialVariantId,
          qty: -b.qty,
          source: "Dipakai Produksi",
          username: user?.username ?? "unknown",
          productId: variant.product.id,
          productLabel: variant.product.sku,
        },
      });
    }

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
      entityLabel: source === "unlinked" ? `${variant.product.sku} — Stok Masuk — Tanpa Job Produksi` : variant.product.sku,
      after: { source: "receive-scan", scanSource: source, jobId, color: variant.color, type: variant.type },
    });

    const todayTotal = await getTodayScanTotal();

    return NextResponse.json({
      variantId: variant.id,
      sku: variant.product.sku,
      name: variant.product.name,
      color: variant.color,
      colorHex: variant.colorHex,
      type: variant.type,
      jobId,
      source,
      qtyAfter: variant.qty + 1,
      todayTotal,
    });
  } catch (error) {
    console.error("Error receiving stock scan:", error);
    return NextResponse.json({ error: "Gagal menerima scan" }, { status: 500 });
  }
}
