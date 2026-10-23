import { NextRequest, NextResponse } from "next/server";
import { findMaterialByBarcode } from "@/lib/material-barcode";

// GET /api/materials/lookup-barcode?code=... — Scan Material's first step:
// is this barcode already known (MaterialVariant.barcode, .knownBarcodes,
// or Material.barcode)? Returns matched:false rather than 404 so the client
// can pop the "belum dikenal" link-or-register flow instead of erroring.
export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code")?.trim() || "";
    if (!code) {
      return NextResponse.json({ error: "code wajib diisi" }, { status: 400 });
    }

    const match = await findMaterialByBarcode(code);
    if (!match) {
      return NextResponse.json({ matched: false, code });
    }

    if (match.kind === "variant") {
      const variantLabel = [match.variant.brand, match.variant.label].filter(Boolean).join(" - ")
        + (match.variant.materialType ? ` (${match.variant.materialType})` : "");
      return NextResponse.json({
        matched: true,
        kind: "variant",
        materialId: match.material.id,
        variantId: match.variant.id,
        name: `${match.material.name} — ${variantLabel}`,
        stock: match.variant.stock,
        minStock: match.variant.minStock,
        unit: match.material.unit,
      });
    }

    return NextResponse.json({
      matched: true,
      kind: "material",
      materialId: match.material.id,
      variantId: null,
      name: match.material.name,
      stock: match.material.stock ?? 0,
      minStock: match.material.minStock ?? 0,
      unit: match.material.unit,
    });
  } catch (error) {
    console.error("Error looking up barcode:", error);
    return NextResponse.json({ error: "Gagal mencari barcode" }, { status: 500 });
  }
}
