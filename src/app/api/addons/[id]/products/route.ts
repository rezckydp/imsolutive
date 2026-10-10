import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PUT replace this Add-On's eligible-product list with exactly the given
// Master SKU ids (pos-preorder-addon-spec.md bagian 3) — e.g. Engrave only
// eligible on Frame Medal, not any product. Child SKUs follow their Master
// automatically, same pattern as Booth roster / Bundle Category assignment.
// Unlike Bundle Category (single FK on Product), eligibility here is a true
// many-to-many join (AddOnProduct) — a product can be eligible for several
// different add-ons at once, so this only touches rows for THIS add-on.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { productIds } = body as { productIds: string[] };

    if (!Array.isArray(productIds)) {
      return NextResponse.json({ error: "productIds harus array" }, { status: 400 });
    }

    const addOn = await db.addOn.findUnique({ where: { id } });
    if (!addOn) {
      return NextResponse.json({ error: "Add-on tidak ditemukan" }, { status: 404 });
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
        { error: "Hanya Master SKU yang bisa di-assign ke add-on" },
        { status: 400 }
      );
    }

    const allIds = [...products.map((p) => p.id), ...products.flatMap((p) => p.childProducts.map((c) => c.id))];

    await db.$transaction([
      db.addOnProduct.deleteMany({ where: { addOnId: id } }),
      ...(allIds.length > 0
        ? [db.addOnProduct.createMany({ data: allIds.map((productId) => ({ addOnId: id, productId })) })]
        : []),
    ]);

    const updated = await db.addOn.findUnique({
      where: { id },
      include: { eligibleProducts: { include: { product: { select: { id: true, sku: true, name: true } } } } },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error assigning add-on products:", error);
    return NextResponse.json({ error: "Failed to assign products" }, { status: 500 });
  }
}
