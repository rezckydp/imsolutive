import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PUT replace this category's product assignment with exactly the given
// Master SKU ids — "Kelola Kategori Bundle" multi-select (pos-pricing-promo-spec.md
// bagian 2). Child SKUs follow their Master automatically (same pattern as
// isBoothEnabled) so an entire Master-Variant group always prices together.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { productIds } = body as { productIds: string[] };

    if (!Array.isArray(productIds)) {
      return NextResponse.json({ error: "productIds harus array" }, { status: 400 });
    }

    const category = await db.bundleCategory.findUnique({ where: { id } });
    if (!category) {
      return NextResponse.json({ error: "Kategori tidak ditemukan" }, { status: 404 });
    }

    const products = await db.product.findMany({
      where: { id: { in: productIds } },
      include: { childProducts: { select: { id: true } } },
    });
    const foundIds = new Set(products.map((p) => p.id));
    const missing = productIds.filter((pid) => !foundIds.has(pid));
    if (missing.length > 0) {
      return NextResponse.json({ error: `${missing.length} produk tidak ditemukan` }, { status: 404 });
    }
    const nonMaster = products.filter((p) => p.parentProductId);
    if (nonMaster.length > 0) {
      return NextResponse.json(
        { error: "Hanya Master SKU yang bisa di-assign ke kategori bundle" },
        { status: 400 }
      );
    }

    const masterIds = products.map((p) => p.id);
    const childIds = products.flatMap((p) => p.childProducts.map((c) => c.id));
    const allIds = [...masterIds, ...childIds];

    await db.$transaction([
      // Lepas semua produk yang sebelumnya di kategori ini tapi gak ada di
      // daftar baru (termasuk anak SKU-nya — kalau Master dilepas, anaknya ikut lepas).
      db.product.updateMany({
        where: { bundleCategoryId: id, id: { notIn: allIds } },
        data: { bundleCategoryId: null },
      }),
      ...(allIds.length > 0
        ? [
            db.product.updateMany({
              where: { id: { in: allIds } },
              data: { bundleCategoryId: id },
            }),
          ]
        : []),
    ]);

    const updated = await db.bundleCategory.findUnique({
      where: { id },
      include: { products: { select: { id: true, sku: true, name: true }, orderBy: { sku: "asc" } } },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error assigning bundle category products:", error);
    return NextResponse.json({ error: "Failed to assign products" }, { status: 500 });
  }
}
