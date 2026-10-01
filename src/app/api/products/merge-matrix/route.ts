import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { logActivity, snapshotProduct, snapshotVariant } from "@/lib/activity-log";

interface SourceInput {
  sku: string;
  label: string; // Variasi 1 value for this source's variants, e.g. "D13"
}

// POST — "Gabung ke Produk Matrix" (variant-matrix-spec.md §3).
// Merges 2+ old Standalone products (each representing one Variasi 1 option,
// e.g. FM001-D13 and FM001-D15) into a single matrix product. Variants are
// MOVED (productId reassigned), never recreated, so variantId — and every
// Order/PrintQueueItem/ProductionItem/StockOpnameItem row that references it
// — stays valid. Emptied source products are deleted, except the base.
export async function POST(request: NextRequest) {
  const user = getCurrentUser(request);
  try {
    const body = await request.json();
    const {
      sources,
      variasi1Name,
      target,
    }: {
      sources: SourceInput[];
      variasi1Name: string;
      target: { mode: "existing"; sku: string } | { mode: "new"; sku: string; name: string };
    } = body;

    if (!Array.isArray(sources) || sources.length < 2) {
      return NextResponse.json({ error: "Pilih minimal 2 produk untuk digabung" }, { status: 400 });
    }
    if (!variasi1Name?.trim()) {
      return NextResponse.json({ error: "Nama Variasi wajib diisi" }, { status: 400 });
    }
    for (const s of sources) {
      if (!s.label?.trim()) {
        return NextResponse.json({ error: `Label Variasi untuk ${s.sku} wajib diisi` }, { status: 400 });
      }
    }
    const labels = sources.map((s) => s.label.trim().toLowerCase());
    if (new Set(labels).size !== labels.length) {
      return NextResponse.json({ error: "Label Variasi tidak boleh sama antar produk" }, { status: 400 });
    }

    const sourceProducts = await db.product.findMany({
      where: { sku: { in: sources.map((s) => s.sku) } },
      include: { variants: true, childProducts: { select: { id: true } } },
    });
    if (sourceProducts.length !== sources.length) {
      return NextResponse.json({ error: "Salah satu SKU tidak ditemukan" }, { status: 404 });
    }
    for (const p of sourceProducts) {
      if (p.parentProductId || p.childProducts.length > 0) {
        return NextResponse.json(
          { error: `${p.sku} punya relasi Master-Child — tidak bisa digabung ke matrix (lihat variant-matrix-spec.md)` },
          { status: 400 }
        );
      }
    }

    // Barcode collision check across everything being merged together.
    const allBarcodes = sourceProducts
      .flatMap((p) => p.variants)
      .map((v) => v.barcode)
      .filter((b): b is string => !!b && b.trim() !== "");
    const dupBarcode = allBarcodes.find((b, i) => allBarcodes.indexOf(b) !== i);
    if (dupBarcode) {
      return NextResponse.json(
        { error: `Barcode "${dupBarcode}" dipakai di lebih dari satu produk yang mau digabung` },
        { status: 409 }
      );
    }

    const sourceBySku = new Map(sourceProducts.map((p) => [p.sku, p]));

    // Resolve the target product: an existing source acting as base, or a
    // brand-new container product.
    let targetId: string;
    let targetSkuForResponse: string;
    if (target.mode === "existing") {
      const base = sourceBySku.get(target.sku);
      if (!base) {
        return NextResponse.json({ error: "Produk dasar harus salah satu dari produk yang dipilih" }, { status: 400 });
      }
      targetId = base.id;
      targetSkuForResponse = base.sku;
      const before = snapshotProduct(base);
      const updated = await db.product.update({
        where: { id: base.id },
        data: { variasi1Name: variasi1Name.trim() },
      });
      await logActivity({
        userId: user?.id ?? null, username: user?.username ?? "unknown",
        action: "UPDATE", entityType: "Product", entityId: updated.id,
        entityLabel: updated.sku, before, after: snapshotProduct(updated),
      });
    } else {
      if (!target.sku?.trim() || !target.name?.trim()) {
        return NextResponse.json({ error: "SKU dan Nama produk baru wajib diisi" }, { status: 400 });
      }
      const skuConflict = await db.product.findUnique({ where: { sku: target.sku.trim() } });
      if (skuConflict) {
        return NextResponse.json({ error: `SKU "${target.sku}" sudah dipakai` }, { status: 409 });
      }
      const first = sourceProducts[0];
      const created = await db.product.create({
        data: {
          sku: target.sku.trim(),
          name: target.name.trim(),
          minStock: first.minStock,
          estPrintMinutes: first.estPrintMinutes,
          variasi1Name: variasi1Name.trim(),
        },
      });
      targetId = created.id;
      targetSkuForResponse = created.sku;
      await logActivity({
        userId: user?.id ?? null, username: user?.username ?? "unknown",
        action: "CREATE", entityType: "Product", entityId: created.id,
        entityLabel: created.sku, after: snapshotProduct(created),
      });
    }

    // Move every source's variants onto the target, tagging them with that
    // source's Variasi 1 label. Updates the existing row in place (same id)
    // so variantId never changes.
    for (const s of sources) {
      const source = sourceBySku.get(s.sku)!;
      for (const v of source.variants) {
        const before = snapshotVariant(v);
        const updated = await db.productVariant.update({
          where: { id: v.id },
          data: { productId: targetId, type: s.label.trim() },
        });
        await logActivity({
          userId: user?.id ?? null, username: user?.username ?? "unknown",
          action: "UPDATE", entityType: "ProductVariant", entityId: updated.id,
          entityLabel: `${targetSkuForResponse} - ${s.label.trim()}/${updated.color || "Default"}`,
          before, after: snapshotVariant(updated),
        });
      }
    }

    // Delete emptied sources (everything except the base, if the base was
    // one of the sources — a new container product has no source to delete
    // beyond the originals, all of which are now empty).
    for (const s of sources) {
      const source = sourceBySku.get(s.sku)!;
      if (source.id === targetId) continue;
      const before = snapshotProduct(source);
      await db.product.delete({ where: { id: source.id } });
      await logActivity({
        userId: user?.id ?? null, username: user?.username ?? "unknown",
        action: "DELETE", entityType: "Product", entityId: source.id,
        entityLabel: source.sku, before,
      });
    }

    const merged = await db.product.findUnique({
      where: { id: targetId },
      include: {
        variants: { orderBy: [{ type: "asc" }, { color: "asc" }] },
        parentProduct: { select: { id: true, sku: true, name: true } },
        childProducts: { select: { id: true, sku: true, name: true } },
      },
    });

    return NextResponse.json({ product: merged });
  } catch (error) {
    console.error("Error merging products into matrix:", error);
    return NextResponse.json({ error: "Gagal menggabungkan produk" }, { status: 500 });
  }
}
