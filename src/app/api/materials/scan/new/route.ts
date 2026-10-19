import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

// POST /api/materials/scan/new — submit of the "Input Data Filament" popup
// that appears when a scanned barcode doesn't match any MaterialVariant yet.
// Finds-or-creates the Material named "Filament {Jenis} — {Brand}", then
// creates a new MaterialVariant under it (label = Warna, stock = 1).
export async function POST(request: NextRequest) {
  const user = getCurrentUser(request);
  try {
    const body = await request.json();
    const brand = (body.brand || "").toString().trim();
    const jenis = (body.jenis || "").toString().trim();
    const warna = (body.warna || "").toString().trim();
    const barcode = (body.barcode || "").toString().trim();

    if (!warna || !barcode) {
      return NextResponse.json({ error: "Warna dan Barcode wajib diisi" }, { status: 400 });
    }

    const barcodeConflict = await db.materialVariant.findUnique({ where: { barcode } });
    if (barcodeConflict) {
      return NextResponse.json({ error: `Barcode "${barcode}" sudah terdaftar` }, { status: 409 });
    }

    const materialName = jenis && brand
      ? `Filament ${jenis} — ${brand}`
      : jenis
        ? `Filament ${jenis}`
        : brand
          ? `Filament — ${brand}`
          : "Filament";

    let material = await db.material.findFirst({ where: { name: materialName } });
    if (!material) {
      material = await db.material.create({ data: { name: materialName, unit: "roll" } });
    }

    const variant = await db.materialVariant.create({
      data: { materialId: material.id, label: warna, stock: 1, minStock: 0, barcode },
    });

    await db.materialMovement.create({
      data: {
        materialVariantId: variant.id,
        qty: 1,
        source: "Scan Terima Material",
        username: user?.username ?? "unknown",
        productLabel: `${material.name} - ${variant.label} (baru)`,
      },
    });

    return NextResponse.json({
      matched: true,
      isNew: true,
      variantId: variant.id,
      materialId: material.id,
      materialName: material.name,
      label: variant.label,
      stock: variant.stock,
    });
  } catch (error) {
    console.error("Error creating material from scan:", error);
    return NextResponse.json({ error: "Gagal menyimpan data filament" }, { status: 500 });
  }
}
