import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

// PUT update a MaterialVariant (Label, Stock, Min Stock, Barcode). A direct
// stock edit here is a manual correction — logged to Riwayat as "Manual"
// for the delta, same single source of truth as scan/BOM-deduct movements.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getCurrentUser(request);
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.materialVariant.findUnique({ where: { id }, include: { material: true } });
    if (!existing) {
      return NextResponse.json({ error: "Variant tidak ditemukan" }, { status: 404 });
    }

    const barcode = body.barcode !== undefined ? (body.barcode || "").toString().trim() || null : undefined;
    if (barcode && barcode !== existing.barcode) {
      const barcodeConflict = await db.materialVariant.findUnique({ where: { barcode } });
      if (barcodeConflict) {
        return NextResponse.json({ error: `Barcode "${barcode}" sudah dipakai variant lain` }, { status: 409 });
      }
    }

    const newStock = body.stock !== undefined ? (parseInt(body.stock, 10) || 0) : undefined;

    const variant = await db.materialVariant.update({
      where: { id },
      data: {
        ...(body.label !== undefined && { label: body.label.toString().trim() }),
        ...(newStock !== undefined && { stock: newStock }),
        ...(body.minStock !== undefined && { minStock: parseInt(body.minStock, 10) || 0 }),
        ...(barcode !== undefined && { barcode }),
        ...(body.brand !== undefined && { brand: (body.brand || "").toString().trim() || null }),
        ...(body.materialType !== undefined && { materialType: (body.materialType || "").toString().trim() || null }),
        ...(body.knownBarcodes !== undefined && {
          knownBarcodes: Array.isArray(body.knownBarcodes) && body.knownBarcodes.length > 0
            ? JSON.stringify(body.knownBarcodes.filter((b: unknown) => typeof b === "string" && b.trim()))
            : null,
        }),
      },
    });

    if (newStock !== undefined && newStock !== existing.stock) {
      await db.materialMovement.create({
        data: {
          materialId: existing.materialId,
          materialVariantId: id,
          qty: newStock - existing.stock,
          source: "Manual",
          username: user?.username ?? "unknown",
          productLabel: `${existing.material.name} - ${existing.label}`,
        },
      });
    }

    return NextResponse.json(variant);
  } catch (error) {
    console.error("Error updating material variant:", error);
    return NextResponse.json({ error: "Failed to update material variant" }, { status: 500 });
  }
}

// DELETE a MaterialVariant — cascades BOM links and movement log.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = await db.materialVariant.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Variant tidak ditemukan" }, { status: 404 });
    }

    await db.materialVariant.delete({ where: { id } });
    return NextResponse.json({ message: "Material variant deleted successfully" });
  } catch (error) {
    console.error("Error deleting material variant:", error);
    return NextResponse.json({ error: "Failed to delete material variant" }, { status: 500 });
  }
}
