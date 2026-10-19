import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

// PUT update a Material — Nama/Unit always; for hasVariants=false rows also
// Stock/Min Stock/Barcode (inline edit straight from the detail card). A
// direct stock edit here is a manual correction, logged same as the rest.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getCurrentUser(request);
  try {
    const { id } = await params;
    const body = await request.json();
    const name = body.name !== undefined ? body.name.toString().trim() : undefined;
    const unit = body.unit !== undefined ? body.unit.toString().trim() : undefined;

    const existing = await db.material.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Material tidak ditemukan" }, { status: 404 });
    }

    const barcode = body.barcode !== undefined ? (body.barcode || "").toString().trim() || null : undefined;
    if (!existing.hasVariants && barcode && barcode !== existing.barcode) {
      const barcodeConflict = await db.material.findUnique({ where: { barcode } });
      if (barcodeConflict) {
        return NextResponse.json({ error: `Barcode "${barcode}" sudah dipakai Material lain` }, { status: 409 });
      }
    }

    const newStock = !existing.hasVariants && body.stock !== undefined ? (parseInt(body.stock, 10) || 0) : undefined;

    const material = await db.material.update({
      where: { id },
      data: {
        ...(name !== undefined && name !== "" && { name }),
        ...(unit !== undefined && unit !== "" && { unit }),
        ...(!existing.hasVariants && newStock !== undefined && { stock: newStock }),
        ...(!existing.hasVariants && body.minStock !== undefined && { minStock: parseInt(body.minStock, 10) || 0 }),
        ...(!existing.hasVariants && barcode !== undefined && { barcode }),
      },
      include: { variants: { orderBy: { label: "asc" } } },
    });

    if (newStock !== undefined && existing.stock !== null && newStock !== existing.stock) {
      await db.materialMovement.create({
        data: {
          materialId: id,
          qty: newStock - existing.stock,
          source: "Manual",
          username: user?.username ?? "unknown",
          productLabel: existing.name,
        },
      });
    }

    return NextResponse.json(material);
  } catch (error) {
    console.error("Error updating material:", error);
    return NextResponse.json({ error: "Failed to update material" }, { status: 500 });
  }
}

// DELETE a Material — cascades its variants, BOM links and movement log.
// If any Product's BOM still references this Material and the caller hasn't
// passed ?force=true yet, respond 409 with the affected products instead of
// deleting, so the client can show a warning and ask for confirmation first
// (ims-hotfix-edit-delete-material.md).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = await db.material.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Material tidak ditemukan" }, { status: 404 });
    }

    const force = request.nextUrl.searchParams.get("force") === "true";

    if (!force) {
      const boms = await db.productBOM.findMany({
        where: { materialId: id },
        distinct: ["productId"],
        include: { product: { select: { sku: true, name: true } } },
      });
      if (boms.length > 0) {
        return NextResponse.json(
          {
            requiresConfirm: true,
            affectedProducts: boms.map((b) => ({ sku: b.product.sku, name: b.product.name })),
          },
          { status: 409 }
        );
      }
    }

    await db.material.delete({ where: { id } });
    return NextResponse.json({ message: "Material deleted successfully" });
  } catch (error) {
    console.error("Error deleting material:", error);
    return NextResponse.json({ error: "Failed to delete material" }, { status: 500 });
  }
}
