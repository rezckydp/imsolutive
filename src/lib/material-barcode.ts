import { db } from "@/lib/db";

interface MaterialVariantRecord {
  id: string;
  materialId: string;
  label: string;
  stock: number;
  minStock: number;
  brand: string | null;
  materialType: string | null;
}

interface MaterialRecord {
  id: string;
  name: string;
  unit: string;
  hasVariants: boolean;
  stock: number | null;
  minStock: number | null;
}

export type MaterialBarcodeMatch =
  | { kind: "variant"; variant: MaterialVariantRecord; material: MaterialRecord }
  | { kind: "material"; material: MaterialRecord };

// Scan Material (ims-feature-warehouse-management-scan-material.md) needs
// one lookup that covers every place a barcode can be registered:
// MaterialVariant.barcode (single, existing), MaterialVariant.knownBarcodes
// (JSON array — Filament's multiple packaging barcodes), and Material.barcode
// (hasVariants=false rows, e.g. "Thanks Card").
export async function findMaterialByBarcode(code: string): Promise<MaterialBarcodeMatch | null> {
  const byVariantBarcode = await db.materialVariant.findUnique({
    where: { barcode: code },
    include: { material: true },
  });
  if (byVariantBarcode) {
    return { kind: "variant", variant: byVariantBarcode, material: byVariantBarcode.material };
  }

  const candidates = await db.materialVariant.findMany({
    where: { knownBarcodes: { contains: code } },
    include: { material: true },
  });
  for (const c of candidates) {
    try {
      const arr: unknown = JSON.parse(c.knownBarcodes || "[]");
      if (Array.isArray(arr) && arr.includes(code)) {
        return { kind: "variant", variant: c, material: c.material };
      }
    } catch {
      // malformed JSON on this row — skip it, not a match
    }
  }

  const byMaterialBarcode = await db.material.findUnique({ where: { barcode: code } });
  if (byMaterialBarcode) {
    return { kind: "material", material: byMaterialBarcode };
  }

  return null;
}
