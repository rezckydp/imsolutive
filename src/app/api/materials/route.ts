import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET all Materials with their Variants — catalog source for the Warehouse
// Management "Material" sub-tab AND the BOM checklist on the Product form.
export async function GET() {
  try {
    const materials = await db.material.findMany({
      include: { variants: { orderBy: { label: "asc" } } },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ materials });
  } catch (error) {
    console.error("Error fetching materials:", error);
    return NextResponse.json({ error: "Failed to fetch materials" }, { status: 500 });
  }
}

// POST create a new Material (Nama, Unit, "punya varian?").
// hasVariants = true  -> create the Material only, variants added separately.
// hasVariants = false -> also accept Stock/Min Stock/Barcode in this same call.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = (body.name || "").toString().trim();
    const unit = (body.unit || "").toString().trim() || "pcs";
    const hasVariants = body.hasVariants !== false;

    if (!name) {
      return NextResponse.json({ error: "Nama Material wajib diisi" }, { status: 400 });
    }

    if (!hasVariants) {
      const barcode = (body.barcode || "").toString().trim() || null;
      if (barcode) {
        const barcodeConflict = await db.material.findUnique({ where: { barcode } });
        if (barcodeConflict) {
          return NextResponse.json({ error: `Barcode "${barcode}" sudah dipakai Material lain` }, { status: 409 });
        }
      }
      const material = await db.material.create({
        data: {
          name,
          unit,
          hasVariants: false,
          stock: parseInt(body.stock, 10) || 0,
          minStock: parseInt(body.minStock, 10) || 0,
          barcode,
        },
        include: { variants: true },
      });
      return NextResponse.json(material, { status: 201 });
    }

    const material = await db.material.create({
      data: { name, unit, hasVariants: true },
      include: { variants: true },
    });

    return NextResponse.json(material, { status: 201 });
  } catch (error) {
    console.error("Error creating material:", error);
    return NextResponse.json({ error: "Failed to create material" }, { status: 500 });
  }
}
