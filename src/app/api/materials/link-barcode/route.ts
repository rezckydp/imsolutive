import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/materials/link-barcode — Scan Material's "Link ke item yang
// sudah ada" step: register an unrecognized barcode against an existing
// Material (hasVariants=false → Material.barcode) or MaterialVariant
// (→ appended into its knownBarcodes array, so a Filament item can keep
// collecting different packaging codes across restocks).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const code = (body.code || "").toString().trim();
    const materialId = (body.materialId || "").toString().trim();
    const variantId = body.variantId ? body.variantId.toString().trim() : null;

    if (!code || !materialId) {
      return NextResponse.json({ error: "code dan materialId wajib diisi" }, { status: 400 });
    }

    if (variantId) {
      const variant = await db.materialVariant.findUnique({ where: { id: variantId } });
      if (!variant) {
        return NextResponse.json({ error: "Variant tidak ditemukan" }, { status: 404 });
      }
      if (variant.barcode === code) {
        return NextResponse.json({ message: "Barcode already linked", variantId, code });
      }

      let known: string[] = [];
      try {
        const parsed = JSON.parse(variant.knownBarcodes || "[]");
        if (Array.isArray(parsed)) known = parsed.filter((b) => typeof b === "string");
      } catch {
        known = [];
      }
      if (!known.includes(code)) known.push(code);

      await db.materialVariant.update({
        where: { id: variantId },
        data: { knownBarcodes: JSON.stringify(known) },
      });
      return NextResponse.json({ message: "Barcode linked", variantId, code });
    }

    const material = await db.material.findUnique({ where: { id: materialId } });
    if (!material) {
      return NextResponse.json({ error: "Material tidak ditemukan" }, { status: 404 });
    }

    const barcodeConflict = await db.material.findUnique({ where: { barcode: code } });
    if (barcodeConflict && barcodeConflict.id !== materialId) {
      return NextResponse.json({ error: `Barcode "${code}" sudah dipakai Material lain` }, { status: 409 });
    }

    await db.material.update({ where: { id: materialId }, data: { barcode: code } });
    return NextResponse.json({ message: "Barcode linked", materialId, code });
  } catch (error) {
    console.error("Error linking barcode:", error);
    return NextResponse.json({ error: "Gagal link barcode" }, { status: 500 });
  }
}
