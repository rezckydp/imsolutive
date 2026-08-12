import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PATCH /api/products/[sku]/reparent
// Body: { newParentSku: string }
// Moves a child SKU Variant to a different Master SKU. Stock, minStock, and
// estPrintMinutes are immediately synced to the new Master (matched by
// color+type for stock; direct copy for minStock/estPrintMinutes).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sku: string }> }
) {
  try {
    const { sku } = await params;
    const body = await request.json();
    const { newParentSku } = body;

    if (!newParentSku) {
      return NextResponse.json({ error: "newParentSku is required" }, { status: 400 });
    }

    const child = await db.product.findUnique({
      where: { sku },
      include: { variants: true },
    });
    if (!child) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    if (!child.parentProductId) {
      return NextResponse.json(
        { error: "Produk ini bukan SKU Varian (nggak punya Induk). Cuma SKU Varian yang bisa dipindah Induknya." },
        { status: 400 }
      );
    }

    const newMaster = await db.product.findUnique({
      where: { sku: newParentSku },
      include: { variants: true },
    });
    if (!newMaster) {
      return NextResponse.json({ error: "Master SKU tujuan tidak ditemukan" }, { status: 404 });
    }
    if (newMaster.parentProductId) {
      return NextResponse.json(
        { error: "SKU tujuan itu sendiri adalah Varian, bukan Master. Pilih Master SKU asli." },
        { status: 400 }
      );
    }
    if (newMaster.id === child.parentProductId) {
      return NextResponse.json({ error: "SKU ini sudah link ke Master itu" }, { status: 400 });
    }

    // Sync each child variant's stock to the new Master's matching color+type.
    // Colors that don't exist under the new Master are left untouched.
    for (const v of child.variants) {
      const match = newMaster.variants.find((mv) => mv.color === v.color && mv.type === v.type);
      if (match) {
        await db.productVariant.update({
          where: { id: v.id },
          data: { qty: match.qty },
        });
      }
    }

    const updated = await db.product.update({
      where: { id: child.id },
      data: {
        parentProductId: newMaster.id,
        minStock: newMaster.minStock,
        estPrintMinutes: newMaster.estPrintMinutes,
      },
      include: {
        variants: true,
        parentProduct: { select: { id: true, sku: true, name: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error reparenting product:", error);
    return NextResponse.json({ error: "Failed to move to new Master SKU" }, { status: 500 });
  }
}
