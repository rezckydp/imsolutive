import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

// POST /api/materials/scan — "📦 Ambil Material" scan session. A matched
// barcode credits +1 to that MaterialVariant's stock. An unmatched barcode
// returns matched:false so the client pops "Input Data Filament" (see
// /api/materials/scan/new) instead of erroring out.
export async function POST(request: NextRequest) {
  const user = getCurrentUser(request);
  try {
    const body = await request.json();
    const barcode = (body.barcode || "").toString().trim();

    if (!barcode) {
      return NextResponse.json({ error: "Barcode wajib diisi" }, { status: 400 });
    }

    const variant = await db.materialVariant.findUnique({
      where: { barcode },
      include: { material: true },
    });

    if (!variant) {
      return NextResponse.json({ matched: false, barcode });
    }

    const updated = await db.materialVariant.update({
      where: { id: variant.id },
      data: { stock: { increment: 1 } },
    });

    await db.materialMovement.create({
      data: {
        materialId: variant.materialId,
        materialVariantId: variant.id,
        qty: 1,
        source: "Scan Terima Material",
        username: user?.username ?? "unknown",
        productLabel: `${variant.material.name} - ${variant.label}`,
      },
    });

    return NextResponse.json({
      matched: true,
      isNew: false,
      variantId: variant.id,
      materialId: variant.materialId,
      materialName: variant.material.name,
      label: variant.label,
      stock: updated.stock,
    });
  } catch (error) {
    console.error("Error scanning material:", error);
    return NextResponse.json({ error: "Gagal memproses scan" }, { status: 500 });
  }
}
