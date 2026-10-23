import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST add a new Variant to a Material (+ Tambah Varian)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const label = (body.label || "").toString().trim();
    const stock = Number.isFinite(body.stock) ? body.stock : parseInt(body.stock, 10) || 0;
    const minStock = Number.isFinite(body.minStock) ? body.minStock : parseInt(body.minStock, 10) || 0;
    const barcode = (body.barcode || "").toString().trim() || null;
    const brand = body.brand !== undefined ? (body.brand || "").toString().trim() || null : null;
    const materialType = body.materialType !== undefined ? (body.materialType || "").toString().trim() || null : null;
    const knownBarcodes = Array.isArray(body.knownBarcodes) && body.knownBarcodes.length > 0
      ? JSON.stringify(body.knownBarcodes.filter((b: unknown) => typeof b === "string" && b.trim()))
      : null;

    if (!label) {
      return NextResponse.json({ error: "Label Varian wajib diisi" }, { status: 400 });
    }

    const material = await db.material.findUnique({ where: { id } });
    if (!material) {
      return NextResponse.json({ error: "Material tidak ditemukan" }, { status: 404 });
    }
    if (!material.hasVariants) {
      return NextResponse.json({ error: "Material ini tidak punya varian" }, { status: 400 });
    }

    if (barcode) {
      const barcodeConflict = await db.materialVariant.findUnique({ where: { barcode } });
      if (barcodeConflict) {
        return NextResponse.json({ error: `Barcode "${barcode}" sudah dipakai variant lain` }, { status: 409 });
      }
    }

    const variant = await db.materialVariant.create({
      data: { materialId: id, label, stock, minStock, barcode, brand, materialType, knownBarcodes },
    });

    return NextResponse.json(variant, { status: 201 });
  } catch (error) {
    console.error("Error creating material variant:", error);
    return NextResponse.json({ error: "Failed to create material variant" }, { status: 500 });
  }
}
