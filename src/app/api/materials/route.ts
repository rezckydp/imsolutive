import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET all Materials with their Variants — catalog source for the Inventory
// Management "Material" tab AND the BOM checklist on the Product form.
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

// POST create a new Material (Nama, Unit) — variants are added separately.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = (body.name || "").toString().trim();
    const unit = (body.unit || "").toString().trim() || "pcs";

    if (!name) {
      return NextResponse.json({ error: "Nama Material wajib diisi" }, { status: 400 });
    }

    const material = await db.material.create({
      data: { name, unit },
      include: { variants: true },
    });

    return NextResponse.json(material, { status: 201 });
  } catch (error) {
    console.error("Error creating material:", error);
    return NextResponse.json({ error: "Failed to create material" }, { status: 500 });
  }
}
