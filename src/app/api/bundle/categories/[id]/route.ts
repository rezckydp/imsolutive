import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PATCH update a Bundle Category's config fields (not product assignment —
// see /api/bundle/categories/[id]/products for that)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { code, name, normalPrice, bulkMinQty, bulkUnitPrice, bulkTierName } = body;

    const existing = await db.bundleCategory.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Kategori tidak ditemukan" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};

    if (code !== undefined) {
      const normalizedCode = String(code).trim().toUpperCase();
      if (!normalizedCode) return NextResponse.json({ error: "Kode kategori wajib diisi" }, { status: 400 });
      if (normalizedCode !== existing.code) {
        const dup = await db.bundleCategory.findUnique({ where: { code: normalizedCode } });
        if (dup) return NextResponse.json({ error: `Kode "${normalizedCode}" sudah dipakai kategori lain` }, { status: 409 });
      }
      data.code = normalizedCode;
    }
    if (name !== undefined) {
      if (!String(name).trim()) return NextResponse.json({ error: "Nama kategori wajib diisi" }, { status: 400 });
      data.name = String(name).trim();
    }
    if (normalPrice !== undefined) {
      if (normalPrice == null || isNaN(Number(normalPrice)) || Number(normalPrice) < 0) {
        return NextResponse.json({ error: "Harga normal harus diisi angka >= 0" }, { status: 400 });
      }
      data.normalPrice = Math.round(Number(normalPrice));
    }
    if (bulkMinQty !== undefined || bulkUnitPrice !== undefined) {
      const nextMinQty = bulkMinQty !== undefined ? bulkMinQty : existing.bulkMinQty;
      const nextUnitPrice = bulkUnitPrice !== undefined ? bulkUnitPrice : existing.bulkUnitPrice;
      const hasBulk = nextMinQty != null && nextMinQty !== "" && nextUnitPrice != null && nextUnitPrice !== "";
      data.bulkMinQty = hasBulk ? Math.round(Number(nextMinQty)) : null;
      data.bulkUnitPrice = hasBulk ? Math.round(Number(nextUnitPrice)) : null;
    }
    if (bulkTierName !== undefined) {
      data.bulkTierName = bulkTierName && String(bulkTierName).trim() ? String(bulkTierName).trim() : null;
    }

    const updated = await db.bundleCategory.update({
      where: { id },
      data,
      include: { products: { select: { id: true, sku: true, name: true } } },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating bundle category:", error);
    return NextResponse.json({ error: "Failed to update bundle category" }, { status: 500 });
  }
}

// DELETE a Bundle Category — refuses if any BundlePackage still requires it
// (would make that package's requirements dangle) or if products are still
// assigned (unassign them from the category panel first, so nobody loses
// POS pricing for a SKU without realizing it).
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const category = await db.bundleCategory.findUnique({
      where: { id },
      include: {
        products: { select: { id: true } },
        requirements: { select: { id: true } },
      },
    });
    if (!category) {
      return NextResponse.json({ error: "Kategori tidak ditemukan" }, { status: 404 });
    }
    if (category.products.length > 0) {
      return NextResponse.json(
        { error: `Masih ada ${category.products.length} produk di kategori ini — lepas dulu sebelum menghapus` },
        { status: 409 }
      );
    }
    if (category.requirements.length > 0) {
      return NextResponse.json(
        { error: "Masih dipakai di salah satu Paket Fixed — hapus/ubah paket itu dulu sebelum menghapus kategori" },
        { status: 409 }
      );
    }

    await db.bundleCategory.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting bundle category:", error);
    return NextResponse.json({ error: "Failed to delete bundle category" }, { status: 500 });
  }
}
