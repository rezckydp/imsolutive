import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PATCH set the same boothMinStock target across EVERY color/type variant of
// one Master SKU in one go — the "isi sekaligus" bulk-fill action, so Rezcky
// doesn't have to click into each color row individually when they all need
// the same target. Mirrors how minStock/price already sync Master -> child
// products, except this stays within one product's own variants.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sku: string }> }
) {
  try {
    const { sku } = await params;
    const body = await request.json();
    const { boothMinStock } = body;

    if (boothMinStock === undefined || boothMinStock === null || boothMinStock === "") {
      return NextResponse.json({ error: "boothMinStock is required" }, { status: 400 });
    }
    const qty = parseInt(boothMinStock, 10);
    if (isNaN(qty) || qty < 0) {
      return NextResponse.json({ error: "boothMinStock harus angka >= 0" }, { status: 400 });
    }

    const product = await db.product.findUnique({ where: { sku } });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    if (product.parentProductId) {
      return NextResponse.json(
        { error: "Hanya Master SKU yang bisa di-set target massal" },
        { status: 400 }
      );
    }

    const { count } = await db.productVariant.updateMany({
      where: { productId: product.id },
      data: { boothMinStock: qty },
    });

    return NextResponse.json({ success: true, count });
  } catch (error) {
    console.error("Error bulk-setting booth target:", error);
    return NextResponse.json({ error: "Failed to bulk-set booth target" }, { status: 500 });
  }
}
